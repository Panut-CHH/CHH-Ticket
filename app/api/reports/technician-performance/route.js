import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/reports/technician-performance
 * Fetch technician performance data with filtering and aggregation
 * 
 * Query Parameters:
 * - technician_id: Filter by specific technician
 * - date_from: Start date (ISO format)
 * - date_to: End date (ISO format)
 * - station_id: Filter by specific station
 * - user_id: Current user ID (for permission checking)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const technicianId = searchParams.get('technician_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const stationId = searchParams.get('station_id');
    const userId = searchParams.get('user_id');

    console.log('[API] Technician performance request:', {
      technicianId, dateFrom, dateTo, stationId, userId
    });

    // Get user roles to determine permissions
    let userRoles = ['production']; // default
    if (userId) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role, roles')
        .eq('id', userId)
        .single();
      // Support both old format (role) and new format (roles)
      userRoles = user?.roles || (user?.role ? [user.role] : ['production']);
      userRoles = Array.isArray(userRoles) ? userRoles : [userRoles];
    }
    const normalizedRoles = userRoles.map(r => String(r).toLowerCase());

    // Build query with filters
    let query = supabaseAdmin
      .from('technician_work_sessions')
      .select(`
        *,
        stations (
          id,
          name_th,
          code
        ),
        technician:users!technician_work_sessions_technician_id_fkey (
          id,
          name,
          email
        ),
        proxy:users!technician_work_sessions_proxy_user_id_fkey (
          id,
          name,
          email
        )
      `)
      .order('started_at', { ascending: false })
      .order('id', { ascending: true });

    // Apply filters
    const toIso = (d) => new Date(d).toISOString();
    const toStartOfDay = (d) => {
      const dt = new Date(d);
      dt.setHours(0,0,0,0);
      return dt.toISOString();
    };
    const toNextStartOfDay = (d) => {
      const dt = new Date(d);
      dt.setHours(0,0,0,0);
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString();
    };

    if (dateFrom) {
      query = query.gte('started_at', toStartOfDay(dateFrom));
    }
    if (dateTo) {
      // ใช้ lt ของวันถัดไปเพื่อครอบคลุมทั้งวัน date_to
      query = query.lt('started_at', toNextStartOfDay(dateTo));
    }
    if (stationId) {
      query = query.eq('station_id', stationId);
    }

    // Permission-based filtering
    const hasProductionRole = normalizedRoles.some(r => r === 'production' || r === 'painting' || r === 'packing');
    const hasAdminRole = normalizedRoles.some(r => r === 'admin' || r === 'superadmin');
    
    if (hasProductionRole && !hasAdminRole) {
      // Production, Painting, and Packing roles can only see their own data
      if (technicianId && technicianId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Access denied: Cannot view other technicians\' data' },
          { status: 403 }
        );
      }
      query = query.eq('technician_id', userId);
    } else if (hasAdminRole) {
      // Admins and superadmins can see all data or filter by technician
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Access denied: Insufficient permissions' },
        { status: 403 }
      );
    }

    // Paginate to get all sessions (Supabase default limit = 1000)
    let sessions = [];
    let fetchError = null;
    let from = 0;
    const ps = 1000;
    while (true) {
      const { data: page, error: pageErr } = await query.range(from, from + ps - 1);
      if (pageErr) { fetchError = pageErr; break; }
      sessions = sessions.concat(page || []);
      if (!page || page.length < ps) break;
      from += ps;
    }
    const error = fetchError;

    if (error) {
      console.error('[API] Error fetching sessions:', error);
      throw error;
    }

    // Calculate statistics
    const stats = calculateStatistics(sessions || []);

    // Group sessions by technician for summary
    const technicianSummary = groupByTechnician(sessions || []);

    // Aggregations
    const stationByTechnician = aggregateTimeByStationAndTechnician(sessions || []);
    const ticketTotalsByTechnician = aggregateTimeByTicketAndTechnician(sessions || []);

    console.log('[API] Returning performance data:', {
      sessionCount: sessions?.length || 0,
      technicianCount: Object.keys(technicianSummary).length,
      stationGroups: stationByTechnician.length,
      ticketGroups: ticketTotalsByTechnician.length
    });

    const response = NextResponse.json({
      success: true,
      data: {
        sessions: sessions || [],
        statistics: stats,
        technicianSummary: technicianSummary,
        stationByTechnician,
        ticketTotalsByTechnician
      }
    });
    await logApiCall(request, 'read', 'report_technician_performance', null, {
      sessionCount: sessions?.length || 0,
      technicianCount: Object.keys(technicianSummary).length
    }, 'success', null);
    return response;

  } catch (error) {
    console.error('[API] Error in technician performance:', error);
    await logError(error, { action: 'read', entityType: 'report_technician_performance' }, request);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateStatistics(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      totalSessions: 0,
      totalHours: 0,
      averageDuration: 0,
      fastestSession: null,
      slowestSession: null,
      completedSessions: 0,
      averagePerStation: {}
    };
  }

  const completedSessions = sessions.filter(s => s.completed_at && s.duration_minutes);
  const totalSessions = sessions.length;
  const totalHours = completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60;
  const averageDuration = completedSessions.length > 0 
    ? completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / completedSessions.length 
    : 0;

  const fastestSession = completedSessions.length > 0
    ? completedSessions.reduce((fastest, current) => 
        (current.duration_minutes < fastest.duration_minutes) ? current : fastest
      )
    : null;

  const slowestSession = completedSessions.length > 0
    ? completedSessions.reduce((slowest, current) => 
        (current.duration_minutes > slowest.duration_minutes) ? current : slowest
      )
    : null;

  // Calculate average duration per station
  const stationGroups = {};
  completedSessions.forEach(session => {
    const stationName = session.stations?.name_th || 'Unknown';
    if (!stationGroups[stationName]) {
      stationGroups[stationName] = [];
    }
    stationGroups[stationName].push(session.duration_minutes);
  });

  const averagePerStation = {};
  Object.keys(stationGroups).forEach(station => {
    const durations = stationGroups[station];
    averagePerStation[station] = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  });

  return {
    totalSessions,
    totalHours: Math.round(totalHours * 100) / 100,
    averageDuration: Math.round(averageDuration * 100) / 100,
    fastestSession,
    slowestSession,
    completedSessions: completedSessions.length,
    averagePerStation
  };
}

function groupByTechnician(sessions) {
  const groups = {};
  
  sessions.forEach(session => {
    const technicianId = session.technician_id;
    const technicianName = session.technician?.name || session.technician?.email || 'Unknown';
    
    if (!groups[technicianId]) {
      groups[technicianId] = {
        technicianId,
        technicianName,
        totalSessions: 0,
        completedSessions: 0,
        totalHours: 0,
        averageDuration: 0,
        stations: new Set()
      };
    }
    
    groups[technicianId].totalSessions++;
    groups[technicianId].stations.add(session.stations?.name_th || 'Unknown');
    
    if (session.completed_at && session.duration_minutes) {
      groups[technicianId].completedSessions++;
      groups[technicianId].totalHours += session.duration_minutes / 60;
    }
  });
  
  // Convert sets to arrays and calculate averages
  Object.keys(groups).forEach(techId => {
    const tech = groups[techId];
    tech.stations = Array.from(tech.stations);
    tech.totalHours = Math.round(tech.totalHours * 100) / 100;
    tech.averageDuration = tech.completedSessions > 0 
      ? Math.round((tech.totalHours * 60 / tech.completedSessions) * 100) / 100 
      : 0;
  });
  
  return groups;
}

// New: Aggregate total minutes per (technician, station)
function aggregateTimeByStationAndTechnician(sessions) {
  const map = new Map();
  sessions.forEach(s => {
    const techId = s.technician_id;
    const techName = s.technician?.name || s.technician?.email || 'Unknown';
    const stationId = s.station_id;
    const stationName = s.stations?.name_th || s.stations?.code || 'Unknown Station';
    const key = `${techId}|${stationId}`;
    const minutes = Number(s.duration_minutes || 0);
    if (!map.has(key)) {
      map.set(key, { technicianId: techId, technicianName: techName, stationId, stationName, totalMinutes: 0, sessionsCount: 0 });
    }
    const agg = map.get(key);
    agg.totalMinutes += minutes;
    agg.sessionsCount += 1;
  });
  return Array.from(map.values()).map(r => ({
    ...r,
    totalHours: Math.round((r.totalMinutes / 60) * 100) / 100,
    avgMinutes: r.sessionsCount > 0 ? Math.round((r.totalMinutes / r.sessionsCount) * 100) / 100 : 0
  }));
}

// New: Aggregate total minutes per (technician, ticket)
function aggregateTimeByTicketAndTechnician(sessions) {
  const map = new Map();
  sessions.forEach(s => {
    const techId = s.technician_id;
    const techName = s.technician?.name || s.technician?.email || 'Unknown';
    const ticketNo = s.ticket_no;
    const key = `${techId}|${ticketNo}`;
    const minutes = Number(s.duration_minutes || 0);
    if (!map.has(key)) {
      map.set(key, { technicianId: techId, technicianName: techName, ticketNo, totalMinutes: 0, sessionsCount: 0 });
    }
    const agg = map.get(key);
    agg.totalMinutes += minutes;
    agg.sessionsCount += 1;
  });
  return Array.from(map.values()).map(r => ({
    ...r,
    totalHours: Math.round((r.totalMinutes / 60) * 100) / 100,
    avgMinutes: r.sessionsCount > 0 ? Math.round((r.totalMinutes / r.sessionsCount) * 100) / 100 : 0
  }));
}

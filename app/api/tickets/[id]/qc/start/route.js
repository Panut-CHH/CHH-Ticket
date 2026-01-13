import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";
import { createQCReadyNotification } from "@/utils/notificationManager";
import { logApiCall, logError } from "@/utils/activityLogger";
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request, context) {
  try {
    const params = await context.params;
    const ticketNo = params?.id;
    
    console.log('=== QC Start API ===');
    console.log('Ticket No:', ticketNo);
    
    if (!ticketNo) {
      return NextResponse.json({ error: "Missing ticket number" }, { status: 400 });
    }
    
    const admin = supabaseServer;
    
    // Find QC station and update to current
    const { data: flows, error } = await admin
      .from("ticket_station_flow")
      .select(`
        id,
        status,
        step_order,
        stations (
          code,
          name_th
        )
      `)
      .eq("ticket_no", ticketNo)
      .order("step_order", { ascending: true });
    
    if (error) {
      console.error('Error loading flows:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log('Flows found:', flows);
    
    // Locate the NEXT pending QC station (not the first QC in the list)
    const list = Array.isArray(flows) ? flows : [];
    const qcStations = list.filter(f => {
      const code = String(f?.stations?.code || '').toUpperCase();
      const name = String(f?.stations?.name_th || '').toUpperCase();
      return code === 'QC' || name.includes('QC') || name.includes('ตรวจ') || name.includes('คุณภาพ');
    });
    // Prefer QC with status 'pending'; if none pending, fallback to any non-completed QC; else null
    const qcPending = qcStations.find(s => (s.status || 'pending') === 'pending');
    const qcNotCompleted = qcStations.find(s => (s.status || 'pending') !== 'completed');
    const firstPending = list.find(f => (f.status || 'pending') === 'pending');
    const qcStation = qcPending || qcNotCompleted || firstPending;
    console.log('QC Station candidate:', qcStation);
    
    if (qcStation) {
      // สลับ 1: ล้าง status "current" ทั้งหมดก่อนเพื่อป้องกันมีหลายจุด
      const { error: clearCurrentsError } = await admin
        .from("ticket_station_flow")
        .update({ status: "pending" })
        .eq("ticket_no", ticketNo)
        .eq("status", "current");
      
      if (clearCurrentsError) {
        console.warn('Warning: could not clear current statuses:', clearCurrentsError);
      } else {
        console.log('Cleared all current statuses before starting QC');
      }
      
      // สลับ 2: ตั้ง QC station เป็น current และบันทึก started_at
      const startedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("ticket_station_flow")
        .update({ 
          status: "current",
          started_at: startedAt
        })
        .eq("id", qcStation.id);
      
      if (updateError) {
        console.error('Error updating QC station:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      
      console.log('QC station updated to current with started_at:', qcStation.id, startedAt);
      
      // แจ้งเตือน QC users เมื่อมี ticket พร้อมสำหรับ QC
      const stationName = qcStation.stations?.name_th || qcStation.stations?.code || 'QC';
      await createQCReadyNotification(ticketNo, stationName);
      
      // Get current user for log
      let currentUser = null;
      let userName = null;
      try {
        const cookieStore = cookies();
        const authHeader = request.headers.get('authorization');
        const bearerToken = authHeader?.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length)
          : null;
        
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          {
            global: bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : undefined,
            cookies: {
              get(name) {
                return cookieStore.get(name)?.value;
              },
            },
          }
        );
        
        // ถ้ามี Bearer token ให้ใช้ getUser แทน getSession
        if (bearerToken) {
          const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken);
          if (userError) {
            console.error('User error in QC start (Bearer token):', userError);
            return NextResponse.json({ 
              error: "Session expired or invalid. Please log out and log in again.",
              code: "SESSION_INVALID"
            }, { status: 401 });
          }
          if (!userData?.user) {
            return NextResponse.json({ 
              error: "No active session. Please log in again.",
              code: "NO_SESSION"
            }, { status: 401 });
          }
          currentUser = userData.user;
        } else {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          // ตรวจสอบ session error
          if (sessionError) {
            console.error('Session error in QC start:', sessionError);
            if (sessionError.message?.includes('refresh_token_not_found') ||
                sessionError.message?.includes('Invalid Refresh Token') ||
                sessionError.message?.includes('Refresh Token Not Found') ||
                sessionError.message?.includes('JWT expired') ||
                sessionError.message?.includes('Invalid JWT')) {
              return NextResponse.json({ 
                error: "Session expired or invalid. Please log out and log in again.",
                code: "SESSION_INVALID"
              }, { status: 401 });
            }
          }
          
          // ตรวจสอบว่า session มีอยู่จริง
          if (!session || !session.user) {
            return NextResponse.json({ 
              error: "No active session. Please log in again.",
              code: "NO_SESSION"
            }, { status: 401 });
          }
          
          currentUser = session.user;
        }
        
        if (currentUser) {
          try {
            const { data: userRecord } = await supabaseServer
              .from('users')
              .select('name, email')
              .eq('id', currentUser.id)
              .maybeSingle();
            userName = userRecord?.name || userRecord?.email || currentUser.user_metadata?.full_name || currentUser.email || null;
          } catch (userRecordError) {
            // ถ้าดึงข้อมูลจาก users table ไม่ได้ ให้ใช้ข้อมูลจาก session
            console.warn('Failed to fetch user record from users table, using session data:', userRecordError?.message);
            userName = currentUser.user_metadata?.full_name || currentUser.email || null;
          }
        }
      } catch (e) {
        console.error('Failed to get current user for log:', e?.message);
        return NextResponse.json({ 
          error: "Authentication failed. Please log out and log in again.",
          code: "AUTH_EXCEPTION"
        }, { status: 401 });
      }
      
      const response = NextResponse.json({ 
        success: true, 
        message: "QC started successfully",
        qcStationId: qcStation.id
      });
      
      // Log QC start
      await logApiCall(request, 'qc_started', 'qc_workflow', ticketNo, {
        station_id: qcStation.id,
        station_name: stationName,
        step_order: qcStation.step_order
      }, 'success', null, currentUser ? { id: currentUser.id, email: currentUser.email, name: userName } : null);
      
      return response;
    } else {
      console.log('No QC station found for ticket:', ticketNo);
      return NextResponse.json({ error: "QC station not found" }, { status: 404 });
    }
  } catch (error) {
    console.error('QC Start API error:', error);
    await logError(error, { action: 'qc_started', entityType: 'qc_workflow', entityId: (await context.params)?.id }, request);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const today = new Date();

    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 10);
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + 25);

    const startDate = searchParams.get('start') || defaultStart.toISOString().split('T')[0];
    const endDate   = searchParams.get('end')   || defaultEnd.toISOString().split('T')[0];

    // Fetch active tickets that have due_date within or after startDate
    // Also include tickets with no due_date that were created recently
    let tickets = [];
    {
      // Query 1: tickets with due_date in range
      const { data: t1 } = await supabaseAdmin
        .from('ticket')
        .select('no, source_no, description, status, created_at, due_date, project_id, projects(project_name, item_code)')
        .gte('due_date', startDate)
        .lte('created_at', endDate + 'T23:59:59Z')
        .not('status', 'in', '("done","completed","closed","finish","finished")')
        .order('due_date', { ascending: true })
        .limit(40);
      tickets = t1 || [];

      // Query 2: tickets with no due_date, created recently
      if (tickets.length < 40) {
        const { data: t2 } = await supabaseAdmin
          .from('ticket')
          .select('no, source_no, description, status, created_at, due_date, project_id, projects(project_name, item_code)')
          .is('due_date', null)
          .gte('created_at', startDate)
          .not('status', 'in', '("done","completed","closed","finish","finished")')
          .order('created_at', { ascending: false })
          .limit(10);
        const existing = new Set(tickets.map(t => t.no));
        (t2 || []).forEach(t => { if (!existing.has(t.no)) tickets.push(t); });
      }
    }

    const ticketNos = tickets.map(t => t.no);
    if (!ticketNos.length) {
      return NextResponse.json({ tickets: [] });
    }

    // Fetch station flows (with station info)
    let flows = [];
    for (let i = 0; i < ticketNos.length; i += 100) {
      const chunk = ticketNos.slice(i, i + 100);
      const { data: f } = await supabaseAdmin
        .from('ticket_station_flow')
        .select('ticket_no, station_id, step_order, status, started_at, completed_at, stations(name_th, code)')
        .in('ticket_no', chunk)
        .order('step_order', { ascending: true });
      flows = flows.concat(f || []);
    }

    // Fetch assignments with technician names via view (paginated)
    let assignments = [];
    try {
      let from = 0;
      const ps = 1000;
      while (true) {
        const { data: a } = await supabaseAdmin
          .from('view_ticket_assignments_with_user')
          .select('ticket_no, station_id, step_order, technician_id, technician_name')
          .in('ticket_no', ticketNos)
          .order('ticket_no', { ascending: true })
          .order('step_order', { ascending: true })
          .order('station_id', { ascending: true })
          .order('technician_id', { ascending: true })
          .range(from, from + ps - 1);
        assignments = assignments.concat(a || []);
        if (!a || a.length < ps) break;
        from += ps;
      }
    } catch {
      // Fallback: join ticket_assignments + users manually
      try {
        let from = 0;
        const ps = 1000;
        let raw = [];
        while (true) {
          const { data: ta } = await supabaseAdmin
            .from('ticket_assignments')
            .select('ticket_no, station_id, step_order, technician_id, users(name)')
            .in('ticket_no', ticketNos)
            .order('id', { ascending: true })
            .range(from, from + ps - 1);
          raw = raw.concat(ta || []);
          if (!ta || ta.length < ps) break;
          from += ps;
        }
        assignments = raw.map(a => ({
          ticket_no: a.ticket_no,
          station_id: a.station_id,
          step_order: a.step_order,
          technician_name: a.users?.name || ''
        }));
      } catch {}
    }

    // Build assignment lookup
    const assignMap = {};
    assignments.forEach(a => {
      const k = `${a.ticket_no}||${a.station_id}||${a.step_order}`;
      // Append if multiple technicians assigned to same step
      if (assignMap[k]) {
        assignMap[k] = assignMap[k] + ', ' + (a.technician_name || '');
      } else {
        assignMap[k] = a.technician_name || '';
      }
    });

    // Group flows by ticket
    const flowsByTicket = {};
    flows.forEach(f => {
      if (!flowsByTicket[f.ticket_no]) flowsByTicket[f.ticket_no] = [];
      const techKey = `${f.ticket_no}||${f.station_id}||${f.step_order}`;
      flowsByTicket[f.ticket_no].push({
        station_id: f.station_id,
        step_order: f.step_order,
        status: f.status,
        started_at: f.started_at || null,
        completed_at: f.completed_at || null,
        station_name: f.stations?.name_th || f.stations?.code || 'Station',
        technician_name: assignMap[techKey] || ''
      });
    });

    // Build response
    const result = tickets.map(t => ({
      no: t.no,
      source_no: t.source_no || '',
      description: t.description || '',
      status: t.status || '',
      created_at: t.created_at || null,
      due_date: t.due_date || null,
      project_name: t.projects?.project_name || t.source_no || '-',
      flows: (flowsByTicket[t.no] || []).sort((a, b) => a.step_order - b.step_order)
    }));

    return NextResponse.json({ tickets: result, count: result.length });
  } catch (e) {
    console.error('[GANTT API] error:', e);
    return NextResponse.json({ tickets: [], error: e?.message }, { status: 500 });
  }
}

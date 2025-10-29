import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

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
      
      // สลับ 2: ตั้ง QC station เป็น current
      const { error: updateError } = await admin
        .from("ticket_station_flow")
        .update({ status: "current" })
        .eq("id", qcStation.id);
      
      if (updateError) {
        console.error('Error updating QC station:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      
      console.log('QC station updated to current:', qcStation.id);
      
      return NextResponse.json({ 
        success: true, 
        message: "QC started successfully",
        qcStationId: qcStation.id
      });
    } else {
      console.log('No QC station found for ticket:', ticketNo);
      return NextResponse.json({ error: "QC station not found" }, { status: 404 });
    }
  } catch (error) {
    console.error('QC Start API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

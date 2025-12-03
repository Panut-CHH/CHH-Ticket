import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/tickets/[id]/labor-prices
 * ดึงราคาค่าแรงเริ่มต้นสำหรับ ticket โดยใช้ item code
 */
export async function GET(request, ctx) {
  try {
    const { id: ticketId } = await ctx.params;

    // ดึง ticket เพื่อหา item code
    const { data: ticket, error: ticketError } = await supabaseServer
      .from('ticket')
      .select('source_no')
      .eq('no', ticketId)
      .single();

    if (ticketError || !ticket || !ticket.source_no) {
      // ถ้าไม่มี ticket หรือไม่มี source_no ให้ return empty array
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    const itemCode = ticket.source_no;

    // ดึงราคาค่าแรงสำหรับ item code นี้
    const { data: prices, error: pricesError } = await supabaseServer
      .from('item_labor_prices')
      .select('*')
      .eq('item_code', itemCode)
      .order('station_code', { ascending: true });

    if (pricesError) {
      console.error('Error fetching labor prices:', pricesError);
      return NextResponse.json(
        { success: false, error: pricesError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: prices || []
    });

    await logApiCall(request, 'read', 'ticket_labor_prices', ticketId, {
      item_code: itemCode,
      prices_count: prices?.length || 0
    }, 'success', null);

    return response;

  } catch (error) {
    console.error('Error in GET ticket labor prices:', error);
    await logError(error, { action: 'read', entityType: 'ticket_labor_prices' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


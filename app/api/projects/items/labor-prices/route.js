import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/projects/items/labor-prices?itemCode=...
 * ดึงราคาค่าแรงสำหรับ item code
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemCode = searchParams.get('itemCode');

    if (!itemCode) {
      return NextResponse.json(
        { success: false, error: 'itemCode parameter is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from('item_labor_prices')
      .select('*')
      .eq('item_code', itemCode)
      .order('station_code', { ascending: true });

    if (error) {
      console.error('Error fetching labor prices:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: data || []
    });

    await logApiCall(request, 'read', 'labor_prices', itemCode, {
      count: data?.length || 0
    }, 'success', null);

    return response;

  } catch (error) {
    console.error('Error in GET labor prices:', error);
    await logError(error, { action: 'read', entityType: 'labor_prices' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/items/labor-prices?itemCode=...
 * บันทึก/อัปเดตราคาค่าแรงสำหรับ item code
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemCode = searchParams.get('itemCode');

    if (!itemCode) {
      return NextResponse.json(
        { success: false, error: 'itemCode parameter is required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate input
    if (!Array.isArray(body.prices)) {
      return NextResponse.json(
        { success: false, error: 'prices must be an array' },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    // Process each price entry
    for (const priceEntry of body.prices) {
      if (!priceEntry.station_code) {
        errors.push(`Missing station_code for one entry`);
        continue;
      }

      if (!priceEntry.price_type || !['flat', 'per_piece', 'per_hour'].includes(priceEntry.price_type)) {
        errors.push(`Invalid price_type for station ${priceEntry.station_code}`);
        continue;
      }

      // Use upsert to insert or update
      const { data, error } = await supabaseServer
        .from('item_labor_prices')
        .upsert({
          item_code: itemCode,
          station_code: priceEntry.station_code,
          price: priceEntry.price ? parseFloat(priceEntry.price) : null,
          price_type: priceEntry.price_type,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'item_code,station_code'
        })
        .select()
        .single();

      if (error) {
        console.error(`Error upserting price for ${priceEntry.station_code}:`, error);
        errors.push(`Failed to save price for station ${priceEntry.station_code}: ${error.message}`);
      } else {
        results.push(data);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return NextResponse.json(
        { success: false, error: errors.join('; ') },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });

    await logApiCall(request, 'upsert', 'labor_prices', itemCode, {
      prices_count: results.length,
      errors_count: errors.length
    }, errors.length > 0 ? 'partial_success' : 'success', null);

    return response;

  } catch (error) {
    console.error('Error in POST labor prices:', error);
    await logError(error, { action: 'upsert', entityType: 'labor_prices' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


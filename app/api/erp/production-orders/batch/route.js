import { NextResponse } from 'next/server';
import { fetchMultipleProductionOrders } from '@/utils/erpApi';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * POST /api/erp/production-orders/batch
 * ดึงข้อมูลหลาย Production Orders พร้อมกัน
 */
export async function POST(request) {
  try {
    const { rpdNumbers } = await request.json();
    
    if (!Array.isArray(rpdNumbers) || rpdNumbers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'RPD numbers array is required' },
        { status: 400 }
      );
    }

    const results = await fetchMultipleProductionOrders(rpdNumbers);
    
    const response = NextResponse.json({
      success: true,
      data: results,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
    await logApiCall(request, 'read', 'erp_production_orders_batch', null, { total: results.length }, 'success', null);
    return response;
  } catch (error) {
    console.error('API Error:', error);
    await logError(error, { action: 'read', entityType: 'erp_production_orders_batch' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { fetchProductionOrder } from '@/utils/erpApi';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/erp/production-order/[id]
 * ดึงข้อมูล Production Order จาก ERP ด้วย RPD No.
 */
export async function GET(request, { params }) {
  try {
    const { id: rpdNo } = await params;
    
    if (!rpdNo) {
      return NextResponse.json(
        { success: false, error: 'RPD No. is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching ERP data for RPD: ${rpdNo}`);
    
    const result = await fetchProductionOrder(rpdNo);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
      );
    }
    
    const response = NextResponse.json({
      success: true,
      data: result.data
    });
    await logApiCall(request, 'read', 'erp_production_order', rpdNo, { success: true }, 'success', null);
    return response;
    
  } catch (error) {
    console.error('API Error:', error);
    await logError(error, { action: 'read', entityType: 'erp_production_order', entityId: (await params)?.id }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

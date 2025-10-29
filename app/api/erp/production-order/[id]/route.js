import { NextResponse } from 'next/server';
import { fetchProductionOrder } from '@/utils/erpApi';

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
    
    return NextResponse.json({
      success: true,
      data: result.data
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

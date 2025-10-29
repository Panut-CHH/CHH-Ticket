import { NextResponse } from 'next/server';
import { fetchMultipleProductionOrders } from '@/utils/erpApi';

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
    
    return NextResponse.json({
      success: true,
      data: results,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

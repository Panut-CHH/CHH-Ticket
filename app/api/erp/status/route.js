import { NextResponse } from 'next/server';
import { checkErpConnection } from '@/utils/erpApi';

/**
 * GET /api/erp/status
 * ตรวจสอบสถานะการเชื่อมต่อ ERP
 */
export async function GET() {
  try {
    const result = await checkErpConnection();
    
    return NextResponse.json({
      success: result.success,
      status: result.status,
      error: result.error,
      message: result.message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { checkErpConnection } from '@/utils/erpApi';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/erp/status
 * ตรวจสอบสถานะการเชื่อมต่อ ERP
 */
export async function GET(request) {
  try {
    const result = await checkErpConnection();
    
    const response = NextResponse.json({
      success: result.success,
      status: result.status,
      error: result.error,
      message: result.message,
      timestamp: new Date().toISOString()
    });
    await logApiCall(request, 'read', 'erp_status', null, { success: result.success }, 'success', null);
    return response;
  } catch (error) {
    console.error('API Error:', error);
    await logError(error, { action: 'read', entityType: 'erp_status' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

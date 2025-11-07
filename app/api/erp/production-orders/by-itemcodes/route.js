import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

export async function POST(request) {
  try {
    const { itemCodes } = await request.json();
    
    if (!itemCodes || !Array.isArray(itemCodes)) {
      return NextResponse.json(
        { success: false, error: 'itemCodes array required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching ERP data for ${itemCodes.length} item codes:`, itemCodes);
    
    // สำหรับตอนนี้ return empty array เพื่อให้ระบบทำงานได้
    // TODO: ใช้ ERP API จริงในอนาคต
    const allTickets = [];
    
    console.log(`✅ Found ${allTickets.length} tickets matching item codes`);
    
    const response = NextResponse.json({
      success: true,
      data: allTickets
    });
    await logApiCall(request, 'read', 'erp_by_itemcodes', null, { itemCodesCount: itemCodes.length, resultCount: allTickets.length }, 'success', null);
    return response;
    
  } catch (error) {
    console.error('API Error:', error);
    await logError(error, { action: 'read', entityType: 'erp_by_itemcodes' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

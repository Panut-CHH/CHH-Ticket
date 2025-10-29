import { NextResponse } from 'next/server';

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
    
    return NextResponse.json({
      success: true,
      data: allTickets
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';

/**
 * API Route: GET /api/project-code/[projectCodeNo]
 * ดึงข้อมูล Project Code จาก External API
 */
export async function GET(request, ctx) {
  try {
    const { projectCodeNo } = await ctx.params;

    // Validate projectCodeNo
    if (!projectCodeNo || projectCodeNo.trim() === '') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Project Number is required',
          data: null 
        },
        { status: 400 }
      );
    }

    // Call external API
    const externalApiUrl = `https://evergreen-bn.vercel.app/api/projectCode/${projectCodeNo}`;
    
    // Bearer Token สำหรับเรียก External API
    const BEARER_TOKEN = process.env.EVERGREEN_API_TOKEN || '$2a$12$P5ikNWsRcf9o/8/zfuvQ2.u2ZrjmReGa.q8ljT37GmcgT9.Wb7Qtm';
    
    const response = await fetch(externalApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BEARER_TOKEN}`,
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 seconds timeout
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = raw?.error ? 
        (typeof raw.error === 'object' ? JSON.stringify(raw.error) : raw.error) :
        `Project Number ${projectCodeNo} not found in external system`;
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          data: null 
        },
        { status: response.status }
      );
    }

    // Normalize external shape: external returns { success, data: { ... } }
    const normalizedData = raw?.data ?? raw;

    return NextResponse.json({
      success: true,
      data: normalizedData,
      error: null
    });

  } catch (error) {
    console.error('Error fetching project code:', error);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Request timeout. Please try again.',
          data: null 
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch project code from external API',
        data: null 
      },
      { status: 500 }
    );
  }
}

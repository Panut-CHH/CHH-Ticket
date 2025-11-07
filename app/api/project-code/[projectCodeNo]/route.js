import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

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
    
    const extResponse = await fetch(externalApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BEARER_TOKEN}`,
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 seconds timeout
    });

    const raw = await extResponse.json().catch(() => null);

    if (!extResponse.ok) {
      const errorMsg = raw?.error ? 
        (typeof raw.error === 'object' ? JSON.stringify(raw.error) : raw.error) :
        `Project Number ${projectCodeNo} not found in external system`;
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          data: null 
        },
        { status: extResponse.status }
      );
    }

    // Normalize external shape: external returns { success, data: { ... } }
    const normalizedData = raw?.data ?? raw;

    const jsonResponse = NextResponse.json({
      success: true,
      data: normalizedData,
      error: null
    });
    await logApiCall(request, 'read', 'project_code', projectCodeNo, { external: true }, 'success', null);
    return jsonResponse;

  } catch (error) {
    console.error('Error fetching project code:', error);
    await logError(error, { action: 'read', entityType: 'project_code', entityId: (await ctx.params)?.projectCodeNo }, request);
    
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

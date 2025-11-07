import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

// Server-side fetch-all ERP production orders with short-lived in-memory cache
const ERP_BASE_URL = 'https://evergreen-bn.vercel.app/api/productionOrder';
const ERP_API_KEY = 'Bearer $2a$12$P5ikNWsRcf9o/8/zfuvQ2.u2ZrjmReGa.q8ljT37GmcgT9.Wb7Qtm';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(request) {
  try {
    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
      const response = NextResponse.json({ success: true, data: cache.data, fromCache: true });
      await logApiCall(request, 'read', 'erp_production_orders', null, { fromCache: true, total: cache.data?.length || 0 }, 'success', null);
      return response;
    }

    const resp = await fetch(ERP_BASE_URL, {
      method: 'GET',
      headers: {
        'Authorization': ERP_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      return NextResponse.json(
        { success: false, error: `ERP fetch failed: ${resp.status}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

    cache = { data: list, timestamp: now };
    const response = NextResponse.json({ success: true, data: list, fromCache: false, total: list.length });
    await logApiCall(request, 'read', 'erp_production_orders', null, { fromCache: false, total: list.length }, 'success', null);
    return response;
  } catch (error) {
    console.error('Fetch-all ERP error:', error);
    await logError(error, { action: 'read', entityType: 'erp_production_orders' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}




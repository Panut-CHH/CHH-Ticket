import { NextResponse } from 'next/server';

// Server-side fetch-all ERP production orders with short-lived in-memory cache
const ERP_BASE_URL = 'https://evergreen-bn.vercel.app/api/productionOrder';
const ERP_API_KEY = 'Bearer $2a$12$P5ikNWsRcf9o/8/zfuvQ2.u2ZrjmReGa.q8ljT37GmcgT9.Wb7Qtm';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function GET() {
  try {
    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: cache.data, fromCache: true });
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
    return NextResponse.json({ success: true, data: list, fromCache: false, total: list.length });
  } catch (error) {
    console.error('Fetch-all ERP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}




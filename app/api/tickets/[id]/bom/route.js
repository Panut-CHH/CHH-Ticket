import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logApiCall, logError } from '@/utils/activityLogger';

async function createSupabaseClient(request) {
  const cookieStore = cookies();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : undefined,
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function GET(request, { params }) {
  const ticketId = params?.id;
  try {
    if (!ticketId) {
      return NextResponse.json({ success: false, error: 'ticket id required' }, { status: 400 });
    }

    const supabase = await createSupabaseClient(request);

    // Authn: allow authenticated read (RLS enforces). If no user, still try; RLS will block.
    const { data, error } = await supabase
      .from('ticket_bom')
      .select('material_name, quantity, unit')
      .eq('ticket_no', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logApiCall(request, 'read', 'ticket_bom', ticketId, null, 'success', null);
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    await logError(error, { action: 'read', entityType: 'ticket_bom', entityId: ticketId }, request);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}



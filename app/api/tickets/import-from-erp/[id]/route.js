import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchProductionOrder } from '@/utils/erpApi';
import { logApiCall, logError } from '@/utils/activityLogger';

// Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function pickErpFields(record) {
  const id = record?.No || record?.no || record?.RPD_No || record?.rpdNo || record?.orderNumber || record?.Order_No || record?.No_ || record?.id;
  const itemCode = record?.Source_No || record?.Item_No || record?.itemCode || record?.Item_Code || record?.Source_Item || '';
  const description = record?.Description || record?.description || '';
  const description2 = record?.Description_2 || record?.description2 || '';
  const dueDate = record?.Delivery_Date || record?.deliveryDate || record?.Ending_Date_Time || record?.Ending_Date || record?.Due_Date || '';
  const quantity = Number(record?.Quantity ?? record?.quantity ?? 0) || 0;
  const rpdNo = String(id || '').trim();
  return { rpdNo, itemCode, description, description2, dueDate, quantity };
}

export async function GET(req, { params }) {
  try {
    const id = decodeURIComponent(params?.id || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

    const erpResp = await fetchProductionOrder(id);
    if (!erpResp?.success || !erpResp?.data) {
      return NextResponse.json({ success: false, error: 'ERP record not found' }, { status: 404 });
    }

    const raw = erpResp.data?.data ? erpResp.data.data : erpResp.data;
    const { rpdNo, itemCode, description, description2, dueDate, quantity } = pickErpFields(raw);
    if (!rpdNo) {
      return NextResponse.json({ success: false, error: 'Invalid ERP payload' }, { status: 422 });
    }

    // Upsert into ticket table (no flows here; admin can add flows later)
    const { data: upserted, error } = await supabaseAdmin
      .from('ticket')
      .upsert({
        no: rpdNo,
        source_no: itemCode || rpdNo,
        description: description || '',
        description_2: description2 || '',
        due_date: dueDate || null,
        quantity: quantity || 0,
      }, { onConflict: 'no' })
      .select('no')
      .maybeSingle();

    if (error) throw error;

    const response = NextResponse.json({ success: true, data: { no: upserted?.no || rpdNo } });
    await logApiCall(req, 'create', 'ticket_import', upserted?.no || rpdNo, {
      source: 'erp',
      rpd_no: rpdNo,
      item_code: itemCode
    }, 'success', null);
    return response;
  } catch (e) {
    console.error('[IMPORT ERP] error:', e);
    await logError(e, { action: 'create', entityType: 'ticket_import', entityId: (await params)?.id }, req);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}




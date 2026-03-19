import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall } from '@/utils/activityLogger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/penalties/[id]/approve
 * อนุมัติหรือปฏิเสธการหักเงิน (Admin only)
 * Body: { action: 'approve' | 'reject', user_id: uuid, rejection_reason?: string }
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, user_id, rejection_reason } = body;

    if (!id || !action || !user_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Check if user is Admin/SuperAdmin
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('role, roles, name, email')
      .eq('id', user_id)
      .maybeSingle();

    const userRoles = userRow?.roles || (userRow?.role ? [userRow.role] : []);
    const normalizedRoles = userRoles.map(r => String(r).toLowerCase());
    const isAdmin = normalizedRoles.some(r => r === 'admin' || r === 'superadmin');

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only Admin can approve/reject penalties' },
        { status: 403 }
      );
    }

    // Check current penalty status
    const { data: penalty, error: fetchError } = await supabaseAdmin
      .from('penalty_deductions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !penalty) {
      return NextResponse.json(
        { success: false, error: 'Penalty not found' },
        { status: 404 }
      );
    }

    if (penalty.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Penalty already ${penalty.status}` },
        { status: 400 }
      );
    }

    // Update penalty status
    const updateData = {
      status: action === 'approve' ? 'approved' : 'rejected',
      approved_by: user_id,
      approved_at: new Date().toISOString()
    };
    if (action === 'reject' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('penalty_deductions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log the action
    await logApiCall(request, `penalty_${action}`, 'penalty_deduction', id, {
      penalty_id: id,
      technician_id: penalty.technician_id,
      ticket_no: penalty.ticket_no,
      amount: penalty.amount,
      action_taken: action,
      rejection_reason: rejection_reason || null
    }, 'success', null, { id: user_id, email: userRow?.email, name: userRow?.name });

    return NextResponse.json({
      success: true,
      message: `Penalty ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: updated
    });

  } catch (error) {
    console.error('[API] Error approving/rejecting penalty:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

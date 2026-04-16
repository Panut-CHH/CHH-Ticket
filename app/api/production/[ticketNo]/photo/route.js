import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/production/[ticketNo]/photo
 * อัปโหลดรูปถ่ายงานสำหรับสถานี (optional — ถ่ายครั้งเดียวต่อสถานีก็พอ)
 *
 * FormData:
 *   file: File (image)
 *   step_order: number
 *   station_id: string (uuid)
 */
export async function POST(request, { params }) {
  try {
    const { ticketNo } = await params;
    const formData = await request.formData();

    const file = formData.get('file');
    const stepOrder = parseInt(formData.get('step_order'));
    const stationId = formData.get('station_id');

    if (!file || !stepOrder || !stationId) {
      return NextResponse.json(
        { success: false, error: 'Missing file, step_order, or station_id' },
        { status: 400 }
      );
    }

    // Validate image type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'อนุญาตเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP)' },
        { status: 400 }
      );
    }

    // Validate size (5MB max สำหรับรูปถ่ายจากมือถือ)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'รูปใหญ่เกิน 5MB' },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${ticketNo}/step${stepOrder}_${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('station-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('[PHOTO] Upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: 'อัปโหลดรูปไม่สำเร็จ: ' + uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('station-photos')
      .getPublicUrl(fileName);

    // Save URL to ticket_station_flow
    const { error: updateError } = await supabaseAdmin
      .from('ticket_station_flow')
      .update({ photo_url: publicUrl })
      .eq('ticket_no', ticketNo)
      .eq('station_id', stationId)
      .eq('step_order', stepOrder);

    if (updateError) {
      console.error('[PHOTO] DB update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'บันทึก URL ไม่สำเร็จ' },
        { status: 500 }
      );
    }

    console.log('[PHOTO] Uploaded:', { ticketNo, stepOrder, publicUrl });

    return NextResponse.json({
      success: true,
      photo_url: publicUrl
    });
  } catch (error) {
    console.error('[PHOTO] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

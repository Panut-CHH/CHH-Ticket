import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';

/**
 * POST /api/tickets
 * สร้าง ticket ใหม่
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      project_id, 
      no, 
      description, 
      quantity = 0, 
      priority = 'Medium', 
      status = 'Pending',
      customer_name = '',
      due_date = null,
      source_no = null
    } = body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!no) {
      return NextResponse.json(
        { success: false, error: 'no is required' },
        { status: 400 }
      );
    }

    let finalProjectId = project_id;

    // ถ้าไม่มี project_id แต่มี source_no → ค้นหา project_id จาก item_code
    if (!finalProjectId && source_no) {
      try {
        const { data: project, error: projectError } = await supabaseServer
          .from('projects')
          .select('id')
          .eq('item_code', source_no)
          .single();

        if (!projectError && project) {
          finalProjectId = project.id;
          console.log(`Auto-linked ticket ${no} to project ${project.id} via source_no ${source_no}`);
        } else {
          console.warn(`No project found for source_no ${source_no} in ticket ${no}`);
        }
      } catch (linkError) {
        console.warn(`Error linking ticket ${no} to project via source_no ${source_no}:`, linkError);
      }
    }

    // สร้าง ticket ในฐานข้อมูล
    const { data: ticket, error } = await supabaseServer
      .from('ticket')
      .insert({
        project_id: finalProjectId,
        no,
        description,
        quantity,
        priority,
        status,
        customer_name,
        due_date,
        source_no
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating ticket:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: ticket,
      message: 'Ticket created successfully'
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tickets
 * ดึงรายการ tickets ทั้งหมด
 */
export async function GET(request) {
  try {
    const { data: tickets, error } = await supabaseServer
      .from('ticket')
      .select(`
        *,
        projects (
          id,
          project_number,
          project_name,
          item_code
        )
      `)
      .order('no', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: tickets,
      total: tickets.length
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

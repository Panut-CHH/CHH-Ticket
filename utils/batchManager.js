import { supabaseServer } from "@/utils/supabaseServer";

/**
 * สร้างการแยก Batch หลังจาก QC
 */
export async function createBatchSplit(ticketNo, passQty, failQty, qcSessionId) {
  try {
    const admin = supabaseServer;
    const batches = [];

    // สร้าง Batch สำหรับชิ้นงานที่ผ่าน
    if (passQty > 0) {
      const { data: passBatch, error: passBatchError } = await admin
        .from('ticket_batches')
        .insert({
          ticket_no: ticketNo,
          batch_name: 'Batch A (ผ่าน)',
          quantity: passQty,
          status: 'in_progress',
          qc_session_id: qcSessionId
        })
        .select()
        .single();

      if (passBatchError) {
        throw new Error(`Failed to create pass batch: ${passBatchError.message}`);
      }
      batches.push(passBatch);
    }

    // สร้าง Batch สำหรับชิ้นงานที่ไม่ผ่าน
    if (failQty > 0) {
      const { data: failBatch, error: failBatchError } = await admin
        .from('ticket_batches')
        .insert({
          ticket_no: ticketNo,
          batch_name: 'Batch B (ไม่ผ่าน)',
          quantity: failQty,
          status: 'rework',
          qc_session_id: qcSessionId
        })
        .select()
        .single();

      if (failBatchError) {
        throw new Error(`Failed to create fail batch: ${failBatchError.message}`);
      }
      batches.push(failBatch);
    }

    return batches;
  } catch (error) {
    console.error('Error in createBatchSplit:', error);
    throw error;
  }
}

/**
 * ดึงข้อมูล Batches ของตั๋ว
 */
export async function getBatchesByTicket(ticketNo) {
  try {
    const admin = supabaseServer;
    
    const { data: batches, error } = await admin
      .from('ticket_batches')
      .select(`
        *,
        stations(name_th, code),
        qc_sessions(id, inspector, inspected_date)
      `)
      .eq('ticket_no', ticketNo)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch batches: ${error.message}`);
    }

    return batches || [];
  } catch (error) {
    console.error('Error in getBatchesByTicket:', error);
    throw error;
  }
}

/**
 * อัปเดตสถานะ Batch
 */
export async function updateBatchStatus(batchId, status, currentStationId = null) {
  try {
    const admin = supabaseServer;
    
    const updateData = { status };
    if (currentStationId) {
      updateData.current_station_id = currentStationId;
    }

    const { data, error } = await admin
      .from('ticket_batches')
      .update(updateData)
      .eq('id', batchId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update batch status: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error in updateBatchStatus:', error);
    throw error;
  }
}

/**
 * ตรวจสอบว่า Batches สามารถรวมได้หรือไม่
 */
export async function canMergeBatches(batchIds) {
  try {
    const admin = supabaseServer;
    
    const { data: batches, error } = await admin
      .from('ticket_batches')
      .select('status, ticket_no')
      .in('id', batchIds);

    if (error) {
      throw new Error(`Failed to check batches: ${error.message}`);
    }

    // ตรวจสอบว่าทุก batch อยู่ในสถานะที่สามารถรวมได้
    const mergeableStatuses = ['completed', 'in_progress'];
    const canMerge = batches.every(batch => 
      mergeableStatuses.includes(batch.status)
    );

    // ตรวจสอบว่าทุก batch เป็นตั๋วเดียวกัน
    const sameTicket = batches.every(batch => 
      batch.ticket_no === batches[0].ticket_no
    );

    return canMerge && sameTicket;
  } catch (error) {
    console.error('Error in canMergeBatches:', error);
    throw error;
  }
}

/**
 * รวม Batches เป็นอันเดียว
 */
export async function mergeBatches(batchIds, targetStationId, approvedBy) {
  try {
    const admin = supabaseServer;

    // 1. ดึงข้อมูล batches
    const { data: batches, error: batchesError } = await admin
      .from('ticket_batches')
      .select('*')
      .in('id', batchIds);

    if (batchesError || !batches || batches.length === 0) {
      throw new Error('Batches not found');
    }

    // 2. คำนวณจำนวนรวม
    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const ticketNo = batches[0].ticket_no;

    // 3. สร้าง batch ใหม่ที่รวมแล้ว
    const { data: mergedBatch, error: mergedBatchError } = await admin
      .from('ticket_batches')
      .insert({
        ticket_no: ticketNo,
        batch_name: 'Merged Batch',
        quantity: totalQuantity,
        current_station_id: targetStationId,
        status: 'in_progress'
      })
      .select()
      .single();

    if (mergedBatchError) {
      throw new Error(`Failed to create merged batch: ${mergedBatchError.message}`);
    }

    // 4. อัปเดต ticket_station_flow
    const { error: flowUpdateError } = await admin
      .from('ticket_station_flow')
      .update({
        batch_id: mergedBatch.id
      })
      .in('batch_id', batchIds);

    if (flowUpdateError) {
      console.warn('Failed to update flows:', flowUpdateError);
    }

    // 5. อัปเดตสถานะ batches เดิม
    const { error: batchStatusError } = await admin
      .from('ticket_batches')
      .update({
        status: 'completed'
      })
      .in('id', batchIds);

    if (batchStatusError) {
      console.warn('Failed to update batch status:', batchStatusError);
    }

    return {
      mergedBatch,
      totalQuantity,
      sourceBatchIds: batchIds
    };
  } catch (error) {
    console.error('Error in mergeBatches:', error);
    throw error;
  }
}

/**
 * ดึงข้อมูล Batch พร้อมสถานะปัจจุบัน
 */
export async function getBatchWithStatus(batchId) {
  try {
    const admin = supabaseServer;
    
    const { data: batch, error } = await admin
      .from('ticket_batches')
      .select(`
        *,
        stations(name_th, code),
        qc_sessions(id, inspector, inspected_date),
        ticket_station_flow(
          id,
          status,
          step_order,
          stations(name_th, code)
        )
      `)
      .eq('id', batchId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch batch: ${error.message}`);
    }

    return batch;
  } catch (error) {
    console.error('Error in getBatchWithStatus:', error);
    throw error;
  }
}






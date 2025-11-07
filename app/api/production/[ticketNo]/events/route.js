import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/production/[ticketNo]/events
 * Server-Sent Events endpoint for real-time updates
 */
export async function GET(request, { params }) {
  const { ticketNo } = await params;
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const data = JSON.stringify({
        type: 'connected',
        ticketNo,
        timestamp: new Date().toISOString()
      });
      controller.enqueue(`data: ${data}\n\n`);

      // Set up Supabase realtime subscription
      const channel = supabaseAdmin
        .channel(`sse-${ticketNo}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'ticket_station_flow',
            filter: `ticket_no=eq.${ticketNo}`
          },
          (payload) => {
            const data = JSON.stringify({
              type: 'flow_change',
              ticketNo,
              payload,
              timestamp: new Date().toISOString()
            });
            controller.enqueue(`data: ${data}\n\n`);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'ticket_assignments',
            filter: `ticket_no=eq.${ticketNo}`
          },
          (payload) => {
            const data = JSON.stringify({
              type: 'assignment_change',
              ticketNo,
              payload,
              timestamp: new Date().toISOString()
            });
            controller.enqueue(`data: ${data}\n\n`);
          }
        )
        .subscribe((status) => {
          const data = JSON.stringify({
            type: 'subscription_status',
            ticketNo,
            status,
            timestamp: new Date().toISOString()
          });
          controller.enqueue(`data: ${data}\n\n`);
        });

      // Fallback: Polling mechanism (every 2 seconds)
      let lastData = null;
      const pollInterval = setInterval(async () => {
        try {
          // Get current data
          const { data: flows, error } = await supabaseAdmin
            .from('ticket_station_flow')
            .select('*')
            .eq('ticket_no', ticketNo)
            .order('step_order', { ascending: true });

          if (error) {
            console.error('[SSE] Polling error:', error);
            return;
          }

          // Check if data changed
          const currentData = JSON.stringify(flows);
          if (lastData && lastData !== currentData) {
            const data = JSON.stringify({
              type: 'flow_change',
              ticketNo,
              payload: { new: flows, old: null },
              timestamp: new Date().toISOString(),
              source: 'polling'
            });
            controller.enqueue(`data: ${data}\n\n`);
          }
          
          lastData = currentData;
        } catch (e) {
          console.error('[SSE] Polling failed:', e);
        }
      }, 2000); // Poll every 2 seconds

      // Store cleanup function
      this.cleanup = () => {
        supabaseAdmin.removeChannel(channel);
        clearInterval(pollInterval);
        controller.close();
      };
    },
    cancel() {
      if (this.cleanup) {
        this.cleanup();
      }
    }
  });

  try {
    const response = new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
    await logApiCall(request, 'read', 'production_events', ticketNo, { sse: true }, 'success', null);
    return response;
  } catch (e) {
    await logError(e, { action: 'read', entityType: 'production_events', entityId: ticketNo }, request);
    throw e;
  }
}

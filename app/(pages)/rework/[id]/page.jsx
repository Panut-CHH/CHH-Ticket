"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft,
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Users, 
  Calendar,
  MapPin,
  User,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleGuard from '@/components/RoleGuard';
import { supabase } from '@/utils/supabaseClient';

export default function ReworkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reworkOrderId = params?.id;
  
  const [reworkOrder, setReworkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (reworkOrderId) {
      loadReworkOrder();
      
      // Realtime subscription
      const channel = supabase
        .channel('rework-order-detail-realtime')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'rework_orders',
          filter: `id=eq.${reworkOrderId}`
        }, () => {
          loadReworkOrder();
        })
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'rework_roadmap',
          filter: `rework_order_id=eq.${reworkOrderId}`
        }, () => {
          loadReworkOrder();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [reworkOrderId]);

  const loadReworkOrder = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('rework_orders')
        .select(`
          *,
          rework_roadmap(
            *,
            stations(name_th, code),
            users(name)
          ),
          ticket_batches(*),
          users!rework_orders_created_by_fkey(name),
          users!rework_orders_approved_by_fkey(name)
        `)
        .eq('id', reworkOrderId)
        .single();

      if (error) {
        console.error('Error loading rework order:', error);
        router.push('/rework');
        return;
      }

      setReworkOrder(data);
    } catch (error) {
      console.error('Error:', error);
      router.push('/rework');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      
      const response = await fetch(`/api/rework/${reworkOrderId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approvedBy: 'current-user-id', // จะต้องดึงจาก auth context
          notes: 'อนุมัติโดย Admin'
        })
      });

      if (response.ok) {
        await loadReworkOrder();
        alert('อนุมัติ Rework Order สำเร็จ');
      } else {
        const error = await response.json();
        alert(`เกิดข้อผิดพลาด: ${error.error}`);
      }
    } catch (error) {
      console.error('Error approving rework order:', error);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('กรุณาระบุเหตุผลที่ปฏิเสธ:');
    if (!reason) return;

    try {
      setActionLoading(true);
      
      const response = await fetch(`/api/rework/${reworkOrderId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rejectedBy: 'current-user-id', // จะต้องดึงจาก auth context
          reason: reason
        })
      });

      if (response.ok) {
        await loadReworkOrder();
        alert('ปฏิเสธ Rework Order สำเร็จ');
      } else {
        const error = await response.json();
        alert(`เกิดข้อผิดพลาด: ${error.error}`);
      }
    } catch (error) {
      console.error('Error rejecting rework order:', error);
      alert('เกิดข้อผิดพลาดในการปฏิเสธ');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { 
        icon: Clock, 
        text: 'รออนุมัติ', 
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' 
      },
      approved: { 
        icon: CheckCircle, 
        text: 'อนุมัติแล้ว', 
        className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
      },
      rejected: { 
        icon: XCircle, 
        text: 'ปฏิเสธ', 
        className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' 
      },
      in_progress: { 
        icon: Play, 
        text: 'กำลังดำเนินการ', 
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' 
      },
      completed: { 
        icon: CheckCircle, 
        text: 'เสร็จสมบูรณ์', 
        className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
      },
      cancelled: { 
        icon: XCircle, 
        text: 'ยกเลิก', 
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300' 
      }
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
        <Icon className="w-4 h-4" />
        {badge.text}
      </span>
    );
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      minor: { 
        text: 'Minor', 
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' 
      },
      major: { 
        text: 'Major', 
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' 
      },
      custom: { 
        text: 'Custom', 
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' 
      }
    };

    const badge = badges[severity] || badges.major;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
        {badge.text}
      </span>
    );
  };

  const getStepStatusBadge = (status) => {
    const badges = {
      pending: { 
        icon: Clock, 
        text: 'รอเริ่ม', 
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300' 
      },
      in_progress: { 
        icon: Play, 
        text: 'กำลังทำ', 
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' 
      },
      completed: { 
        icon: CheckCircle, 
        text: 'เสร็จแล้ว', 
        className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
      }
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        <Icon className="w-3 h-3" />
        {badge.text}
      </span>
    );
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['admin', 'superadmin']}>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </RoleGuard>
      </ProtectedRoute>
    );
  }

  if (!reworkOrder) {
    return (
      <ProtectedRoute>
        <RoleGuard allowedRoles={['admin', 'superadmin']}>
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                ไม่พบ Rework Order
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Rework Order ที่คุณกำลังมองหาอาจถูกลบหรือไม่มีอยู่
              </p>
              <Link 
                href="/rework"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับไปหน้ารายการ
              </Link>
            </div>
          </div>
        </RoleGuard>
      </ProtectedRoute>
    );
  }

  const progressPercentage = reworkOrder.rework_roadmap?.length > 0 
    ? Math.round((reworkOrder.rework_roadmap.filter(step => step.status === 'completed').length / reworkOrder.rework_roadmap.length) * 100)
    : 0;

  return (
    <ProtectedRoute>
      <RoleGuard allowedRoles={['admin', 'superadmin']}>
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link 
                  href="/rework"
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Rework Order: {reworkOrder.ticket_no}
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    รายละเอียดและความคืบหน้าของ Rework Order
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {getStatusBadge(reworkOrder.approval_status)}
                {getSeverityBadge(reworkOrder.severity)}
                {reworkOrder.status !== 'pending' && getStatusBadge(reworkOrder.status)}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Order Info */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    ข้อมูล Rework Order
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ตั๋ว
                      </label>
                      <p className="text-gray-900 dark:text-gray-100 font-medium">
                        {reworkOrder.ticket_no}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        จำนวนชิ้นงาน
                      </label>
                      <p className="text-gray-900 dark:text-gray-100 font-medium">
                        {reworkOrder.quantity} ชิ้น
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        สร้างโดย
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">
                        {reworkOrder.users?.name || 'ไม่ระบุ'}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        วันที่สร้าง
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">
                        {new Date(reworkOrder.created_at).toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      สาเหตุ
                    </label>
                    <p className="text-gray-900 dark:text-gray-100">
                      {reworkOrder.reason}
                    </p>
                  </div>

                  {reworkOrder.notes && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        หมายเหตุ
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">
                        {reworkOrder.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Roadmap */}
                {reworkOrder.rework_roadmap && reworkOrder.rework_roadmap.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Rework Roadmap
                      </h2>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        ความคืบหน้า: {progressPercentage}%
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4">
                      {reworkOrder.rework_roadmap.map((step, index) => (
                        <div key={step.id} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-slate-600 rounded-lg">
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-300">
                            {index + 1}
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                                {step.station_name || step.stations?.name_th || 'ไม่ระบุสถานี'}
                              </h3>
                              {getStepStatusBadge(step.status)}
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                              {step.users && (
                                <div className="flex items-center gap-1">
                                  <User className="w-4 h-4" />
                                  <span>{step.users.name}</span>
                                </div>
                              )}
                              {step.estimated_hours && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>{step.estimated_hours} ชม.</span>
                                </div>
                              )}
                            </div>
                            
                            {step.notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {step.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Actions */}
                {reworkOrder.approval_status === 'pending' && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      การดำเนินการ
                    </h3>
                    
                    <div className="space-y-3">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                      >
                        {actionLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <ThumbsUp className="w-4 h-4" />
                        )}
                        อนุมัติ
                      </button>
                      
                      <button
                        onClick={handleReject}
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        ปฏิเสธ
                      </button>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Timeline
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          สร้าง Rework Order
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(reworkOrder.created_at).toLocaleString('th-TH')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          โดย: {reworkOrder.users?.name || 'ไม่ระบุ'}
                        </p>
                      </div>
                    </div>

                    {reworkOrder.approved_at && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            อนุมัติแล้ว
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(reworkOrder.approved_at).toLocaleString('th-TH')}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            โดย: {reworkOrder.users?.name || 'ไม่ระบุ'}
                          </p>
                        </div>
                      </div>
                    )}

                    {reworkOrder.completed_at && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            เสร็จสมบูรณ์
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(reworkOrder.completed_at).toLocaleString('th-TH')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Batch Info */}
                {reworkOrder.ticket_batches && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      ข้อมูล Batch
                    </h3>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">ชื่อ Batch:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {reworkOrder.ticket_batches.batch_name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">จำนวน:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {reworkOrder.ticket_batches.quantity} ชิ้น
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">สถานะ:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {reworkOrder.ticket_batches.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}






"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Users, 
  Calendar,
  Filter,
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleGuard from '@/components/RoleGuard';
import { supabase } from '@/utils/supabaseClient';

export default function ReworkOrdersPage() {
  const [reworkOrders, setReworkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadReworkOrders();
    
    // Realtime subscription
    const channel = supabase
      .channel('rework-orders-realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'rework_orders' 
      }, () => {
        loadReworkOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadReworkOrders = async () => {
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
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading rework orders:', error);
      } else {
        setReworkOrders(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (orderId) => {
    try {
      setActionLoading(orderId);
      
      const response = await fetch(`/api/rework/${orderId}/approve`, {
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
        await loadReworkOrders();
        alert('อนุมัติ Rework Order สำเร็จ');
      } else {
        const error = await response.json();
        alert(`เกิดข้อผิดพลาด: ${error.error}`);
      }
    } catch (error) {
      console.error('Error approving rework order:', error);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (orderId) => {
    const reason = prompt('กรุณาระบุเหตุผลที่ปฏิเสธ:');
    if (!reason) return;

    try {
      setActionLoading(orderId);
      
      const response = await fetch(`/api/rework/${orderId}/reject`, {
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
        await loadReworkOrders();
        alert('ปฏิเสธ Rework Order สำเร็จ');
      } else {
        const error = await response.json();
        alert(`เกิดข้อผิดพลาด: ${error.error}`);
      }
    } catch (error) {
      console.error('Error rejecting rework order:', error);
      alert('เกิดข้อผิดพลาดในการปฏิเสธ');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredOrders = reworkOrders.filter(order => {
    const matchesFilter = filter === 'all' || order.approval_status === filter;
    const matchesSearch = order.ticket_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.reason.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

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
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
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

  return (
    <ProtectedRoute>
      <RoleGuard allowedRoles={['admin', 'superadmin']}>
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    จัดการ Rework Orders
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    อนุมัติหรือปฏิเสธคำขอ Rework จาก QC
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    ทั้งหมด: {reworkOrders.length} | รออนุมัติ: {reworkOrders.filter(o => o.approval_status === 'pending').length}
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="ค้นหาตั๋วหรือสาเหตุ..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  {['all', 'pending', 'approved', 'rejected'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilter(status)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        filter === status
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {status === 'all' ? 'ทั้งหมด' : 
                       status === 'pending' ? 'รออนุมัติ' :
                       status === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Orders List */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    ไม่พบ Rework Orders
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {filter === 'all' ? 'ยังไม่มี Rework Orders' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-slate-700">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="p-6 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {order.ticket_no}
                            </h3>
                            {getStatusBadge(order.approval_status)}
                            {getSeverityBadge(order.severity)}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Users className="w-4 h-4" />
                              <span>จำนวน: {order.quantity} ชิ้น</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Calendar className="w-4 h-4" />
                              <span>สร้าง: {new Date(order.created_at).toLocaleDateString('th-TH')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <span>โดย: {order.users?.name || 'ไม่ระบุ'}</span>
                            </div>
                          </div>

                          <div className="mb-3">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              <strong>สาเหตุ:</strong> {order.reason}
                            </p>
                            {order.notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                <strong>หมายเหตุ:</strong> {order.notes}
                              </p>
                            )}
                          </div>

                          {order.rework_roadmap && order.rework_roadmap.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Roadmap ({order.rework_roadmap.length} ขั้นตอน):
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {order.rework_roadmap.slice(0, 3).map((step, index) => (
                                  <span key={index} className="text-xs bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                                    {index + 1}. {step.station_name || step.stations?.name_th || 'ไม่ระบุ'}
                                  </span>
                                ))}
                                {order.rework_roadmap.length > 3 && (
                                  <span className="text-xs text-gray-500">
                                    +{order.rework_roadmap.length - 3} อื่นๆ
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowDetailModal(true);
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {order.approval_status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(order.id)}
                                disabled={actionLoading === order.id}
                                className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="อนุมัติ"
                              >
                                {actionLoading === order.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                ) : (
                                  <ThumbsUp className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleReject(order.id)}
                                disabled={actionLoading === order.id}
                                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="ปฏิเสธ"
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}






"use client";

import React, { useEffect, useState } from "react";
import { FileText, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { t } from "@/utils/translations";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";

export default function DashboardPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'rework'
  const [totalTickets, setTotalTickets] = useState(0);
  const [inProgressTickets, setInProgressTickets] = useState(0);
  const [completedTickets, setCompletedTickets] = useState(0);

  // Animate numbers
  useEffect(() => {
    const animateNumber = (setter, targetNumber, duration = 800) => {
      const startTime = Date.now();
      const startNumber = 0;
      
      function update() {
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentNumber = Math.floor(startNumber + (targetNumber - startNumber) * progress);
        setter(currentNumber);
        
        if (progress < 1) {
          requestAnimationFrame(update);
        }
      }
      
      update();
    };

    setTimeout(() => {
      animateNumber(setTotalTickets, 1234);
      animateNumber(setInProgressTickets, 456);
      animateNumber(setCompletedTickets, 778);
    }, 500);
  }, []);

  const recentTickets = [
    {
      id: "D-001",
      title: language === "th" ? "บาน 4.5x(95+45)x265 ไม้สัก พร้อมวงกบ" : "Door 4.5x(95+45)x265 Teak with Frame",
      status: language === "th" ? "กำลังดำเนินการ" : "In Progress",
      assignee: language === "th" ? "ช่างวิทวัส" : "Craftsman Witwat",
      date: language === "th" ? "2 ชั่วโมงที่แล้ว" : "2 hours ago"
    },
    {
      id: "F-002",
      title: language === "th" ? "วงกบ 3.5x(95+45)x265 ไม้ยาง เซาะร่องยาง" : "Frame 3.5x(95+45)x265 Rubber Wood Grooved",
      status: language === "th" ? "เสร็จสิ้น" : "Completed",
      assignee: language === "th" ? "ช่างศิวกร" : "Craftsman Siwakorn",
      date: language === "th" ? "5 ชั่วโมงที่แล้ว" : "5 hours ago"
    },
    {
      id: "D-003",
      title: language === "th" ? "บาน 3.5x(80+40)x200 MDF ติดตั้งบานพับ+ลูกบิด" : "Door 3.5x(80+40)x200 MDF with Hinges+Knob",
      status: language === "th" ? "กำลังดำเนินการ" : "In Progress",
      assignee: language === "th" ? "ช่างอดิศักดิ์" : "Craftsman Adisak",
      date: language === "th" ? "1 วันที่แล้ว" : "1 day ago"
    },
    {
      id: "F-004",
      title: language === "th" ? "วงกบ 3.5x(90+45)x210 ทาสีขาว ด้านละ 2 เที่ยว" : "Frame 3.5x(90+45)x210 White Paint 2 Coats",
      status: language === "th" ? "เสร็จสิ้น" : "Completed",
      assignee: language === "th" ? "ช่างสมพร" : "Craftsman Somporn",
      date: language === "th" ? "2 วันที่แล้ว" : "2 days ago"
    },
    {
      id: "D-005",
      title: language === "th" ? "บานคู่ 4.5x(120+60)x200 ประกอบวงกบ" : "Double Door 4.5x(120+60)x200 with Frame",
      status: language === "th" ? "รอดำเนินการ" : "Pending",
      assignee: "-",
      date: language === "th" ? "3 วันที่แล้ว" : "3 days ago"
    }
  ];

  const getStatusBadge = (status) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    
    switch (status) {
      case "เสร็จสิ้น":
        return `${baseClasses} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300`;
      case "กำลังดำเนินการ":
        return `${baseClasses} bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300`;
      case "รอดำเนินการ":
        return `${baseClasses} bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300`;
      default:
        return `${baseClasses} bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300`;
    }
  };

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/dashboard">
        <div className="min-h-screen p-1 sm:p-1.5 md:p-2 lg:p-3 xl:p-4 animate-fadeInUp">
      {/* Header */}
      <header className="mb-1 sm:mb-2 md:mb-3 lg:mb-4">
        <h1 className="text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('dashboard', language)} - {language === 'th' ? 'การผลิตประตูและวงกบ' : 'Door and Frame Production'}</h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-400 mt-0.5">{language === 'th' ? 'ภาพรวมสถานะงานประตูและวงกบ' : 'Overview of door and frame production status'}</p>
      </header>
      
      {/* Tabs */}
      <div className="mb-1 sm:mb-2 md:mb-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {language === 'th' ? 'ภาพรวม' : 'Overview'}
          </button>
          <button
            onClick={() => setActiveTab('rework')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'rework'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {language === 'th' ? 'Rework Orders' : 'Rework Orders'}
          </button>
        </div>
      </div>
      
      {activeTab === 'overview' && (
      <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 sm:gap-1.5 md:gap-2 lg:gap-3 mb-1 sm:mb-2 md:mb-3 lg:mb-4">
        {/* Total Tickets Card */}
        <div className="stat-card animate-fadeInUpSmall bg-white dark:bg-slate-800 rounded-md shadow-sm border border-gray-200 dark:border-slate-700 p-1.5 sm:p-2 md:p-3 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-400">ออเดอร์ทั้งหมด</p>
              <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100 mt-0.5 animate-countUp">{totalTickets.toLocaleString()}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-1 animate-pulse">
              <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-600" />
            </div>
          </div>
          <div className="mt-1 flex items-center text-xs">
            <span className="text-green-600 font-medium">+12%</span>
            <span className="text-gray-500 dark:text-gray-400 dark:text-gray-400 ml-1">จากเดือนที่แล้ว</span>
          </div>
        </div>
        
        {/* In Progress Tickets Card */}
        <div className="stat-card animate-fadeInUpSmall bg-white dark:bg-slate-800 rounded-md shadow-sm border border-gray-200 dark:border-slate-700 p-1.5 sm:p-2 md:p-3 hover:shadow-lg transition-all duration-300 hover:-translate-y-1" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">กำลังผลิต</p>
              <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5 animate-countUp">{inProgressTickets.toLocaleString()}</p>
            </div>
            <div className="bg-amber-100 rounded-full p-1 animate-pulse">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-amber-600" />
            </div>
          </div>
          <div className="mt-1 flex items-center text-xs">
            <span className="text-amber-600 font-medium">37%</span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">ของออเดอร์ทั้งหมด</span>
          </div>
        </div>
        
        {/* Completed Tickets Card */}
        <div className="stat-card animate-fadeInUpSmall bg-white dark:bg-slate-800 rounded-md shadow-sm border border-gray-200 dark:border-slate-700 p-1.5 sm:p-2 md:p-3 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 md:col-span-2 lg:col-span-1" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">ผลิตเสร็จแล้ว</p>
              <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5 animate-countUp">{completedTickets.toLocaleString()}</p>
            </div>
            <div className="bg-green-100 rounded-full p-1 animate-pulse">
              <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-green-600" />
            </div>
          </div>
          <div className="mt-1 flex items-center text-xs">
            <span className="text-green-600 font-medium">63%</span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">ของออเดอร์ทั้งหมด</span>
          </div>
        </div>
      </div>
      

      {/* Recent Tickets Table */}
      <div className="bg-white dark:bg-slate-800 rounded-md shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden animate-fadeInUpSmall" style={{ animationDelay: '0.4s' }}>
        <div className="p-1.5 sm:p-2 md:p-3 border-b border-gray-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">ออเดอร์ล่าสุด</h2>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
              <tr>
                <th className="px-1.5 sm:px-2 md:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                <th className="px-1.5 sm:px-2 md:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">หัวข้อ</th>
                <th className="px-1.5 sm:px-2 md:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                <th className="px-1.5 sm:px-2 md:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">ผู้รับผิดชอบ</th>
                <th className="px-1.5 sm:px-2 md:px-3 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">วันที่</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {recentTickets.map((ticket, index) => (
                <tr key={ticket.id} className="transition-all duration-150 hover:bg-gray-50 dark:hover:bg-slate-700 hover:translate-x-1">
                  <td className="px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 whitespace-nowrap text-xs font-medium text-gray-900 dark:text-gray-100">{ticket.id}</td>
                  <td className="px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 hidden md:table-cell">{ticket.title}</td>
                  <td className="px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 whitespace-nowrap">
                    <span className={getStatusBadge(ticket.status)}>{ticket.status}</span>
                  </td>
                  <td className="px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 hidden md:table-cell">{ticket.assignee}</td>
                  <td className="px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{ticket.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
      
      {activeTab === 'rework' && (
        <ReworkOrdersTab language={language} />
      )}
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

// Rework Orders Tab Component
function ReworkOrdersTab({ language }) {
  const { user } = useAuth();
  const [reworkOrders, setReworkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadReworkOrders();
  }, []);

  const loadReworkOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rework_orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setReworkOrders(data || []);
    } catch (e) {
      console.error('Error loading rework orders:', e);
      setReworkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (orderId) => {
    try {
      setActionLoading(orderId);
      
      // รับ user ID จาก AuthContext
      const approvedBy = user?.id || user?.email || 'admin-user-id';
      
      const response = await fetch(`/api/rework/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to approve');
      }
      
      await loadReworkOrders();
      
      if (language === 'th') {
        alert('อนุมัติ Rework Order เรียบร้อย');
      } else {
        alert('Rework Order approved successfully');
      }
    } catch (e) {
      console.error('Error approving:', e);
      alert(language === 'th' ? `เกิดข้อผิดพลาด: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (orderId) => {
    if (!confirm(language === 'th' ? 'ต้องการปฏิเสธ Rework Order นี้?' : 'Reject this Rework Order?')) return;
    
    try {
      setActionLoading(orderId);
      
      const rejectedBy = user?.id || user?.email || 'admin-user-id';
      
      const response = await fetch(`/api/rework/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectedBy })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject');
      }
      
      await loadReworkOrders();
      
      if (language === 'th') {
        alert('ปฏิเสธ Rework Order เรียบร้อย');
      } else {
        alert('Rework Order rejected successfully');
      }
    } catch (e) {
      console.error('Error rejecting:', e);
      alert(language === 'th' ? `เกิดข้อผิดพลาด: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingOrders = reworkOrders.filter(o => o.approval_status === 'pending');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-md shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="p-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {language === 'th' ? 'Rework Orders รออนุมัติ' : 'Pending Rework Orders'}
        </h2>
      </div>
      
      {loading ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
        </div>
      ) : pendingOrders.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {language === 'th' ? 'ไม่มี Rework Orders รออนุมัติ' : 'No pending rework orders'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Ticket</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">จำนวน</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Severity</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">สาเหตุ</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">วันที่</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map(order => (
                <tr key={order.id} className="border-b border-gray-200 dark:border-slate-700">
                  <td className="px-3 py-2 text-sm">{order.ticket_no}</td>
                  <td className="px-3 py-2 text-sm">{order.quantity}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.severity === 'minor' ? 'bg-green-100 text-green-800' :
                      order.severity === 'major' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {order.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm truncate max-w-xs">{order.reason}</td>
                  <td className="px-3 py-2 text-sm">{new Date(order.created_at).toLocaleDateString('th-TH')}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(order.id)}
                        disabled={actionLoading === order.id}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs disabled:opacity-50"
                      >
                        {actionLoading === order.id ? 'กำลังดำเนินการ...' : language === 'th' ? 'อนุมัติ' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(order.id)}
                        disabled={actionLoading === order.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50"
                      >
                        {language === 'th' ? 'ปฏิเสธ' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { Warehouse, Search, CheckCircle2, Clock, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { canPerformActions } from "@/utils/rolePermissions";

const STORE_STATUSES = [
  { value: 'เบิกของแล้ว', label: 'itemsWithdrawn', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle2 },
  { value: 'เบิกไม่ครบ', label: 'incompleteWithdrawal', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock },
  { value: 'รอของ', label: 'waitingForItems', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', icon: XCircle },
];

export default function StorePage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const canAction = canPerformActions(user?.roles || user?.role);

  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(new Set());
  const [selectedStoreStatuses, setSelectedStoreStatuses] = useState(new Set());
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Load tickets
  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      setLoadError("");

      const { data: ticketData, error: ticketError } = await supabase
        .from('ticket')
        .select('no, source_no, description, description_2, due_date, priority, customer_name, quantity, pass_quantity, store_status')
        .order('created_at', { ascending: false });

      if (ticketError) throw ticketError;

      const mappedTickets = (ticketData || []).map(t => {
        const id = (t.no || '').replace('#', '');
        const displayQty = (typeof t.pass_quantity === 'number' && t.pass_quantity !== null)
          ? t.pass_quantity
          : (t.quantity || 0);

        return {
          id,
          title: t.description || '',
          priority: t.priority || 'ยังไม่ได้กำหนด Priority',
          status: t.store_status || null,
          dueDate: t.due_date || '',
          quantity: displayQty,
          itemCode: t.source_no || '',
          description: t.description || '',
          description2: t.description_2 || '',
          customerName: t.customer_name || ''
        };
      });

      setTickets(mappedTickets);
    } catch (e) {
      setLoadError(e?.message || 'Failed to load tickets');
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Realtime subscription for ticket updates
  useEffect(() => {
    const channel = supabase
      .channel('store-ticket-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket'
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          loadTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Update store status
  const updateStoreStatus = async (ticketId, newStatus) => {
    if (!canAction) {
      alert(language === 'th' ? 'คุณไม่มีสิทธิ์ในการอัปเดตสถานะ' : 'You do not have permission to update status');
      return;
    }

    setUpdatingStatus(prev => new Set(prev).add(ticketId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/store-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({ store_status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update store status');
      }

      await loadTickets();
    } catch (error) {
      console.error('Error updating store status:', error);
      alert(language === 'th' 
        ? `ไม่สามารถอัปเดตสถานะได้: ${error.message}` 
        : `Failed to update status: ${error.message}`);
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(ticketId);
        return next;
      });
    }
  };

  // Filter tickets by search and store status
  const filteredTickets = useMemo(() => {
    let filtered = tickets;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        (t.id || "").toLowerCase().includes(q) ||
        (t.title || "").toLowerCase().includes(q) ||
        (t.itemCode || "").toLowerCase().includes(q) ||
        (t.customerName || "").toLowerCase().includes(q)
      );
    }

    if (selectedStoreStatuses.size > 0) {
      filtered = filtered.filter(t => {
        const ticketStatus = t.status || 'ยังไม่มีสถานะ';
        return selectedStoreStatuses.has(ticketStatus);
      });
    }

    return filtered;
  }, [tickets, searchTerm, selectedStoreStatuses]);

  // Sort tickets
  const displayedTickets = useMemo(() => {
    const sorted = [...filteredTickets].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'id': {
          av = (a.id || '').localeCompare(b.id || '');
          bv = 0;
          return sortDir === 'asc' ? av : -av;
        }
        case 'status': {
          const storeStatusRank = (s) => {
            if (!s || s === null) return 4;
            const status = String(s);
            if (status === 'เบิกของแล้ว') return 0;
            if (status === 'เบิกไม่ครบ') return 1;
            if (status === 'รอของ') return 2;
            return 3;
          };
          av = storeStatusRank(a.status);
          bv = storeStatusRank(b.status);
          break;
        }
        case 'dueDate': {
          const aHasDate = !!a.dueDate;
          const bHasDate = !!b.dueDate;
          if (!aHasDate && !bHasDate) return 0;
          if (!aHasDate) return 1;
          if (!bHasDate) return -1;
          av = new Date(a.dueDate).getTime();
          bv = new Date(b.dueDate).getTime();
          break;
        }
        case 'priority': {
          const priorityRank = (p) => {
            if (!p) return 4;
            const priority = p.toString().toLowerCase().trim();
            if (priority === "high priority" || priority === "high") return 0;
            if (priority === "medium priority" || priority === "medium") return 1;
            if (priority === "low priority" || priority === "low") return 2;
            if (priority === "ยังไม่ได้กำหนด priority" || priority.includes("ไม่ได้กำหนด")) return 3;
            return 4;
          };
          av = priorityRank(a.priority);
          bv = priorityRank(b.priority);
          break;
        }
        case 'created':
        default: {
          const indexA = tickets.findIndex(t => t.id === a.id);
          const indexB = tickets.findIndex(t => t.id === b.id);
          av = indexA;
          bv = indexB;
          break;
        }
      }
      const diff = av - bv;
      return sortDir === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [filteredTickets, sortKey, sortDir, tickets]);

  // Stats
  const stats = useMemo(() => {
    const total = tickets.length;
    const itemsWithdrawn = tickets.filter(t => t.status === 'เบิกของแล้ว').length;
    const incompleteWithdrawal = tickets.filter(t => t.status === 'เบิกไม่ครบ').length;
    const waitingForItems = tickets.filter(t => t.status === 'รอของ').length;
    const noStatus = tickets.filter(t => !t.status).length;

    return { total, itemsWithdrawn, incompleteWithdrawal, waitingForItems, noStatus };
  }, [tickets]);

  const getStatusDisplay = (status) => {
    if (!status) return null;
    const statusObj = STORE_STATUSES.find(s => s.value === status);
    if (!statusObj) return null;
    const IconComponent = statusObj.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${statusObj.color}`}>
        <IconComponent className="w-3.5 h-3.5" />
        {t(statusObj.label, language)}
      </span>
    );
  };

  const activeFilterCount = selectedStoreStatuses.size;

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/store">
        <div className="min-h-screen container-safe px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 animate-fadeInUp bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                <Warehouse className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('store', language)}</h1>
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5">{t('storeManagementDesc', language)}</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-md hover:shadow-lg transition-all">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('allTickets', language)}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
            </div>
            <div className="p-5 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-2xl border border-green-200 dark:border-green-800 shadow-md hover:shadow-lg transition-all">
              <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('itemsWithdrawn', language)}
              </div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-500">{stats.itemsWithdrawn}</div>
            </div>
            <div className="p-5 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-2xl border border-yellow-200 dark:border-yellow-800 shadow-md hover:shadow-lg transition-all">
              <div className="text-xs font-medium text-yellow-700 dark:text-yellow-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {t('incompleteWithdrawal', language)}
              </div>
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-500">{stats.incompleteWithdrawal}</div>
            </div>
            <div className="p-5 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-2xl border border-red-200 dark:border-red-800 shadow-md hover:shadow-lg transition-all">
              <div className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                {t('waitingForItems', language)}
              </div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-500">{stats.waitingForItems}</div>
            </div>
            <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-md hover:shadow-lg transition-all">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">{language === 'th' ? 'ยังไม่ระบุ' : 'No Status'}</div>
              <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">{stats.noStatus}</div>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="mb-6 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base text-gray-900 dark:text-gray-100 shadow-sm transition-all"
                placeholder={language === 'th' ? 'ค้นหาตั๋ว...' : 'Search tickets...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filter and Sort Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all shadow-sm ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm">{language === 'th' ? 'ตัวกรอง' : 'Filter'}</span>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Sort Controls */}
              <div className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <ArrowUpDown className="w-4 h-4 text-gray-400" />
                  </div>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all appearance-none cursor-pointer shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    <option value="created">{language === 'th' ? 'วันที่สร้าง' : 'Created Date'}</option>
                    <option value="id">{language === 'th' ? 'เลขตั๋ว' : 'Ticket No.'}</option>
                    <option value="status">{language === 'th' ? 'สถานะ Store' : 'Store Status'}</option>
                    <option value="dueDate">{language === 'th' ? 'กำหนดส่ง' : 'Due Date'}</option>
                    <option value="priority">{language === 'th' ? 'ความสำคัญ' : 'Priority'}</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 pr-4 flex items-center">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <button
                  onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                  className={`px-4 py-3 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 min-w-[60px] ${
                    sortDir === 'asc' 
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                      : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                  title={language === 'th' ? (sortDir === 'asc' ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย') : (sortDir === 'asc' ? 'Ascending' : 'Descending')}
                >
                  {sortDir === 'asc' ? (
                    <ArrowUp className="w-5 h-5" />
                  ) : (
                    <ArrowDown className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-gray-200 dark:border-slate-700 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    {language === 'th' ? 'กรองตามสถานะ Store' : 'Filter by Store Status'}
                  </h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setSelectedStoreStatuses(new Set())}
                      className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
                    >
                      {language === 'th' ? 'ล้างทั้งหมด' : 'Clear all'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const newSet = new Set(selectedStoreStatuses);
                      if (newSet.has('ยังไม่มีสถานะ')) {
                        newSet.delete('ยังไม่มีสถานะ');
                      } else {
                        newSet.add('ยังไม่มีสถานะ');
                      }
                      setSelectedStoreStatuses(newSet);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
                      selectedStoreStatuses.has('ยังไม่มีสถานะ')
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ring-2 ring-gray-400 dark:ring-gray-500'
                        : 'bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    {language === 'th' ? 'ยังไม่มีสถานะ' : 'No Status'}
                  </button>
                  {STORE_STATUSES.map((statusOption) => {
                    const IconComponent = statusOption.icon;
                    const isSelected = selectedStoreStatuses.has(statusOption.value);
                    return (
                      <button
                        key={statusOption.value}
                        onClick={() => {
                          const newSet = new Set(selectedStoreStatuses);
                          if (newSet.has(statusOption.value)) {
                            newSet.delete(statusOption.value);
                          } else {
                            newSet.add(statusOption.value);
                          }
                          setSelectedStoreStatuses(newSet);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm flex items-center gap-2 ${
                          isSelected
                            ? `${statusOption.color} ring-2 ring-offset-1`
                            : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-600'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                        {t(statusOption.label, language)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Loading/Error States */}
          {loadingTickets && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 text-sm font-medium shadow-sm">
              {language === 'th' ? 'กำลังโหลดตั๋ว...' : 'Loading tickets...'}
            </div>
          )}

          {!!loadError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium shadow-sm">
              {loadError}
            </div>
          )}

          {/* Ticket List */}
          {!loadingTickets && displayedTickets.length === 0 && (
            <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border-2 border-gray-200 dark:border-slate-700 text-center shadow-sm">
              <Warehouse className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {language === 'th' ? 'ไม่พบตั๋ว' : 'No tickets found'}
              </p>
            </div>
          )}

          <div className="space-y-4">
            {displayedTickets.map((ticket) => {
              const isUpdating = updatingStatus.has(ticket.id);
              const currentStatusObj = ticket.status ? STORE_STATUSES.find(s => s.value === ticket.status) : null;

              return (
                <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-gray-200 dark:border-slate-700 p-5 sm:p-6 shadow-md hover:shadow-xl transition-all duration-300">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-3 flex-wrap mb-3">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                          {ticket.id}
                        </h3>
                        {ticket.itemCode && (
                          <span className="px-3 py-1 rounded-lg font-mono text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                            {ticket.itemCode}
                          </span>
                        )}
                        {getStatusDisplay(ticket.status)}
                      </div>

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-500 dark:text-gray-500">{language === 'th' ? 'จำนวน:' : 'Qty:'}</span>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {ticket.quantity} {language === 'th' ? 'ชิ้น' : 'pcs'}
                          </span>
                        </span>
                        {ticket.dueDate && (
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-500 dark:text-gray-500">{language === 'th' ? 'กำหนดส่ง:' : 'Due:'}</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {new Date(ticket.dueDate).toLocaleDateString('th-TH')}
                            </span>
                          </span>
                        )}
                        {ticket.priority && (
                          <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {ticket.priority}
                          </span>
                        )}
                      </div>

                      {ticket.title && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                          {ticket.title}
                        </p>
                      )}
                    </div>

                    {/* Status Update Buttons */}
                    <div className="shrink-0">
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        {STORE_STATUSES.map((statusOption) => {
                          const IconComponent = statusOption.icon;
                          const isSelected = ticket.status === statusOption.value;
                          const isDisabled = !canAction || isUpdating;

                          return (
                            <button
                              key={statusOption.value}
                              onClick={() => {
                                if (!isDisabled) {
                                  const newStatus = isSelected ? null : statusOption.value;
                                  updateStoreStatus(ticket.id, newStatus);
                                }
                              }}
                              disabled={isDisabled}
                              title={isSelected 
                                ? (language === 'th' ? 'คลิกเพื่อล้างสถานะ' : 'Click to clear status')
                                : (language === 'th' ? `คลิกเพื่อตั้งเป็น: ${t(statusOption.label, language)}` : `Click to set: ${t(statusOption.label, language)}`)
                              }
                              className={`
                                flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm min-w-[140px]
                                ${isSelected
                                  ? `${statusOption.color} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 transform scale-105`
                                  : 'bg-white dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                                }
                                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'}
                              `}
                            >
                              <IconComponent className="w-4 h-4" />
                              <span>{t(statusOption.label, language)}</span>
                              {isSelected && (
                                <X className="w-3.5 h-3.5 opacity-75" />
                              )}
                            </button>
                          );
                        })}
                        {ticket.status && (
                          <button
                            onClick={() => !isUpdating && canAction && updateStoreStatus(ticket.id, null)}
                            disabled={!canAction || isUpdating}
                            title={language === 'th' ? 'ล้างสถานะ' : 'Clear status'}
                            className={`
                              px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 border-2 border-transparent hover:border-gray-300 dark:hover:border-slate-500
                              ${(!canAction || isUpdating) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'}
                            `}
                          >
                            <XCircle className="w-4 h-4 inline mr-1.5" />
                            {language === 'th' ? 'ล้าง' : 'Clear'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

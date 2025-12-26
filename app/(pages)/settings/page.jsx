"use client";

import React, { useMemo, useState, useEffect } from "react";
import { User as UserIcon, Users, Shield, Check, Search, Plus, Pencil, Trash2, X, Database, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import UserModal from "@/components/UserModal";
import { roles, roleColors, statusColors } from "@/modules/settings/mockUsers";
import { supabase } from "@/utils/supabaseClient";
import { hasSettingsTabAccess, getRoleDisplayName } from "@/utils/rolePermissions";
import ErpTestComponent from "@/components/ErpTestComponent";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";

function ProfileForm({ user, onSave }) {
  const { language } = useLanguage();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatar, setAvatar] = useState(user?.avatar || ""); // Data URL or existing path
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    if (!file.type.startsWith("image/")) {
      setUploadError(language === 'th' ? "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" : "Only image files are supported");
      return;
    }
    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (file.size > maxBytes) {
      setUploadError(language === 'th' ? "ไฟล์มีขนาดใหญ่เกิน 2MB" : "File size exceeds 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAvatar(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await onSave({ name, email, avatar });
      setSaved(true);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 1800);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('displayName', language)}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            placeholder={language === 'th' ? 'เช่น Admin User' : 'e.g. Admin User'}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('email', language)}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            placeholder="you@example.com"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('uploadProfilePicture', language)}</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-600 hover:file:bg-emerald-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('supportedFormats', language)}</p>
          {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
          {avatar && (
            <div className="mt-3 flex items-center gap-3">
              <img src={avatar} alt="avatar" className="w-12 h-12 rounded-full object-cover border" />
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('profilePicturePreview', language)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="pressable px-4 py-2 rounded-xl text-white shadow disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "#22d3a0" }}
        >
          {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : t('saveProfile', language)}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
            <Check className="w-4 h-4" /> {language === 'th' ? 'บันทึกแล้ว' : 'Saved'}
          </span>
        )}
      </div>
    </form>
  );
}

function TicketResetManagement({ user }) {
  const { language } = useLanguage();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicket, setSelectedTicket] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  // Fetch tickets from database
  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ticket')
        .select('no, description, status, source_no')
        .order('no', { ascending: false })
        .limit(500); // Limit to prevent too many results
      
      if (error) {
        console.error('Error fetching tickets:', error);
        return;
      }
      
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter tickets
  const filteredTickets = tickets.filter(ticket => {
    const matchSearch = (ticket.no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (ticket.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  const handleReset = async () => {
    if (!selectedTicket) {
      alert(language === 'th' ? 'กรุณาเลือกตั๋วที่ต้องการรีเซ็ต' : 'Please select a ticket to reset');
      return;
    }

    const confirmMessage = language === 'th' 
      ? `คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตตั๋ว ${selectedTicket}?\n\nการดำเนินการนี้จะ:\n- ล้างสถานะทั้งหมดกลับเป็น pending\n- ปิด work sessions ที่ยังไม่เสร็จ\n- รีเซ็ต ticket status กลับเป็น Released\n\nการดำเนินการนี้ไม่สามารถยกเลิกได้!`
      : `Are you sure you want to reset ticket ${selectedTicket}?\n\nThis will:\n- Reset all statuses to pending\n- Close incomplete work sessions\n- Reset ticket status to Released\n\nThis action cannot be undone!`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setResetting(true);
    setResetMessage("");

    try {
      const ticketNo = selectedTicket.replace('#', '');
      const apiResponse = await fetch(`/api/production/${ticketNo}/update-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          user_id: user?.id
        })
      });

      const apiResult = await apiResponse.json();

      if (!apiResponse.ok || !apiResult.success) {
        throw new Error(apiResult.error || (language === 'th' ? 'ไม่สามารถรีเซ็ตตั๋วได้' : 'Failed to reset ticket'));
      }

      setResetMessage(language === 'th' ? 'รีเซ็ตตั๋วสำเร็จ!' : 'Ticket reset successfully!');
      setSelectedTicket("");
      
      // Refresh tickets list
      setTimeout(() => {
        fetchTickets();
        setResetMessage("");
      }, 2000);
    } catch (e) {
      console.error('[RESET] Failed:', e);
      setResetMessage(language === 'th' 
        ? 'เกิดข้อผิดพลาด: ' + (e?.message || 'Unknown error')
        : 'Error: ' + (e?.message || 'Unknown error'));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
          {language === 'th' ? 'รีเซ็ตตั๋วกลับไปสถานี 1' : 'Reset Ticket to Station 1'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {language === 'th' 
            ? 'รีเซ็ตตั๋วที่ทำผิดกลับไปเริ่มใหม่ตั้งแต่สถานี 1 (เฉพาะ SuperAdmin)'
            : 'Reset tickets that were done incorrectly back to station 1 (SuperAdmin only)'}
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={language === 'th' ? 'ค้นหาตั๋ว (Ticket No. หรือ Description)...' : 'Search tickets (Ticket No. or Description)...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          />
        </div>
      </div>

      {/* Ticket Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {language === 'th' ? 'เลือกตั๋วที่ต้องการรีเซ็ต' : 'Select ticket to reset'}
        </label>
        <select
          value={selectedTicket}
          onChange={(e) => setSelectedTicket(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
        >
          <option value="">{language === 'th' ? '-- เลือกตั๋ว --' : '-- Select Ticket --'}</option>
          {loading ? (
            <option disabled>{language === 'th' ? 'กำลังโหลด...' : 'Loading...'}</option>
          ) : (
            filteredTickets.map((ticket) => (
              <option key={ticket.no} value={ticket.no}>
                {ticket.no} - {ticket.description || '-'} ({ticket.status || 'N/A'})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Reset Button */}
      <div className="mb-4">
        <button
          onClick={handleReset}
          disabled={!selectedTicket || resetting}
          className={`w-full px-4 py-3 rounded-xl text-white font-medium transition-colors ${
            !selectedTicket || resetting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {resetting 
            ? (language === 'th' ? 'กำลังรีเซ็ต...' : 'Resetting...')
            : (language === 'th' ? 'รีเซ็ตตั๋วกลับไปสถานี 1' : 'Reset Ticket to Station 1')
          }
        </button>
      </div>

      {/* Message */}
      {resetMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          resetMessage.includes('สำเร็จ') || resetMessage.includes('successfully')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {resetMessage}
        </div>
      )}

      {/* Warning */}
      <div className="mt-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-start gap-2">
          <X className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800 dark:text-yellow-300">
            <div className="font-medium mb-1">
              {language === 'th' ? 'คำเตือน' : 'Warning'}
            </div>
            <div>
              {language === 'th' 
                ? 'การรีเซ็ตตั๋วจะล้างความคืบหน้าทั้งหมดและไม่สามารถยกเลิกได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ'
                : 'Resetting a ticket will clear all progress and cannot be undone. Please verify before proceeding.'}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-400">
          {language === 'th' 
            ? `แสดง ${filteredTickets.length} จาก ${tickets.length} ตั๋ว`
            : `Showing ${filteredTickets.length} of ${tickets.length} tickets`}
        </div>
      )}
    </div>
  );
}

function UserManagement() {
  const { language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Fetch users from Supabase
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching users:', error);
        return;
      }
      
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       user.email.toLowerCase().includes(searchTerm.toLowerCase());
    // Support both old format (role) and new format (roles)
    const userRoles = user.roles || (user.role ? [user.role] : []);
    const matchRole = roleFilter === "all" || userRoles.includes(roleFilter);
    const matchStatus = statusFilter === "all" || user.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const handleAddUser = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (userId) => {
    if (confirm(language === 'th' ? "คุณแน่ใจหรือไม่ที่จะลบผู้ใช้นี้?" : "Are you sure you want to delete this user?")) {
      try {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', userId);
        
        if (error) {
          console.error('Error deleting user:', error);
          alert(language === 'th' ? 'เกิดข้อผิดพลาดในการลบผู้ใช้' : 'Error deleting user');
          return;
        }
        
        // Refresh the users list
        await fetchUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
        alert(language === 'th' ? 'เกิดข้อผิดพลาดในการลบผู้ใช้' : 'Error deleting user');
      }
    }
  };

  const handleModalSuccess = async () => {
    // Refresh the users list when modal operation is successful
    await fetchUsers();
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">{t('manageUsers', language)}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{language === 'th' ? 'เพิ่ม/ลบ/แก้ไขผู้ใช้และกำหนดสิทธิ์การใช้งาน' : 'Add/remove/edit users and set permissions'}</p>
          </div>
          <button
            onClick={handleAddUser}
            className="pressable inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white shadow"
            style={{ background: "#22d3a0" }}
          >
            <Plus className="w-4 h-4" />
            {language === 'th' ? 'เพิ่มผู้ใช้' : 'Add User'}
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={language === 'th' ? 'ค้นหาชื่อหรืออีเมล...' : 'Search name or email...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          >
            <option value="all">{language === 'th' ? 'ทุก Role' : 'All Roles'}</option>
            {roles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          >
            <option value="all">{language === 'th' ? 'ทุกสถานะ' : 'All Status'}</option>
            <option value="active">{language === 'th' ? 'ใช้งานอยู่' : 'Active'}</option>
            <option value="inactive">{language === 'th' ? 'ไม่ใช้งาน' : 'Inactive'}</option>
          </select>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto -mx-6 sm:mx-0">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{language === 'th' ? 'ผู้ใช้' : 'User'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{language === 'th' ? 'สถานะ' : 'Status'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">{language === 'th' ? 'เข้าสู่ระบบล่าสุด' : 'Last Login'}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{language === 'th' ? 'จัดการ' : 'Manage'}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200 dark:divide-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading users...'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-700">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-medium">
                              {getInitials(user.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {(user.roles || (user.role ? [user.role] : [])).map((role, idx) => (
                            <span key={idx} className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${roleColors[role] || roleColors['user']}`}>
                              {getRoleDisplayName(role)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${statusColors[user.status]}`}>
                          {user.status === "active" ? (language === 'th' ? "ใช้งานอยู่" : "Active") : (language === 'th' ? "ไม่ใช้งาน" : "Inactive")}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors"
                            title={language === 'th' ? 'แก้ไข' : 'Edit'}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
                            title={language === 'th' ? 'ลบ' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
              {!loading && filteredUsers.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  {language === 'th' ? 'ไม่พบข้อมูลผู้ใช้' : 'No user data found'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {language === 'th' ? `แสดง ${filteredUsers.length} จาก ${users.length} ผู้ใช้` : `Showing ${filteredUsers.length} of ${users.length} users`}
          </span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <UserModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingUser={editingUser}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { language } = useLanguage();

  // Define all possible tabs
  const allTabs = [
    { key: "profile", label: t('editProfile', language), icon: <UserIcon className="w-4 h-4" /> },
    { key: "security", label: t('changePassword', language), icon: <Shield className="w-4 h-4" /> },
    { key: "users", label: t('manageUsers', language), icon: <Users className="w-4 h-4" /> },
    { key: "erpTest", label: t('erpTest', language), icon: <Database className="w-4 h-4" /> },
    { key: "ticketReset", label: language === 'th' ? 'รีเซ็ตตั๋ว' : 'Reset Ticket', icon: <RotateCcw className="w-4 h-4" /> },
  ];

  // Filter tabs based on user roles
  const tabs = allTabs.filter(tab => {
    if (!user) return false;
    return hasSettingsTabAccess(user.roles || user.role, tab.key);
  });

  const [activeTab, setActiveTab] = useState("profile");

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/settings">
        <>
          <div className="space-y-4 animate-fadeInUp">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-100 mb-1">{t('systemSettings', language)}</h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('configureSystem', language)}</p>

          {/* Tabs */}
          <div className="mt-5 overflow-x-auto">
            <div className="inline-flex gap-2 p-1 bg-slate-100/70 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`pressable inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                      active
                        ? "bg-white dark:bg-slate-800 text-emerald-600 border-emerald-200 shadow-sm"
                        : "bg-transparent text-slate-600 dark:text-slate-400 dark:text-slate-400 border-transparent hover:bg-white dark:hover:bg-slate-800 hover:text-emerald-600"
                    }`}
                  >
                    <span className="inline-flex w-4 h-4 items-center justify-center">{t.icon}</span>
                    <span className="whitespace-nowrap">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        {activeTab === "profile" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('editProfile', language)}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('updateUserInfo', language)}</p>
            <ProfileForm user={user} onSave={updateUser} />
          </div>
        )}

        {activeTab === "users" && <UserManagement />}

        {activeTab === "erpTest" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('erpTest', language)}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{language === 'th' ? 'ทดสอบการเชื่อมต่อและดึงข้อมูลจากระบบ ERP' : 'Test ERP connection and data fetching'}</p>
            <ErpTestComponent />
          </div>
        )}

        {activeTab === "security" && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('changePassword', language)}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{language === 'th' ? 'จัดการรหัสผ่านและการเข้าสู่ระบบ' : 'Manage password and login'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{language === 'th' ? 'รหัสผ่านใหม่' : 'New Password'}</label>
                <input type="password" className="w-full rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{language === 'th' ? 'ยืนยันรหัสผ่าน' : 'Confirm Password'}</label>
                <input type="password" className="w-full rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" placeholder="••••••••" />
              </div>
            </div>
            <div className="mt-4">
              <button className="pressable px-4 py-2 rounded-xl text-white shadow" style={{ background: "#22d3a0" }}>{language === 'th' ? 'อัปเดตรหัสผ่าน' : 'Update Password'}</button>
            </div>
          </div>
        )}

        {activeTab === "ticketReset" && <TicketResetManagement user={user} />}

        {/* Removed 'ทั่วไป' tab per request */}
          </div>
        </>
      </RoleGuard>
    </ProtectedRoute>
  );
}


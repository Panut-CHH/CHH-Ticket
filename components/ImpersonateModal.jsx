"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { Search, User, Mail, Shield, Loader2, AlertCircle } from "lucide-react";

const ROLE_COLORS = {
  SuperAdmin: "bg-purple-100 text-purple-700 border-purple-200",
  superadmin: "bg-purple-100 text-purple-700 border-purple-200",
  Admin: "bg-blue-100 text-blue-700 border-blue-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  QC: "bg-amber-100 text-amber-700 border-amber-200",
  qc: "bg-amber-100 text-amber-700 border-amber-200",
  Production: "bg-emerald-100 text-emerald-700 border-emerald-200",
  production: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Painting: "bg-pink-100 text-pink-700 border-pink-200",
  painting: "bg-pink-100 text-pink-700 border-pink-200",
  Packing: "bg-indigo-100 text-indigo-700 border-indigo-200",
  packing: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Drawing: "bg-orange-100 text-orange-700 border-orange-200",
  drawing: "bg-orange-100 text-orange-700 border-orange-200",
  user: "bg-gray-100 text-gray-700 border-gray-200"
};

export default function ImpersonateModal({ open, onClose }) {
  const { user, impersonate } = useAuth();
  const { language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [impersonating, setImpersonating] = useState(null);

  useEffect(() => {
    if (open) {
      fetchUsers();
    } else {
      // Reset state when modal closes
      setUsers([]);
      setError(null);
      setSearchTerm("");
      setImpersonating(null);
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { supabase } = await import('@/utils/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError(t('sessionExpired', language));
        return;
      }

      const response = await fetch('/api/users/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      console.log('ImpersonateModal: API response:', result);

      if (!result.success) {
        console.error('ImpersonateModal: API error:', result.error);
        setError(result.error || t('impersonateError', language));
        return;
      }

      console.log('ImpersonateModal: Users received:', result.users);
      setUsers(result.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(t('impersonateError', language));
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (targetUser) => {
    if (!impersonate) return;
    
    setImpersonating(targetUser.id);
    
    try {
      const success = await impersonate(targetUser);
      if (success) {
        onClose();
      } else {
        setError(t('impersonateError', language));
      }
    } catch (err) {
      console.error('Error impersonating user:', err);
      setError(t('impersonateError', language));
    } finally {
      setImpersonating(null);
    }
  };

  const filteredUsers = users.filter(targetUser => {
    // ซ่อนผู้ใช้ปัจจุบันออกจากรายการ
    if (targetUser.id === user?.id) {
      return false;
    }
    
    // กรองตาม search term
    const userRoles = targetUser.roles || (targetUser.role ? [targetUser.role] : []);
    const rolesString = userRoles.join(' ').toLowerCase();
    return targetUser.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           targetUser.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
           rolesString.includes(searchTerm.toLowerCase());
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('selectUserToImpersonate', language)}
      maxWidth="max-w-4xl"
    >
      <div className="p-4">
        {/* Search Box */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={t('search', language)}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">{t('loading', language)}</span>
          </div>
        )}

        {/* Users List */}
        {!loading && !error && (
          <>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchTerm ? t('notFound', language) : t('noUsersAvailable', language)}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredUsers.map((targetUser) => (
                  <div
                    key={targetUser.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={targetUser.avatar || "/pictureUser/pictureUser_1.png"}
                        alt={targetUser.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {targetUser.name}
                          </h3>
                          <div className="flex flex-wrap gap-1">
                            {(targetUser.roles || (targetUser.role ? [targetUser.role] : [])).map((role, idx) => (
                              <span key={idx} className={`px-2 py-1 text-xs rounded-full border ${ROLE_COLORS[role] || ROLE_COLORS.user}`}>
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {targetUser.email}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleImpersonate(targetUser)}
                      disabled={impersonating === targetUser.id}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      {impersonating === targetUser.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('loading', language)}
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4" />
                          {t('impersonate', language)}
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            {t('cancel', language)}
          </button>
        </div>
      </div>
    </Modal>
  );
}

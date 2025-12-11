"use client";

import React, { useState, useEffect } from "react";
import { X, User, Mail, Lock, Shield, Check, Sparkles } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { getRoleDisplayName } from "@/utils/rolePermissions";

export default function UserModal({ open, onClose, editingUser = null, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    roles: ["Production"]
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      // เลื่อน viewport ไปด้านบนสุด เพื่อให้ modal อยู่ในมุมมองกลางจอเสมอ
      window.scrollTo({ top: 0, behavior: "auto" });

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      if (editingUser) {
        // Support both old format (role) and new format (roles)
        const userRoles = editingUser.roles || (editingUser.role ? [editingUser.role] : ["Production"]);
        setFormData({
          name: editingUser.name || "",
          email: editingUser.email || "",
          password: "",
          roles: Array.isArray(userRoles) ? userRoles : [userRoles]
        });
      } else {
        setFormData({
          name: "",
          email: "",
          password: "",
          roles: ["Production"]
        });
      }
      setErrors({});
    }
  }, [open, editingUser]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "กรุณากรอกชื่อ";
    }
    
    if (!formData.email.trim()) {
      newErrors.email = "กรุณากรอกอีเมล";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "รูปแบบอีเมลไม่ถูกต้อง";
    }
    
    if (!editingUser && !formData.password.trim()) {
      newErrors.password = "กรุณากรอกรหัสผ่าน";
    } else if (formData.password && formData.password.length < 4) {
      newErrors.password = "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร";
    }
    
    if (!formData.roles || formData.roles.length === 0) {
      newErrors.roles = "กรุณาเลือกอย่างน้อย 1 บทบาท";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    
    try {
      if (editingUser) {
        const response = await fetch(`/api/users/${editingUser.id}/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password,
            roles: formData.roles,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update user');
        }
      } else {
        const response = await fetch('/api/users/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password,
            roles: formData.roles,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to create user');
        }
      }
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      setErrors({ submit: error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const toggleRole = (role) => {
    if (formData.roles.includes(role)) {
      handleInputChange('roles', formData.roles.filter(r => r !== role));
    } else {
      handleInputChange('roles', [...formData.roles, role]);
    }
  };

  const roleColors = {
    SuperAdmin: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    Admin: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    QC: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    Production: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    Painting: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800",
    "Supervisor Painting": "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    "Supervisor Production": "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    Packing: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    CNC: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
    Drawing: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    Storage: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-4 sm:pt-6 md:pt-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-md" 
        onClick={onClose} 
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-md sm:max-w-lg max-h-[85vh] overflow-hidden">
        {/* Modal Card */}
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-200/50 dark:border-slate-700/50">
          {/* Gradient Header */}
          <div className="relative bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-4 sm:p-5">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    {editingUser ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}
                  </h2>
                  <p className="text-emerald-50 text-xs sm:text-sm mt-0.5">
                    {editingUser ? "อัปเดตข้อมูลผู้ใช้" : "สร้างบัญชีผู้ใช้ใหม่"}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 sm:p-2 text-white/90 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200 backdrop-blur-sm"
                aria-label="ปิด"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
          
          {/* Content - Scrollable Form */}
          <div 
            className="overflow-y-auto max-h-[calc(85vh-200px)] sm:max-h-[calc(85vh-220px)] modal-scrollbar"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(148, 163, 184, 0.3) transparent'
            }}
          >
            <form id="user-form" onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
              {/* Name Field */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <div className="p-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span>ชื่อผู้ใช้</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-lg border-2 text-sm bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 ${
                    errors.name 
                      ? 'border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30' 
                      : 'border-gray-200 dark:border-slate-700 focus:border-emerald-400 dark:focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/30'
                  } focus:outline-none focus:bg-white dark:focus:bg-slate-800`}
                  placeholder="กรอกชื่อผู้ใช้"
                />
                {errors.name && (
                  <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm mt-1 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <div className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span>อีเมล</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-lg border-2 text-sm bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 ${
                    errors.email 
                      ? 'border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30' 
                      : 'border-gray-200 dark:border-slate-700 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30'
                  } focus:outline-none focus:bg-white dark:focus:bg-slate-800`}
                  placeholder="example@factory.com"
                />
                {errors.email && (
                  <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm mt-1 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <div className="p-1 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 flex items-center justify-between flex-wrap gap-2">
                    <span>รหัสผ่าน</span>
                    {editingUser && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                        (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)
                      </span>
                    )}
                  </div>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-lg border-2 text-sm bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 ${
                    errors.password 
                      ? 'border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30' 
                      : 'border-gray-200 dark:border-slate-700 focus:border-amber-400 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/30'
                  } focus:outline-none focus:bg-white dark:focus:bg-slate-800`}
                  placeholder={editingUser ? "กรอกรหัสผ่านใหม่ (ถ้าต้องการเปลี่ยน)" : "กรอกรหัสผ่าน (อย่างน้อย 4 ตัวอักษร)"}
                />
                {errors.password && (
                  <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm mt-1 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Roles Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <div className="p-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span>บทบาท</span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                    (เลือกได้หลายบทบาท)
                  </span>
                </label>
                
                {/* Role Badges Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {["SuperAdmin", "Admin", "QC", "DashboardView", "Production", "Painting", "Supervisor Painting", "Supervisor Production", "Packing", "CNC", "Drawing", "Storage"].map((role) => {
                    const isSelected = formData.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`relative group p-2.5 rounded-lg border-2 transition-all duration-200 text-left ${
                          isSelected
                            ? `${roleColors[role]} border-current shadow-md scale-[1.02]`
                            : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 p-0.5 bg-white/90 dark:bg-slate-900/90 rounded-full shadow-sm">
                            <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        )}
                        <div className="font-medium text-xs pr-6">{getRoleDisplayName(role)}</div>
                      </button>
                    );
                  })}
                </div>
                
                {errors.roles && (
                  <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm mt-1 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                    {errors.roles}
                  </p>
                )}
                {!errors.roles && formData.roles.length === 0 && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs sm:text-sm mt-1 flex items-center gap-1">
                    <span className="w-1 h-1 bg-amber-500 rounded-full"></span>
                    กรุณาเลือกอย่างน้อย 1 บทบาท
                  </p>
                )}
                
                {/* Selected Roles Display */}
                {formData.roles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">เลือกแล้ว:</span>
                    {formData.roles.map((role) => (
                      <span
                        key={role}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${roleColors[role]}`}
                      >
                        {getRoleDisplayName(role)}
                        <button
                          type="button"
                          onClick={() => toggleRole(role)}
                          className="hover:scale-110 transition-transform"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Error */}
              {errors.submit && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                    {errors.submit}
                  </p>
                </div>
              )}
            </form>
          </div>

          {/* Action Buttons - Fixed at Bottom */}
          <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="submit"
                form="user-form"
                disabled={submitting}
                className="flex-1 group relative overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingUser ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้"}</span>
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-200"></div>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-sm font-semibold transition-all duration-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

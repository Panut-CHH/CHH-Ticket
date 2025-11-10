"use client";

import React, { useState, useEffect } from "react";
import { X, User, Mail, Lock, Shield } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

export default function UserModal({ open, onClose, editingUser = null, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "Technician"
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      if (editingUser) {
        setFormData({
          name: editingUser.name || "",
          email: editingUser.email || "",
          password: "",
          role: editingUser.role || "Technician"
        });
      } else {
        setFormData({
          name: "",
          email: "",
          password: "",
          role: "Technician"
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
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
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
        // Update existing user - เรียก API เพื่ออัปเดตทั้ง auth.users และ public.users
        const response = await fetch(`/api/users/${editingUser.id}/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password, // ส่งไปแม้จะว่าง API จะจัดการเอง
            role: formData.role,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update user');
        }
      } else {
        // Create new user - เรียก API เพื่อสร้างทั้ง auth.users และ public.users
        const response = await fetch('/api/users/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            password: formData.password,
            role: formData.role,
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingUser ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}
          </h2>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <User className="w-4 h-4" />
                ชื่อ
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  errors.name 
                    ? 'border-red-300 focus:ring-red-300' 
                    : 'border-gray-300 dark:border-slate-600 focus:ring-blue-300'
                } focus:outline-none focus:ring-2`}
                placeholder="กรอกชื่อ"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Mail className="w-4 h-4" />
                อีเมล
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  errors.email 
                    ? 'border-red-300 focus:ring-red-300' 
                    : 'border-gray-300 dark:border-slate-600 focus:ring-blue-300'
                } focus:outline-none focus:ring-2`}
                placeholder="example@factory.com"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Lock className="w-4 h-4" />
                รหัสผ่าน
                {editingUser && <span className="text-gray-500 text-xs">(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</span>}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  errors.password 
                    ? 'border-red-300 focus:ring-red-300' 
                    : 'border-gray-300 dark:border-slate-600 focus:ring-blue-300'
                } focus:outline-none focus:ring-2`}
                placeholder={editingUser ? "กรอกรหัสผ่านใหม่ (ถ้าต้องการเปลี่ยน)" : "กรอกรหัสผ่าน"}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            {/* Role */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Shield className="w-4 h-4" />
                บทบาท
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleInputChange('role', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
              >
                <option value="SuperAdmin">SuperAdmin</option>
                <option value="Admin">Admin</option>
                <option value="QC">QC</option>
                <option value="Technician">Technician</option>
                <option value="CNC">CNC</option>
                <option value="Drawing">Drawing</option>
              </select>
            </div>


            {/* Submit Error */}
            {errors.submit && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{errors.submit}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? "กำลังบันทึก..." : (editingUser ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

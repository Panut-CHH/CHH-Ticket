"use client";

import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function DebugUserRole() {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const updateUserRole = async (newRole) => {
    setIsUpdating(true);
    setMessage("");
    
    try {
      const response = await fetch('/api/users/update-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          role: newRole
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage(`✅ Role updated to ${newRole}. Please refresh the page.`);
        // Force refresh after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Debug User Role</h1>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Current User Info</h2>
          <div className="space-y-2">
            <p><strong>Email:</strong> {user?.email || 'Not available'}</p>
            <p><strong>Name:</strong> {user?.name || 'Not available'}</p>
            <p><strong>Current Role:</strong> <span className="font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{user?.role || 'Not set'}</span></p>
            <p><strong>User ID:</strong> {user?.id || 'Not available'}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mt-6">
          <h2 className="text-lg font-semibold mb-4">Update Role</h2>
          <div className="space-y-3">
            <button
              onClick={() => updateUserRole('SuperAdmin')}
              disabled={isUpdating}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as SuperAdmin'}
            </button>
            
            <button
              onClick={() => updateUserRole('Admin')}
              disabled={isUpdating}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as Admin'}
            </button>
            
            <button
              onClick={() => updateUserRole('Drawing')}
              disabled={isUpdating}
              className="w-full bg-orange-600 text-white py-2 px-4 rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as Drawing'}
            </button>
            
            <button
              onClick={() => updateUserRole('Technician')}
              disabled={isUpdating}
              className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as Technician'}
            </button>
            
            <button
              onClick={() => updateUserRole('CNC')}
              disabled={isUpdating}
              className="w-full bg-cyan-600 text-white py-2 px-4 rounded hover:bg-cyan-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as CNC'}
            </button>
            
            <button
              onClick={() => updateUserRole('QC')}
              disabled={isUpdating}
              className="w-full bg-yellow-600 text-white py-2 px-4 rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Set as QC'}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-6 p-4 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg">
            {message}
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-lg">
          <p><strong>Note:</strong> After updating the role, please refresh the page to see the changes.</p>
        </div>
      </div>
    </div>
  );
}

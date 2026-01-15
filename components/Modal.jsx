"use client";

import React, { useEffect } from "react";

export default function Modal({ open, onClose, title, children, maxWidth = "max-w-2xl", hideHeader = false, maxHeight = "max-h-[70vh]", footer }) {
  useEffect(() => {
    if (!open) return;
    
    // Store original styles
    const originalStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    
    // Prevent body scroll but allow modal scroll
    document.body.style.overflow = "hidden";
    
    return () => {
      // Restore original styles
      document.body.style.overflow = originalStyle.overflow;
      document.body.style.paddingRight = originalStyle.paddingRight;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Modal Container */}
      <div className={`relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full ${maxWidth} ${maxHeight} flex flex-col`}>
        {/* Header */}
        {!hideHeader && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <button 
              onClick={onClose} 
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className="overflow-y-auto flex-1 modal-scrollbar-visible">
          {children}
        </div>
        
        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}



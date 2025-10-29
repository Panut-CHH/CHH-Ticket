"use client";

import React from "react";

/**
 * DocumentViewer renders a given URL or base64 data URL as either an image or a PDF inside an iframe.
 * It accepts any direct image URL (png/jpg/webp), PDF URL, or base64 data URL.
 */
export default function DocumentViewer({ url, className = "", height = 640 }) {
  const responsiveHeight = typeof height === 'number' ? height : height;
  
  if (!url) {
    return (
      <div className={`flex items-center justify-center border rounded-lg sm:rounded-xl bg-gray-50 text-gray-500 text-sm sm:text-base ${className}`} style={{ height: responsiveHeight }}>
        ไม่มีเอกสารแนบ
      </div>
    );
  }

  const lower = String(url).toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) => lower.endsWith(ext)) || lower.includes("data:image/");

  if (isImage) {
    return (
      <div className={`border rounded-lg sm:rounded-xl bg-white overflow-hidden ${className}`} style={{ height: responsiveHeight }}>
        <div className="w-full h-full overflow-auto flex items-start justify-center bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="document" className="max-w-none object-contain" />
        </div>
      </div>
    );
  }

  // Default to PDF or generic file; render with iframe so browsers can preview PDFs
  return (
    <div className={`border rounded-lg sm:rounded-xl overflow-hidden bg-white ${className}`} style={{ height: responsiveHeight }}>
      <iframe
        title="PDF Document"
        src={url}
        className="w-full h-full"
        loading="lazy"
      />
    </div>
  );
}



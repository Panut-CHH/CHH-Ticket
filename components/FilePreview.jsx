"use client";

import React, { useState, useEffect } from "react";
import { X, Download, FileText, Image, File, Maximize, Minimize } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

export default function FilePreview({ 
  fileUrl, 
  fileName, 
  fileType, 
  isOpen, 
  onClose 
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // สร้าง blob URL จาก Supabase Storage
  const createBlobUrl = async (url) => {
    try {
      setLoading(true);
      setError(null);

      console.log('Attempting to fetch file from:', url);

      // ดาวน์โหลดไฟล์จาก Supabase Storage
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
        },
        credentials: 'omit', // ไม่ส่ง credentials
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      console.log('Blob created:', blob.type, blob.size);
      
      if (blob.size === 0) {
        throw new Error('ไฟล์ว่างเปล่า');
      }

      const blobUrl = URL.createObjectURL(blob);
      setBlobUrl(blobUrl);
      console.log('Blob URL created:', blobUrl);
    } catch (err) {
      console.error('Error creating blob URL:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        url: url
      });
      
      // แสดงข้อผิดพลาดที่ละเอียดขึ้น
      if (err.message.includes('CORS')) {
        setError('ปัญหา CORS: ไม่สามารถเข้าถึงไฟล์ได้');
      } else if (err.message.includes('404')) {
        setError('ไม่พบไฟล์ในระบบ');
      } else if (err.message.includes('403')) {
        setError('ไม่มีสิทธิ์เข้าถึงไฟล์นี้');
      } else {
        setError(`ไม่สามารถโหลดไฟล์ได้: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && fileUrl && !blobUrl && !error) {
      // ลองใช้ blob URL ก่อน
      createBlobUrl(fileUrl);
    }

    // Cleanup blob URL เมื่อ component unmount หรือ close
    return () => {
      if (blobUrl && blobUrl !== 'direct' && typeof blobUrl === 'string') {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    };
  }, [isOpen, fileUrl, blobUrl, error]);

  // ปิด modal และ cleanup
  const handleClose = () => {
    if (blobUrl && blobUrl !== 'direct' && typeof blobUrl === 'string') {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setError(null);
    setIsFullscreen(false);
    onClose();
  };

  // สลับ fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // ตรวจสอบประเภทไฟล์
  const isImage = fileType?.toLowerCase().includes('image') || 
                  fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
  
  const isPdf = fileType?.toLowerCase().includes('pdf') || 
                fileName?.toLowerCase().endsWith('.pdf');

  const isText = fileType?.toLowerCase().includes('text') || 
                 fileName?.toLowerCase().match(/\.(txt|csv|json)$/);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full flex flex-col transition-all duration-300 ${
        isFullscreen 
          ? 'h-screen w-screen max-w-none rounded-none' 
          : 'max-w-7xl h-[95vh] sm:h-[90vh]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {isImage && <Image className="w-5 h-5 text-blue-500" />}
            {isPdf && <FileText className="w-5 h-5 text-red-500" />}
            {isText && <File className="w-5 h-5 text-green-500" />}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {fileName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                download={fileName}
                className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                title="ดาวน์โหลดไฟล์"
              >
                <Download className="w-5 h-5" />
              </a>
            )}
            {isPdf && (
              <button
                onClick={toggleFullscreen}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title={isFullscreen ? "ออกจากเต็มหน้าจอ" : "เต็มหน้าจอ"}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-gray-600 dark:text-gray-400">กำลังโหลดไฟล์...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  ไม่สามารถโหลดไฟล์ได้
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => createBlobUrl(fileUrl)}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    ลองใหม่
                  </button>
                  <button
                    onClick={() => {
                      // ใช้ direct URL แทน blob URL
                      setBlobUrl('direct');
                      setError(null);
                      setLoading(false);
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    ใช้ Direct URL
                  </button>
                </div>
              </div>
            </div>
          )}

          {(blobUrl || (!loading && !error && fileUrl)) && (
            <div className="h-full overflow-hidden">
              {isImage && (
                <div className="h-full overflow-auto p-4">
                  <div className="flex items-center justify-center min-h-full">
                    <img
                      src={blobUrl === 'direct' ? fileUrl : (blobUrl || fileUrl)}
                      alt={fileName}
                      className="max-w-full max-h-full object-contain"
                      onError={() => setError('ไม่สามารถแสดงรูปภาพได้')}
                    />
                  </div>
                </div>
              )}

              {isPdf && (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                  <iframe
                    src={blobUrl === 'direct' ? fileUrl : (blobUrl || fileUrl)}
                    className="w-full h-full border-0"
                    title={fileName}
                    style={{
                      minHeight: '600px',
                      width: '100%',
                      height: '100%'
                    }}
                    onError={() => setError('ไม่สามารถแสดง PDF ได้')}
                  />
                </div>
              )}

              {isText && (
                <div className="p-4 h-full">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 h-full overflow-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    {blobUrl ? 'กำลังโหลดเนื้อหา...' : ''}
                  </pre>
                </div>
              )}

              {!isImage && !isPdf && !isText && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      ไม่สามารถแสดงตัวอย่างไฟล์นี้ได้
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      กรุณาดาวน์โหลดไฟล์เพื่อดูเนื้อหา
                    </p>
                    <div className="flex gap-3 justify-center">
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          download={fileName}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          ดาวน์โหลดไฟล์
                        </a>
                      )}
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          เปิดในแท็บใหม่
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>ประเภทไฟล์: {fileType || 'ไม่ระบุ'}</span>
            <span>ขนาด: {blobUrl ? 'โหลดแล้ว' : 'กำลังโหลด...'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

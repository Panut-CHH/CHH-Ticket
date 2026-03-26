"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * PdfViewer - Renders all pages of a PDF using pdf.js (CDN).
 * Works on mobile browsers where iframe PDF viewing is limited to 1 page.
 */
export default function PdfViewer({ url, className = "" }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const renderingRef = useRef(false);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;

    async function loadPdfJs() {
      // Load pdf.js from CDN if not already loaded
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      return pdfjsLib;
    }

    async function renderPdf() {
      if (renderingRef.current) return;
      renderingRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument(url).promise;

        if (cancelled) return;

        setPageCount(pdf.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;

          const page = await pdf.getPage(i);
          const containerWidth = container.clientWidth || window.innerWidth;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / unscaledViewport.width;
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";

          // Add page separator except for first page
          if (i > 1) {
            const separator = document.createElement("div");
            separator.style.height = "8px";
            separator.style.background = "rgba(0,0,0,0.1)";
            container.appendChild(separator);
          }

          container.appendChild(canvas);

          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF render error:", err);
          setError("ไม่สามารถแสดง PDF ได้");
          setLoading(false);
        }
      } finally {
        renderingRef.current = false;
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center text-red-500">
          <p>{error}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-blue-500 underline"
          >
            เปิด PDF ในแท็บใหม่
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-white mx-auto mb-2"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              กำลังโหลด PDF...{pageCount > 0 ? ` (${pageCount} หน้า)` : ""}
            </p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-y-auto" style={{ maxHeight: "82vh" }} />
    </div>
  );
}

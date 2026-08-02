"use client";

import { useState, useEffect, useCallback } from "react";

const pdfWorker = new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function PdfEditor({ initialPath }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [pages, setPages] = useState([]); // [{ originalIndex, thumbnail }]
  const [splitPoints, setSplitPoints] = useState(new Set()); // boundary page numbers
  const [splitFiles, setSplitFiles] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [showFullView, setShowFullView] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fileUrl = (path, download = false) =>
    `${API_URL}/pdf/file?path=${encodeURIComponent(path)}${download ? "&download=true" : ""}`;

  const loadThumbnails = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const pdfjsLib = await import("pdfjs-dist/build/pdf");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

      const pdf = await pdfjsLib.getDocument(fileUrl(path)).promise;
      const newPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        newPages.push({ originalIndex: i, thumbnail: canvas.toDataURL() });
      }
      setPages(newPages);
      setDirty(false);
      setSplitPoints(new Set());
      setSplitFiles([]);
    } catch (err) {
      setError("Couldn't load PDF pages: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThumbnails(currentPath);
  }, [currentPath, loadThumbnails]);

  function handleDragStart(e, index) {
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDrop(e, index) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData("text/plain"));
    if (fromIndex === index) return;
    setPages((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(index, 0, moved);
      return updated;
    });
    setDirty(true);
  }

  function deletePageAt(index) {
    setPages((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function toggleSplitAfter(index) {
    const boundary = index + 2; // start page of next segment
    setSplitPoints((prev) => {
      const next = new Set(prev);
      if (next.has(boundary)) next.delete(boundary);
      else next.add(boundary);
      return next;
    });
  }

  async function applyChanges() {
    setLoading(true);
    setError(null);
    try {
      const order = pages.map((p) => p.originalIndex);
      const res = await fetch(`${API_URL}/pdf/apply-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, order }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      const data = await res.json();
      setCurrentPath(data.path); // triggers reload via useEffect
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function splitPdf() {
    if (splitPoints.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const sorted = [...splitPoints].sort((a, b) => a - b);
      const res = await fetch(`${API_URL}/pdf/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, splitPoints: sorted }),
      });
      if (!res.ok) throw new Error("Failed to split PDF");
      const data = await res.json();
      setSplitFiles(data.files);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 border border-line rounded-doc bg-paper p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="font-display text-base">Edit PDF</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowFullView((v) => !v)}
            className="font-display text-[13px] border border-ink px-3 py-1.5 rounded-doc"
          >
            {showFullView ? "Hide" : "View"} full PDF
          </button>
          <a
            href={fileUrl(currentPath, true)}
            className="font-display text-[13px] border border-ink px-3 py-1.5 rounded-doc no-underline text-ink"
          >
            Download
          </a>
          <button
            onClick={applyChanges}
            disabled={!dirty || loading}
            className="font-display text-[13px] bg-ink text-paperwhite px-3 py-1.5 rounded-doc disabled:opacity-40"
          >
            Save changes
          </button>
          <button
            onClick={splitPdf}
            disabled={splitPoints.size === 0 || dirty || loading}
            className="font-display text-[13px] border border-pen-red text-pen-red px-3 py-1.5 rounded-doc disabled:opacity-40"
            title={dirty ? "Save your changes before splitting" : ""}
          >
            Split PDF ({splitPoints.size})
          </button>
        </div>
      </div>

      {error && <p className="text-pen-red text-[13px] mb-3 font-display">✗ {error}</p>}
      {loading && <p className="text-ink-soft text-[13px] mb-3 font-display">Working…</p>}
      {dirty && (
        <p className="text-[13px] text-ink-soft mb-3 font-display">
          Unsaved changes — click "Save changes" before splitting or reloading.
        </p>
      )}

      {showFullView && (
        <embed
          src={fileUrl(currentPath)}
          type="application/pdf"
          className="w-full h-[75vh] mb-6 border border-line rounded-doc"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {pages.map((p, i) => (
          <div key={`${p.originalIndex}-${i}`} className="flex items-center">
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, i)}
              className="relative border border-line rounded-doc overflow-hidden cursor-move bg-white group"
            >
              <img src={p.thumbnail} alt={`Page ${i + 1}`} className="block w-[110px]" />
              <span className="absolute bottom-1 left-1 bg-ink text-paperwhite text-[10px] font-display px-1.5 rounded">
                {i + 1}
              </span>
              <button
                onClick={() => deletePageAt(i)}
                className="absolute top-1 right-1 bg-pen-red text-white text-[11px] w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete page"
              >
                ×
              </button>
            </div>

            {i < pages.length - 1 && (
              <button
                onClick={() => toggleSplitAfter(i)}
                className={`mx-1 text-[16px] font-display ${
                  splitPoints.has(i + 2) ? "text-pen-red" : "text-ink-soft opacity-30 hover:opacity-100"
                }`}
                title="Toggle split point"
              >
                ✂
              </button>
            )}
          </div>
        ))}
      </div>

      {splitFiles.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="font-display text-[13px] mb-2">Split into {splitFiles.length} files:</p>
          <div className="flex flex-col gap-1">
            {splitFiles.map((path, i) => (
              <a
                key={path}
                href={fileUrl(path, true)}
                className="font-display text-[13px] text-pen-blue no-underline"
              >
                Download part {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
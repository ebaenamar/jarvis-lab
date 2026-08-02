"use client";

import { useEffect, useRef, useState } from "react";

const RENDER_SCALE = 1.5;
const BLANK_W = 612; // US Letter, PDF points
const BLANK_H = 792;

let idCounter = 0;
const nextId = () => ++idCounter;

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const lib = await import("pdfjs-dist");
  // If the worker fails to load, check your installed pdfjs-dist version —
  // older versions ship a .js worker, newer ones a .mjs worker.
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
  _pdfjs = lib;
  return lib;
}

function makeEntry(type, originalIndex = null) {
  return { id: nextId(), type, originalIndex, rotation: 0, viewport: null, annotations: [] };
}

// Canonical annotation coordinates are always PDF points in the page's
// original (unrotated) coordinate space — this is what pdf-lib expects,
// and it's what keeps annotations correctly placed even if you rotate
// the page again after adding them.
function toCanonical(entry, x, y) {
  if (entry.type === "blank") return [x / RENDER_SCALE, BLANK_H - y / RENDER_SCALE];
  if (!entry.viewport) return null;
  return entry.viewport.convertToPdfPoint(x, y);
}

function toDisplay(entry, x, y) {
  if (entry.type === "blank") return [x * RENDER_SCALE, (BLANK_H - y) * RENDER_SCALE];
  if (!entry.viewport) return null;
  return entry.viewport.convertToViewportPoint(x, y);
}

export default function EditPdfPage() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageOrder, setPageOrder] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tool, setTool] = useState("none"); // none | text | highlight | draw
  const [fileName, setFileName] = useState("");
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [editingTextId, setEditingTextId] = useState(null);
  const [dragRect, setDragRect] = useState(null);
  const [drawPoints, setDrawPoints] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileBytesRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const thumbRefs = useRef({});
  const dragStartRef = useRef(null);
  const isPointerDown = useRef(false);

  const entry = pageOrder[currentIndex] || null;

  // --- Load a file -----------------------------------------------------
  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file || file.type !== "application/pdf") return;
    const buf = await file.arrayBuffer();
    fileBytesRef.current = new Uint8Array(buf);
    setFileName(file.name);

    const pdfjsLib = await getPdfjs();
    const doc = await pdfjsLib.getDocument({ data: fileBytesRef.current.slice(0) }).promise;
    setPdfDoc(doc);
    setPageOrder(Array.from({ length: doc.numPages }, (_, i) => makeEntry("original", i)));
    setCurrentIndex(0);
  }

  // --- Render the current page onto the main canvas ---------------------
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (entry.type === "blank") {
        const w = BLANK_W * RENDER_SCALE;
        const h = BLANK_H * RENDER_SCALE;
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fbfaf6";
        ctx.fillRect(0, 0, w, h);
        setCanvasSize({ w, h });
        return;
      }

      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(entry.originalIndex + 1);
      const viewport = page.getViewport({ scale: RENDER_SCALE, rotation: entry.rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;
      setCanvasSize({ w: viewport.width, h: viewport.height });
      setPageOrder((prev) => prev.map((en, i) => (i === currentIndex ? { ...en, viewport } : en)));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentIndex, entry?.id, entry?.rotation, entry?.type]);

  // --- Render thumbnails --------------------------------------------------
  const structureKey = pageOrder.map((e) => `${e.id}:${e.type}:${e.rotation}`).join("|");
  useEffect(() => {
    pageOrder.forEach(async (en) => {
      const canvas = thumbRefs.current[en.id];
      if (!canvas) return;

      if (en.type === "blank") {
        const w = 84;
        const h = Math.round(w * (BLANK_H / BLANK_W));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fbfaf6";
        ctx.fillRect(0, 0, w, h);
        return;
      }

      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(en.originalIndex + 1);
      const base = page.getViewport({ scale: 1, rotation: en.rotation });
      const thumbScale = 84 / base.width;
      const viewport = page.getViewport({ scale: thumbScale, rotation: en.rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, structureKey]);

  // --- Page operations -----------------------------------------------------
  function updateCurrentEntry(fn) {
    setPageOrder((prev) => prev.map((en, i) => (i === currentIndex ? fn(en) : en)));
  }

  function rotatePage() {
    updateCurrentEntry((en) => ({ ...en, rotation: (en.rotation + 90) % 360 }));
  }

  function deleteCurrentPage() {
    if (pageOrder.length <= 1) return;
    setPageOrder((prev) => prev.filter((_, i) => i !== currentIndex));
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function insertBlankAfterCurrent() {
    const blank = makeEntry("blank");
    setPageOrder((prev) => {
      const copy = [...prev];
      copy.splice(currentIndex + 1, 0, blank);
      return copy;
    });
    setCurrentIndex((i) => i + 1);
  }

  function movePage(dir) {
    const swap = currentIndex + dir;
    if (swap < 0 || swap >= pageOrder.length) return;
    setPageOrder((prev) => {
      const copy = [...prev];
      [copy[currentIndex], copy[swap]] = [copy[swap], copy[currentIndex]];
      return copy;
    });
    setCurrentIndex(swap);
  }

  function clearAnnotations() {
    updateCurrentEntry((en) => ({ ...en, annotations: [] }));
  }

  function removeAnnotation(id) {
    updateCurrentEntry((en) => ({ ...en, annotations: en.annotations.filter((a) => a.id !== id) }));
  }

  // --- Overlay pointer handling -----------------------------------------
  function getDisplayPoint(e) {
    const rect = overlayRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handleOverlayClick(e) {
    if (tool !== "text" || !entry) return;
    const { x, y } = getDisplayPoint(e);
    const canonical = toCanonical(entry, x, y);
    if (!canonical) return;
    const id = nextId();
    updateCurrentEntry((en) => ({
      ...en,
      annotations: [...en.annotations, { id, kind: "text", x: canonical[0], y: canonical[1], text: "", size: 16 }],
    }));
    setEditingTextId(id);
  }

  function handlePointerDown(e) {
    if (!entry) return;
    if (tool === "highlight") {
      const p = getDisplayPoint(e);
      dragStartRef.current = p;
      setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
      isPointerDown.current = true;
    } else if (tool === "draw") {
      setDrawPoints([getDisplayPoint(e)]);
      isPointerDown.current = true;
    }
  }

  function handlePointerMove(e) {
    if (!isPointerDown.current) return;
    const p = getDisplayPoint(e);
    if (tool === "highlight" && dragStartRef.current) {
      const s = dragStartRef.current;
      setDragRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
    } else if (tool === "draw") {
      setDrawPoints((prev) => (prev ? [...prev, p] : [p]));
    }
  }

  function handlePointerUp() {
    if (!entry) return;
    if (tool === "highlight" && dragRect) {
      if (dragRect.w > 4 && dragRect.h > 4) {
        const c1 = toCanonical(entry, dragRect.x, dragRect.y);
        const c2 = toCanonical(entry, dragRect.x + dragRect.w, dragRect.y + dragRect.h);
        if (c1 && c2) {
          const minX = Math.min(c1[0], c2[0]);
          const maxX = Math.max(c1[0], c2[0]);
          const minY = Math.min(c1[1], c2[1]);
          const maxY = Math.max(c1[1], c2[1]);
          updateCurrentEntry((en) => ({
            ...en,
            annotations: [...en.annotations, { id: nextId(), kind: "highlight", x: minX, y: minY, w: maxX - minX, h: maxY - minY }],
          }));
        }
      }
      setDragRect(null);
      dragStartRef.current = null;
    } else if (tool === "draw" && drawPoints && drawPoints.length > 1) {
      const pts = drawPoints
        .map((p) => {
          const c = toCanonical(entry, p.x, p.y);
          return c ? { x: c[0], y: c[1] } : null;
        })
        .filter(Boolean);
      if (pts.length > 1) {
        updateCurrentEntry((en) => ({ ...en, annotations: [...en.annotations, { id: nextId(), kind: "draw", points: pts }] }));
      }
      setDrawPoints(null);
    }
    isPointerDown.current = false;
  }

  // --- Export --------------------------------------------------------------
  async function handleExport() {
    if (!pageOrder.length) return;
    setExporting(true);
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const outPdf = await PDFDocument.create();
      const font = await outPdf.embedFont(StandardFonts.Helvetica);
      const srcPdf = fileBytesRef.current ? await PDFDocument.load(fileBytesRef.current.slice(0)) : null;

      for (const en of pageOrder) {
        let page;
        if (en.type === "original" && srcPdf) {
          const [copied] = await outPdf.copyPages(srcPdf, [en.originalIndex]);
          outPdf.addPage(copied);
          page = copied;
          if (en.rotation) {
            const base = page.getRotation().angle;
            page.setRotation(degrees((base + en.rotation) % 360));
          }
        } else {
          page = outPdf.addPage([BLANK_W, BLANK_H]);
        }

        for (const ann of en.annotations) {
          if (ann.kind === "text" && ann.text.trim()) {
            page.drawText(ann.text, { x: ann.x, y: ann.y - ann.size, size: ann.size, font, color: rgb(0.17, 0.29, 0.45) });
          } else if (ann.kind === "highlight") {
            page.drawRectangle({ x: ann.x, y: ann.y, width: ann.w, height: ann.h, color: rgb(1, 0.88, 0.3), opacity: 0.4 });
          } else if (ann.kind === "draw" && ann.points.length > 1) {
            for (let i = 1; i < ann.points.length; i++) {
              page.drawLine({ start: ann.points[i - 1], end: ann.points[i], thickness: 2.5, color: rgb(0.7, 0.22, 0.18) });
            }
          }
        }
      }

      const bytes = await outPdf.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName ? fileName.replace(/\.pdf$/i, "") + "-edited.pdf" : "edited.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const toolBtn = (id, label) =>
    `font-display text-xs px-3 py-2 rounded-doc border transition-colors ${
      tool === id ? "bg-ink text-paperwhite border-ink" : "bg-paperwhite text-ink-soft border-line hover:border-ink"
    }`;

  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="py-5 border-b border-line">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between gap-4">
          <a href="/" className="inline-flex items-baseline gap-0.5 font-display font-bold text-[19px] tracking-[-0.02em] no-underline text-ink">
            open<span className="text-pen-red">PDF</span>
          </a>
          {fileName && <span className="font-display text-xs text-ink-soft truncate">{fileName}</span>}
          <div className="flex items-center gap-3">
            <label className="font-display text-xs px-4 py-2 rounded-doc border border-line text-ink-soft cursor-pointer hover:border-ink transition-colors">
              Open file
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
            <button
              onClick={handleExport}
              disabled={!pageOrder.length || exporting}
              className="font-display text-xs font-medium px-4 py-2 rounded-doc bg-ink text-paperwhite border border-ink disabled:opacity-50 disabled:pointer-events-none hover:shadow-[0_3px_0_#b23a2e] transition-shadow"
            >
              {exporting ? "Exporting…" : "Download PDF"}
            </button>
          </div>
        </div>
      </header>

      {!pageOrder.length ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`w-full max-w-md text-center border-2 border-dashed rounded-doc px-8 py-16 transition-colors ${
              isDraggingFile ? "border-pen-blue bg-paperwhite" : "border-line bg-paperwhite/60"
            }`}
          >
            <p className="font-display text-sm text-ink mb-2">Drop a PDF here</p>
            <p className="text-ink-soft text-sm mb-6">or choose a file to start editing</p>
            <label className="inline-block font-display text-xs font-medium px-5 py-3 rounded-doc bg-ink text-paperwhite cursor-pointer hover:shadow-[0_3px_0_#b23a2e] transition-shadow">
              Choose file
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Thumbnails */}
          <aside className="w-[140px] shrink-0 border-r border-line overflow-y-auto py-4 px-3 flex flex-col gap-3">
            {pageOrder.map((en, i) => (
              <button
                key={en.id}
                onClick={() => setCurrentIndex(i)}
                className={`relative border rounded-[2px] overflow-hidden bg-paperwhite ${
                  i === currentIndex ? "border-pen-blue ring-1 ring-pen-blue" : "border-line"
                }`}
              >
                <canvas ref={(el) => el && (thumbRefs.current[en.id] = el)} className="block w-full h-auto" />
                <span className="absolute bottom-1 right-1 font-display text-[10px] bg-ink/80 text-paperwhite px-1 rounded-sm">{i + 1}</span>
              </button>
            ))}
            <button
              onClick={insertBlankAfterCurrent}
              className="font-display text-xs text-ink-soft border border-dashed border-line rounded-doc py-3 hover:border-ink hover:text-ink transition-colors"
            >
              + Blank page
            </button>
          </aside>

          {/* Main editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="border-b border-line px-6 py-3 flex flex-wrap items-center gap-2">
              <button className={toolBtn("none", "Select")} onClick={() => setTool("none")}>Select</button>
              <button className={toolBtn("text", "Text")} onClick={() => setTool("text")}>+ Text</button>
              <button className={toolBtn("highlight", "Highlight")} onClick={() => setTool("highlight")}>Highlight</button>
              <button className={toolBtn("draw", "Draw")} onClick={() => setTool("draw")}>Draw</button>

              <span className="w-px h-5 bg-line mx-1" />

              <button
                onClick={rotatePage}
                disabled={entry?.type === "blank"}
                className="font-display text-xs px-3 py-2 rounded-doc border border-line text-ink-soft hover:border-ink disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Rotate ⟳
              </button>
              <button onClick={() => movePage(-1)} className="font-display text-xs px-3 py-2 rounded-doc border border-line text-ink-soft hover:border-ink transition-colors">
                ← Move
              </button>
              <button onClick={() => movePage(1)} className="font-display text-xs px-3 py-2 rounded-doc border border-line text-ink-soft hover:border-ink transition-colors">
                Move →
              </button>
              <button onClick={clearAnnotations} className="font-display text-xs px-3 py-2 rounded-doc border border-line text-ink-soft hover:border-ink transition-colors">
                Clear marks
              </button>
              <button
                onClick={deleteCurrentPage}
                disabled={pageOrder.length <= 1}
                className="font-display text-xs px-3 py-2 rounded-doc border border-pen-red text-pen-red hover:bg-pen-red hover:text-paperwhite disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Delete page
              </button>

              <span className="ml-auto font-display text-xs text-ink-soft">
                Page {currentIndex + 1} of {pageOrder.length}
              </span>
            </div>

            {/* Canvas area */}
            <div className="flex-1 overflow-auto bg-paper-dim/40 p-8 flex items-start justify-center">
              {entry && (
                <div className="relative inline-block shadow-[0_24px_60px_-24px_rgba(28,27,25,0.35)]" style={{ width: canvasSize.w, height: canvasSize.h }}>
                  <canvas ref={canvasRef} className="block bg-paperwhite" />
                  <div
                    ref={overlayRef}
                    onClick={handleOverlayClick}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    className="absolute inset-0"
                    style={{
                      cursor: tool === "text" ? "text" : tool === "highlight" || tool === "draw" ? "crosshair" : "default",
                    }}
                  >
                    {/* Highlights */}
                    {entry.annotations
                      .filter((a) => a.kind === "highlight")
                      .map((ann) => {
                        const d1 = toDisplay(entry, ann.x, ann.y);
                        const d2 = toDisplay(entry, ann.x + ann.w, ann.y + ann.h);
                        if (!d1 || !d2) return null;
                        const left = Math.min(d1[0], d2[0]);
                        const top = Math.min(d1[1], d2[1]);
                        const width = Math.abs(d2[0] - d1[0]);
                        const height = Math.abs(d2[1] - d1[1]);
                        return (
                          <div key={ann.id} className="absolute group" style={{ left, top, width, height, background: "rgba(255,224,64,0.45)" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAnnotation(ann.id);
                              }}
                              className="absolute -top-2 -right-2 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-pen-red text-paperwhite text-[10px] leading-none"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}

                    {/* Draw strokes */}
                    <svg className="absolute inset-0 pointer-events-none" width={canvasSize.w} height={canvasSize.h}>
                      {entry.annotations
                        .filter((a) => a.kind === "draw")
                        .map((ann) => {
                          const pts = ann.points
                            .map((p) => {
                              const d = toDisplay(entry, p.x, p.y);
                              return d ? `${d[0]},${d[1]}` : null;
                            })
                            .filter(Boolean)
                            .join(" ");
                          return <polyline key={ann.id} points={pts} fill="none" stroke="#b23a2e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
                        })}
                      {drawPoints && drawPoints.length > 1 && (
                        <polyline
                          points={drawPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke="#b23a2e"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.7}
                        />
                      )}
                    </svg>

                    {/* In-progress highlight drag preview */}
                    {dragRect && (
                      <div
                        className="absolute border border-pen-blue"
                        style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h, background: "rgba(255,224,64,0.3)" }}
                      />
                    )}

                    {/* Text annotations */}
                    {entry.annotations
                      .filter((a) => a.kind === "text")
                      .map((ann) => {
                        const d = toDisplay(entry, ann.x, ann.y);
                        if (!d) return null;
                        const isEditing = editingTextId === ann.id;
                        return (
                          <div key={ann.id} className="absolute group" style={{ left: d[0], top: d[1] }}>
                            {isEditing ? (
                              <textarea
                                autoFocus
                                value={ann.text}
                                onChange={(e) =>
                                  updateCurrentEntry((en) => ({
                                    ...en,
                                    annotations: en.annotations.map((a) => (a.id === ann.id ? { ...a, text: e.target.value } : a)),
                                  }))
                                }
                                onBlur={() => {
                                  if (!ann.text.trim()) removeAnnotation(ann.id);
                                  setEditingTextId(null);
                                }}
                                className="font-annotation text-pen-blue bg-paperwhite/90 border border-pen-blue rounded-[2px] px-1 py-0.5 resize outline-none"
                                style={{ fontSize: ann.size, minWidth: 120 }}
                              />
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTextId(ann.id);
                                }}
                                className="font-annotation text-pen-blue cursor-text whitespace-pre-wrap"
                                style={{ fontSize: ann.size }}
                              >
                                {ann.text}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeAnnotation(ann.id);
                                  }}
                                  className="ml-1 hidden group-hover:inline-flex w-4 h-4 items-center justify-center rounded-full bg-pen-red text-paperwhite text-[10px] leading-none align-top"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
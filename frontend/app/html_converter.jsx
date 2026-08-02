"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const DEFAULT_HTML = `<h1>Hello from HTML</h1>
<p>This content will be converted to PDF.</p>`;

export default function HtmlToPdfPage() {
  const [htmlInput, setHtmlInput] = useState(DEFAULT_HTML);
  const [converting, setConverting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [error, setError] = useState(null);

  const previewRef = useRef(null);
  const prevUrlRef = useRef(null);

  // Revoke the previous object URL whenever we make a new one, or on unmount —
  // otherwise each conversion leaks a blob URL for the life of the tab.
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  async function handleConvert() {
    if (!htmlInput.trim()) {
      setError("Please enter some HTML before converting.");
      return;
    }

    setConverting(true);
    setError(null);

    try {
      // Both run entirely in the browser — no server round trip, no
      // headless-browser dependency. html2canvas rasterizes the rendered
      // preview element; jsPDF lays that image across as many pages as needed.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const node = previewRef.current;
      if (!node) throw new Error("Nothing to convert — the preview didn't render.");

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      // Paginate: slide the same tall image up by one page-height per page
      // until we've covered its full height.
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);

      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = url;

      setPdfBlob(blob);
      setPdfUrl(url);
    } catch (err) {
      setError(err.message || "Conversion failed.");
    } finally {
      setConverting(false);
    }
  }

  function handleDownload() {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "html-export.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="py-5 border-b border-line">
        <div className="max-w-[1180px] mx-auto px-8 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-baseline gap-0.5 font-display font-bold text-[19px] tracking-[-0.02em] no-underline text-ink">
            open<span className="text-pen-red">PDF</span>
          </Link>
          <Link href="/" className="font-display text-xs text-ink-soft no-underline hover:text-pen-blue transition-colors">
            ← Back home
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-[1180px] w-full mx-auto px-8 py-12">
        <p className="font-display text-xs tracking-[0.08em] uppercase text-pen-blue flex items-center gap-2.5 mb-4 before:content-[''] before:block before:w-[22px] before:h-px before:bg-pen-blue">
          Runs entirely in your browser
        </p>
        <h1 className="font-display font-bold text-[clamp(28px,3.4vw,40px)] leading-[1.1] tracking-[-0.02em] mb-3">
          Convert HTML to PDF
        </h1>
        <p className="text-ink-soft max-w-[60ch] mb-10">
          Paste HTML, see it rendered below, then export it as a paginated PDF. No upload, no server — the conversion happens on your machine.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input */}
          <div>
            <label className="block font-display text-xs uppercase tracking-[0.04em] text-ink-soft mb-2">
              HTML source
            </label>
            <textarea
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[360px] border border-line rounded-doc bg-paperwhite p-3 font-mono text-[13px] text-ink focus:border-pen-blue outline-none resize-y"
              placeholder="<h1>Hello</h1>"
            />

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleConvert}
                disabled={converting}
                className="font-display font-medium text-sm bg-ink text-paperwhite border border-ink px-[22px] py-[13px] rounded-doc inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none hover:shadow-[0_3px_0_#b23a2e] transition-shadow"
              >
                {converting ? "Converting…" : "Generate PDF"}
              </button>

              {pdfUrl && (
                <>
                  <button
                    onClick={handleDownload}
                    className="font-display text-sm border border-ink px-[18px] py-[11px] rounded-doc text-ink hover:bg-ink hover:text-paperwhite transition-colors"
                  >
                    Download PDF
                  </button>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-display text-sm text-pen-blue no-underline hover:underline"
                  >
                    Open in new tab
                  </a>
                </>
              )}
            </div>

            {error && <p className="mt-3 text-[13px] text-pen-red font-display">✗ {error}</p>}
            {pdfUrl && !error && (
              <p className="mt-3 text-[13px] text-[#6b9955] font-display">✓ PDF generated</p>
            )}
          </div>

          {/* Live preview — this is the exact element that gets rasterized */}
          <div>
            <label className="block font-display text-xs uppercase tracking-[0.04em] text-ink-soft mb-2">
              Preview (this is what gets exported)
            </label>
            <div className="border border-line rounded-doc bg-paperwhite p-2 shadow-[0_24px_60px_-24px_rgba(28,27,25,0.35)]">
              <div
                ref={previewRef}
                className="bg-white text-black p-8 min-h-[360px] overflow-auto"
                style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
                dangerouslySetInnerHTML={{ __html: htmlInput }}
              />
            </div>
            <p className="mt-2 text-[12px] text-ink-soft">
              The preview renders your raw HTML/CSS directly — only paste HTML you trust, same as pasting into any browser.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

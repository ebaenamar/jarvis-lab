"use client";

import PdfEditor from "./PdfEditor";
import Link from "next/link";
import { useState } from "react";

export default function HomePage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function uploadPdf(selectedFile) {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pdf/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const savedPath = await res.text();
      setResult(savedPath);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      uploadPdf(selected);
    }
  }

  return (
    <>
      <header className="border-b border-line py-7">
        <div className="max-w-[1180px] mx-auto px-8 flex items-center justify-between">
          <div className="flex items-baseline gap-0.5 font-display font-bold text-[19px] tracking-[-0.02em]">
            open<span className="text-pen-red">PDF</span>
          </div>
          <ul className="hidden md:flex gap-8 list-none font-display text-[13px] tracking-[0.01em]">
            <li>
              <a className="text-ink-soft no-underline transition-colors duration-150 hover:text-pen-blue" href="#features">
                Features
              </a>
            </li>
            <li>
              <a className="text-ink-soft no-underline transition-colors duration-150 hover:text-pen-blue" href="#source">
                Source
              </a>
            </li>
            <li>
              <a className="text-ink-soft no-underline transition-colors duration-150 hover:text-pen-blue" href="#">
                Docs
              </a>
            </li>
            <li>
              <a className="text-ink-soft no-underline transition-colors duration-150 hover:text-pen-blue" href="#">
                Community
              </a>
            </li>
          </ul>
          <div className="flex items-center gap-3">
            <Link
              className="font-display text-[13px] text-ink-soft no-underline whitespace-nowrap transition-colors duration-150 hover:text-pen-blue"
              href="/html-to-pdf"
            >
              HTML → PDF
            </Link>
            <Link
              className="font-display text-[13px] border border-ink px-4 py-2 rounded-doc no-underline text-ink whitespace-nowrap transition-colors duration-150 hover:bg-ink hover:text-paperwhite"
              href="/editor"
            >
              Editor
            </Link>
            <Link
              className="font-display text-[13px] text-ink-soft no-underline transition-colors duration-150 hover:text-pen-blue"
              href="/login"
            >
              Log in
            </Link>
            <Link
              className="font-display text-[13px] border border-ink px-4 py-2 rounded-doc no-underline text-ink whitespace-nowrap transition-colors duration-150 hover:bg-ink hover:text-paperwhite"
              href="/signup"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="pt-[88px] pb-24">
          <div className="max-w-[1180px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
            <div>
              <p className="font-display text-xs tracking-[0.08em] uppercase text-pen-blue flex items-center gap-2.5 mb-5 before:content-[''] before:block before:w-[22px] before:h-px before:bg-pen-blue">
                 Sundai Hack 134 Project
              </p>
              <h1 className="font-display font-bold text-[clamp(34px,4.4vw,54px)] leading-[1.08] tracking-[-0.02em] mb-[22px]">
                A PDF viewer
                <br />
                with nothing
                <br />
                <span className="bg-ink text-ink rounded-[2px] px-1.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
                  to hide
                </span>
                .
              </h1>
              <p className="text-lg text-ink-soft max-w-[46ch] mb-[34px]">
                openPDF renders, annotates, and fills forms — without phoning
                home. Every line of the codebase is public, forkable, and
                built by people who actually read PDFs for a living.
              </p>
              <div className="flex items-center gap-5 mb-10">
                <a
                  className="font-display font-medium text-sm bg-ink text-paperwhite border border-ink px-[22px] py-[13px] rounded-doc no-underline inline-flex items-center gap-2 transition-transform duration-150 hover:-translate-y-px hover:shadow-[0_4px_0_#b23a2e]"
                  href="#"
                >
                  Download for free →
                </a>
                <a
                  className="font-display text-sm text-ink no-underline border-b border-line pb-0.5 transition-colors duration-150 hover:border-ink"
                  href="#source"
                >
                  View source on GitHub
                </a>
              </div>
              <div className="flex gap-7 font-display text-xs text-ink-soft">
                <span><strong className="text-ink font-bold">0</strong> trackers</span>
                <span><strong className="text-ink font-bold">100%</strong> offline-capable</span>
            
              </div>
            </div>

            {/* SIGNATURE ELEMENT: a "reviewed" document with margin annotations */}
            <div className="relative flex pl-0 lg:pl-[34px]">
              <div
                className="hidden lg:flex absolute left-0 top-[10px] bottom-[10px] w-[26px] flex-col justify-between font-display text-[9px] text-ink-soft"
                aria-hidden="true"
              >
                <span className="relative pl-2.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-1.5 before:h-px before:bg-line">01</span>
                <span className="relative pl-2.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-1.5 before:h-px before:bg-line">02</span>
                <span className="relative pl-2.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-1.5 before:h-px before:bg-line">03</span>
                <span className="relative pl-2.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-1.5 before:h-px before:bg-line">04</span>
                <span className="relative pl-2.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:w-1.5 before:h-px before:bg-line">05</span>
              </div>

              <div className="relative bg-paperwhite border border-line rounded-doc w-full px-[30px] pt-[30px] pb-[34px] shadow-[0_24px_60px_-24px_rgba(28,27,25,0.35)] after:content-[''] after:absolute after:right-0 after:bottom-0 after:w-[26px] after:h-[26px] after:[background:linear-gradient(135deg,transparent_50%,#e4e0d3_50%)] after:rounded-br-doc">
                <div className="flex justify-between items-center border-b border-line pb-3 mb-5">
                  <span className="font-display text-xs text-ink-soft">quarterly-report.pdf</span>
                  <div className="flex gap-[5px]">
                    <span className="w-[7px] h-[7px] rounded-full bg-line"></span>
                    <span className="w-[7px] h-[7px] rounded-full bg-line"></span>
                    <span className="w-[7px] h-[7px] rounded-full bg-line"></span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="h-2 rounded-[2px] bg-paper-dim w-[70%]"></div>
                  <div className="h-2 rounded-[2px] bg-paper-dim w-full"></div>

                  <div className="relative h-2 rounded-[2px] bg-pen-red/[0.16] w-[90%]">
                    <div className="static lg:absolute lg:right-[-14px] lg:translate-x-full lg:top-[62px] flex items-center gap-2 mt-2.5 lg:mt-0 max-w-[190px]">
                      <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 bg-paperwhite">1</span>
                      <span className="font-annotation text-[17px] leading-[1.15] text-pen-red">no telemetry, ever</span>
                    </div>
                  </div>

                  <div className="h-2 rounded-[2px] bg-paper-dim w-[80%]"></div>

                  <div className="relative h-2 rounded-[2px] bg-pen-red/[0.16] w-[55%]">
                    <div className="static lg:absolute lg:right-[-14px] lg:translate-x-full lg:top-[112px] flex items-center gap-2 mt-2.5 lg:mt-0 max-w-[190px]">
                      <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 bg-paperwhite">2</span>
                      <span className="font-annotation text-[17px] leading-[1.15] text-pen-red">runs fully offline</span>
                    </div>
                  </div>

                  <div className="h-2 rounded-[2px] bg-paper-dim w-[90%]"></div>
                  <div className="h-2 rounded-[2px] bg-paper-dim w-[70%]"></div>

                  <div className="relative h-2 rounded-[2px] bg-pen-red/[0.16] w-full">
                    <div className="static lg:absolute lg:right-[-14px] lg:translate-x-full lg:top-[168px] flex items-center gap-2 mt-2.5 lg:mt-0 max-w-[190px]">
                      <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 bg-paperwhite">3</span>
                      <span className="font-annotation text-[17px] leading-[1.15] text-pen-red">audited by anyone</span>
                    </div>
                  </div>

                  <div className="h-2 rounded-[2px] bg-paper-dim w-[80%]"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* UPLOAD — connects to the Spring Boot backend */}
        <section className="border-t border-line py-16">
          <div className="max-w-[1180px] mx-auto px-8">
            <div className="border border-line rounded-doc bg-paper px-8 py-10 max-w-[560px] mx-auto text-center">
              <h2 className="font-display text-lg mb-2 tracking-[-0.01em]">
                Try it — upload a PDF
              </h2>
              <p className="text-[14.5px] text-ink-soft mb-6">
                Sent straight to the local backend. Nothing leaves your machine.
              </p>

              <label
                className="font-display font-medium text-sm bg-ink text-paperwhite border border-ink px-[22px] py-[13px] rounded-doc inline-flex items-center gap-2 cursor-pointer transition-transform duration-150 hover:-translate-y-px hover:shadow-[0_4px_0_#b23a2e]"
              >
                {uploading ? "Uploading…" : "Choose PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>

              {file && (
                <p className="mt-4 text-[13px] text-ink-soft font-display">
                  {file.name}
                </p>
              )}

              {result && (
                <p className="mt-2 text-[13px] text-[#6b9955] font-display">
                  ✓ Uploaded — saved at {result}
                </p>
              )}
              {result && <PdfEditor initialPath={result} />}

              {error && (
                <p className="mt-2 text-[13px] text-pen-red font-display">
                  ✗ {error}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="border-t border-line py-16">
          <div className="max-w-[1180px] mx-auto px-8">
            <div className="border border-line rounded-doc bg-paper p-8 max-w-3xl mx-auto flex items-center justify-between gap-6 flex-wrap">
              <div>
                <h2 className="font-display text-lg mb-2 tracking-[-0.01em]">Convert HTML to PDF</h2>
                <p className="text-[14.5px] text-ink-soft">
                  Paste HTML, preview it live, export a paginated PDF — runs entirely in your browser.
                </p>
              </div>
              <Link
                href="/html-to-pdf"
                className="font-display font-medium text-sm bg-ink text-paperwhite border border-ink px-[22px] py-[13px] rounded-doc inline-flex items-center gap-2 whitespace-nowrap no-underline hover:shadow-[0_3px_0_#b23a2e] transition-shadow"
              >
                Open converter →
              </Link>
            </div>
          </div>
        </section>

        {/* FEATURES — numbered to match the annotations above */}
        <section className="border-t border-line py-20" id="features">
          <div className="max-w-[1180px] mx-auto px-8">
            <div className="flex items-baseline justify-between mb-12 gap-6 flex-wrap">
              <h2 className="font-display text-[clamp(24px,3vw,32px)] tracking-[-0.01em]">
                Three things we won't compromise on
              </h2>
              <p className="text-ink-soft max-w-[42ch]">
                The margin notes on the left aren't decoration — they're
                the whole pitch.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
              <div className="bg-paper px-7 py-8">
                <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-5 h-5 rounded-full flex items-center justify-center mb-[18px]">1</span>
                <h3 className="font-display text-base mb-2.5 tracking-[-0.01em]">No telemetry, ever</h3>
                <p className="text-[14.5px] text-ink-soft">
                  openPDF makes zero network calls unless you explicitly
                  open a URL. No analytics SDKs, no "anonymous" usage
                  pings, no exceptions.
                </p>
              </div>
              <div className="bg-paper px-7 py-8">
                <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-5 h-5 rounded-full flex items-center justify-center mb-[18px]">2</span>
                <h3 className="font-display text-base mb-2.5 tracking-[-0.01em]">Runs fully offline</h3>
                <p className="text-[14.5px] text-ink-soft">
                  View, annotate, sign, and fill forms without an internet
                  connection. Your documents never leave your machine
                  unless you move them.
                </p>
              </div>
              <div className="bg-paper px-7 py-8">
                <span className="font-display text-[11px] font-bold text-pen-red border border-pen-red w-5 h-5 rounded-full flex items-center justify-center mb-[18px]">3</span>
                <h3 className="font-display text-base mb-2.5 tracking-[-0.01em]">Audited by anyone</h3>
                <p className="text-[14.5px] text-ink-soft">
                  The full source is public under Sundai. Read it, fork it,
                  ship your own build — no CLA, no dual-licensing catch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TRANSPARENCY / SOURCE STRIP */}
        <section className="bg-ink text-paper py-16" id="source">
          <div className="max-w-[1180px] mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-[clamp(22px,2.6vw,28px)] mb-4 tracking-[-0.01em]">
                Don't take our word for it.
              </h2>
              <p className="text-[#b9b6ab] max-w-[44ch]">
                Clone it, build it, diff it against the release binary.
                openPDF ships the same code it's built from — nothing
                more.
              </p>
            </div>
            <div className="bg-[#101010] border border-[#35342f] rounded-doc px-[22px] py-5 font-display text-[13px] leading-[1.8] overflow-x-auto">
              <div><span className="text-[#b9b6ab]">$</span> <span className="text-[#7ea1c4]">git</span> clone https://github.com/openpdf/openpdf.git</div>
              <div><span className="text-[#b9b6ab]">$</span> <span className="text-[#7ea1c4]">cd</span> openpdf &amp;&amp; <span className="text-[#7ea1c4]">npm</span> install</div>
              <div><span className="text-[#b9b6ab]">$</span> <span className="text-[#7ea1c4]">npm</span> run build</div>
              <div className="text-[#6b9955]">✓ built in 12.4s — no external calls made</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-line">
        <div className="max-w-[1180px] mx-auto px-8 flex justify-between items-center flex-wrap gap-4 font-display text-xs text-ink-soft">
          <span>© {new Date().getFullYear()} openPDF </span>
          <ul className="flex gap-[22px] list-none">
            <li><a className="no-underline text-ink-soft hover:text-pen-blue" href="#">GitHub</a></li>
            <li><a className="no-underline text-ink-soft hover:text-pen-blue" href="#">Docs</a></li>
            <li><a className="no-underline text-ink-soft hover:text-pen-blue" href="#">Contributing</a></li>
            <li><a className="no-underline text-ink-soft hover:text-pen-blue" href="#">Discord</a></li>
          </ul>
        </div>
      </footer>
    </>
  );
}
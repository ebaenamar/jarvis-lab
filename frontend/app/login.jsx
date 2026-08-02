"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const message = isJson ? payload?.error || "Login failed" : payload || "Login failed";
        throw new Error(message);
      }

      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message.includes("<!DOCTYPE") ? "The backend is not responding at the configured URL." : message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="py-7 border-b border-line">
        <div className="max-w-[1180px] mx-auto px-8">
          <a
            href="/"
            className="inline-flex items-baseline gap-0.5 font-display font-bold text-[19px] tracking-[-0.02em] no-underline text-ink"
          >
            open<span className="text-pen-red">PDF</span>
          </a>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[420px]">
          <p className="font-display text-xs tracking-[0.08em] uppercase text-pen-blue flex items-center gap-2.5 mb-5 before:content-[''] before:block before:w-[22px] before:h-px before:bg-pen-blue">
            Access
          </p>
          <h1 className="font-display font-bold text-[32px] leading-[1.1] tracking-[-0.02em] mb-2">
            Welcome back.
          </h1>
          <p className="text-ink-soft mb-8">
            Log in to sync your annotations and settings.
          </p>

          {/* Form card — styled like a reviewed document page */}
          <div className="relative bg-paperwhite border border-line rounded-doc px-8 pt-8 pb-9 shadow-[0_24px_60px_-24px_rgba(28,27,25,0.35)] after:content-[''] after:absolute after:right-0 after:bottom-0 after:w-[22px] after:h-[22px] after:[background:linear-gradient(135deg,transparent_50%,#e4e0d3_50%)] after:rounded-br-doc">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label
                  htmlFor="username"
                  className="block font-display text-xs uppercase tracking-[0.04em] text-ink-soft mb-2"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ada"
                  className="w-full bg-transparent border-0 border-b border-line pb-2 text-[15px] text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-pen-blue transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="font-display text-xs uppercase tracking-[0.04em] text-ink-soft"
                  >
                    Password
                  </label>
                  <a
                    href="/forgot-password"
                    className="font-display text-xs text-pen-blue no-underline hover:underline"
                  >
                    Forgot?
                  </a>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent border-0 border-b border-line pb-2 text-[15px] text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-pen-blue transition-colors"
                />
              </div>

              {error ? (
                <p className="text-sm text-pen-red">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 font-display font-medium text-sm bg-ink text-paperwhite border border-ink px-[22px] py-[13px] rounded-doc inline-flex items-center justify-center gap-2 transition-transform duration-150 hover:-translate-y-px hover:shadow-[0_4px_0_#b23a2e] disabled:opacity-60 disabled:pointer-events-none"
              >
                {submitting ? "Logging in…" : "Log in →"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-ink-soft">
            New to openPDF?{" "}
            <a href="/signup" className="text-pen-blue no-underline hover:underline">
              Create an account
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

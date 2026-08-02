import { Inter, JetBrains_Mono, Kalam } from "next/font/google";
import "./globals.css";

// Body copy — clean, neutral, highly legible
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display/headline face — monospace signals "code, open, inspectable"
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Margin-note face — handwritten annotation feel, used sparingly
const kalam = Kalam({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-kalam",
  display: "swap",
});

export const metadata = {
  title: "openPDF — an open-source PDF viewer",
  description:
    "A free, open-source PDF viewer built in the open. No telemetry, no lock-in, every line auditable.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${kalam.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "openPDF — an open-source PDF viewer",
  description:
    "A free, open-source PDF viewer built in the open. No telemetry, no lock-in, every line auditable.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

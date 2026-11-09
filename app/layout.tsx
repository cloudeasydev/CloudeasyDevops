import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Providers } from "@/components/providers";
import "./globals.css";

const themeBoot = `
try {
  var t = localStorage.getItem("cloudeasy.theme");
  var theme = t === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f6fb" : "#0c0e16");
} catch (e) {}
`;

export const metadata: Metadata = {
  title: "CloudEasy DevOps Portal",
  applicationName: "CloudEasy DevOps Portal",
  description: "Cloud operations portal for projects, secrets, network checks, and team access.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0e16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="cloudeasy-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Merriweather:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-canvas" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

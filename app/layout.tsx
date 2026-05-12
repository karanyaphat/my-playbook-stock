import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const graphik = localFont({
  variable: "--font-graphik",
  display: "swap",
  src: [
    { path: "../public/fonts/Graphik-Light-Trial.woff",        weight: "300", style: "normal" },
    { path: "../public/fonts/Graphik-LightItalic-Trial.woff",  weight: "300", style: "italic" },
    { path: "../public/fonts/Graphik-Regular-Trial.woff",      weight: "400", style: "normal" },
    { path: "../public/fonts/Graphik-RegularItalic-Trial.woff",weight: "400", style: "italic" },
    { path: "../public/fonts/Graphik-Medium-Trial.woff",       weight: "500", style: "normal" },
    { path: "../public/fonts/Graphik-MediumItalic-Trial.woff", weight: "500", style: "italic" },
    { path: "../public/fonts/Graphik-Semibold-Trial.woff",     weight: "600", style: "normal" },
    { path: "../public/fonts/Graphik-SemiboldItalic-Trial.woff",weight: "600", style: "italic" },
    { path: "../public/fonts/Graphik-Bold-Trial.woff",         weight: "700", style: "normal" },
    { path: "../public/fonts/Graphik-BoldItalic-Trial.woff",   weight: "700", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "My Playbook Stock",
  description: "Build your own investment playbook and track your portfolio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${graphik.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

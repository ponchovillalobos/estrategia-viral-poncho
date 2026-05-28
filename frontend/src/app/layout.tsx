import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TabNav } from "@/components/layout/tab-nav";
import { Toaster } from "@/components/ui/sonner";
import { NotificationPoller } from "@/components/layout/notification-poller";
import { QueuePanel } from "@/components/jobs/queue-panel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Estrategia Viral Poncho — Dashboard",
  description: "Plan viral 30 días — comunicación + ventas + IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TabNav />
        <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
          {children}
        </main>
        <Toaster theme="dark" position="top-right" />
        <NotificationPoller />
        <QueuePanel />
      </body>
    </html>
  );
}

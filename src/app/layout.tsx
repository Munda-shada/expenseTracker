import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'Expense Tracker',
  description: 'Private offline-first expense tracker with AI logging, budgets, reminders, goals, and sync.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Expenses',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="color-scheme" content="light" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body>
        <div className="max-w-120 mx-auto min-h-screen bg-white">
          {children}
        </div>
      </body>
    </html>
  );
}

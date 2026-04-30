import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'Expense Tracker',
  description: 'Personal expense tracker',
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

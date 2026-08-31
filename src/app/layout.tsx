import { ClientProvider } from "@/components/ui/ClientProvider";
import type { Metadata, Viewport } from "next";

import "../components/style.css";

export const metadata: Metadata = {
  title: "Hedge Fund",
  description: "Manage my own asset",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f5f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>
        <ClientProvider>{children}</ClientProvider>
      </body>
    </html>
  );
}


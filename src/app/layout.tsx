import type { Metadata, Viewport } from "next";

import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ENTECH Dashboard",
    template: "%s · ENTECH Dashboard",
  },
  description: "ระบบติดตามงานพนักงาน / Employee task tracking",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";

import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { ThemeProvider } from "@/lib/theme/client";
import { getTheme } from "@/lib/theme/server";

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
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);

  return (
    // "system" writes no attribute at all — globals.css then leaves the choice
    // to `color-scheme: light dark`, i.e. the device setting. Resolving this on
    // the server means the first paint is already the right palette.
    <html lang={locale} data-theme={theme === "system" ? undefined : theme}>
      <body>
        <ThemeProvider theme={theme}>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

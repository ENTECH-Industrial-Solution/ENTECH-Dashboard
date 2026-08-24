"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/dictionaries";
import { isProduction } from "@/lib/env";

export async function setLocaleAction(next: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(next)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    httpOnly: false, // read by client components too; contains no secret
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

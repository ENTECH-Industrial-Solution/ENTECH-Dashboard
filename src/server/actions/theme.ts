"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { isProduction } from "@/lib/env";
import { THEME_COOKIE, type Theme, isTheme } from "@/lib/theme/themes";

export async function setThemeAction(next: Theme): Promise<void> {
  if (!isTheme(next)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, next, {
    httpOnly: false, // a display preference, not a secret
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

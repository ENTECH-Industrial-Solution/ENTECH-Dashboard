import { ZodError } from "zod";

import { AuthorizationError } from "@/lib/errors";

/**
 * Uniform return shape for every server action, consumed by useActionState on
 * the client. Actions never throw across the boundary — they return a typed
 * failure, so an unexpected error can never leak a stack trace to the browser.
 */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: Record<string, string> }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idleState: ActionState = { status: "idle" };

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    result[key] ??= issue.message;
  }
  return result;
}

/**
 * Wraps an action body so validation and authorization failures become
 * ActionState, and anything unexpected is logged server-side but reported to
 * the client as a generic message.
 */
export async function runAction(
  fn: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    // Next.js signals redirect() and notFound() by throwing; let those through.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
        (error as { digest: string }).digest === "NEXT_NOT_FOUND")
    ) {
      throw error;
    }

    if (error instanceof ZodError) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(error),
      };
    }

    if (error instanceof AuthorizationError) {
      return { status: "error", message: error.message };
    }

    console.error("[action] unhandled error", error);
    return {
      status: "error",
      message: "เกิดข้อผิดพลาด กรุณาลองใหม่ / Something went wrong, please try again",
    };
  }
}

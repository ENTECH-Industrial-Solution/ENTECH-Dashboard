"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const t = useTranslations();
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? t("common.saving")) : children}
    </button>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  );
}

export function Alert({
  tone,
  children,
}: {
  tone: "error" | "success" | "warning";
  children: ReactNode;
}) {
  const styles = {
    error: { background: "var(--danger-soft)", color: "var(--danger)" },
    success: { background: "var(--success-soft)", color: "var(--success)" },
    warning: { background: "var(--warning-soft)", color: "var(--warning)" },
  }[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="rounded-lg px-3 py-2 text-sm"
      style={styles}
    >
      {children}
    </div>
  );
}

const STATUS_TONE = {
  TODO: { background: "var(--surface-muted)", color: "var(--text-muted)" },
  IN_PROGRESS: { background: "var(--brand-soft)", color: "var(--brand)" },
  BLOCKED: { background: "var(--warning-soft)", color: "var(--warning)" },
  COMPLETED: { background: "var(--success-soft)", color: "var(--success)" },
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_TONE }) {
  const t = useTranslations();
  return (
    <span className="badge" style={STATUS_TONE[status]}>
      {t(`status.${status}` as TranslationKey)}
    </span>
  );
}

const PRIORITY_TONE = {
  LOW: { background: "var(--surface-muted)", color: "var(--text-muted)" },
  MEDIUM: { background: "var(--surface-muted)", color: "var(--text)" },
  HIGH: { background: "var(--warning-soft)", color: "var(--warning)" },
  URGENT: { background: "var(--danger-soft)", color: "var(--danger)" },
} as const;

export function PriorityBadge({
  priority,
}: {
  priority: keyof typeof PRIORITY_TONE;
}) {
  const t = useTranslations();
  return (
    <span className="badge" style={PRIORITY_TONE[priority]}>
      {t(`priority.${priority}` as TranslationKey)}
    </span>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl border border-dashed px-6 py-10 text-center text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      {label}
    </div>
  );
}

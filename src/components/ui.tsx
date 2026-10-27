"use client";

import { useFormStatus } from "react-dom";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Swap } from "@/components/motion";
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
      <Swap id={pending ? "pending" : "idle"}>
        {pending ? (pendingLabel ?? t("common.saving")) : children}
      </Swap>
    </button>
  );
}

/**
 * A row of mutually exclusive buttons — the language, task-or-trip — with a
 * pill that slides to the chosen one instead of the colour jumping across.
 *
 * The server renders the chosen button wearing its own background, so the row
 * is right before hydration and without JavaScript. Once the pill has been
 * measured it takes that background over; it mounts already in place, so only
 * a *change* slides. A `ResizeObserver` re-measures when the labels change
 * width — switching language is exactly that.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  // Layout effect, so the pill lands in the same paint the button lets go of
  // its own background — a passive effect would show neither for a frame.
  useLayoutEffect(() => {
    const el = group.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (on) {
        setPill({ x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={group}
      className="relative inline-flex rounded-lg border p-0.5"
      role="group"
      aria-label={label}
    >
      {pill && (
        <span
          aria-hidden
          className="segmented-pill"
          style={{ width: pill.w, height: pill.h, translate: `${pill.x}px ${pill.y}px` }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            aria-pressed={active}
            className={`relative rounded-md font-medium transition-colors ${
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
            }`}
            style={
              active
                ? {
                    background: pill ? undefined : "var(--brand)",
                    color: "var(--brand-contrast)",
                  }
                : { color: "var(--text-muted)" }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
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
      className="alert rounded-lg px-3 py-2 text-sm"
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
    <Swap id={status}>
      <span className="badge" style={STATUS_TONE[status]}>
        {t(`status.${status}` as TranslationKey)}
      </span>
    </Swap>
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

"use client";

import { useRef } from "react";

import { peopleSummary } from "@/lib/trips";
import type { ProjectNote } from "@/server/queries";

const PAPERS = ["yellow", "blue", "pink"] as const;

function noteTone(note: ProjectNote) {
  if (note.late) return "var(--danger)";
  if (note.status === "IN_PROGRESS") return "var(--brand)";
  if (note.status === "BLOCKED") return "var(--warning)";
  return "var(--text-muted)";
}

/**
 * A project's open notes as a pile you scroll through, like flipping through
 * folders: the note you are on in full, the next one peeking out below it, and
 * the last two you flipped past filed above it with their code and title still
 * showing. Further back than that the pile closes up.
 *
 * The scrolling is the browser's own — wheel, trackpad, finger, snapping —
 * over a column of empty slots, one per note. All this component does is
 * publish how far that column has scrolled, in notes, as `--p`, and the CSS
 * places each note from it. The value is written straight onto the element
 * rather than through state, so a scroll re-renders nothing. Before hydration
 * `--p` is 0, which is the first note in full.
 */
export function NoteStack({ notes, more }: { notes: ProjectNote[]; more: number }) {
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    const slot = el?.querySelector<HTMLElement>(".stack-slot");
    if (!el || !slot) return;
    el.style.setProperty("--p", String(el.scrollTop / slot.offsetHeight));
  }

  return (
    <div
      aria-hidden
      className="note-stack"
      style={{ "--n": notes.length } as React.CSSProperties}
    >
      <div ref={ref} className="note-drawer scroll-bare" onScroll={onScroll}>
        <div className="note-pile">
          {notes.map((note, i) => (
            <div
              key={note.id}
              className="stack-note"
              data-paper={PAPERS[i % PAPERS.length]}
              style={{ "--k": i } as React.CSSProperties}
            >
              <div className="flex items-center gap-1.5 font-mono text-[0.65rem]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: noteTone(note) }} />
                <span className="truncate" style={{ color: "var(--text-muted)" }}>
                  {note.code}
                </span>
              </div>
              <p className="line-clamp-2 text-xs font-medium leading-snug break-words">
                {note.title}
              </p>
              {note.assignees.length > 0 && (
                <p
                  className="mt-auto truncate text-end text-[0.65rem]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {peopleSummary(note.assignees)}
                </p>
              )}
            </div>
          ))}
        </div>
        {notes.map((note) => (
          <div key={note.id} className="stack-slot" />
        ))}
      </div>
      {more > 0 && <span className="stack-more">+{more}</span>}
    </div>
  );
}

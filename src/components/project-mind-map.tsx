"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { PartEditor } from "@/components/project-parts";
import { tripState } from "@/components/trip-card";
import { useTranslations } from "@/lib/i18n/client";
import type { PartRef } from "@/lib/projects";
import { fileFieldTripPartAction } from "@/server/actions/field-trips";
import { movePartAction } from "@/server/actions/projects";
import { fileTaskPartAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

export type MindLeaf =
  | {
      kind: "task";
      id: string;
      code: string;
      title: string;
      status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
      late: boolean;
    }
  | {
      kind: "trip";
      id: string;
      title: string;
      startedAt: string | null;
      completedAt: string | null;
      late: boolean;
    };

/**
 * One branch: a sub-project, or (id null) the work filed under none.
 * `parentId` is the sub-project it sits inside, null for directly under the project.
 */
export type MindBranch = {
  id: string | null;
  name: string;
  parentId: string | null;
  /** On the board with no line yet — see `ProjectPart.floating`. */
  floating: boolean;
  leaves: MindLeaf[];
};

/** The same reading of state the cards and the note pile use, as a dot colour. */
function leafTone(leaf: MindLeaf) {
  if (leaf.kind === "trip") {
    const state = tripState({ ...leaf, cancelledAt: null });
    if (state === "COMPLETED") return "var(--success)";
    if (leaf.late) return "var(--danger)";
    return state === "ON_SITE" ? "var(--brand)" : "var(--text-muted)";
  }
  if (leaf.status === "COMPLETED") return "var(--success)";
  if (leaf.late) return "var(--danger)";
  if (leaf.status === "IN_PROGRESS") return "var(--brand)";
  if (leaf.status === "BLOCKED") return "var(--warning)";
  return "var(--text-muted)";
}

/** How many `--branch-n` tokens globals.css defines; past that the colours repeat. */
const BRANCH_COLORS = 5;

/**
 * Branches alternate sides by weight, so a big branch on the right is
 * balanced by the small ones on the left rather than by whichever came next.
 */
function splitSides(branches: MindBranch[], sizeOf: (branch: MindBranch) => number) {
  const sides: [MindBranch[], MindBranch[]] = [[], []];
  const weight = [0, 0];
  for (const branch of branches) {
    const side = weight[1]! < weight[0]! ? 1 : 0;
    sides[side].push(branch);
    weight[side]! += sizeOf(branch);
  }
  return { right: sides[0], left: sides[1] };
}

type Rect = { left: number; right: number; top: number; bottom: number; cy: number };

/**
 * A connector from one node to the next, chosen by where the target is rather
 * than by breakpoint: beside it is a horizontal S-curve (the two-sided map on
 * a wide screen), above or below it is an elbow down a trunk (the one-column
 * tree on a phone). So the lines follow whatever layout the CSS settled on —
 * and wherever somebody has since dragged a node to.
 */
function connector(s: Rect, t: Rect) {
  if (t.left >= s.right - 1 || t.right <= s.left + 1) {
    const toRight = t.left >= s.right - 1;
    const x1 = toRight ? s.right : s.left;
    const x2 = toRight ? t.left : t.right;
    const mx = (x1 + x2) / 2;
    return `M${x1} ${s.cy}C${mx} ${s.cy} ${mx} ${t.cy} ${x2} ${t.cy}`;
  }
  const x = s.left + 14;
  const below = t.cy >= s.bottom;
  const y1 = below ? s.bottom : s.top;
  const r = Math.min(8, Math.abs(t.cy - y1));
  const turn = below ? t.cy - r : t.cy + r;
  return `M${x} ${y1}V${turn}Q${x} ${t.cy} ${x + r} ${t.cy}H${t.left}`;
}

const partKey = (branch: MindBranch) => `part:${branch.id ?? "unfiled"}`;
const leafKey = (leaf: MindLeaf) => `leaf:${leaf.kind}-${leaf.id}`;
/** The part id inside a `part:<id>` node key. */
const idOf = (key: string) => key.slice("part:".length);

type Vec = { x: number; y: number };

type Body = {
  el: HTMLElement;
  parent: string | null;
  /** Where the layout put it, in board units, before anything moved it. */
  base: Vec;
  w: number;
  h: number;
  /** How far it is drawn from `base` right now, and how fast that is changing. */
  d: Vec;
  v: Vec;
  phase: number;
};

/** What a press on the board turned into. */
type Gesture =
  | { kind: "move"; id: number; key: string | null; start: Vec; from: Vec; moved: boolean }
  | { kind: "link"; id: number; from: string; handle: HTMLElement; to: HTMLElement | null }
  | { kind: "cut"; id: number; last: Vec; trail: Vec[]; marked: Set<string> };

/**
 * What the board asks of the page when somebody rewires it. The board knows
 * nodes and lines; what a line between two nodes *means* is the page's.
 */
type Wiring = {
  /** Whether a line may be drawn from one node to another. */
  canLink: (from: string, to: string) => boolean;
  link: (from: string, to: string) => void;
  /** Lines cut, each named by the node at its far end from the project. */
  cut: (lines: string[]) => void;
};

const ZERO: Vec = { x: 0, y: 0 };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const GRID = 24;
const PAD = 32;
/** Pixels a press must travel before it is a drag; less is a click. */
const SLOP = 4;
/** The idle drift, in px, and the spring pulling a node after its parent. */
const WOBBLE = 2.5;
const SPRING = 0.12;
const DAMPING = 0.78;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The board's mechanics, outside React: a node moves every frame, and a
 * re-render per frame for every node and line would be the whole cost of the
 * page. React draws the nodes once where the grid puts them; this class then
 * owns only `translate` on each node, `d` and inline style on each line and
 * `transform` on the world, none of which React ever writes, so the two never
 * fight.
 *
 * A node's offset is where somebody dragged it. What it is *drawn* at springs
 * towards its parent's drawn position plus that offset plus a slow drift, so
 * dragging a sub-project trails its work behind it and everything sways a
 * little at rest. Offsets live only in this object: the board is a scratch
 * surface, and the layout is back the next time the page loads.
 *
 * Rewiring is the one thing here that writes, and it does not write: a line
 * drawn from a handle or cut with the scissors is reported through `wiring`,
 * and the page decides what that means and asks the server.
 */
class Whiteboard {
  private bodies = new Map<string, Body>();
  private paths = new Map<string, SVGPathElement>();
  private hits = new Map<string, SVGPathElement>();
  private offsets = new Map<string, Vec>();
  private pan: Vec = { ...ZERO };
  private zoom = 1;
  private gesture: Gesture | null = null;
  private selected: string | null = null;
  private scissors = false;
  private fitted = false;
  private frame = 0;
  private quietClickAt = -Infinity;
  private still = window.matchMedia("(prefers-reduced-motion: reduce)");
  private resize = new ResizeObserver(() => this.measure());
  private sight = new IntersectionObserver(([entry]) =>
    entry?.isIntersecting ? this.start() : this.stop(),
  );

  constructor(
    private board: HTMLElement,
    private world: HTMLElement,
    private wiring: { current: Wiring },
  ) {
    this.sight.observe(board);
    board.addEventListener("pointerdown", this.down);
    board.addEventListener("pointermove", this.move);
    board.addEventListener("pointerup", this.up);
    board.addEventListener("pointercancel", this.up);
    board.addEventListener("wheel", this.wheel, { passive: false });
    board.addEventListener("click", this.click, true);
    board.addEventListener("dragstart", this.noNativeDrag);
  }

  destroy() {
    this.stop();
    this.resize.disconnect();
    this.sight.disconnect();
    const b = this.board;
    b.removeEventListener("pointerdown", this.down);
    b.removeEventListener("pointermove", this.move);
    b.removeEventListener("pointerup", this.up);
    b.removeEventListener("pointercancel", this.up);
    b.removeEventListener("wheel", this.wheel);
    b.removeEventListener("click", this.click, true);
    b.removeEventListener("dragstart", this.noNativeDrag);
  }

  /** After React has redrawn the nodes: find them again and watch their sizes. */
  rebind() {
    this.resize.disconnect();
    this.resize.observe(this.world);
    this.world.querySelectorAll("[data-node]").forEach((el) => this.resize.observe(el));
    this.paths = this.collect("[data-edge]", "edge");
    this.hits = this.collect("[data-hit]", "hit");
    if (this.selected && !this.hits.has(this.selected)) this.selected = null;
    this.paint();
    this.measure();
  }

  private collect(selector: string, attr: "edge" | "hit") {
    const found = new Map<string, SVGPathElement>();
    this.world.querySelectorAll<SVGPathElement>(selector).forEach((path) => {
      found.set(path.dataset[attr]!, path);
    });
    return found;
  }

  /** Re-read where the layout put every node, keeping what is drawn on top. */
  measure() {
    const origin = this.world.getBoundingClientRect();
    const scale = this.drawnScale(origin);
    const next = new Map<string, Body>();
    this.world.querySelectorAll<HTMLElement>("[data-node]").forEach((el, i) => {
      const key = el.dataset.node!;
      const old = this.bodies.get(key);
      // Only an element this board has already moved carries a translate. One
      // React just created — a leaf filed into another branch is a new
      // element there — is sitting exactly where the layout put it.
      const kept = old?.el === el ? old : undefined;
      const d = kept?.d ?? { ...ZERO };
      const r = el.getBoundingClientRect();
      next.set(key, {
        el,
        parent: el.dataset.parent ?? null,
        base: {
          x: (r.left - origin.left) / scale - d.x,
          y: (r.top - origin.top) / scale - d.y,
        },
        w: el.offsetWidth,
        h: el.offsetHeight,
        d,
        v: kept?.v ?? { ...ZERO },
        phase: old?.phase ?? i * 1.7,
      });
    });
    this.bodies = next;
    if (!this.fitted && next.size > 0) this.fit();
  }

  /** Frame the whole map, centred, never larger than life. */
  fit() {
    if (this.bodies.size === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // Where each node is headed: its own offset plus every ancestor's, since
    // a moved sub-project carries its work with it.
    const at = new Map<string, Vec>();
    for (const [key, b] of this.bodies) {
      const own = this.offsets.get(key) ?? ZERO;
      const up = (b.parent && at.get(b.parent)) || ZERO;
      const o = { x: own.x + up.x, y: own.y + up.y };
      at.set(key, o);
      minX = Math.min(minX, b.base.x + o.x);
      minY = Math.min(minY, b.base.y + o.y);
      maxX = Math.max(maxX, b.base.x + o.x + b.w);
      maxY = Math.max(maxY, b.base.y + o.y + b.h);
    }
    const bw = this.board.clientWidth;
    const bh = this.board.clientHeight;
    const w = maxX - minX;
    const h = maxY - minY;
    // Shrink to fit, but not into unreadable: a tall phone tree starts at the
    // top at half size and is dragged through instead.
    const z = clamp(Math.min((bw - PAD * 2) / w, (bh - PAD * 2) / h), 0.5, 1);
    this.zoom = z;
    this.pan = {
      x: w * z <= bw - PAD * 2 ? (bw - w * z) / 2 - minX * z : PAD - minX * z,
      y: h * z <= bh - PAD * 2 ? (bh - h * z) / 2 - minY * z : PAD - minY * z,
    };
    this.fitted = true;
  }

  /** Every node back where the layout put it — they spring home — and reframe. */
  reset() {
    this.offsets.clear();
    this.fit();
  }

  refit() {
    this.measure();
    this.fit();
  }

  /** Zoom by `factor` around a point on the board (its centre by default). */
  zoomBy(factor: number, at?: Vec) {
    const c = at ?? { x: this.board.clientWidth / 2, y: this.board.clientHeight / 2 };
    const z = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = z / this.zoom;
    this.pan = { x: c.x - (c.x - this.pan.x) * k, y: c.y - (c.y - this.pan.y) * k };
    this.zoom = z;
  }

  setScissors(on: boolean) {
    this.scissors = on;
    this.select(null);
  }

  private select(key: string | null) {
    this.selected = key;
    this.paint();
  }

  /** Red and dashed: the line that is selected, or that the scissors crossed. */
  private paint() {
    const marked = this.gesture?.kind === "cut" ? this.gesture.marked : null;
    for (const [key, path] of this.paths) {
      const on = key === this.selected || !!marked?.has(key);
      path.style.stroke = on ? "var(--danger)" : "";
      path.style.strokeDasharray = on ? "6 4" : "";
      path.style.opacity = on ? "1" : "";
    }
    if (!this.selected) this.badge()?.style.setProperty("display", "none");
  }

  private badge() {
    return this.world.querySelector<SVGGElement>("[data-cut-badge]");
  }

  /**
   * The scale the world is drawn at *now*, read off the page. `zoom` can be
   * ahead of it — a zoom or a fit lands on screen at the next frame — and
   * measuring against the wrong one put every line off its box.
   */
  private drawnScale(rect = this.world.getBoundingClientRect()) {
    return rect.width / this.world.offsetWidth || 1;
  }

  private toWorld(e: PointerEvent): Vec {
    const r = this.world.getBoundingClientRect();
    const s = this.drawnScale(r);
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  private start() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const { pan, zoom, board, world } = this;
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    board.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
    board.style.backgroundSize = `${GRID * zoom}px ${GRID * zoom}px`;

    const calm = this.still.matches;
    const g = this.gesture;
    const held = g?.kind === "move" && g.moved ? g.key : null;
    // Map order is document order, so a parent has always moved before its
    // children read where it is.
    for (const [key, b] of this.bodies) {
      const parent = b.parent ? this.bodies.get(b.parent) : undefined;
      const o = this.offsets.get(key) ?? ZERO;
      const drift = calm || key === held ? 0 : WOBBLE;
      const tx = (parent?.d.x ?? 0) + o.x + drift * Math.sin(now * 0.0013 + b.phase);
      const ty = (parent?.d.y ?? 0) + o.y + drift * Math.cos(now * 0.0011 + b.phase * 1.3);
      if (calm || key === held) {
        b.d = { x: tx, y: ty };
        b.v = { ...ZERO };
      } else {
        b.v.x = (b.v.x + (tx - b.d.x) * SPRING) * DAMPING;
        b.v.y = (b.v.y + (ty - b.d.y) * SPRING) * DAMPING;
        b.d.x += b.v.x;
        b.d.y += b.v.y;
      }
      b.el.style.translate = `${b.d.x}px ${b.d.y}px`;
    }

    const rectOf = (b: Body): Rect => {
      const left = b.base.x + b.d.x;
      const top = b.base.y + b.d.y;
      return { left, right: left + b.w, top, bottom: top + b.h, cy: top + b.h / 2 };
    };
    for (const [key, b] of this.bodies) {
      const parent = b.parent ? this.bodies.get(b.parent) : undefined;
      if (!parent) {
        // Belt and braces for any line whose node has since lost its parent.
        this.paths.get(key)?.removeAttribute("d");
        this.hits.get(key)?.removeAttribute("d");
        continue;
      }
      const d = connector(rectOf(parent), rectOf(b));
      this.paths.get(key)?.setAttribute("d", d);
      this.hits.get(key)?.setAttribute("d", d);
    }

    // The ✂ rides the middle of the selected line, wherever it has drifted to.
    const chosen = this.selected ? this.paths.get(this.selected) : undefined;
    const badge = this.badge();
    if (chosen && badge) {
      const mid = chosen.getPointAtLength(chosen.getTotalLength() / 2);
      badge.style.display = "";
      badge.setAttribute("transform", `translate(${mid.x} ${mid.y})`);
    }
  };

  private capture(id: number) {
    try {
      this.board.setPointerCapture(id);
    } catch {
      // The pointer is already gone; the gesture simply ends on its next event.
    }
  }

  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.gesture) return;
    const target = e.target as Element;

    if (target.closest("[data-cut-badge]")) {
      e.preventDefault();
      const key = this.selected;
      this.select(null);
      if (key) this.wiring.current.cut([key]);
      return;
    }
    // The sub-project editor and the toolbar are controls, not things to drag.
    if (target.closest("button, input, textarea, select, label, form")) return;

    const handle = target.closest<HTMLElement>("[data-handle]");
    const from = handle?.closest<HTMLElement>("[data-node]")?.dataset.node;
    if (handle && from) {
      this.gesture = { kind: "link", id: e.pointerId, from, handle, to: null };
      this.capture(e.pointerId);
      return;
    }

    if (this.scissors) {
      const at = this.toWorld(e);
      this.gesture = { kind: "cut", id: e.pointerId, last: at, trail: [at], marked: new Set() };
      this.capture(e.pointerId);
      return;
    }

    const key = target.closest<HTMLElement>("[data-node]")?.dataset.node ?? null;
    this.gesture = {
      kind: "move",
      id: e.pointerId,
      key,
      start: { x: e.clientX, y: e.clientY },
      from: key ? { ...(this.offsets.get(key) ?? ZERO) } : { ...this.pan },
      moved: false,
    };
  };

  private move = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;

    if (g.kind === "link") {
      const at = this.toWorld(e);
      const h = g.handle.getBoundingClientRect();
      const o = this.world.getBoundingClientRect();
      const s = this.drawnScale(o);
      const sx = (h.left + h.width / 2 - o.left) / s;
      const sy = (h.top + h.height / 2 - o.top) / s;
      const mx = (sx + at.x) / 2;
      this.world
        .querySelector("[data-link]")
        ?.setAttribute("d", `M${sx} ${sy}C${mx} ${sy} ${mx} ${at.y} ${at.x} ${at.y}`);
      const under = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-node]");
      const key = under?.dataset.node;
      const to = key && key !== g.from && this.wiring.current.canLink(g.from, key) ? under : null;
      if (to !== g.to) {
        if (g.to) g.to.style.outline = "";
        if (to) to.style.outline = "2px solid var(--brand)";
        g.to = to;
      }
      return;
    }

    if (g.kind === "cut") {
      const at = this.toWorld(e);
      // Stepped along the stroke, so a quick swipe cannot jump over a line.
      const steps = Math.max(1, Math.ceil(Math.hypot(at.x - g.last.x, at.y - g.last.y) / 4));
      let crossed = false;
      for (let i = 1; i <= steps; i++) {
        const p = new DOMPoint(
          g.last.x + ((at.x - g.last.x) * i) / steps,
          g.last.y + ((at.y - g.last.y) * i) / steps,
        );
        for (const [key, hit] of this.hits) {
          if (!g.marked.has(key) && hit.isPointInStroke(p)) {
            g.marked.add(key);
            crossed = true;
          }
        }
      }
      g.last = at;
      g.trail.push(at);
      this.world
        .querySelector("[data-trail]")
        ?.setAttribute("d", g.trail.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(""));
      if (crossed) this.paint();
      return;
    }

    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      g.moved = true;
      // Captured only once it is a drag: capturing on press would retarget
      // the click, and a plain click on a leaf has to reach its link.
      this.capture(e.pointerId);
      this.board.dataset.dragging = "";
    }
    if (g.key) this.offsets.set(g.key, { x: g.from.x + dx / this.zoom, y: g.from.y + dy / this.zoom });
    else this.pan = { x: g.from.x + dx, y: g.from.y + dy };
  };

  private up = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.gesture = null;
    const done = e.type === "pointerup";

    if (g.kind === "link") {
      this.quietClickAt = e.timeStamp;
      this.world.querySelector("[data-link]")?.setAttribute("d", "");
      if (g.to) g.to.style.outline = "";
      if (done && g.to) this.wiring.current.link(g.from, g.to.dataset.node!);
      return;
    }

    if (g.kind === "cut") {
      this.quietClickAt = e.timeStamp;
      this.world.querySelector("[data-trail]")?.setAttribute("d", "");
      this.paint();
      if (done && g.marked.size > 0) this.wiring.current.cut([...g.marked]);
      return;
    }

    delete this.board.dataset.dragging;
    if (g.moved) this.quietClickAt = e.timeStamp;
  };

  /**
   * The click that ends a drag is not a click on whatever it ended over. Any
   * other click picks the line under it, or puts the selection down.
   */
  private click = (e: MouseEvent) => {
    if (e.timeStamp - this.quietClickAt < 400) {
      e.preventDefault();
      e.stopPropagation();
      this.quietClickAt = -Infinity;
      return;
    }
    const hit = (e.target as Element).closest<SVGPathElement>("[data-hit]");
    this.select(hit?.dataset.hit ?? null);
  };

  /**
   * Ctrl + wheel (and a trackpad pinch, which arrives as one) zooms at the
   * pointer. A plain wheel is left to scroll the page: a board that swallowed
   * it would trap anybody scrolling past.
   */
  private wheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = this.board.getBoundingClientRect();
    this.zoomBy(Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  private noNativeDrag = (e: DragEvent) => e.preventDefault();
}

/**
 * Where a loose leaf lands in the pile: a small drop, nudge and tilt taken
 * from its id, so it is scattered but lands the same way on every visit.
 */
function scatter(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const n = (shift: number) => ((h >>> shift) % 1000) / 1000;
  return {
    drop: Math.round(n(0) * 32),
    nudge: Math.round((n(7) - 0.5) * 32),
    tilt: Number(((n(14) - 0.5) * 8).toFixed(1)),
  };
}

/**
 * One thing moved on the board: a leaf (`leaf:…`) filed under a sub-project,
 * or a sub-project (`part:…`) put inside another. `to` is that sub-project's
 * id, `"root"` for a sub-project directly under the project, or null for
 * loose: work in no sub-project, a sub-project with no line at all.
 */
type Move = { key: string; to: string | null };

/** The branches as they will be once `moves` land — what the board shows meanwhile. */
function applyMoves(branches: MindBranch[], moves: Move[], unfiledName: string) {
  let next = branches.map((b) => ({ ...b, leaves: [...b.leaves] }));
  for (const { key, to } of moves) {
    if (key.startsWith("part:")) {
      const part = next.find((b) => b.id === idOf(key));
      if (part) {
        part.parentId = to === "root" ? null : to;
        part.floating = to === null;
      }
      continue;
    }
    const from = next.find((b) => b.leaves.some((l) => leafKey(l) === key));
    const item = from?.leaves.find((l) => leafKey(l) === key);
    if (!from || !item || from.id === to) continue;
    from.leaves = from.leaves.filter((l) => l !== item);
    let target = next.find((b) => b.id === to);
    if (!target) {
      target = { id: null, name: unfiledName, parentId: null, floating: false, leaves: [] };
      next = [...next, target];
    }
    target.leaves.push(item);
  }
  return next.filter((b) => b.id !== null || b.leaves.length > 0);
}

/**
 * A project as a spider diagram on a whiteboard: the project in the middle,
 * its sub-projects branching off it, each one's tasks and trips hanging off
 * that. Drag the board to pan, drag any box to move it (its work follows),
 * zoom with the buttons or Ctrl + wheel, and expand it to grow the board downward.
 * Every leaf still links to its card further down the page (`#task-<id>` /
 * `#trip-<id>`, which `CardGrid` opens itself to find).
 *
 * For an admin on an open project the lines are the filing itself: drag from
 * the dot on a box to another box to put that work in that sub-project, or
 * that sub-project inside another or under the project, and click a line and
 * its ✂ — or swipe the scissors across lines — to let go of whatever hangs
 * off it. What is let go of, and every new sub-project, lies loose on the
 * board with no line until somebody draws one.
 * Each is the same audited edit the forms and `movePartAction` make; the
 * board shows the result at once and the server confirms it.
 *
 * The leaves are exactly the rows the page's own lists draw — the caller
 * builds them from `getProjectWork()` — so the map shows nothing the viewer
 * could not already read. Cancelled trips are left off: they did not happen.
 */
export function ProjectMindMap({
  root,
  branches: given,
  editable,
}: {
  root: { id: string; code: string; name: string; image: string | null };
  branches: MindBranch[];
  /** Admin on an open project: sub-projects get an edit button and the lines can be rewired. */
  editable: boolean;
}) {
  const t = useTranslations();
  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const whiteboard = useRef<Whiteboard | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [scissors, setScissors] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const stopEditing = useCallback(() => setEditing(null), []);
  const [branches, addMoves] = useOptimistic(given, (now: MindBranch[], moves: Move[]) =>
    applyMoves(now, moves, t("parts.unfiled")),
  );

  // Work in no sub-project has no line to draw: it lies loose on the board,
  // and drawing a line from it to a sub-project is how it gets filed.
  const parts = branches.filter((branch) => branch.id !== null);
  const loose = branches.find((branch) => branch.id === null)?.leaves ?? [];
  const known = new Set(parts.map((branch) => branch.id));
  // A parent that is not on the board is read as none, as `partTree` reads it.
  const parentOf = (branch: MindBranch) =>
    branch.parentId && known.has(branch.parentId) ? branch.parentId : null;
  const childrenOf = (id: string | null) => parts.filter((branch) => parentOf(branch) === id);
  // A sub-project with no line yet lies loose on the board beside the loose
  // work, until somebody connects it.
  const adrift = childrenOf(null).filter((branch) => branch.floating);
  const top = childrenOf(null).filter((branch) => !branch.floating);
  const sizeOf = (branch: MindBranch): number =>
    branch.leaves.length + 1 + childrenOf(branch.id).reduce((n, child) => n + sizeOf(child), 0);
  // A sub-project wears its top-level ancestor's colour, so a family reads as one.
  const colorOf = new Map<string, string>();
  const paint = (branch: MindBranch, color: string) => {
    colorOf.set(branch.id!, color);
    childrenOf(branch.id).forEach((child) => paint(child, color));
  };
  [...top, ...adrift].forEach((branch, i) =>
    paint(branch, `var(--branch-${(i % BRANCH_COLORS) + 1})`),
  );
  const { left, right } = splitSides(top, sizeOf);

  /** Whether sub-project `id` sits somewhere inside `ancestor` (or is it). */
  const within = (id: string | null, ancestor: string) => {
    for (let at = id, hops = 0; at && hops <= parts.length; hops++) {
      if (at === ancestor) return true;
      at = parentOf(parts.find((branch) => branch.id === at)!);
    }
    return false;
  };
  const where = new Map<string, string | null>([
    ...branches.flatMap((b) => b.leaves.map((l) => [leafKey(l), b.id] as const)),
    ...parts.map((b) => [partKey(b), parentOf(b) ?? (b.floating ? null : "root")] as const),
  ]);

  /** Moves things where `moves` says: shown at once, then saved one by one. */
  const file = (moves: Move[]) => {
    const leaves = new Map(branches.flatMap((b) => b.leaves.map((l) => [leafKey(l), l] as const)));
    const real = moves.filter((m) => where.has(m.key) && where.get(m.key) !== m.to);
    if (real.length === 0) return;
    setFailed(null);
    startTransition(async () => {
      addMoves(real);
      for (const { key, to } of real) {
        const form = new FormData();
        const item = leaves.get(key);
        let result;
        if (item) {
          form.set(item.kind === "task" ? "taskId" : "fieldTripId", item.id);
          form.set("partId", to ?? "");
          result =
            item.kind === "task"
              ? await fileTaskPartAction(idleState, form)
              : await fileFieldTripPartAction(idleState, form);
        } else {
          form.set("partId", idOf(key));
          form.set("to", to ?? "loose");
          result = await movePartAction(idleState, form);
        }
        if (result.status === "error") {
          setFailed(result.message ?? null);
          return;
        }
      }
    });
  };

  /*
   * What a line means, by what it joins: work and a sub-project files the work
   * there (drawn either way round); a sub-project to another puts the first
   * inside the second; a sub-project and the project (either way round) puts
   * it directly under the project. A sub-project cannot go inside itself or
   * anything inside it — the server refuses that too, this only keeps the
   * board from offering it.
   */
  const meaning = (from: string, to: string): Move | null => {
    const [a, b] = from.startsWith("leaf:") ? [from, to] : [to, from];
    if (a.startsWith("leaf:")) return b.startsWith("part:") ? { key: a, to: idOf(b) } : null;
    if (from === "root") return to.startsWith("part:") ? { key: to, to: "root" } : null;
    if (!from.startsWith("part:")) return null;
    if (to === "root") return { key: from, to: "root" };
    if (!to.startsWith("part:") || within(idOf(to), idOf(from))) return null;
    return { key: from, to: idOf(to) };
  };

  // Read through a ref by the board, so it always reaches this render's `file`.
  const wiring = useRef<Wiring>({ canLink: () => false, link: () => {}, cut: () => {} });
  wiring.current = {
    canLink: (from, to) => {
      const move = meaning(from, to);
      return !!move && where.get(move.key) !== move.to;
    },
    link: (from, to) => {
      const move = meaning(from, to);
      if (move) file([move]);
    },
    // A cut line lets go of whatever hangs off it, and it lies loose: work
    // in no sub-project, a sub-project (with everything on it) with no line.
    cut: (lines) => file(lines.map((key) => ({ key, to: null }))),
  };

  useLayoutEffect(() => {
    const board = boardRef.current;
    const world = worldRef.current;
    if (!board || !world) return;
    const instance = new Whiteboard(board, world, wiring);
    whiteboard.current = instance;
    return () => {
      instance.destroy();
      whiteboard.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    whiteboard.current?.rebind();
  }, [branches, editing]);

  useEffect(() => {
    whiteboard.current?.setScissors(scissors);
  }, [scissors]);

  // Expanding grows the board downward in place; reframe once it has finished
  // growing. shortcut: a timer matching the height transition rather than
  // `transitionend`, which never fires when reduced motion zeroes the duration.
  const firstFrame = useRef(true);
  useEffect(() => {
    if (firstFrame.current) {
      firstFrame.current = false;
      return;
    }
    const timer = setTimeout(() => whiteboard.current?.refit(), 320);
    return () => clearTimeout(timer);
  }, [expanded]);

  /** The dot a line is drawn from, on the side of the box its line meets. */
  function handle(color: string, edge: string) {
    if (!editable) return null;
    return (
      <span
        data-handle
        aria-hidden
        className={`absolute top-1/2 -mt-1.5 h-3 w-3 cursor-crosshair rounded-full border-2 transition-transform hover:scale-150 ${edge}`}
        style={{ background: color, borderColor: "var(--surface)" }}
      />
    );
  }

  // A render function, not a component: a component declared in here would be
  // a new type every render and remount the open editor on each re-measure.
  // A sub-project's work and the sub-projects inside it hang off it the same
  // way, so the branch recurses; on a phone each level steps in once more.
  function renderBranch(branch: MindBranch, side: "left" | "right", parent: string | null) {
    const color = colorOf.get(branch.id ?? "") ?? "var(--border)";
    const part: PartRef | null = branch.id ? { id: branch.id, name: branch.name } : null;
    const key = partKey(branch);
    const inner = childrenOf(branch.id);
    const towardsLeaves = side === "left" ? "-right-1.5 lg:right-auto lg:-left-1.5" : "-right-1.5";
    const towardsPart = side === "left" ? "-left-1.5 lg:left-auto lg:-right-1.5" : "-left-1.5";

    return (
      <div
        key={key}
        className={`flex flex-col gap-2 lg:items-center lg:gap-10 ${
          parent === "root" ? "ps-8 lg:ps-0" : ""
        } ${side === "left" ? "lg:flex-row-reverse" : "lg:flex-row"}`}
      >
        <div
          className={`pointer-events-auto flex shrink-0 flex-col gap-2 ${side === "left" ? "lg:items-end" : ""}`}
        >
          <div
            data-node={key}
            data-parent={parent ?? undefined}
            className="relative flex w-fit max-w-[14rem] cursor-grab items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-medium shadow-sm"
            style={{
              borderColor: color,
              borderStyle: part ? "solid" : "dashed",
              background: `color-mix(in oklch, ${color} 14%, var(--surface))`,
            }}
          >
            <span className="min-w-0 truncate" title={branch.name}>
              {branch.name}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 text-xs tabular-nums"
              style={{ background: "var(--surface)", color: "var(--text-muted)" }}
            >
              {branch.leaves.length}
            </span>
            {editable && part && (
              <button
                type="button"
                className="shrink-0 rounded-full px-1 text-xs"
                style={{ color: "var(--text-muted)" }}
                aria-label={`${t("projects.edit")} ${branch.name}`}
                aria-expanded={editing === part.id}
                onClick={() => setEditing(editing === part.id ? null : part.id)}
              >
                ✎
              </button>
            )}
            {handle(color, towardsLeaves)}
          </div>
          {editable && part && editing === part.id && (
            <PartEditor part={part} projectId={root.id} onDone={stopEditing} />
          )}
        </div>

        {/* An empty one says so with its own "0": a label beside it would be
            a second thing on the board that does not move with the box. */}
        {(branch.leaves.length > 0 || inner.length > 0) && (
          <div
            className={`flex min-w-0 flex-col gap-4 ps-8 lg:ps-0 ${side === "left" ? "lg:items-end" : ""}`}
          >
            {inner.map((child) => renderBranch(child, side, key))}
            {branch.leaves.length > 0 && (
              <ul className={`flex min-w-0 flex-col gap-1.5 ${side === "left" ? "lg:items-end" : ""}`}>
                {branch.leaves.map((leaf) => (
                  <li key={leafKey(leaf)}>{renderLeaf(leaf, key, color, towardsPart)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  /** One task or trip; `parent` null is a loose one, tilted where it landed. */
  function renderLeaf(leaf: MindLeaf, parent: string | null, color: string, edge: string) {
    const toss = parent ? undefined : scatter(leaf.id);
    return (
      <a
        data-node={leafKey(leaf)}
        data-parent={parent ?? undefined}
        draggable={false}
        href={`#${leaf.kind}-${leaf.id}`}
        className="pointer-events-auto relative flex w-fit max-w-full items-center gap-2 rounded-lg border px-2.5 py-1 text-xs shadow-sm transition-colors hover:border-[var(--text-muted)] lg:max-w-[16rem]"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          opacity:
            (leaf.kind === "task" && leaf.status === "COMPLETED") ||
            (leaf.kind === "trip" && leaf.completedAt)
              ? 0.7
              : 1,
          ...(toss && { rotate: `${toss.tilt}deg`, marginTop: toss.drop, marginLeft: toss.nudge }),
        }}
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 ${leaf.kind === "trip" ? "rotate-45 rounded-[1px]" : "rounded-full"}`}
          style={{ background: leafTone(leaf) }}
        />
        {leaf.kind === "task" && (
          <span className="shrink-0 font-mono" style={{ color: "var(--text-muted)" }}>
            {leaf.code}
          </span>
        )}
        <span className="min-w-0 truncate">{leaf.title}</span>
        {handle(color, edge)}
      </a>
    );
  }

  const tool = "btn btn-secondary min-w-9";

  return (
    <div
      ref={boardRef}
      className={`group/board touch-none overflow-hidden select-none ${
        expanded ? "h-[min(85vh,52rem)]" : "h-[22rem]"
      } relative rounded-xl border transition-[height] duration-300 ease-out ${
        scissors ? "cursor-crosshair" : ""
      }`}
      style={{
        borderColor: "var(--border)",
        backgroundColor: "color-mix(in oklch, var(--surface-muted) 55%, var(--surface))",
        backgroundImage: "radial-gradient(var(--border) 1.2px, transparent 1.2px)",
      }}
    >
      <div
        ref={worldRef}
        className={`absolute top-0 left-0 w-full origin-top-left touch-none ${
          scissors ? "" : "cursor-grab group-data-[dragging]/board:cursor-grabbing"
        }`}
      >
        {/* Below the nodes, so a box always wins a press; the grid above it
            lets presses through everywhere but on the boxes themselves. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {parts.map((branch) => {
            const color = colorOf.get(branch.id ?? "") ?? "var(--border)";
            // A loose sub-project has no line, so it gets no path at all —
            // one left in place would keep the shape of the line just cut.
            const connected = where.get(partKey(branch)) !== null;
            return [
              connected && (
                <path
                  key={partKey(branch)}
                  data-edge={partKey(branch)}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              ),
              ...branch.leaves.map((leaf) => (
                <path
                  key={leafKey(leaf)}
                  data-edge={leafKey(leaf)}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  opacity={0.55}
                />
              )),
              // Every line can be cut, whichever side it runs to; a floating
              // sub-project has no line of its own to cut.
              ...(editable
                ? [
                    ...(connected ? [partKey(branch)] : []),
                    ...branch.leaves.map(leafKey),
                  ].map((key) => (
                    <path
                      key={`hit-${key}`}
                      data-hit={key}
                      fill="none"
                      stroke="var(--danger)"
                      strokeOpacity={0}
                      strokeWidth={14}
                      strokeLinecap="round"
                      className={`[pointer-events:stroke] hover:[stroke-opacity:0.2] ${
                        scissors ? "" : "cursor-pointer"
                      }`}
                    />
                  ))
                : []),
            ];
          })}
          <path
            data-link
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
          <path
            data-trail
            fill="none"
            stroke="var(--danger)"
            strokeWidth={2}
            strokeDasharray="2 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g data-cut-badge className="pointer-events-auto cursor-pointer" style={{ display: "none" }}>
            <title>{t("projects.boardCut")}</title>
            <circle r={13} fill="var(--danger-soft)" stroke="var(--danger)" strokeWidth={1.5} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={14} fill="var(--danger)">
              ✂
            </text>
          </g>
        </svg>

        <div className="pointer-events-none relative grid grid-cols-1 gap-6 p-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-12">
          <div
            data-node="root"
            className="pointer-events-auto relative flex w-fit max-w-[16rem] cursor-grab items-center gap-3 rounded-2xl border-2 p-3 shadow-md lg:col-start-2 lg:row-start-1"
            style={{
              borderColor: "var(--brand)",
              background: "color-mix(in oklch, var(--brand) 10%, var(--surface))",
            }}
          >
            {root.image && (
              // eslint-disable-next-line @next/next/no-img-element -- our own same-origin route, already downscaled on upload
              <img
                src={root.image}
                alt=""
                draggable={false}
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                {root.code}
              </div>
              <div className="line-clamp-2 font-semibold leading-snug break-words">{root.name}</div>
            </div>
            {/* Drawn from the project to a nested sub-project, a line lifts it to the top. */}
            {handle("var(--brand)", "-right-1.5")}
          </div>

          {right.length > 0 && (
            <div className="flex flex-col gap-6 lg:col-start-3 lg:row-start-1">
              {right.map((branch) => renderBranch(branch, "right", "root"))}
            </div>
          )}
          {left.length > 0 && (
            <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
              {left.map((branch) => renderBranch(branch, "left", "root"))}
            </div>
          )}
          {(adrift.length > 0 || loose.length > 0) && (
            <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-5 pt-8 lg:col-span-3 lg:col-start-1 lg:row-start-2">
              {adrift.map((branch) => renderBranch(branch, "right", null))}
              {loose.map((leaf) => (
                <div key={leafKey(leaf)}>
                  {renderLeaf(leaf, null, "var(--text-muted)", "-left-1.5")}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outside the world, so the toolbar neither zooms nor pans. */}
      <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-2">
        {editable && (
          <button
            type="button"
            className={scissors ? "btn btn-danger min-w-9" : tool}
            aria-pressed={scissors}
            aria-label={t("projects.boardScissors")}
            title={t("projects.boardScissors")}
            onClick={() => setScissors((on) => !on)}
          >
            ✂
          </button>
        )}
        <button
          type="button"
          className={tool}
          aria-label={t("projects.boardZoomOut")}
          title={t("projects.boardZoomOut")}
          onClick={() => whiteboard.current?.zoomBy(1 / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className={tool}
          aria-label={t("projects.boardZoomIn")}
          title={t("projects.boardZoomIn")}
          onClick={() => whiteboard.current?.zoomBy(1.25)}
        >
          +
        </button>
        <button
          type="button"
          className={tool}
          aria-label={t("projects.boardReset")}
          title={t("projects.boardReset")}
          onClick={() => whiteboard.current?.reset()}
        >
          ⟲
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-pressed={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t("projects.boardCollapse") : t("projects.boardExpand")}
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] space-y-1 text-xs">
        {failed && (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {failed}
          </p>
        )}
        <p style={{ color: "var(--text-muted)" }}>
          {scissors
            ? t("projects.boardScissorsHint")
            : editable
              ? t("projects.boardEditHint")
              : t("projects.boardHint")}
        </p>
      </div>
    </div>
  );
}

/** Enough of a project to name it and link to it — what a task or trip card carries. */
export type ProjectRef = { id: string; code: string; name: string };

/** A sub-project (ProjectPart), as a task or trip carries it. */
export type PartRef = { id: string; name: string };

/** A sub-project with its place in the tree: `parentId` null is directly under the project. */
export type PartNode = PartRef & { parentId: string | null };

/** An open project as the pickers offer it, with the sub-projects inside it. */
export type ProjectOption = ProjectRef & { parts: PartNode[] };

/**
 * A project's sub-projects in tree order — each parent followed by what is
 * inside it — with how deep each one sits, for a flat list (a `<select>`) to
 * indent. Keeps the order it is given among siblings. A part whose parent is
 * missing is treated as top-level, so nothing is ever dropped from the list.
 */
export function partTree<T extends PartNode>(parts: T[]): { part: T; depth: number }[] {
  const ids = new Set(parts.map((p) => p.id));
  const out: { part: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const part of parts) {
      const parent = part.parentId && ids.has(part.parentId) ? part.parentId : null;
      if (parent !== parentId || seen.has(part.id)) continue;
      seen.add(part.id);
      out.push({ part, depth });
      walk(part.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

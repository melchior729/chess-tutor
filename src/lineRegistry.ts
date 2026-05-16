import type { MoveNode, RootNode } from "./gameTree";
import { pathFromRoot } from "./gameTree";

export type SavedLine = {
  /** Tip node of this branch (path resolved from the tree when listing). */
  tipId: number;
  label: string;
  updatedAt: number;
  nodes: MoveNode[];
};

const lines = new Map<string, SavedLine>();

export function pathKey(nodes: MoveNode[]): string {
  return nodes.map((n) => n.id).join(",");
}

export function pathsMatch(a: MoveNode[], b: MoveNode[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((n, i) => n.id === b[i]!.id);
}

export function clearSavedLines(): void {
  lines.clear();
}

/** Save the line abandoned when rewinding and playing a different move. */
export function registerForkedLine(abandonedPath: MoveNode[]): void {
  if (abandonedPath.length === 0) return;
  const tip = abandonedPath[abandonedPath.length - 1]!;
  lines.set(String(tip.id), {
    tipId: tip.id,
    label: formatLineLabel(abandonedPath),
    updatedAt: Date.now(),
    nodes: abandonedPath.slice(),
  });
}

/** Extend a saved branch entry while continuing on that line (no new explorer row). */
export function syncBranchTip(activePath: MoveNode[]): void {
  if (activePath.length === 0) return;
  for (const line of [...lines.values()]) {
    if (!activePath.some((n) => n.id === line.tipId)) continue;
    lines.delete(String(line.tipId));
    const tip = activePath[activePath.length - 1]!;
    lines.set(String(tip.id), {
      tipId: tip.id,
      label: formatLineLabel(activePath),
      updatedAt: Date.now(),
      nodes: activePath.slice(),
    });
    return;
  }
}

export function findNodeById(root: RootNode, id: number): MoveNode | undefined {
  const stack = [...root.children];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    stack.push(...n.children);
  }
  return undefined;
}

export function listSavedLines(root: RootNode): SavedLine[] {
  const out: SavedLine[] = [];
  for (const line of lines.values()) {
    const tip = findNodeById(root, line.tipId);
    if (!tip) continue;
    const nodes = pathFromRoot(tip);
    out.push({
      tipId: line.tipId,
      updatedAt: line.updatedAt,
      label: formatLineLabel(nodes),
      nodes,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function formatLineLabel(nodes: MoveNode[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.color === "w") {
      parts.push(`${Math.floor(i / 2) + 1}.`, n.san);
    } else {
      parts.push(n.san);
    }
  }
  let text = parts.join(" ");
  if (text.length > 72) text = `${text.slice(0, 69)}…`;
  return text;
}

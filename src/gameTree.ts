import { Chess } from "chess.js";

import type { MoveQuality } from "./moveQuality";

let nextMoveId = 1;

/** Root sentinel; does not correspond to a half-move. */
export class RootNode {
  readonly isRoot = true;
  readonly id = 0;
  readonly children: MoveNode[] = [];
}

export class MoveNode {
  readonly isRoot = false;
  readonly id: number;
  readonly san: string;
  readonly uci: string;
  /** Piece color that moved (`w`/`b`). */
  readonly color: "w" | "b";
  readonly parent: RootNode | MoveNode;
  readonly children: MoveNode[] = [];
  /** Engine classification (human moves when setting enabled). */
  quality?: MoveQuality;
  /** Move is covered by a Wikibooks opening-theory article for this line. */
  isBook?: boolean;

  constructor(init: Omit<MoveNode, "children" | "isRoot" | "quality" | "isBook">) {
    this.id = init.id;
    this.san = init.san;
    this.uci = init.uci;
    this.color = init.color;
    this.parent = init.parent;
  }
}

/** Path from root to `node`, excluding sentinel (first ply at index 0). */
export function pathFromRoot(node: RootNode | MoveNode): MoveNode[] {
  if ("isRoot" in node && node.isRoot) return [];
  let cur = node as MoveNode;
  const seq: MoveNode[] = [];
  while (true) {
    seq.unshift(cur);
    const p = cur.parent;
    if (p instanceof RootNode) break;
    cur = p;
  }
  return seq;
}


export function findChildBySan(parent: RootNode | MoveNode, san: string): MoveNode | undefined {
  const list = "isRoot" in parent && parent.isRoot ? parent.children : (parent as MoveNode).children;
  return list.find((c) => c.san === san);
}

export function createMoveNode(
  parent: RootNode | MoveNode,
  san: string,
  uci: string,
  color: "w" | "b",
): MoveNode {
  const n = new MoveNode({
    id: nextMoveId++,
    san,
    uci,
    color,
    parent,
  });
  if ("isRoot" in parent && parent.isRoot) parent.children.push(n);
  else (parent as MoveNode).children.push(n);
  return n;
}

/** Append new child or reuse existing with same SAN (transposition / repeat). */
export function getOrCreateChild(
  parent: RootNode | MoveNode,
  san: string,
  uci: string,
  color: "w" | "b",
): MoveNode {
  return findChildBySan(parent, san) ?? createMoveNode(parent, san, uci, color);
}

export function replayToDepth(game: Chess, branchPath: MoveNode[], depth: number): void {
  game.reset();
  for (let i = 0; i < depth; i++) {
    game.move(branchPath[i]!.san);
  }
}

export function uciPrefix(branchPath: MoveNode[], depth: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < depth; i++) out.push(branchPath[i]!.uci);
  return out;
}

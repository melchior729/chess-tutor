import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Color, Key } from "chessground/types";
import type { Chess } from "chess.js";
import type { Config } from "chessground/config";

function buildDests(game: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const mv of game.moves({ verbose: true })) {
    const arr = dests.get(mv.from as Key) ?? [];
    if (!arr.includes(mv.to as Key)) arr.push(mv.to as Key);
    dests.set(mv.from as Key, arr);
  }
  return dests;
}

function lastMoveKeys(game: Chess): Key[] | undefined {
  const h = game.history({ verbose: true });
  const last = h[h.length - 1];
  if (!last) return undefined;
  return [last.from as Key, last.to as Key];
}

export interface SyncChessOpts {
  /** When false, board is view-only (e.g. promotion modal). */
  inputsEnabled: boolean;
  movableEvents?: NonNullable<Config["movable"]>["events"];
  /** Engine hint arrow(s); cleared on next sync without shapes. */
  autoShapes?: DrawShape[];
}

/** Push chess.js authority into Chessground. */
export function syncChessground(chess: Chess, cg: Api, orientation: Color, opts: SyncChessOpts): void {
  const turnCg: Color = chess.turn() === "w" ? "white" : "black";

  cg.set({
    fen: chess.fen(),
    orientation,
    turnColor: turnCg,
    check: chess.isCheck() ? (chess.turn() === "w" ? "white" : "black") : false,
    lastMove: lastMoveKeys(chess),
    draggable: {
      enabled: opts.inputsEnabled,
    },
    selectable: {
      enabled: opts.inputsEnabled,
    },
    movable: {
      free: false,
      color: opts.inputsEnabled ? turnCg : undefined,
      dests: opts.inputsEnabled ? buildDests(chess) : new Map(),
      showDests: opts.inputsEnabled,
      events: opts.movableEvents,
    },
    autoCastle: true,
    drawable: {
      enabled: true,
      visible: true,
      autoShapes: opts.autoShapes ?? [],
    },
  });
}

export function mountChessground(el: HTMLElement, orientation: Color = "white"): Api {
  return Chessground(el, {
    fen: undefined,
    orientation,
    draggable: { enabled: true },
    selectable: { enabled: true },
    movable: { free: false, showDests: true },
    autoCastle: true,
    drawable: { enabled: true, visible: true },
  });
}

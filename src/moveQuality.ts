import { Chess, type Square } from "chess.js";

import type { ParsedScore } from "./uci";

export type MoveQuality =
  | "brilliant"
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "okay"
  | "inaccuracy"
  | "mistake"
  | "blunder";

const PIECE_CP: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export function qualityLabel(q: MoveQuality): string {
  switch (q) {
    case "brilliant":
      return "!!";
    case "best":
      return "★";
    case "great":
      return "!";
    case "excellent":
      return "✓";
    case "good":
      return "○";
    case "okay":
      return "≈";
    case "inaccuracy":
      return "?!";
    case "mistake":
      return "?";
    case "blunder":
      return "??";
  }
}

export function qualityColor(q: MoveQuality): string {
  switch (q) {
    case "brilliant":
      return "#26c6da";
    case "best":
      return "#ffc107";
    case "great":
      return "#66bb6a";
    case "excellent":
      return "#9ccc65";
    case "good":
      return "#9e9e9e";
    case "okay":
      return "#c0ca33";
    case "inaccuracy":
      return "#ffb74d";
    case "mistake":
      return "#ff8a65";
    case "blunder":
      return "#ef5350";
  }
}

/** Centipawns advantage for `color` when `score` is from side `stm` to move. */
export function advantageCp(score: ParsedScore, color: "w" | "b", stm: "w" | "b"): number {
  if (score.kind === "mate") {
    const mateForStm = score.value;
    const winForStm = mateForStm > 0;
    const winForColor =
      (winForStm && stm === color) || (!winForStm && stm !== color);
    return winForColor ? 10_000 : -10_000;
  }
  return stm === color ? score.value : -score.value;
}

export function uciMovesMatch(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? "") === (b[4] ?? "");
}

export function classifyFromCpLoss(
  cpLoss: number,
  opts: { isBest: boolean; sacrifice: boolean },
): MoveQuality {
  if (opts.isBest && opts.sacrifice && cpLoss <= 20) return "brilliant";
  if (opts.isBest) return "best";
  if (cpLoss <= 12) return "excellent";
  if (cpLoss <= 35) return "good";
  if (cpLoss <= 50) return "okay";
  if (cpLoss <= 80) return "inaccuracy";
  if (cpLoss <= 150) return "mistake";
  return "blunder";
}

/** Was this capture a net material sacrifice vs the captured piece? */
export function isMaterialSacrifice(beforeMoves: string[], playedUci: string): boolean {
  const g = new Chess();
  for (const u of beforeMoves) {
    const from = u.slice(0, 2) as Square;
    const to = u.slice(2, 4) as Square;
    const promotion = u.length > 4 ? u[4] : undefined;
    g.move({ from, to, promotion });
  }
  const from = playedUci.slice(0, 2) as Square;
  const to = playedUci.slice(2, 4) as Square;
  const promotion = playedUci.length > 4 ? playedUci[4] : undefined;
  const played = g.move({ from, to, promotion });
  if (!played?.captured) return false;
  const capturedCp = PIECE_CP[played.captured] ?? 0;
  const moverPiece = played.piece;
  const givenCp = moverPiece ? (PIECE_CP[moverPiece] ?? 0) : 0;
  return capturedCp >= 300 && givenCp < capturedCp - 100;
}

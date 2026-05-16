import bundledOpenings from "./assets/openings.json";

export type OpeningRecord = {
  eco: string;
  name: string;
  uci: string[];
};

const db: OpeningRecord[] = bundledOpenings as OpeningRecord[];

export function getOpenings(): OpeningRecord[] {
  return db;
}

/** Longest lichess opening line that matches the played UCI prefix. */
export function lookupOpening(uciMoves: string[], openings: OpeningRecord[]): OpeningRecord | null {
  let best: OpeningRecord | null = null;
  let bestLen = 0;
  for (const op of openings) {
    if (op.uci.length > uciMoves.length) continue;
    let ok = true;
    for (let i = 0; i < op.uci.length; i++) {
      if (op.uci[i] !== uciMoves[i]) {
        ok = false;
        break;
      }
    }
    if (ok && op.uci.length > bestLen) {
      bestLen = op.uci.length;
      best = op;
    }
  }
  return best;
}

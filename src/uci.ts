import type { Move } from "chess.js";

/** UCI move (e.g. `e2e4`, `e7e8q`). */
export function moveToUci(m: Pick<Move, "from" | "to" | "promotion">): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

export type ParsedScore =
  | { kind: "cp"; value: number }
  | { kind: "mate"; value: number };

/** First PV move from a UCI `info` line (e.g. `e2e4`). */
export function parseInfoPv(line: string): string | undefined {
  const m = /\bpv\s+(\S+)/.exec(line);
  const uci = m?.[1];
  if (!uci || uci === "(none)") return undefined;
  return uci;
}

/** Parse last `score cp` or `score mate` from a single UCI `info` line. */
export function parseInfoLine(line: string): ParsedScore | undefined {
  const mateM = /\bscore mate (-?\d+)/.exec(line);
  if (mateM?.[1]) return { kind: "mate", value: Number(mateM[1]) };
  const cpM = /\bscore cp (-?\d+)/.exec(line);
  if (cpM?.[1]) return { kind: "cp", value: Number(cpM[1]) };
  return undefined;
}

/** UCI scores are for the side to move; normalize to White's perspective. */
export function scoreForWhite(
  score: ParsedScore,
  stm: "w" | "b",
): ParsedScore {
  if (stm === "w") return score;
  return score.kind === "cp"
    ? { kind: "cp", value: -score.value }
    : { kind: "mate", value: -score.value };
}

import type { Chess } from "chess.js";

const PV = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 } as const;

/** Signed difference in hundredths of a pawn (+ means White leads on material). */
export function materialCentipawns(chess: Chess): number {
  let w = 0;
  let b = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const v = PV[sq.type];
      if (sq.color === "w") w += v;
      else b += v;
    }
  }
  return w - b;
}

const PIECES_DESC = [
  { v: 900, w: "♕", b: "♛" },
  { v: 500, w: "♖", b: "♜" },
  { v: 300, w: "♘", b: "♞" },
  { v: 300, w: "♗", b: "♝" },
  { v: 100, w: "♙", b: "♟" },
] as const;

/** Approximate leftover material as glyphs (greedy descending). Returns empty if ~equal. */
export function surplusGlyphs(centi: number, sideAhead: "w" | "b"): string {
  let r = Math.round(Math.abs(centi));
  let s = "";
  for (const p of PIECES_DESC) {
    while (r >= p.v) {
      r -= p.v;
      s += sideAhead === "w" ? p.w : p.b;
    }
  }
  return s;
}

export function renderMaterialStrip(
  el: HTMLElement | null,
  centi: number,
  sideOwn: "w" | "b",
): void {
  if (!el) return;
  el.replaceChildren();
  const mine = sideOwn === "w" ? centi > 0 : centi < 0;
  if (!mine) return;
  const v = Math.abs(centi / 100);
  const glyphs = surplusGlyphs(Math.abs(centi), sideOwn === "w" ? "w" : "b");
  const label = document.createElement("span");
  label.className = "material-strip__label";
  label.textContent = `+${v.toFixed(v >= 10 ? 0 : 1)}`;
  const icons = document.createElement("span");
  icons.className = "material-strip__icons";
  icons.setAttribute("aria-hidden", "true");
  icons.textContent = glyphs;
  icons.title = `${sideOwn === "w" ? "White" : "Black"} up ${v.toFixed(1)} pawns`;
  el.appendChild(label);
  if (glyphs.length) el.appendChild(icons);
}

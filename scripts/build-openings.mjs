/**
 * Build public/openings.json from lichess-org/chess-openings (CC0).
 * Run: node scripts/build-openings.mjs
 */
import { Chess } from "chess.js";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPublic = join(root, "public", "openings.json");
const outBundled = join(root, "src", "assets", "openings.json");
const BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";

function moveToUci(m) {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

function pgnToUci(pgn) {
  const cleaned = pgn
    .replace(/\d+\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const game = new Chess();
  const ucis = [];
  for (const token of cleaned.split(" ")) {
    if (!token || token === "*") continue;
    const played = game.move(token);
    if (!played) {
      console.warn("skip bad pgn token:", token, "in", pgn);
      return [];
    }
    ucis.push(moveToUci(played));
  }
  return ucis;
}

const volumes = ["a", "b", "c", "d", "e"];
const entries = [];

for (const vol of volumes) {
  const res = await fetch(`${BASE}/${vol}.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch ${vol}.tsv: ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    const eco = line.slice(0, tab);
    const rest = line.slice(tab + 1);
    const tab2 = rest.indexOf("\t");
    const name = rest.slice(0, tab2);
    const pgn = rest.slice(tab2 + 1);
    const uci = pgnToUci(pgn);
    if (uci.length === 0) continue;
    entries.push({ eco, name, uci });
  }
}

const json = JSON.stringify(entries);
mkdirSync(dirname(outPublic), { recursive: true });
mkdirSync(dirname(outBundled), { recursive: true });
writeFileSync(outPublic, json);
writeFileSync(outBundled, json);
console.log(`Wrote ${entries.length} openings to ${outPublic} and ${outBundled}`);

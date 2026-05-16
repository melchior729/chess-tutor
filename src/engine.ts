import { parseInfoLine, type ParsedScore } from "./uci";

const BOOT_TIMEOUT_MS = 30_000;

/** Emscripten Stockfish instance (main-thread build). */
export type StockfishInstance = {
  addMessageListener: (fn: (line: string) => void) => void;
  removeMessageListener?: (fn: (line: string) => void) => void;
  postMessage: (cmd: string) => void;
  onCustomMessage: (cmd: string) => void;
  __IS_SINGLE_THREADED__?: boolean;
  __IS_NON_NESTED__?: boolean;
};

type StockfishFactory = (opts: {
  locateFile: (path: string) => string;
}) => Promise<StockfishInstance>;

declare global {
  interface Window {
    __stockfishFactory?: StockfishFactory;
  }
}

function stockfishBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}

function stockfishScriptUrl(): string {
  return new URL("stockfish-nnue-16-single.js", stockfishBaseUrl()).href;
}

function stockfishWasmUrl(): string {
  return new URL("stockfish-nnue-16-single.wasm", stockfishBaseUrl()).href;
}

async function loadStockfishFactory(): Promise<StockfishFactory> {
  if (window.__stockfishFactory) return window.__stockfishFactory;

  const scriptUrl = stockfishScriptUrl();
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${scriptUrl}"]`) as
      | HTMLScriptElement
      | null;
    if (existing?._exports) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`));
    document.head.appendChild(script);
  });

  const tag = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;
  const factory = tag?._exports as StockfishFactory | undefined;
  if (!factory) throw new Error("Stockfish script loaded but _exports is missing");
  window.__stockfishFactory = factory;
  return factory;
}

export async function createStockfishEngine(): Promise<StockfishEngine> {
  const factory = await loadStockfishFactory();
  const wasmUrl = stockfishWasmUrl();
  const sf = await factory({
    locateFile: (path) => (path.includes(".wasm") ? wasmUrl : stockfishScriptUrl()),
  });
  return new StockfishEngine(sf);
}

export type EngineLineHandler = (line: string) => void;

/** UCI_Elo targets for UI difficulty 1–9 (level 10 = full strength). */
const UCI_ELO_BY_DIFFICULTY: Record<number, number> = {
  1: 1320,
  2: 1370,
  3: 1420,
  4: 1500,
  5: 1600,
  6: 1700,
  7: 1850,
  8: 2000,
  9: 2200,
};

export function clampDifficulty(difficulty: number): number {
  return Math.max(1, Math.min(10, Math.round(difficulty)));
}

/** Apply UCI strength options for UI difficulty 1–10. */
export function applyDifficultyToEngine(engine: StockfishEngine, difficulty: number): void {
  const d = clampDifficulty(difficulty);
  if (d === 10) {
    engine.setLimitStrength(false);
    engine.setSkillLevel(20);
    return;
  }
  engine.setLimitStrength(true);
  engine.setUciElo(UCI_ELO_BY_DIFFICULTY[d]!);
}

export function movetimeMsForDifficulty(difficulty: number): number {
  const d = Math.max(1, Math.min(10, Math.round(difficulty)));
  return 250 + d * 175;
}

export function parseBestMoveUci(line: string): string | null {
  const m = /^bestmove\s+(\S+)/.exec(line.trim());
  if (!m?.[1] || m[1] === "(none)") return null;
  return m[1];
}

export class StockfishEngine {
  private booted = false;
  private onLine: EngineLineHandler = () => {};
  private readonly listener = (line: string) => this.dispatchLine(line);

  constructor(private readonly sf: StockfishInstance) {
    sf.addMessageListener(this.listener);
  }

  private dispatchLine(chunk: string): void {
    for (const part of chunk.split("\n")) {
      const line = part.trim();
      if (line) this.onLine(line);
    }
  }

  private send(cmd: string): void {
    if (this.sf.__IS_SINGLE_THREADED__ || this.sf.__IS_NON_NESTED__) {
      this.sf.onCustomMessage(cmd);
    } else {
      this.sf.postMessage(cmd);
    }
  }

  setLineHandler(handler: EngineLineHandler): void {
    this.onLine = handler;
  }

  get isBooted(): boolean {
    return this.booted;
  }

  post(cmd: string): void {
    this.send(cmd);
  }

  stop(): void {
    this.post("stop");
  }

  setSkillLevel(level: number): void {
    this.post(`setoption name Skill Level value ${level}`);
  }

  setLimitStrength(enabled: boolean): void {
    this.post(`setoption name UCI_LimitStrength value ${enabled}`);
  }

  setUciElo(elo: number): void {
    this.post(`setoption name UCI_Elo value ${elo}`);
  }

  setPosition(moves: string[]): void {
    if (moves.length === 0) this.post("position startpos");
    else this.post(`position startpos moves ${moves.join(" ")}`);
  }

  analyzeDepth(depth: number): void {
    this.post(`go depth ${depth}`);
  }

  playMovetime(ms: number): void {
    this.post(`go movetime ${ms}`);
  }

  waitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let sawUciOk = false;
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(deadline);
        this.onLine = prev;
        fn();
      };

      const prev = this.onLine;
      const deadline = window.setTimeout(() => {
        finish(() => reject(new Error("Stockfish handshake timeout")));
      }, BOOT_TIMEOUT_MS);

      this.onLine = (line) => {
        if (line === "uciok") {
          sawUciOk = true;
          this.post("isready");
          return;
        }
        if (line === "readyok" && sawUciOk) {
          this.booted = true;
          finish(resolve);
        }
      };

      this.post("uci");
    });
  }
}

export function parseInfoScore(line: string): ParsedScore | undefined {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return undefined;
  return parseInfoLine(line);
}

import type { Chess, Move } from "chess.js";

export type MoveSoundBucket = "mate" | "stale" | "check" | "promote" | "castle" | "capture" | "move";

let ctx: AudioContext | undefined;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Call after first user gesture if the browser suspended audio. */
export function resumeAudioContext(): void {
  void getCtx().resume();
}

function beep(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.08) {
  const c = getCtx();
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.02);
}

export function playBucket(bucket: MoveSoundBucket) {
  try {
    switch (bucket) {
      case "mate":
        beep(180, 0.35, "triangle", 0.12);
        beep(120, 0.45, "triangle", 0.14);
        break;
      case "stale":
        beep(200, 0.2);
        beep(150, 0.25);
        break;
      case "check":
        beep(880, 0.08);
        beep(660, 0.1);
        break;
      case "promote":
        beep(520, 0.06);
        beep(780, 0.1);
        break;
      case "castle":
        beep(360, 0.05);
        beep(300, 0.06);
        break;
      case "capture":
        beep(392, 0.035, "sine", 0.05);
        beep(262, 0.09, "triangle", 0.04);
        break;
      default:
        beep(520, 0.04);
    }
  } catch {
    /* AudioContext unsupported */
  }
}

export function bucketForCommittedMove(move: Move, board: Chess): MoveSoundBucket {
  if (board.isCheckmate()) return "mate";
  if (board.isStalemate()) return "stale";
  if (move.isPromotion()) return "promote";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "castle";
  if (move.isCapture()) return "capture";
  if (board.inCheck()) return "check";
  return "move";
}

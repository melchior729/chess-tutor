import { Chess, type Move, type Square } from "chess.js";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import type { DrawShape } from "chessground/draw";
import type { Color as CgColor, Key } from "chessground/types";

import "./style.css";

import { mountChessground, syncChessground } from "./chessgroundSync";
import {
  createStockfishEngine,
  movetimeMsForDifficulty,
  parseBestMoveUci,
  parseInfoScore,
  skillLevelForDifficulty,
  StockfishEngine,
} from "./engine";
import {
  getOrCreateChild,
  pathFromRoot,
  type MoveNode,
  replayToDepth,
  RootNode,
  uciPrefix,
} from "./gameTree";
import { materialCentipawns, renderMaterialStrip } from "./material";
import { renderMoveLog } from "./moveLogDom";
import { BOOK_COLOR, BOOK_LABEL } from "./bookMove";
import { hasWikiArticle } from "./openingWiki";
import { refreshOpeningPanel } from "./openingPanel";
import {
  advantageCp,
  classifyFromCpLoss,
  isMaterialSacrifice,
  qualityColor,
  qualityLabel,
  uciMovesMatch,
} from "./moveQuality";
import { bucketForCommittedMove, playBucket, resumeAudioContext } from "./sounds";
import { initPhoneLayout, isPhoneLayout } from "./phoneLayout";
import { loadSettings, saveSettings, type AppSettings } from "./settings";
import { moveToUci, parseInfoPv, scoreForWhite, type ParsedScore } from "./uci";

const ANALYSIS_DEPTH = 14;
const HINT_DEPTH = 12;
const CLASSIFY_DEPTH = 12;
const EVAL_DEBOUNCE_MS = 200;

/** Display + bar fill from White's perspective (positive = White better). */
function scoreToUi(s: ParsedScore): { label: string; whiteFrac: number } {
  if (s.kind === "mate") {
    const m = s.value;
    const n = Math.abs(m);
    const label = m > 0 ? `#${n}` : `−#${n}`;
    const whiteFrac = m > 0 ? 1 : 0;
    return { label, whiteFrac };
  }
  const pawns = s.value / 100;
  const label = `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
  const clampCp = Math.max(-800, Math.min(800, s.value));
  const whiteFrac = 0.5 + clampCp / 1600;
  return { label, whiteFrac };
}

/* ---------- Tree + board ---------- */

const treeRoot = new RootNode();
let game = new Chess();
let branchPath: MoveNode[] = [];
let cursorDepth = 0;

let boardOrientation: CgColor = "white";
let humanColor: "w" | "b" = "w";
let difficulty = 5;
let sessionActive = false;
let engineThinking = false;
let awaitingEngineMove = false;
let awaitingEngineConfirm = false;

let appSettings: AppSettings = loadSettings();

const boardEl = document.querySelector("#board") as HTMLElement;
const materialStripWhiteEl = document.querySelector("#material-strip-white") as HTMLElement;
const materialStripBlackEl = document.querySelector("#material-strip-black") as HTMLElement;
const moveLogEl = document.querySelector("#move-log-body") as HTMLElement;
const evalBarEl = document.querySelector("#eval-bar") as HTMLElement;
const evalLabelEl = document.querySelector("#eval-bar-label") as HTMLElement;
const evalBarWhite = document.querySelector("#eval-bar-fill") as HTMLElement;
const evalBarBlack = document.querySelector("#eval-bar-fill-black") as HTMLElement;
const promotionModal = document.querySelector("#promotion-modal") as HTMLElement;
const promotionChoices = promotionModal.querySelector(".promotion-modal__choices") as HTMLElement;
const setupModal = document.querySelector("#setup-modal") as HTMLElement;
const gameoverModal = document.querySelector("#gameover-modal") as HTMLElement;
const gameoverMessageEl = document.querySelector("#gameover-message") as HTMLElement;
const difficultyInput = document.querySelector("#difficulty") as HTMLInputElement;
const difficultyValueEl = document.querySelector("#difficulty-value") as HTMLElement;
const flipBoardBtn = document.querySelector("#flip-board") as HTMLButtonElement;
const startGameBtn = document.querySelector("#start-game") as HTMLButtonElement;
const playAgainBtn = document.querySelector("#play-again") as HTMLButtonElement;
const changeSettingsBtn = document.querySelector("#change-settings") as HTMLButtonElement;
const openSettingsBtn = document.querySelector("#open-settings") as HTMLButtonElement;
const settingsModal = document.querySelector("#settings-modal") as HTMLElement;
const closeSettingsBtn = document.querySelector("#close-settings") as HTMLButtonElement;
const settingShowEvalBar = document.querySelector("#setting-show-eval-bar") as HTMLInputElement;
const settingConfirmEngine = document.querySelector("#setting-confirm-engine") as HTMLInputElement;
const settingShowMoveQuality = document.querySelector("#setting-show-move-quality") as HTMLInputElement;
const settingShowBestMoveReview = document.querySelector(
  "#setting-show-best-move-review",
) as HTMLInputElement;
const settingShowOpenings = document.querySelector("#setting-show-openings") as HTMLInputElement;
const engineHintBtn = document.querySelector("#engine-hint") as HTMLButtonElement;
const engineUndoBtn = document.querySelector("#engine-undo") as HTMLButtonElement;
const engineContinueBtn = document.querySelector("#engine-continue") as HTMLButtonElement;
const layoutEl = document.querySelector(".layout") as HTMLElement;
const boardRowEl = document.querySelector("#board-row") as HTMLElement;
const boardColumnEl = document.querySelector(".board-column") as HTMLElement;
const movelogAsideEl = document.querySelector(".movelog") as HTMLElement;
const openingPanelEl = document.querySelector("#opening-panel") as HTMLElement;
const openingPanelEls = {
  panel: openingPanelEl,
  name: document.querySelector("#opening-name") as HTMLElement,
  eco: document.querySelector("#opening-eco") as HTMLElement,
  blurb: document.querySelector("#opening-blurb") as HTMLElement,
  wiki: document.querySelector("#opening-wiki") as HTMLElement,
};

window.addEventListener(
  "pointerdown",
  () => {
    resumeAudioContext();
  },
  { passive: true, once: true },
);

function resetTree(): void {
  treeRoot.children.length = 0;
  branchPath = [];
  cursorDepth = 0;
  game = new Chess();
}

function isAtTip(): boolean {
  return cursorDepth === branchPath.length;
}

function rebuildGame(): void {
  replayToDepth(game, branchPath, cursorDepth);
}

function canUserMove(): boolean {
  if (!sessionActive || game.isGameOver()) return false;
  if (engineThinking || awaitingEngineMove) return false;
  if (promotionModal.hasAttribute("data-open")) return false;
  if (awaitingEngineConfirm && isAtTip()) return true;
  return game.turn() === humanColor;
}

function clearSyncedHeights(): void {
  movelogAsideEl.style.height = "";
  movelogAsideEl.style.maxHeight = "";
  evalBarEl.style.height = "";
  evalBarEl.style.maxHeight = "";
  openingPanelEl.style.height = "";
  openingPanelEl.style.maxHeight = "";
}

/** Lock eval bar, movelog, and opening panel to the board column height (desktop only). */
function syncLayoutHeights(): void {
  if (isPhoneLayout()) {
    clearSyncedHeights();
    return;
  }

  const h = boardColumnEl.offsetHeight;
  const boardH = boardEl.offsetHeight;
  if (h <= 0 || boardH <= 0) return;

  const px = `${h}px`;
  movelogAsideEl.style.height = px;
  movelogAsideEl.style.maxHeight = px;

  if (appSettings.showEvalBar && !evalBarEl.hidden) {
    evalBarEl.style.height = px;
    evalBarEl.style.maxHeight = px;
  } else {
    evalBarEl.style.height = "";
    evalBarEl.style.maxHeight = "";
  }

  if (appSettings.showOpenings) {
    openingPanelEl.style.height = px;
    openingPanelEl.style.maxHeight = px;
  } else {
    openingPanelEl.style.height = "";
    openingPanelEl.style.maxHeight = "";
  }
}

function setEvalBarFill(whitePct: number, blackPct: number): void {
  if (isPhoneLayout()) {
    evalBarWhite.style.width = `${whitePct}%`;
    evalBarBlack.style.width = `${blackPct}%`;
    evalBarWhite.style.height = "";
    evalBarBlack.style.height = "";
  } else {
    evalBarWhite.style.height = `${whitePct}%`;
    evalBarBlack.style.height = `${blackPct}%`;
    evalBarWhite.style.width = "";
    evalBarBlack.style.width = "";
  }
}

function applyEvalBarVisibility(): void {
  const show = appSettings.showEvalBar;
  evalBarEl.toggleAttribute("hidden", !show);
  layoutEl.classList.toggle("layout--no-eval", !show);
  if (show) {
    syncLayoutHeights();
  } else {
    evalBarEl.style.height = "";
    evalBarEl.style.maxHeight = "";
    engine?.stop();
  }
  syncLayoutHeights();
}

function syncSettingsForm(): void {
  settingShowEvalBar.checked = appSettings.showEvalBar;
  settingConfirmEngine.checked = appSettings.confirmEngineMove;
  settingShowMoveQuality.checked = appSettings.showMoveQuality;
  settingShowBestMoveReview.checked = appSettings.showBestMoveOnReview;
  settingShowOpenings.checked = appSettings.showOpenings;
}

function applyOpeningsLayout(): void {
  boardRowEl.classList.toggle("board-row--openings", appSettings.showOpenings);
  boardRowEl.classList.toggle("board-row--no-openings", !appSettings.showOpenings);
  syncLayoutHeights();
  syncOpeningPanel();
  cgApi.redrawAll();
}

function readSettingsForm(): void {
  appSettings = {
    showEvalBar: settingShowEvalBar.checked,
    confirmEngineMove: settingConfirmEngine.checked,
    showMoveQuality: settingShowMoveQuality.checked,
    showBestMoveOnReview: settingShowBestMoveReview.checked,
    showOpenings: settingShowOpenings.checked,
  };
  saveSettings(appSettings);
  applyEvalBarVisibility();
  applyOpeningsLayout();
  if (!canShowBestMoveHint()) clearHintArrow();
  updateEngineToolbar();
  syncBoard();
  if (appSettings.showEvalBar && sessionActive && !engineThinking && !awaitingEngineMove) {
    scheduleEval();
  }
}

function showSettingsModal(): void {
  syncSettingsForm();
  settingsModal.hidden = false;
}

function hideSettingsModal(): void {
  settingsModal.hidden = true;
}

/** Confirm step after your move: show what you should have played (position before your move). */
function isConfirmBestMoveHint(): boolean {
  return (
    awaitingEngineConfirm &&
    isAtTip() &&
    !game.isGameOver() &&
    game.turn() !== humanColor &&
    lastMoveWasHuman() &&
    cursorDepth > 0
  );
}

function canShowBestMoveHint(): boolean {
  if (!sessionActive || !engine?.isBooted || game.isGameOver()) return false;
  if (engineThinking || awaitingEngineMove || promotionModal.hasAttribute("data-open")) return false;
  if (isConfirmBestMoveHint()) return true;
  if (!appSettings.showBestMoveOnReview) return false;
  return game.turn() === humanColor;
}

/** Take back your last move and Stockfish's reply (back to your decision point). */
function canUndoHumanEnginePair(): boolean {
  if (!sessionActive || !isAtTip() || game.isGameOver()) return false;
  if (engineThinking || awaitingEngineMove || awaitingEngineConfirm) return false;
  if (branchPath.length < 2) return false;
  const last = branchPath[branchPath.length - 1]!;
  const prev = branchPath[branchPath.length - 2]!;
  return last.color !== humanColor && prev.color === humanColor;
}

function canShowUndo(): boolean {
  return canUndoDuringConfirm() || canUndoHumanEnginePair();
}

function updateEngineToolbar(): void {
  const showConfirm =
    sessionActive && awaitingEngineConfirm && isAtTip() && !game.isGameOver();
  engineContinueBtn.hidden = !showConfirm;
  engineUndoBtn.hidden = !canShowUndo();
  engineHintBtn.hidden = !canShowBestMoveHint();
}

function clearEngineConfirm(): void {
  awaitingEngineConfirm = false;
  clearHintArrow();
  updateEngineToolbar();
}

function lastMoveWasHuman(): boolean {
  const last = branchPath[branchPath.length - 1];
  return last !== undefined && last.color === humanColor;
}

/** Engine is to play at the current tip. */
function offerEngineTurn(): void {
  if (!engine?.isBooted || !sessionActive || game.isGameOver()) return;
  if (!isAtTip() || game.turn() === humanColor) return;
  if (engineThinking || awaitingEngineMove) return;

  if (appSettings.confirmEngineMove && lastMoveWasHuman()) {
    awaitingEngineConfirm = true;
    scheduleEval();
    updateEngineToolbar();
    syncBoard();
    return;
  }

  requestEngineMove();
}

function continueToEngineMove(): void {
  if (!awaitingEngineConfirm || !isAtTip()) return;
  clearHintArrow();
  const engineShouldPlay = game.turn() !== humanColor;
  clearEngineConfirm();
  if (engineShouldPlay) {
    requestEngineMove();
  } else {
    syncBoard();
    scheduleEval();
    scheduleBookLabels();
  }
}

function popPlies(count: number, opts?: { keepConfirm?: boolean }): void {
  cancelPendingEnginePlay();
  if (!opts?.keepConfirm) clearEngineConfirm();
  evalToken++;
  window.clearTimeout(debounceTimer);
  engine?.stop();

  branchPath = branchPath.slice(0, Math.max(0, branchPath.length - count));
  cursorDepth = branchPath.length;
  rebuildGame();
  syncBoard();
  rerenderMovelog();
  refreshEvalForView();
  scheduleBookLabels();
  updateEngineToolbar();
}

/** Undo one ply while staying in confirm/setup mode (both sides movable). */
function undoDuringConfirm(): void {
  if (!awaitingEngineConfirm || !isAtTip() || branchPath.length === 0) return;
  popPlies(1, { keepConfirm: true });
  if (game.turn() === humanColor) {
    clearEngineConfirm();
  } else {
    awaitingEngineConfirm = true;
    scheduleEval();
    updateEngineToolbar();
    syncBoard();
  }
}

function undoHumanEnginePair(): void {
  if (!canUndoHumanEnginePair()) return;
  popPlies(2);
}

function undoLastPlay(): void {
  if (awaitingEngineConfirm) {
    undoDuringConfirm();
    return;
  }
  if (canUndoHumanEnginePair()) undoHumanEnginePair();
}

function canUndoDuringConfirm(): boolean {
  return awaitingEngineConfirm && isAtTip() && !game.isGameOver() && branchPath.length > 0;
}

function boardInputsEnabled(): boolean {
  return canUserMove();
}

function updateMaterialStrips(): void {
  const cp = materialCentipawns(game);
  renderMaterialStrip(materialStripWhiteEl, cp, "w");
  renderMaterialStrip(materialStripBlackEl, cp, "b");
}

function gameResultMessage(): string {
  if (game.isCheckmate()) {
    return game.turn() !== humanColor ? "Checkmate — you win!" : "Checkmate — Stockfish wins.";
  }
  if (game.isStalemate()) return "Stalemate — draw.";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
  if (game.isInsufficientMaterial()) return "Draw — insufficient material.";
  if (game.isDraw()) return "Draw.";
  return "Game over.";
}

function showGameOver(): void {
  gameoverMessageEl.textContent = gameResultMessage();
  gameoverModal.hidden = false;
  cancelPendingEnginePlay();
  clearEngineConfirm();
  engine?.stop();
  engineThinking = false;
  awaitingEngineMove = false;
  syncBoard();
}

function hideGameOver(): void {
  gameoverModal.hidden = true;
}

function showSetup(): void {
  setupModal.hidden = false;
  sessionActive = false;
  cancelPendingEnginePlay();
  clearEngineConfirm();
  engineThinking = false;
  awaitingEngineMove = false;
  engine?.stop();
  syncBoard();
}

function readSetupForm(): { color: "w" | "b"; level: number } {
  const picked = document.querySelector<HTMLInputElement>('input[name="human-color"]:checked');
  const color = picked?.value === "b" ? "b" : "w";
  const level = Number(difficultyInput.value) || 5;
  return { color, level: Math.max(1, Math.min(10, level)) };
}

function startSession(color: "w" | "b", level: number): void {
  humanColor = color;
  difficulty = level;
  sessionActive = true;
  hideGameOver();
  setupModal.hidden = true;

  resetTree();
  boardOrientation = color === "w" ? "white" : "black";

  engine?.setSkillLevel(skillLevelForDifficulty(difficulty));
  syncBoard();
  rerenderMovelog();
  if (game.turn() !== humanColor) offerEngineTurn();
  else scheduleEval();
}

function rerenderMovelog(): void {
  renderMoveLog(moveLogEl, branchPath, cursorDepth, handleSelectMove);
}

function handleSelectMove(node: MoveNode): void {
  if (!sessionActive) return;
  const pn = pathFromRoot(node);
  const aligns =
    pn.length <= branchPath.length && pn.every((n, i) => n.id === branchPath[i]!.id);
  if (aligns) cursorDepth = pn.length;
  else {
    branchPath = pn.slice();
    cursorDepth = branchPath.length;
  }
  rebuildGame();
  if (!isAtTip()) clearEngineConfirm();
  afterPlyNavigation();
}

const cgApi = mountChessground(boardEl, boardOrientation);

let hintArrowUci: string | null = null;

function moveBadgeShape(): DrawShape | undefined {
  if (cursorDepth <= 0) return undefined;
  const node = branchPath[cursorDepth - 1];
  if (!node) return undefined;
  const to = node.uci.slice(2, 4) as Key;

  if (
    appSettings.showMoveQuality &&
    node.quality &&
    node.color === humanColor
  ) {
    return {
      orig: to,
      label: { text: qualityLabel(node.quality), fill: qualityColor(node.quality) },
    };
  }

  if (node.isBook) {
    return {
      orig: to,
      label: { text: BOOK_LABEL, fill: BOOK_COLOR },
    };
  }

  return undefined;
}

function boardAutoShapes(): DrawShape[] | undefined {
  const shapes: DrawShape[] = [];
  if (hintArrowUci && hintArrowUci.length >= 4) {
    shapes.push({
      orig: hintArrowUci.slice(0, 2) as Key,
      dest: hintArrowUci.slice(2, 4) as Key,
      brush: "green",
    });
  }
  const badge = moveBadgeShape();
  if (badge) shapes.push(badge);
  return shapes.length > 0 ? shapes : undefined;
}

function setHintArrow(uci: string): void {
  hintArrowUci = uci;
  syncBoard();
}

function clearHintArrow(): void {
  if (!hintArrowUci) return;
  hintArrowUci = null;
  syncBoard();
}

function sansAtCursor(): string[] {
  return branchPath.slice(0, cursorDepth).map((n) => n.san);
}

function onOpeningLayout(): void {
  syncLayoutHeights();
  scheduleBookLabels();
}

function syncOpeningPanel(): void {
  refreshOpeningPanel(
    openingPanelEls,
    uciPrefix(branchPath, cursorDepth),
    sansAtCursor(),
    appSettings.showOpenings,
    onOpeningLayout,
  );
}

function syncBoard(): void {
  syncChessground(game, cgApi, boardOrientation, {
    inputsEnabled: boardInputsEnabled(),
    movableEvents: {
      after: (orig, dest) => handleUserMove(orig as Square, dest as Square),
    },
    autoShapes: boardAutoShapes(),
  });
  updateMaterialStrips();
  updateEngineToolbar();
  syncOpeningPanel();
  syncLayoutHeights();
}

function commitPlayedMove(move: Move): void {
  if (cursorDepth < branchPath.length) branchPath = branchPath.slice(0, cursorDepth);

  const parent = cursorDepth === 0 ? treeRoot : branchPath[cursorDepth - 1]!;
  const node = getOrCreateChild(parent, move.san, moveToUci(move), move.color);

  branchPath = [...branchPath.slice(0, cursorDepth), node];
  cursorDepth = branchPath.length;

  rebuildGame();
  playBucket(bucketForCommittedMove(move, game));
  syncBoard();
  rerenderMovelog();
  scheduleEval();
  scheduleBookLabels();
  if (sessionActive && move.color === humanColor && appSettings.showMoveQuality) {
    const node = branchPath[branchPath.length - 1]!;
    classifyQueue.push({ node, beforeMoves: uciPrefix(branchPath, branchPath.length - 1) });
    void drainClassifyQueue();
  }
  afterMoveCommitted();
}

function afterMoveCommitted(): void {
  if (!sessionActive) return;
  if (game.isGameOver()) {
    showGameOver();
    return;
  }
  if (awaitingEngineConfirm) {
    scheduleEval();
    updateEngineToolbar();
    syncBoard();
    return;
  }
  if (isAtTip() && game.turn() !== humanColor) offerEngineTurn();
}

let evalToken = 0;
let appliedToken = -1;
let debounceTimer: number | undefined;
let engine: StockfishEngine | undefined;

/** After `stop()`, Stockfish emits `bestmove` for the aborted search — discard it and then issue `go movetime`. */
let resumeEnginePlay: { moves: string[]; mt: number } | null = null;
let resumeFallbackTimer: number | undefined;

let hintToken = 0;
let activeHintSearchToken = -1;
let pendingHintSearch = false;
let hintFallbackTimer: number | undefined;

type DepthSearchResult = { score?: ParsedScore; pv?: string };
let depthSearchActive = false;
let depthSearchLast: DepthSearchResult = {};
let depthSearchFinish: ((r: DepthSearchResult) => void) | null = null;
let depthSearchTimeout: number | undefined;
let afterEngineStop: (() => void) | null = null;

const classifyQueue: { node: MoveNode; beforeMoves: string[] }[] = [];
let classifying = false;

let bookLabelToken = 0;
let bookLabelTimer: number | undefined;

function scheduleBookLabels(): void {
  if (!sessionActive) return;
  window.clearTimeout(bookLabelTimer);
  bookLabelTimer = window.setTimeout(() => {
    void refreshBookLabels();
  }, 150);
}

async function refreshBookLabels(): Promise<void> {
  if (!sessionActive) return;
  const token = ++bookLabelToken;

  for (let i = 0; i < branchPath.length; i++) {
    if (token !== bookLabelToken) return;
    const sans = branchPath.slice(0, i + 1).map((n) => n.san);
    branchPath[i]!.isBook = await hasWikiArticle(sans);
  }

  if (token !== bookLabelToken) return;
  rerenderMovelog();
  cgApi.set({ drawable: { autoShapes: boardAutoShapes() ?? [] } });
}

function engineStopThen(next: () => void): void {
  afterEngineStop = next;
  engine?.stop();
  window.setTimeout(() => {
    if (afterEngineStop === next) {
      afterEngineStop = null;
      next();
    }
  }, 120);
}

function clearDepthSearchTimeout(): void {
  if (depthSearchTimeout !== undefined) {
    window.clearTimeout(depthSearchTimeout);
    depthSearchTimeout = undefined;
  }
}

function finishDepthSearch(result: DepthSearchResult): void {
  if (!depthSearchFinish) return;
  const done = depthSearchFinish;
  depthSearchFinish = null;
  depthSearchActive = false;
  depthSearchLast = {};
  clearDepthSearchTimeout();
  done(result);
}

function runDepthSearch(moves: string[], depth: number): Promise<DepthSearchResult> {
  return new Promise((resolve) => {
    if (!engine?.isBooted) {
      resolve({});
      return;
    }
    evalToken++;
    window.clearTimeout(debounceTimer);

    const start = () => {
      depthSearchActive = true;
      depthSearchLast = {};
      depthSearchFinish = resolve;
      engine!.setPosition(moves);
      engine!.analyzeDepth(depth);
      clearDepthSearchTimeout();
      depthSearchTimeout = window.setTimeout(() => {
        engine?.stop();
        finishDepthSearch({ ...depthSearchLast });
      }, 10_000);
    };

    engineStopThen(start);
  });
}

async function classifyHumanMove(node: MoveNode, beforeMoves: string[]): Promise<void> {
  const playedUci = node.uci;
  const stm = node.color;
  const before = await runDepthSearch(beforeMoves, CLASSIFY_DEPTH);
  const after = await runDepthSearch([...beforeMoves, playedUci], CLASSIFY_DEPTH);
  if (!before.score || !after.score) return;

  const advBest = advantageCp(before.score, stm, stm);
  const opp: "w" | "b" = stm === "w" ? "b" : "w";
  const advAfter = advantageCp(after.score, stm, opp);
  const cpLoss = Math.max(0, advBest - advAfter);
  const isBest = before.pv ? uciMovesMatch(before.pv, playedUci) : false;
  const sacrifice = isMaterialSacrifice(beforeMoves, playedUci);
  node.quality = classifyFromCpLoss(cpLoss, { isBest, sacrifice });
}

async function drainClassifyQueue(): Promise<void> {
  if (classifying || classifyQueue.length === 0) return;
  if (!engine?.isBooted || !sessionActive) return;
  if (
    engineThinking ||
    awaitingEngineMove ||
    pendingHintSearch ||
    resumeEnginePlay ||
    depthSearchActive
  ) {
    return;
  }

  classifying = true;
  const job = classifyQueue.shift()!;
  try {
    await classifyHumanMove(job.node, job.beforeMoves);
    syncBoard();
    rerenderMovelog();
  } finally {
    classifying = false;
    if (classifyQueue.length > 0) void drainClassifyQueue();
    else scheduleEval();
  }
}

function clearHintFallbackTimer(): void {
  if (hintFallbackTimer !== undefined) {
    window.clearTimeout(hintFallbackTimer);
    hintFallbackTimer = undefined;
  }
}

function flushHintSearch(): void {
  if (!pendingHintSearch || !engine) return;
  clearHintFallbackTimer();
  pendingHintSearch = false;
  activeHintSearchToken = hintToken;
  engine.setPosition(buildUciForHint());
  engine.analyzeDepth(HINT_DEPTH);
}

function requestBestMoveHint(): void {
  if (!canShowBestMoveHint() || !engine?.isBooted || !sessionActive) return;

  hintToken++;
  pendingHintSearch = true;
  evalToken++;
  window.clearTimeout(debounceTimer);
  clearHintArrow();
  engine.stop();
  clearHintFallbackTimer();
  hintFallbackTimer = window.setTimeout(() => flushHintSearch(), 120);
}

function clearResumeFallbackTimer(): void {
  if (resumeFallbackTimer !== undefined) {
    window.clearTimeout(resumeFallbackTimer);
    resumeFallbackTimer = undefined;
  }
}

function cancelPendingEnginePlay(): void {
  clearResumeFallbackTimer();
  clearHintFallbackTimer();
  resumeEnginePlay = null;
  pendingHintSearch = false;
  activeHintSearchToken = -1;
  clearHintArrow();
}

function flushResumeEnginePlay(): void {
  if (!resumeEnginePlay || !engine) return;
  clearResumeFallbackTimer();
  const { moves, mt } = resumeEnginePlay;
  resumeEnginePlay = null;
  engine.setPosition(moves);
  engine.playMovetime(mt);
  awaitingEngineMove = true;
}

function buildUciForEngine(): string[] {
  return uciPrefix(branchPath, cursorDepth);
}

/** Position to analyze for the hint arrow. */
function buildUciForHint(): string[] {
  if (isConfirmBestMoveHint()) return uciPrefix(branchPath, cursorDepth - 1);
  return uciPrefix(branchPath, cursorDepth);
}

/** Re-run eval for the position currently on screen (any ply in the line). */
function refreshEvalForView(): void {
  if (!sessionActive || game.isGameOver()) return;
  scheduleEval();
}

function afterPlyNavigation(): void {
  if (!isAtTip()) clearEngineConfirm();
  if (!canShowBestMoveHint()) clearHintArrow();
  updateEngineToolbar();
  syncBoard();
  rerenderMovelog();
  scheduleBookLabels();
  if (!sessionActive || game.isGameOver()) return;
  if (isAtTip()) {
    if (game.turn() !== humanColor) offerEngineTurn();
    else refreshEvalForView();
  } else {
    refreshEvalForView();
  }
}

function scheduleEval(): void {
  if (!appSettings.showEvalBar) return;
  if (!engine?.isBooted || !sessionActive) return;
  if (engineThinking || awaitingEngineMove || game.isGameOver()) return;
  if (pendingHintSearch || classifying || depthSearchActive) return;
  evalToken++;
  const ticket = evalToken;
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    if (ticket !== evalToken) return;
    const moves = buildUciForEngine();
    engine!.stop();
    engine!.setPosition(moves);
    engine!.analyzeDepth(ANALYSIS_DEPTH);
    appliedToken = ticket;
  }, EVAL_DEBOUNCE_MS);
}

function applyEval(raw: ParsedScore): void {
  if (!appSettings.showEvalBar) return;
  if (appliedToken !== evalToken) return;
  if (engineThinking || awaitingEngineMove) return;
  const score = scoreForWhite(raw, game.turn());
  const { label, whiteFrac } = scoreToUi(score);
  const whitePct = Math.round(whiteFrac * 100);
  const blackPct = 100 - whitePct;
  evalLabelEl.textContent = label;
  evalBarEl.setAttribute("aria-label", `Engine evaluation ${label} from White's perspective`);
  setEvalBarFill(whitePct, blackPct);
}

function maybeRequestEngineMove(): void {
  if (!engine?.isBooted || !sessionActive || game.isGameOver()) return;
  if (!isAtTip() || game.turn() === humanColor) return;
  if (engineThinking || awaitingEngineMove || awaitingEngineConfirm) return;
  offerEngineTurn();
}

function requestEngineMove(): void {
  if (!engine?.isBooted || !sessionActive || game.isGameOver()) return;
  if (!isAtTip() || game.turn() === humanColor) return;

  clearEngineConfirm();
  engineThinking = true;
  awaitingEngineMove = false;
  evalToken++;
  syncBoard();

  const moves = buildUciForEngine();
  const mt = movetimeMsForDifficulty(difficulty);
  resumeEnginePlay = { moves, mt };
  engine.stop();

  // If nothing was searching, Stockfish may emit no `bestmove` after `stop`.
  resumeFallbackTimer = window.setTimeout(() => flushResumeEnginePlay(), 120);
}

function handleEngineBestMove(line: string): void {
  if (!awaitingEngineMove) return;
  awaitingEngineMove = false;

  const uci = parseBestMoveUci(line);
  if (!uci) {
    engineThinking = false;
    syncBoard();
    maybeRequestEngineMove();
    void drainClassifyQueue();
    return;
  }

  rebuildGame();
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? uci[4] : undefined;
  const played = game.move({ from, to, promotion });
  engineThinking = false;

  if (!played) {
    console.error("Stockfish returned illegal move:", uci);
    syncBoard();
    maybeRequestEngineMove();
    void drainClassifyQueue();
    return;
  }

  commitPlayedMove(played);
  void drainClassifyQueue();
}

function onEngineLine(line: string): void {
  if (line.startsWith("bestmove ")) {
    if (resumeEnginePlay) {
      flushResumeEnginePlay();
      return;
    }
    if (depthSearchActive && depthSearchFinish) {
      finishDepthSearch({ ...depthSearchLast });
      return;
    }
    if (afterEngineStop) {
      const next = afterEngineStop;
      afterEngineStop = null;
      next();
      return;
    }
    if (pendingHintSearch) {
      flushHintSearch();
      return;
    }
    if (awaitingEngineMove) {
      handleEngineBestMove(line);
      return;
    }
    return;
  }

  if (depthSearchActive) {
    const sc = parseInfoScore(line);
    if (sc) depthSearchLast.score = sc;
    const pv = parseInfoPv(line);
    if (pv) depthSearchLast.pv = pv;
  }

  if (activeHintSearchToken >= 0 && activeHintSearchToken === hintToken) {
    const pv = parseInfoPv(line);
    if (pv) {
      setHintArrow(pv);
      activeHintSearchToken = -1;
      pendingHintSearch = false;
      engine?.stop();
      scheduleEval();
      return;
    }
  }

  const sc = parseInfoScore(line);
  if (sc) applyEval(sc);
}

function openPromotion(onPick: (piece: string) => void): void {
  promotionModal.hidden = false;
  promotionModal.setAttribute("data-open", "1");
  syncBoard();

  const handler = (ev: Event) => {
    const t = ev.target as HTMLElement | null;
    const btn = t?.closest("button[data-piece]");
    if (!btn) return;
    const p = (btn as HTMLButtonElement).dataset.piece!;
    promotionModal.hidden = true;
    promotionModal.removeAttribute("data-open");
    promotionChoices.removeEventListener("click", handler);
    onPick(p);
  };

  promotionChoices.addEventListener("click", handler);
}

function handleUserMove(orig: Square, dest: Square): void {
  clearHintArrow();
  rebuildGame();
  if (!canUserMove()) {
    syncBoard();
    return;
  }

  const opts = game.moves({ verbose: true, square: orig }).filter((m) => m.to === dest);
  if (!opts.length) {
    syncBoard();
    return;
  }

  if (opts.length === 1) {
    const played = game.move(opts[0]!.san);
    if (!played) syncBoard();
    else commitPlayedMove(played);
    return;
  }

  syncBoard();
  openPromotion((piece) => {
    rebuildGame();
    const again = game.moves({ verbose: true, square: orig }).filter((m) => m.to === dest);
    const sel = again.find((m) => (m.promotion ?? "") === piece);
    if (!sel) {
      syncBoard();
      return;
    }
    const played = game.move(sel.san);
    if (!played) syncBoard();
    else commitPlayedMove(played);
  });
}

applyEvalBarVisibility();
applyOpeningsLayout();
syncSettingsForm();
syncBoard();
rerenderMovelog();

initPhoneLayout(() => {
  syncLayoutHeights();
  cgApi.redrawAll();
  if (sessionActive && appSettings.showEvalBar) scheduleEval();
});

new ResizeObserver(() => {
  syncLayoutHeights();
  cgApi.redrawAll();
}).observe(boardEl);
new ResizeObserver(() => syncLayoutHeights()).observe(boardColumnEl);
requestAnimationFrame(() => {
  syncLayoutHeights();
  cgApi.redrawAll();
});

difficultyInput.addEventListener("input", () => {
  difficultyValueEl.textContent = difficultyInput.value;
});

startGameBtn.addEventListener("click", () => {
  const { color, level } = readSetupForm();
  startSession(color, level);
});

playAgainBtn.addEventListener("click", () => {
  startSession(humanColor, difficulty);
});

changeSettingsBtn.addEventListener("click", () => {
  hideGameOver();
  showSetup();
});

flipBoardBtn.addEventListener("click", () => {
  boardOrientation = boardOrientation === "white" ? "black" : "white";
  syncBoard();
});

function inputFocused(): boolean {
  const a = document.activeElement;
  if (!a || !(a instanceof HTMLElement)) return false;
  return (
    a.isContentEditable || a.closest("textarea") !== null || a.closest('input:not([type="button"])') !== null
  );
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!sessionActive) return;
  if (promotionModal.hasAttribute("data-open")) return;
  if (inputFocused()) return;

  const key = e.key.toLowerCase();
  if (key === "s" && canShowBestMoveHint()) {
    e.preventDefault();
    requestBestMoveHint();
    return;
  }
  if (key === "d" && canShowUndo()) {
    e.preventDefault();
    undoLastPlay();
    return;
  }
  if (awaitingEngineConfirm && key === "c") {
    e.preventDefault();
    continueToEngineMove();
    return;
  }

  switch (e.key) {
    case "ArrowLeft": {
      e.preventDefault();
      if (cursorDepth <= 0) return;
      cursorDepth--;
      rebuildGame();
      afterPlyNavigation();
      break;
    }
    case "ArrowRight": {
      e.preventDefault();
      if (cursorDepth >= branchPath.length) return;
      cursorDepth++;
      rebuildGame();
      afterPlyNavigation();
      break;
    }
    case "ArrowUp": {
      e.preventDefault();
      cursorDepth = 0;
      rebuildGame();
      afterPlyNavigation();
      break;
    }
    case "ArrowDown":
    case "Enter": {
      e.preventDefault();
      cursorDepth = branchPath.length;
      rebuildGame();
      afterPlyNavigation();
      break;
    }
    default:
  }
});

openSettingsBtn.addEventListener("click", () => showSettingsModal());
closeSettingsBtn.addEventListener("click", () => {
  readSettingsForm();
  hideSettingsModal();
});
for (const el of [
  settingShowEvalBar,
  settingConfirmEngine,
  settingShowMoveQuality,
  settingShowBestMoveReview,
  settingShowOpenings,
]) {
  el.addEventListener("change", readSettingsForm);
  el.addEventListener("input", readSettingsForm);
}
engineHintBtn.addEventListener("click", () => requestBestMoveHint());
engineUndoBtn.addEventListener("click", () => undoLastPlay());
engineContinueBtn.addEventListener("click", () => continueToEngineMove());

(async () => {
  try {
    engine = await createStockfishEngine();
    engine.setLineHandler(onEngineLine);
    await engine.waitReady();
    applyEvalBarVisibility();
    if (appSettings.showEvalBar) scheduleEval();
    maybeRequestEngineMove();
  } catch (err) {
    console.error("Stockfish failed to initialize:", err);
    const detail = err instanceof Error ? err.message : String(err);

    evalLabelEl.textContent = "—";
    evalBarEl.setAttribute("aria-label", `Engine offline: ${detail}`);
    setEvalBarFill(50, 50);
    startGameBtn.disabled = true;
    startGameBtn.title = `Engine offline: ${detail}. Use npm run dev or npm run preview (avoid opening index.html as file://).`;
  }
})();

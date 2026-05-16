export type AppSettings = {
  showEvalBar: boolean;
  confirmEngineMove: boolean;
  showMoveQuality: boolean;
  /** Best-move button when reviewing (or at) positions where it is your turn. */
  showBestMoveOnReview: boolean;
  /** Opening panel left of board (eval sits between board and movelog). */
  showOpenings: boolean;
};

const STORAGE_KEY = "chess-tutor-settings";

const DEFAULTS: AppSettings = {
  showEvalBar: true,
  confirmEngineMove: false,
  showMoveQuality: true,
  showBestMoveOnReview: true,
  showOpenings: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      showEvalBar:
        typeof parsed.showEvalBar === "boolean" ? parsed.showEvalBar : DEFAULTS.showEvalBar,
      confirmEngineMove:
        typeof parsed.confirmEngineMove === "boolean"
          ? parsed.confirmEngineMove
          : DEFAULTS.confirmEngineMove,
      showMoveQuality:
        typeof parsed.showMoveQuality === "boolean"
          ? parsed.showMoveQuality
          : DEFAULTS.showMoveQuality,
      showBestMoveOnReview:
        typeof parsed.showBestMoveOnReview === "boolean"
          ? parsed.showBestMoveOnReview
          : DEFAULTS.showBestMoveOnReview,
      showOpenings:
        typeof parsed.showOpenings === "boolean" ? parsed.showOpenings : DEFAULTS.showOpenings,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

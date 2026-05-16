import { fetchOpeningWiki } from "./openingWiki";
import { getOpenings, lookupOpening } from "./openingsData";

export type OpeningPanelEls = {
  panel: HTMLElement;
  content: HTMLElement;
  name: HTMLElement;
  eco: HTMLElement;
  blurb: HTMLElement;
  wiki: HTMLElement;
};

let wikiToken = 0;

function clearPanelContent(els: OpeningPanelEls): void {
  els.eco.textContent = "";
  els.name.textContent = "";
  els.blurb.textContent = "";
  els.blurb.hidden = true;
  els.wiki.innerHTML = "";
  els.wiki.classList.remove("opening-panel__wiki--loading");
}

/**
 * Load opening wiki content when enabled. Calls `onResolved(true)` when there is
 * something to show (wiki HTML), otherwise `onResolved(false)`.
 */
export function refreshOpeningPanel(
  els: OpeningPanelEls,
  uciMoves: string[],
  sans: string[],
  enabled: boolean,
  onLayout?: () => void,
  onResolved?: (hasContent: boolean) => void,
): void {
  const token = ++wikiToken;
  const finish = (hasContent: boolean) => {
    onLayout?.();
    onResolved?.(hasContent);
  };

  if (!enabled) {
    clearPanelContent(els);
    finish(false);
    return;
  }

  if (uciMoves.length === 0) {
    clearPanelContent(els);
    finish(false);
    return;
  }

  clearPanelContent(els);
  const opening = lookupOpening(uciMoves, getOpenings());

  void fetchOpeningWiki(sans).then((html) => {
    if (token !== wikiToken) return;

    if (!html) {
      clearPanelContent(els);
      finish(false);
      return;
    }

    if (opening) {
      els.name.textContent = opening.name;
      els.eco.textContent = opening.eco;
    }

    els.wiki.innerHTML = html;
    const firstP = els.wiki.querySelector("p");
    if (firstP?.textContent) {
      els.blurb.textContent = firstP.textContent.trim();
      els.blurb.hidden = false;
      firstP.remove();
    }
    requestAnimationFrame(() => finish(true));
  });
}

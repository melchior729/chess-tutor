import { fetchOpeningWiki } from "./openingWiki";
import { getOpenings, lookupOpening } from "./openingsData";

export type OpeningPanelEls = {
  panel: HTMLElement;
  name: HTMLElement;
  eco: HTMLElement;
  blurb: HTMLElement;
  wiki: HTMLElement;
};

let wikiToken = 0;

function setPanelEmpty(els: OpeningPanelEls, empty: boolean): void {
  els.panel.classList.toggle("opening-panel--empty", empty);
}

function clearPanelContent(els: OpeningPanelEls): void {
  els.eco.textContent = "";
  els.name.textContent = "";
  els.blurb.textContent = "";
  els.blurb.hidden = true;
  els.wiki.innerHTML = "";
  els.wiki.classList.remove("opening-panel__wiki--loading");
  setPanelEmpty(els, true);
}

export function refreshOpeningPanel(
  els: OpeningPanelEls,
  uciMoves: string[],
  sans: string[],
  showOpenings: boolean,
  onLayout?: () => void,
): void {
  const token = ++wikiToken;

  if (!showOpenings) {
    clearPanelContent(els);
    onLayout?.();
    return;
  }

  if (uciMoves.length === 0) {
    clearPanelContent(els);
    onLayout?.();
    return;
  }

  clearPanelContent(els);
  const opening = lookupOpening(uciMoves, getOpenings());

  void fetchOpeningWiki(sans).then((html) => {
    if (token !== wikiToken) return;

    if (!html) {
      clearPanelContent(els);
      onLayout?.();
      return;
    }

    if (opening) {
      els.name.textContent = opening.name;
      els.eco.textContent = opening.eco;
    }

    els.wiki.innerHTML = html;
    setPanelEmpty(els, false);
    const firstP = els.wiki.querySelector("p");
    if (firstP?.textContent) {
      els.blurb.textContent = firstP.textContent.trim();
      els.blurb.hidden = false;
      firstP.remove();
    }
    requestAnimationFrame(() => onLayout?.());
  });
}

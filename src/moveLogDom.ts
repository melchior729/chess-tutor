import { BOOK_COLOR, BOOK_LABEL } from "./bookMove";
import type { MoveNode } from "./gameTree";
import { qualityColor, qualityLabel } from "./moveQuality";

function sanButton(node: MoveNode, active: boolean, onSelect: (n: MoveNode) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "movelog-table__san";
  b.textContent = node.san;
  if (node.isBook) {
    const book = document.createElement("span");
    book.className = "movelog__book";
    book.textContent = BOOK_LABEL;
    book.title = "Book move (Wikibooks opening theory)";
    book.style.color = BOOK_COLOR;
    b.appendChild(book);
  }
  if (node.quality) {
    const badge = document.createElement("span");
    badge.className = `movelog__quality movelog__quality--${node.quality}`;
    badge.textContent = qualityLabel(node.quality);
    badge.style.color = qualityColor(node.quality);
    b.appendChild(badge);
  }
  if (active) b.classList.add("movelog-table__san--active");
  b.addEventListener("click", () => onSelect(node));
  return b;
}

/**
 * Chess.com–style vertical list: one row per full move (number · White · Black).
 * Driven by `branchPath` — the active line from the root variation tree.
 */
export function renderMoveLog(
  container: HTMLElement,
  branchPath: MoveNode[],
  cursorDepth: number,
  onSelect: (node: MoveNode) => void,
): void {
  container.replaceChildren();

  const table = document.createElement("div");
  table.className = "movelog-table";

  const head = document.createElement("div");
  head.className = "movelog-table__row movelog-table__row--head";
  head.innerHTML = `<span>#</span><span>White</span><span>Black</span>`;
  table.appendChild(head);

  const fullMoves = Math.ceil(branchPath.length / 2);
  for (let mi = 0; mi < fullMoves; mi++) {
    const wi = mi * 2;
    const bi = mi * 2 + 1;
    const wm = branchPath[wi];
    const bm = branchPath[bi];

    const row = document.createElement("div");
    row.className = "movelog-table__row";

    const num = document.createElement("span");
    num.className = "movelog-table__num";
    num.textContent = String(mi + 1);

    const wCell = document.createElement("div");
    wCell.className = "movelog-table__cell";
    const bCell = document.createElement("div");
    bCell.className = "movelog-table__cell";

    if (wm) {
      const wActive = cursorDepth === wi + 1;
      wCell.appendChild(sanButton(wm, wActive, onSelect));
    } else {
      wCell.textContent = "—";
      wCell.classList.add("movelog-table__cell--empty");
    }

    if (bm) {
      const bActive = cursorDepth === bi + 1;
      bCell.appendChild(sanButton(bm, bActive, onSelect));
    } else if (wm) {
      bCell.textContent = "—";
      bCell.classList.add("movelog-table__cell--empty");
    } else {
      bCell.textContent = "—";
      bCell.classList.add("movelog-table__cell--empty");
    }

    row.append(num, wCell, bCell);
    table.appendChild(row);
  }

  container.appendChild(table);

  const activeBtn = container.querySelector<HTMLButtonElement>(".movelog-table__san--active");
  activeBtn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

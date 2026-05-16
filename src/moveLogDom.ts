import { BOOK_COLOR, BOOK_LABEL } from "./bookMove";
import type { MoveNode, RootNode } from "./gameTree";
import { pathFromRoot } from "./gameTree";
import { qualityColor, qualityLabel } from "./moveQuality";

function isCursorAtNode(branchPath: MoveNode[], cursorDepth: number, node: MoveNode): boolean {
  const pn = pathFromRoot(node);
  if (pn.length !== cursorDepth) return false;
  return pn.every((n, i) => branchPath[i]?.id === n.id);
}

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

function varButton(
  node: MoveNode,
  branchPath: MoveNode[],
  cursorDepth: number,
  onSelect: (n: MoveNode) => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "movelog-table__var";
  b.textContent = node.san;
  b.title = "Switch to this line";
  if (isCursorAtNode(branchPath, cursorDepth, node)) {
    b.classList.add("movelog-table__var--active");
  }
  b.addEventListener("click", () => onSelect(node));
  return b;
}

function appendSiblingVariations(
  cell: HTMLElement,
  parent: RootNode | MoveNode,
  onLine: MoveNode,
  branchPath: MoveNode[],
  cursorDepth: number,
  onSelect: (n: MoveNode) => void,
): void {
  const alts = parent.children.filter((c) => c.id !== onLine.id);
  if (!alts.length) return;
  const wrap = document.createElement("div");
  wrap.className = "movelog-table__vars";
  for (const alt of alts) {
    wrap.appendChild(varButton(alt, branchPath, cursorDepth, onSelect));
  }
  cell.appendChild(wrap);
}

/**
 * Chess.com–style vertical list: one row per full move (number · White · Black).
 * Shows sibling SANs so you can jump between branches in the variation tree.
 */
export function renderMoveLog(
  container: HTMLElement,
  treeRoot: RootNode,
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
      const wParent = wi === 0 ? treeRoot : branchPath[wi - 1]!;
      const wActive = cursorDepth === wi + 1;
      wCell.appendChild(sanButton(wm, wActive, onSelect));
      appendSiblingVariations(wCell, wParent, wm, branchPath, cursorDepth, onSelect);
    } else {
      wCell.textContent = "—";
      wCell.classList.add("movelog-table__cell--empty");
    }

    if (bm) {
      const bActive = cursorDepth === bi + 1;
      bCell.appendChild(sanButton(bm, bActive, onSelect));
      appendSiblingVariations(bCell, wm!, bm, branchPath, cursorDepth, onSelect);
    } else if (wm) {
      bCell.textContent = "—";
      bCell.classList.add("movelog-table__cell--empty");
      if (wm.children.length > 0) {
        const wrap = document.createElement("div");
        wrap.className = "movelog-table__vars";
        for (const child of wm.children) {
          wrap.appendChild(varButton(child, branchPath, cursorDepth, onSelect));
        }
        bCell.appendChild(wrap);
      }
    } else {
      bCell.textContent = "—";
      bCell.classList.add("movelog-table__cell--empty");
    }

    row.append(num, wCell, bCell);
    table.appendChild(row);
  }

  container.appendChild(table);

  const activeBtn = container.querySelector<HTMLButtonElement>(
    ".movelog-table__san--active, .movelog-table__var--active",
  );
  activeBtn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

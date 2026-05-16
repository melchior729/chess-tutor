import type { MoveNode } from "./gameTree";
import { pathsMatch, type SavedLine } from "./lineRegistry";

export function renderExplorerPanel(
  container: HTMLElement,
  lines: SavedLine[],
  activePath: MoveNode[],
  onActivate: (nodes: MoveNode[]) => void,
): void {
  container.replaceChildren();

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "explorer-panel__empty";
    empty.textContent = "Lines you play will appear here. Rewind and try a different move to create a branch.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "explorer-panel__list";

  for (const line of lines) {
    const li = document.createElement("li");
    li.className = "explorer-panel__item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "explorer-panel__line";
    if (pathsMatch(line.nodes, activePath)) {
      btn.classList.add("explorer-panel__line--active");
    }
    btn.title = line.label;

    const label = document.createElement("span");
    label.className = "explorer-panel__label";
    label.textContent = line.label;

    const meta = document.createElement("span");
    meta.className = "explorer-panel__meta";
    meta.textContent = `${line.nodes.length} ply`;

    btn.append(label, meta);
    btn.addEventListener("click", () => onActivate(line.nodes));
    li.appendChild(btn);
    list.appendChild(li);
  }

  container.appendChild(list);

  const activeBtn = list.querySelector<HTMLButtonElement>(".explorer-panel__line--active");
  activeBtn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

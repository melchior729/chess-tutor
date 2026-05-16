const WIKI_BOOKS_URL = "https://en.wikibooks.org";
const API_ARGS =
  "redirects&origin=*&action=query&prop=extracts&formatversion=2&format=json";

const wikiCache = new Map<string, string>();
const wikiExistsCache = new Map<string, boolean>();

function cacheWikiResult(title: string, html: string | null): void {
  if (html) {
    wikiCache.set(title, html);
    wikiExistsCache.set(title, true);
  } else {
    wikiCache.set(title, "");
    wikiExistsCache.set(title, false);
  }
}

/** Whether Wikibooks has an opening-theory article for this exact move sequence. */
export async function hasWikiArticle(sans: string[]): Promise<boolean> {
  const title = wikiTitleFromSans(sans);
  if (!title) return false;

  if (wikiExistsCache.has(title)) return wikiExistsCache.get(title)!;

  const cachedHtml = wikiCache.get(title);
  if (cachedHtml !== undefined) return cachedHtml !== "";

  try {
    const res = await fetch(
      `${WIKI_BOOKS_URL}/w/api.php?titles=${encodeURIComponent(title)}&${API_ARGS}`,
    );
    if (!res.ok) return false;
    const json = (await res.json()) as {
      query?: { pages?: { missing?: boolean; extract?: string }[] };
    };
    const page = json.query?.pages?.[0];
    const exists = !!(page && !page.missing && page.extract);
    wikiExistsCache.set(title, exists);
    return exists;
  } catch {
    return false;
  }
}

/** Wikibooks path title for the current line (same rules as lichess.org ui/opening). */
export function wikiTitleFromSans(sans: string[]): string | null {
  if (sans.length === 0 || sans.length > 30) return null;
  const plyPrefix = (ply: number) => `${Math.floor((ply + 1) / 2)}${ply % 2 === 1 ? "._" : "..."}`;
  const pathParts = sans.map((san, i) => `${plyPrefix(i + 1)}${san}`);
  const path = pathParts.join("/").replace(/[+!#?]/g, "");
  if (!path || path.length > 255 - 21) return null;
  return `Chess_Opening_Theory/${path}`;
}

function transformWikiHtml(html: string, title: string): string {
  let out = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "");
  out = out.replace(/<p>(\s|&nbsp;)*<\/p>/gi, "");
  out = out.replace(/ Theory table<\/h2>[\s\S]*?(?=<h2|$)/gi, "");
  out = out.replace(/ All possible Black's moves<\/h2>[\s\S]*?(?=<h2|$)/gi, "");
  out = out.replace(/ All possible replies<\/h3>[\s\S]*?(?=<h3|<h2|$)/gi, "");
  out = out.replace(/ External links<\/h2>[\s\S]*?(?=<h2|$)/gi, "");
  out = out.replace(
    "When contributing to this Wikibook, please follow the Conventions for organization.",
    "",
  );
  const readMoreUrl = `${WIKI_BOOKS_URL}/wiki/${encodeURIComponent(title.replace(/_/g, " "))}`;
  out += `<p class="opening-panel__read-more"><a href="${readMoreUrl}" target="_blank" rel="noopener noreferrer">Read more on Wikibooks</a></p>`;
  return out;
}

export async function fetchOpeningWiki(sans: string[]): Promise<string | null> {
  const title = wikiTitleFromSans(sans);
  if (!title) return null;

  const cached = wikiCache.get(title);
  if (cached !== undefined) return cached || null;

  if (wikiExistsCache.get(title) === false) return null;

  try {
    const res = await fetch(
      `${WIKI_BOOKS_URL}/w/api.php?titles=${encodeURIComponent(title)}&${API_ARGS}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: { pages?: { missing?: boolean; extract?: string }[] };
    };
    const page = json.query?.pages?.[0];
    if (!page || page.missing || !page.extract) {
      cacheWikiResult(title, null);
      return null;
    }
    const html = transformWikiHtml(page.extract, title);
    cacheWikiResult(title, html);
    return html;
  } catch {
    return null;
  }
}

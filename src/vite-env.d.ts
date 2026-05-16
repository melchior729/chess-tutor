/// <reference types="vite/client" />

interface HTMLScriptElement {
  /** Stockfish.js attaches its factory here after the script loads. */
  _exports?: (opts: { locateFile: (path: string) => string }) => Promise<unknown>;
}

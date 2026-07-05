import { isStyleChange, type StyleChange } from "@ui-buddy/shared";

export type PageContext = {
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

const PAGE_CONTEXT_KEY = "uiDevtoolsPageContext";

const isPageContext = (value: unknown): value is PageContext => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PageContext>;
  return (
    typeof candidate.pageUrl === "string" &&
    typeof candidate.viewport?.width === "number" &&
    typeof candidate.viewport.height === "number" &&
    typeof candidate.viewport.devicePixelRatio === "number"
  );
};

export const writePageContext = async (context: PageContext): Promise<void> => {
  try {
    await chrome.storage.session.set({ [PAGE_CONTEXT_KEY]: context });
  } catch {
    // The extension was reloaded while this page kept the old content script.
  }
};

export const readPageContext = async (): Promise<PageContext | null> => {
  const result = await chrome.storage.session.get(PAGE_CONTEXT_KEY);
  const value = result[PAGE_CONTEXT_KEY];
  return isPageContext(value) ? value : null;
};

// ── Persisted CSS-family edits (survive page reloads) ───────────
// Style + raw CSS edits are selector-based, so they can be re-injected after a
// reload. Stored in chrome.storage.session (cleared when the browser closes),
// keyed per page so a refresh doesn't lose in-progress work.

export type PersistedRawCss = { selector: string; css: string };

export type PersistedEdits = {
  styleChanges: StyleChange[];
  rawCss: PersistedRawCss[];
  savedAt: number;
};

const EDITS_KEY_PREFIX = "ubEdits:";

/** Stable per-page key (ignores query/hash so a refresh still matches). */
export const currentEditsUrl = (): string => `${location.origin}${location.pathname}`;

const editsKey = (url: string): string => `${EDITS_KEY_PREFIX}${url}`;

const isPersistedEdits = (value: unknown): value is PersistedEdits => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PersistedEdits>;
  return (
    Array.isArray(candidate.styleChanges) &&
    candidate.styleChanges.every(isStyleChange) &&
    Array.isArray(candidate.rawCss) &&
    candidate.rawCss.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as PersistedRawCss).selector === "string" &&
        typeof (entry as PersistedRawCss).css === "string",
    )
  );
};

export const persistEdits = async (
  url: string,
  edits: Pick<PersistedEdits, "styleChanges" | "rawCss">,
): Promise<void> => {
  try {
    if (edits.styleChanges.length === 0 && edits.rawCss.length === 0) {
      await chrome.storage.session.remove(editsKey(url));
      return;
    }

    await chrome.storage.session.set({
      [editsKey(url)]: { ...edits, savedAt: Date.now() } satisfies PersistedEdits,
    });
  } catch {
    // Extension reloaded while this page kept the old content script.
  }
};

export const loadEdits = async (url: string): Promise<PersistedEdits | null> => {
  try {
    const result = await chrome.storage.session.get(editsKey(url));
    const value = result[editsKey(url)];
    return isPersistedEdits(value) ? value : null;
  } catch {
    return null;
  }
};

export const clearEdits = async (url: string): Promise<void> => {
  try {
    await chrome.storage.session.remove(editsKey(url));
  } catch {
    // Non-fatal.
  }
};

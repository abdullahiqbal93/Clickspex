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
  await chrome.storage.session.set({ [PAGE_CONTEXT_KEY]: context });
};

export const readPageContext = async (): Promise<PageContext | null> => {
  const result = await chrome.storage.session.get(PAGE_CONTEXT_KEY);
  const value = result[PAGE_CONTEXT_KEY];
  return isPageContext(value) ? value : null;
};

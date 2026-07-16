import { afterEach, describe, expect, it, vi } from "vitest";

import { scanPage } from "./pageScanner";

const createComputedStyle = (): CSSStyleDeclaration =>
  ({
    length: 0,
    item: () => "",
    display: "block",
    visibility: "visible",
    opacity: "1",
    backgroundImage: "none",
    getPropertyValue: (property: string) => {
      if (property === "font-family") {
        return "Inter";
      }

      if (property === "font-size") {
        return "16px";
      }

      if (property === "font-weight") {
        return "400";
      }

      return "";
    },
  }) as unknown as CSSStyleDeclaration;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("page scanner Phase 9 performance budget", () => {
  it("stops expensive element style collection when the scan time budget is exhausted", () => {
    document.body.innerHTML = Array.from({ length: 250 }, (_, index) => `<div>${index}</div>`).join(
      "",
    );
    let now = 0;
    const style = createComputedStyle();
    const getComputedStyleMock = vi.fn(() => style);

    vi.spyOn(performance, "now").mockImplementation(() => {
      now += 100;
      return now;
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(getComputedStyleMock);
    vi.stubGlobal("getComputedStyle", getComputedStyleMock);

    const result = scanPage();

    expect(result.fonts[0]).toMatchObject({ family: "Inter" });
    expect(getComputedStyleMock.mock.calls.length).toBeLessThan(10);
  });
});

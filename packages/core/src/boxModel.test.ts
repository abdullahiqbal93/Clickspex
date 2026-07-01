import { describe, expect, it } from "vitest";

import { parseBoxModel, parsePixelValue } from "./boxModel";

describe("box model parsing", () => {
  it("normalizes numeric CSS lengths and reads sides from a style record", () => {
    const boxModel = parseBoxModel({
      "margin-top": "1",
      "margin-right": "2px",
      "margin-bottom": "auto",
      "margin-left": "",
      "border-top-width": "3px",
      "border-right-width": "4px",
      "border-bottom-width": "5px",
      "border-left-width": "6px",
      "padding-top": "7px",
      "padding-right": "8px",
      "padding-bottom": "9px",
      "padding-left": "10px",
      width: "120px",
      height: "44px",
    });

    expect(boxModel.margin).toEqual({ top: "1px", right: "2px", bottom: "auto", left: "0px" });
    expect(boxModel.border.left).toBe("6px");
    expect(boxModel.padding.bottom).toBe("9px");
    expect(boxModel.content).toEqual({ width: "120px", height: "44px" });
  });

  it("parses invalid pixel strings as zero", () => {
    expect(parsePixelValue("auto")).toBe(0);
  });
});

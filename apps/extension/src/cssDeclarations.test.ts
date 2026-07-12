import { describe, expect, it } from "vitest";

import {
  buildImportantCssDeclarations,
  isCssDeclarationValid,
  parseCssDeclarations,
  serializeCssDeclarations,
} from "./cssDeclarations";

describe("CSS declaration utilities", () => {
  it("parses quoted semicolons, functions, custom properties, and disabled declarations", () => {
    expect(
      parseCssDeclarations(
        'background-image: url("data:image/svg+xml;charset=utf-8;demo"); color: red; /* display: none; */ --brand: #05f;',
      ),
    ).toEqual([
      {
        property: "background-image",
        value: 'url("data:image/svg+xml;charset=utf-8;demo")',
        enabled: true,
      },
      { property: "color", value: "red", enabled: true },
      { property: "display", value: "none", enabled: false },
      { property: "--brand", value: "#05f", enabled: true },
    ]);
  });

  it("serializes disabled declarations and excludes them from live important CSS", () => {
    const css = serializeCssDeclarations([
      { property: "color", value: "red", enabled: true },
      { property: "display", value: "none", enabled: false },
      { property: "opacity", value: "0.5 !important", enabled: true },
    ]);

    expect(css).toBe("color: red;\n/* display: none; */\nopacity: 0.5 !important;");
    expect(buildImportantCssDeclarations(css)).toBe(
      "  color: red !important;\n  opacity: 0.5 !important;",
    );
  });

  it("validates custom properties and rejects incomplete declarations", () => {
    expect(isCssDeclarationValid({ property: "--brand", value: "#05f", enabled: true })).toBe(true);
    expect(isCssDeclarationValid({ property: "color", value: "", enabled: true })).toBe(false);
    expect(isCssDeclarationValid({ property: "bad property", value: "1", enabled: true })).toBe(
      false,
    );
  });
});

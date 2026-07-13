import { afterEach, describe, expect, it } from "vitest";

import { calculateSpecificity, collectMatchedStyles } from "./matchedStyles";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("matched style collection", () => {
  it("reports cascade winners, potential state rules, inline styles, and inherited declarations", () => {
    document.head.innerHTML = `
      <style id="theme">
        :root { --brand: #7c3aed; }
        .parent { font-family: Inter; margin: 20px; }
        .card { color: red; padding: 4px; }
        #target { color: blue; }
        .card:hover { color: green; }
      </style>
    `;
    document.body.innerHTML = `
      <div class="parent">
        <button id="target" class="card" style="background-color: white">Save</button>
      </div>
    `;

    const target = document.querySelector("#target");

    if (target === null) {
      throw new Error("Missing target fixture");
    }

    const result = collectMatchedStyles(target);
    const targetRule = result.rules.find((rule) => rule.selector === "#target");
    const classRule = result.rules.find((rule) => rule.selector === ".card");
    const hoverRule = result.rules.find((rule) => rule.selector === ".card:hover");
    const inline = result.rules.find((rule) => rule.origin === "inline");
    const inherited = result.rules.find((rule) => rule.selector === ".parent");

    expect(result.selector).toBe("#target");
    expect(targetRule?.declarations.find((item) => item.property === "color")?.overridden).toBe(
      false,
    );
    expect(classRule?.declarations.find((item) => item.property === "color")?.overridden).toBe(
      true,
    );
    expect(hoverRule?.active).toBe(false);
    expect(inline?.declarations[0]?.property).toBe("background-color");
    expect(inherited?.inheritedFrom?.tagName).toBe("div");
    expect(inherited?.declarations.some((item) => item.property === "font-family")).toBe(true);
    expect(inherited?.declarations.some((item) => item.property === "margin")).toBe(false);
    expect(result.variables["--brand"]).toBe("#7c3aed");
  });

  it("gives IDs more weight than classes and types", () => {
    expect(calculateSpecificity("#app .card button")).toEqual([1, 1, 1]);
    expect(calculateSpecificity(".card:hover")).toEqual([0, 2, 0]);
    expect(calculateSpecificity(":where(#app) button")).toEqual([0, 0, 1]);
  });
});

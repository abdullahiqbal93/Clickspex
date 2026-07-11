import { describe, expect, it } from "vitest";

import { flattenVisibleDomNodes } from "./DomTreePanel";

import type { DomTreeNode } from "@ui-buddy/shared";

const node = (selector: string, childCount = 0): DomTreeNode => ({
  selector,
  domPath: selector,
  tagName: selector === "html" ? "html" : "div",
  id: selector.startsWith("#") ? selector.slice(1) : "",
  classList: [],
  attributes: {},
  textPreview: "",
  childCount,
  visible: true,
});

describe("DOM tree navigation", () => {
  it("flattens only expanded branches and preserves parent relationships", () => {
    const root = node("html", 1);
    const body = node("body", 1);
    const selected = node("#save");

    expect(
      flattenVisibleDomNodes(root, new Set(), {
        html: [body],
        body: [selected],
      }).map((entry) => entry.node.selector),
    ).toEqual(["html"]);

    expect(
      flattenVisibleDomNodes(root, new Set(["html", "body"]), {
        html: [body],
        body: [selected],
      }),
    ).toEqual([
      { node: root, depth: 0, parentSelector: null },
      { node: body, depth: 1, parentSelector: "html" },
      { node: selected, depth: 2, parentSelector: "body" },
    ]);
  });
});

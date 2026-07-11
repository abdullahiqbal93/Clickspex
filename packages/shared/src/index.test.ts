import { describe, expect, it } from "vitest";

import { isExtensionMessage } from "./index";

const node = {
  selector: "#save",
  domPath: "html > body > button#save",
  tagName: "button",
  id: "save",
  classList: ["button"],
  attributes: { "aria-label": "Save" },
  textPreview: "Save",
  childCount: 0,
  visible: true,
};

describe("DOM extension messages", () => {
  it("accepts DOM context and attribute-edit messages", () => {
    expect(isExtensionMessage({ type: "DOM_CONTEXT_REQUEST" })).toBe(true);
    expect(isExtensionMessage({ type: "DOM_TREE_SUBSCRIBE" })).toBe(true);
    expect(isExtensionMessage({ type: "DOM_TREE_UNSUBSCRIBE" })).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CONTEXT_RESULT",
        payload: {
          ancestry: [node],
          children: [],
          childrenBySelector: {},
          selectedSelector: "#save",
        },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CHILDREN_REQUEST",
        payload: { selector: "#save", includeAll: true },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CHILDREN_RESULT",
        payload: { selector: "#save", children: [node] },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "UPDATE_ELEMENT_ATTRIBUTE",
        payload: { selector: "#save", name: "aria-label", value: "Save profile" },
      }),
    ).toBe(true);
  });

  it("rejects malformed DOM payloads", () => {
    expect(
      isExtensionMessage({
        type: "DOM_CONTEXT_RESULT",
        payload: {
          ancestry: [{ ...node, childCount: "0" }],
          children: [],
          childrenBySelector: {},
          selectedSelector: "#save",
        },
      }),
    ).toBe(false);
    expect(
      isExtensionMessage({
        type: "UPDATE_ELEMENT_ATTRIBUTE",
        payload: { selector: "#save", name: "aria-label", value: 42 },
      }),
    ).toBe(false);
  });
});

import { describe, expect, it, beforeEach } from "vitest";

import { generateUniqueSelector, getDomPath } from "./selector";

const getElement = <TElement extends Element>(selector: string): TElement => {
  const element = document.querySelector<TElement>(selector);

  if (element === null) {
    throw new Error(`Missing fixture element: ${selector}`);
  }

  return element;
};

describe("generateUniqueSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("uses the shortest unique id selector when available", () => {
    document.body.innerHTML = `<main><button id="save-button" class="primary">Save</button></main>`;

    const button = getElement<HTMLButtonElement>("button");

    expect(generateUniqueSelector(button)).toBe("#save-button");
  });

  it("produces a queryable selector for ids with special characters", () => {
    document.body.innerHTML = `<section><button id="save:primary">Save</button></section>`;

    const button = getElement<HTMLButtonElement>("button");
    const selector = generateUniqueSelector(button);

    expect(document.querySelector(selector)).toBe(button);
  });

  it("anchors on a stable ancestor id instead of a positional path", () => {
    document.body.innerHTML = `
      <div id="panel"><a><button class="cta">Buy</button></a></div>
      <div><a><button class="cta">Other</button></a></div>
    `;

    const target = getElement<HTMLButtonElement>("#panel button.cta");
    const selector = generateUniqueSelector(target);

    expect(selector).toBe("#panel button.cta");
    expect(document.querySelector(selector)).toBe(target);
    expect(selector).not.toContain(":nth-of-type(");
  });

  it("falls back to an nth-of-type path for repeated sibling elements", () => {
    document.body.innerHTML = `
      <section class="toolbar">
        <button class="tool">One</button>
        <button class="tool">Two</button>
      </section>
    `;

    const secondButton = getElement<HTMLButtonElement>("button:nth-of-type(2)");
    const selector = generateUniqueSelector(secondButton);

    expect(document.querySelector(selector)).toBe(secondButton);
    expect(selector).toContain(":nth-of-type(2)");
  });
});

describe("getDomPath", () => {
  it("returns a readable tag path with ids and nth positions", () => {
    document.body.innerHTML = `<main id="app"><section><button>Save</button></section></main>`;

    expect(getDomPath(getElement("button"))).toContain("main#app:nth-of-type(1)");
  });
});

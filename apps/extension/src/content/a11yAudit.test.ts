import { beforeEach, describe, expect, it } from "vitest";

import { runA11yAudit } from "./a11yAudit";

const issueTitles = () => runA11yAudit().map((issue) => issue.title);

describe("runA11yAudit", () => {
  beforeEach(() => {
    document.documentElement.lang = "en";
    document.body.innerHTML = "";
  });

  it("does not treat placeholder text as an input label", () => {
    document.body.innerHTML = '<input id="email" placeholder="Email address">';

    expect(issueTitles()).toContain("Input without a label");
  });

  it("uses native label association for unusual ids", () => {
    document.body.innerHTML = '<label for="billing.email">Email</label><input id="billing.email">';

    expect(issueTitles()).not.toContain("Input without a label");
  });

  it("skips disabled, hidden, and inert controls", () => {
    document.body.innerHTML = [
      '<input id="disabled" disabled>',
      '<input id="hidden" hidden>',
      '<div inert><button id="inert-button"></button></div>',
      '<button id="visible-button"></button>',
    ].join("");

    const issues = runA11yAudit();

    expect(issues.some((issue) => issue.selector === "#disabled")).toBe(false);
    expect(issues.some((issue) => issue.selector === "#hidden")).toBe(false);
    expect(issues.some((issue) => issue.selector === "#inert-button")).toBe(false);
    expect(issues.some((issue) => issue.selector === "#visible-button")).toBe(true);
  });
});

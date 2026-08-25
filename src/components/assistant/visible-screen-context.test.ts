import { afterEach, describe, expect, it } from "vitest";

import { captureVisibleScreenText } from "./visible-screen-context";

describe("captureVisibleScreenText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("captures rendered page copy without hidden content or form values", () => {
    document.body.innerHTML = `
      <main id="portal-content">
        <h1>Employment history</h1>
        <p>Employment record complete</p>
        <p>Date of exit: 2027-01-31</p>
        <p hidden>Exit date missing</p>
        <label>Account number <input value="123456789012" /></label>
      </main>
    `;

    const text = captureVisibleScreenText();

    expect(text).toContain("Employment history");
    expect(text).toContain("Employment record complete");
    expect(text).toContain("Date of exit: 2027-01-31");
    expect(text).toContain("Account number");
    expect(text).not.toContain("Exit date missing");
    expect(text).not.toContain("123456789012");
  });
});

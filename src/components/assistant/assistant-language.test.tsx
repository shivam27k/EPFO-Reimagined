import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { containsForbiddenScript, SafeBilingualText } from "./assistant-language";

describe("SafeBilingualText", () => {
  it("keeps English captions visible", () => {
    render(<SafeBilingualText text="Your passbook is ready." />);

    expect(screen.getByText("Your passbook is ready.")).toBeVisible();
    expect(document.querySelector(".assistant-text-hindi")).toBeNull();
  });

  it("renders Devanagari captions in the Hindi font span", () => {
    render(<SafeBilingualText text="आपका पासबुक तैयार है।" />);

    expect(screen.getByText("आपका")).toHaveClass("assistant-text-hindi");
    expect(screen.getByText("पासबुक")).toHaveClass("assistant-text-hindi");
  });

  it("splits mixed Hinglish captions into English and Hindi font runs", () => {
    const { container } = render(<SafeBilingualText text="Your passbook तैयार है." />);

    expect(screen.getByText("Your passbook")).toHaveClass("assistant-text-english");
    expect(screen.getByText("तैयार")).toHaveClass("assistant-text-hindi");
    expect(screen.getByText("है")).toHaveClass("assistant-text-hindi");
    expect(container.querySelectorAll(".assistant-text-english")).toHaveLength(3);
    expect(container.querySelectorAll(".assistant-text-hindi")).toHaveLength(2);
  });

  it("replaces Arabic and Perso-Arabic captions instead of rendering them", () => {
    render(<SafeBilingualText text="یہ متن ظاہر نہیں ہونا چاہیے" />);

    expect(screen.getByText("Speech received in an unsupported script. Please speak in English or Hindi.")).toBeVisible();
    expect(screen.queryByText("یہ متن ظاہر نہیں ہونا چاہیے")).toBeNull();
    expect(containsForbiddenScript("یہ متن ظاہر نہیں ہونا چاہیے")).toBe(true);
  });
});

import { render, screen } from "@testing-library/react";

import { AssistantMessage } from "./assistant-message";

describe("AssistantMessage bilingual Markdown", () => {
  test("applies bilingual spans to text unwrapped from a Markdown heading", () => {
    const { container } = render(<AssistantMessage role="assistant" text="# आपका passbook" />);
    const content = container.querySelector(".assistant-message-content");

    expect(content).toHaveTextContent("आपका passbook");
    expect(content?.querySelector(".assistant-text-hindi")).toHaveTextContent("आपका");
    expect(content?.querySelector(".assistant-text-english")).toHaveTextContent("passbook");
  });

  test("blocks forbidden text inside an unwrapped Markdown heading", () => {
    render(<AssistantMessage role="assistant" text="# سلام" />);

    expect(screen.getByText("Speech received in an unsupported script. Please speak in English or Hindi.")).toBeInTheDocument();
    expect(screen.queryByText("سلام")).not.toBeInTheDocument();
  });
});

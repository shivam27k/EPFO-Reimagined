import Markdown from "react-markdown";

export function AssistantMessage({ role, text, source }: { role: "member" | "assistant"; text: string; source?: "openai" | "fallback" }) {
  return (
    <article className="assistant-message" data-role={role}>
      <strong className="assistant-message-author">{role === "member" ? "You" : "EPF Sahayak"}</strong>
      {role === "assistant" ? (
        <div className="assistant-message-content">
          <Markdown
            allowedElements={["p", "strong", "em", "ul", "ol", "li", "code", "br"]}
            unwrapDisallowed
          >
            {text}
          </Markdown>
        </div>
      ) : (
        <p className="assistant-message-content">{text}</p>
      )}
      {role === "assistant" && source ? (
        <small className="assistant-message-source">{source === "openai" ? "OpenAI response grounded in this masked demo record" : "Built-in grounded fallback"}</small>
      ) : null}
    </article>
  );
}

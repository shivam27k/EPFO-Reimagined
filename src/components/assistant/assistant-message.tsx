import { Children, type ReactNode } from "react";
import Markdown from "react-markdown";

import { containsForbiddenScript, SafeBilingualText } from "./assistant-language";

function renderSafeChildren(children: ReactNode) {
  return Children.map(children, (child) => typeof child === "string" ? <SafeBilingualText text={child} /> : child);
}

export function AssistantMessage({ role, text, source }: { role: "member" | "assistant"; text: string; source?: "openai" | "fallback" }) {
  return (
    <article className="assistant-message" data-role={role}>
      <strong className="assistant-message-author">{role === "member" ? "You" : "EPF Sahayak"}</strong>
      {role === "assistant" ? (
        <div className="assistant-message-content">
          {containsForbiddenScript(text) ? <p><SafeBilingualText text={text} /></p> : (
            <Markdown
              allowedElements={["p", "strong", "em", "ul", "ol", "li", "code", "br"]}
              components={{
                code: ({ children }) => <code>{renderSafeChildren(children)}</code>,
                em: ({ children }) => <em>{renderSafeChildren(children)}</em>,
                li: ({ children }) => <li>{renderSafeChildren(children)}</li>,
                p: ({ children }) => <p>{renderSafeChildren(children)}</p>,
                strong: ({ children }) => <strong>{renderSafeChildren(children)}</strong>,
              }}
              unwrapDisallowed
            >
              {text}
            </Markdown>
          )}
        </div>
      ) : (
        <p className="assistant-message-content"><SafeBilingualText text={text} /></p>
      )}
      {role === "assistant" && source ? (
        <small className="assistant-message-source">{source === "openai" ? "OpenAI response grounded in this masked demo record" : "Built-in grounded fallback"}</small>
      ) : null}
    </article>
  );
}

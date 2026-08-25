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
              components={{
                a: ({ children }) => <>{renderSafeChildren(children)}</>,
                blockquote: ({ children }) => <>{renderSafeChildren(children)}</>,
                br: () => <br />,
                code: ({ children }) => <code>{renderSafeChildren(children)}</code>,
                em: ({ children }) => <em>{renderSafeChildren(children)}</em>,
                h1: ({ children }) => <>{renderSafeChildren(children)}</>,
                h2: ({ children }) => <>{renderSafeChildren(children)}</>,
                h3: ({ children }) => <>{renderSafeChildren(children)}</>,
                h4: ({ children }) => <>{renderSafeChildren(children)}</>,
                h5: ({ children }) => <>{renderSafeChildren(children)}</>,
                h6: ({ children }) => <>{renderSafeChildren(children)}</>,
                hr: () => null,
                img: () => null,
                li: ({ children }) => <li>{renderSafeChildren(children)}</li>,
                ol: ({ children }) => <ol>{renderSafeChildren(children)}</ol>,
                p: ({ children }) => <p>{renderSafeChildren(children)}</p>,
                pre: ({ children }) => <pre>{renderSafeChildren(children)}</pre>,
                strong: ({ children }) => <strong>{renderSafeChildren(children)}</strong>,
                ul: ({ children }) => <ul>{renderSafeChildren(children)}</ul>,
              }}
              skipHtml
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

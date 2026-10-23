"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Copy, Check, Terminal, FileCode } from "lucide-react";

interface Props {
  content: string;
  isStreaming?: boolean;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const cleanLang = (lang || "code").toLowerCase();

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span className="md-code-lang">
          <Terminal size={12} className="md-code-icon" />
          {cleanLang}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="md-code-copy-btn"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Regex to match inline code (`code`), bold (**bold**), and italic (*italic*)
  const tokens: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push(
        <code key={match.index} className="inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      tokens.push(
        <strong key={match.index} className="md-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      tokens.push(
        <em key={match.index} className="md-italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    const rest = text.slice(lastIdx);
    // Handle streaming unclosed inline backtick (e.g. `docker run ...)
    if (rest.startsWith("`")) {
      tokens.push(
        <code key="stream-unclosed-code" className="inline-code streaming-code">
          {rest.slice(1)}
        </code>
      );
    } else {
      tokens.push(rest);
    }
  }

  return tokens;
}

export function StreamingMarkdown({ content, isStreaming }: Props) {
  const blocks = useMemo(() => {
    if (!content) return [];

    // Parse code blocks vs regular markdown blocks
    // Supports closed ```lang\ncode``` AND streaming unclosed ```lang\ncode
    const result: Array<{
      type: "code" | "markdown";
      code?: string;
      lang?: string;
      text?: string;
    }> = [];

    const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)(?:```|$)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(content)) !== null) {
      if (match.index > lastIdx) {
        const mdText = content.slice(lastIdx, match.index).trim();
        if (mdText) {
          result.push({ type: "markdown", text: mdText });
        }
      }
      result.push({
        type: "code",
        lang: match[1] || "bash",
        code: match[2].trimEnd(),
      });
      lastIdx = fenceRegex.lastIndex;
    }

    if (lastIdx < content.length) {
      const rest = content.slice(lastIdx).trim();
      if (rest) {
        result.push({ type: "markdown", text: rest });
      }
    }

    return result;
  }, [content]);

  return (
    <div className="streaming-markdown">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <CodeBlock
              key={idx}
              code={block.code || ""}
              lang={block.lang || "bash"}
            />
          );
        }

        // Render markdown lines: headers, lists, paragraphs
        const lines = (block.text || "").split("\n");
        const renderedElements: React.ReactNode[] = [];
        let listBuffer: Array<{ num?: string; text: string }> = [];
        let isOrdered = false;

        const flushList = (listKey: string) => {
          if (listBuffer.length === 0) return;
          if (isOrdered) {
            renderedElements.push(
              <ol key={listKey} className="md-ordered-list">
                {listBuffer.map((item, i) => (
                  <li key={i}>{renderInline(item.text)}</li>
                ))}
              </ol>
            );
          } else {
            renderedElements.push(
              <ul key={listKey} className="md-bullet-list">
                {listBuffer.map((item, i) => (
                  <li key={i}>{renderInline(item.text)}</li>
                ))}
              </ul>
            );
          }
          listBuffer = [];
          isOrdered = false;
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();

          // Bullet item
          if (/^[-*•]\s+/.test(trimmed)) {
            if (isOrdered) flushList(`flush-ol-${lineIdx}`);
            listBuffer.push({ text: trimmed.replace(/^[-*•]\s+/, "") });
            return;
          }

          // Numbered item
          const numMatch = /^(\d+)[.)]\s+/.exec(trimmed);
          if (numMatch) {
            if (!isOrdered && listBuffer.length > 0) flushList(`flush-ul-${lineIdx}`);
            isOrdered = true;
            listBuffer.push({ num: numMatch[1], text: trimmed.slice(numMatch[0].length) });
            return;
          }

          // Not a list item, flush any buffered list
          flushList(`flush-${lineIdx}`);

          if (!trimmed) {
            // Blank line spacing
            renderedElements.push(<div key={`blank-${lineIdx}`} className="md-spacing" />);
            return;
          }

          // Headings
          if (trimmed.startsWith("### ")) {
            renderedElements.push(
              <h3 key={lineIdx} className="md-h3">
                {renderInline(trimmed.slice(4))}
              </h3>
            );
          } else if (trimmed.startsWith("## ")) {
            renderedElements.push(
              <h2 key={lineIdx} className="md-h2">
                {renderInline(trimmed.slice(3))}
              </h2>
            );
          } else if (trimmed.startsWith("# ")) {
            renderedElements.push(
              <h1 key={lineIdx} className="md-h1">
                {renderInline(trimmed.slice(2))}
              </h1>
            );
          } else if (trimmed.startsWith("> ")) {
            renderedElements.push(
              <blockquote key={lineIdx} className="md-blockquote">
                {renderInline(trimmed.slice(2))}
              </blockquote>
            );
          } else {
            // Regular paragraph line
            renderedElements.push(
              <p key={lineIdx} className="md-paragraph">
                {renderInline(line)}
              </p>
            );
          }
        });

        flushList(`final-flush-${idx}`);

        return <div key={idx} className="md-section">{renderedElements}</div>;
      })}
      {isStreaming && <span className="streaming-cursor" />}
    </div>
  );
}

export default StreamingMarkdown;

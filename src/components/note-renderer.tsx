import { createElement, type ReactNode } from "react";
import type { NoteNode } from "../lib/types";
import { normalizeDocument } from "../core/note-document.cjs";
export function NoteDocument({ document }: { document: NoteNode | null }) {
  let safe: NoteNode | null;
  try {
    safe = normalizeDocument(document);
  } catch {
    return <p>This note contains unsupported formatting.</p>;
  }
  function render(node: NoteNode, key: number): ReactNode {
    if (node.type === "text")
      return (node.marks || []).reduce<ReactNode>(
        (child, mark) =>
          createElement(
            (
              {
                bold: "strong",
                italic: "em",
                underline: "u",
                strike: "s",
                code: "code",
              } as Record<string, string>
            )[mark.type],
            { key },
            child,
          ),
        node.text || "",
      );
    if (node.type === "hardBreak") return <br key={key} />;
    const children = node.content?.map(render);
    if (node.type === "doc") return children;
    const tag =
      node.type === "heading"
        ? `h${node.attrs?.level}`
        : (
            {
              paragraph: "p",
              blockquote: "blockquote",
              bulletList: "ul",
              orderedList: "ol",
              listItem: "li",
            } as Record<string, string>
          )[node.type];
    return createElement(
      tag,
      {
        key,
        ...(node.type === "orderedList"
          ? { start: node.attrs?.start || 1 }
          : {}),
      },
      children,
    );
  }
  return <div className="note-prose">{safe ? render(safe, 0) : null}</div>;
}

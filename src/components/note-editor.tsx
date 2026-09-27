"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import type { NoteNode } from "../lib/types";
export default function NoteEditor({
  initial,
  onChange,
  disabled,
}: {
  initial: NoteNode;
  onChange: (doc: NoteNode) => void;
  disabled: boolean;
}) {
  const [, render] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
        codeBlock: false,
        horizontalRule: false,
        trailingNode: false,
      }),
    ],
    content: initial,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Note content",
        "aria-multiline": "true",
        class: "note-prose note-input",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as NoteNode),
    onTransaction: () => render((n) => n + 1),
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  if (!editor) return <p role="status">Loading editor…</p>;
  const tools = [
    {
      name: "Paragraph",
      active: editor.isActive("paragraph"),
      run: () => editor.chain().focus().setParagraph().run(),
    },
    {
      name: "Heading",
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      name: "Subheading",
      active: editor.isActive("heading", { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      name: "Bold",
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      name: "Italic",
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      name: "Underline",
      active: editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      name: "Bulleted list",
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      name: "Numbered list",
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      name: "Quote",
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];
  return (
    <div className="note-editor">
      <div role="group" aria-label="Text formatting" className="note-toolbar">
        {tools.map((t) => (
          <Button
            key={t.name}
            type="button"
            size="sm"
            variant={t.active ? "default" : "outline"}
            aria-pressed={t.active}
            disabled={disabled}
            onClick={t.run}
          >
            {t.name}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          Redo
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

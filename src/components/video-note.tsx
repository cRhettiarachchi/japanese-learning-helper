"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAccount } from "./account-provider";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { NoteDocument } from "./note-renderer";
import { emptyDocument, normalizeDocument } from "../core/note-document.cjs";
import type {
  GrammarVideo,
  NoteNode,
  NoteSave,
  VideoNoteModel,
} from "../lib/types";
const NoteEditor = dynamic(() => import("./note-editor"), {
  ssr: false,
  loading: () => <p role="status">Loading editor…</p>,
});
export function VideoNoteActions({ video }: { video: GrammarVideo }) {
  const { notes } = useAccount();
  return notes ? (
    <NoteControl
      key={notes.auth.user.id + video.id}
      video={video}
      store={notes}
    />
  ) : (
    <Button
      variant="outline"
      size="sm"
      disabled
      title="Sign in to save personal notes"
    >
      Add note
    </Button>
  );
}
function NoteControl({
  video,
  store,
}: {
  video: GrammarVideo;
  store: VideoNoteModel;
}) {
  const note = store.get(video.id),
    saved = !!note?.document;
  const [mode, setMode] = useState<"read" | "edit" | null>(null),
    [draft, setDraft] = useState<NoteNode>(emptyDocument),
    [base, setBase] = useState(0),
    [initial, setInitial] = useState<NoteNode>(emptyDocument),
    [editorKey, setEditorKey] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [notice, setNotice] = useState("");
  const pending = useRef<NoteSave | null>(null),
    alive = useRef(true),
    actions = useRef<HTMLDivElement>(null),
    clicked = useRef<HTMLButtonElement | null>(null),
    saving = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function open(next: "read" | "edit", button: HTMLButtonElement) {
    clicked.current = button;
    const content = note?.document || emptyDocument();
    setDraft(content);
    setInitial(content);
    setBase(note?.revision || 0);
    setEditorKey((n) => n + 1);
    pending.current = null;
    setError("");
    setConflict(false);
    setUncertain(false);
    setNotice("");
    setMode(next);
  }
  function close() {
    if (saving.current) return;
    setMode(null);
  }
  async function save() {
    if (saving.current || store.busy || conflict) return;
    let body: NoteSave;
    try {
      body = pending.current || {
        videoId: video.id,
        document: normalizeDocument(draft),
        expectedRevision: base,
        mutationId: crypto.randomUUID(),
      };
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    pending.current = body;
    try {
      await store.save(body);
      if (alive.current) {
        setMode(null);
        setNotice(body.document ? "Note saved." : "Note removed.");
      }
    } catch (e) {
      if (alive.current) {
        const failure = e as Error & { status?: number };
        setError(
          failure.message || "Could not save. Your draft is still here.",
        );
        setConflict(failure.status === 409);
        const unknown = !failure.status || failure.status >= 500;
        setUncertain(unknown);
        if (!unknown) pending.current = null;
      }
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      await store.load();
      if (!alive.current) return;
      const latest = store.get(video.id);
      const content = latest?.document || emptyDocument();
      setDraft(content);
      setInitial(content);
      setBase(latest?.revision || 0);
      setEditorKey((n) => n + 1);
      pending.current = null;
      setConflict(false);
      setUncertain(false);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div
      className="video-note-actions"
      ref={actions}
      data-note-video={video.id}
    >
      {saved ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => open("read", e.currentTarget)}
          >
            Open note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => open("edit", e.currentTarget)}
          >
            Edit note
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => open("edit", e.currentTarget)}
        >
          Add note
        </Button>
      )}
      {notice && <small role="status">{notice}</small>}
      <Dialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={`video-note-dialog ${mode === "read" ? "note-book" : ""}`}
          showCloseButton={!busy}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const target = clicked.current?.isConnected
              ? clicked.current
              : actions.current?.querySelector("button");
            target?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "read" ? "Your video note" : "Edit your video note"}
            </DialogTitle>
            <DialogDescription>{video.title}</DialogDescription>
          </DialogHeader>
          {mode === "read" ? (
            <div
              className="note-book-page"
              tabIndex={0}
              aria-label="Saved note"
            >
              <NoteDocument document={note?.document || null} />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Personal notes, saved to your account. Clear all content and
                save to remove this note.
              </p>
              {!store.data.available && (
                <p role="status">
                  Saving notes will be available after database setup.
                </p>
              )}
              <NoteEditor
                key={editorKey}
                initial={initial}
                disabled={busy || uncertain}
                onChange={(value) => {
                  setDraft(value);
                  if (!conflict) setError("");
                }}
              />
              {error && (
                <p role="alert" className="note-error">
                  {error}
                </p>
              )}
              {uncertain && (
                <p role="status">
                  The save could not be confirmed. Retry the same save to check
                  it safely.
                </p>
              )}
              {conflict && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void reload()}
                >
                  Reload saved note (replaces this draft)
                </Button>
              )}
              <div className="note-footer">
                <Button variant="outline" disabled={busy} onClick={close}>
                  {uncertain ? "Close" : "Cancel"}
                </Button>
                <Button
                  disabled={busy || store.busy || conflict}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : uncertain ? "Retry save" : "Save note"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

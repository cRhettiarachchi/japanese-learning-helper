"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import type { RevisionCard, VocabularyModel } from "../lib/types";
import { validateCard, validateSource } from "../core/revision-card.cjs";

export function CardJapanese({ card }: { card: RevisionCard }) {
  return (
    <span lang="ja" className="whitespace-pre-wrap break-words leading-loose">
      {card.segments.map((s, i) =>
        s.reading ? (
          <ruby key={i}>
            {s.text}
            <rt>{s.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
const fieldClass =
  "block w-full min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs focus-visible:outline-ring disabled:opacity-50";
export function RevisionCardDialog({ store }: { store: VocabularyModel }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false),
    [japanese, setJapanese] = useState(""),
    [intent, setIntent] = useState(""),
    [draft, setDraft] = useState<RevisionCard | null>(null),
    [hint, setHint] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [approved, setApproved] = useState(false),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null),
    alive = useRef(true),
    cardId = useRef("");
  const owner = store.auth?.user.id;
  useEffect(() => {
    alive.current = true;
    setMounted(true);
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  function changeOpen(next: boolean) {
    // A sent approval may still be saved even if its HTTP response was lost.
    if (store.busy) return;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setOpen(next);
    if (next) {
      setJapanese("");
      setIntent("");
      setDraft(null);
      setHint("");
      setEditing(false);
      setError("");
      setApproved(false);
      cardId.current = `custom:${crypto.randomUUID()}`;
      setNotice("");
    }
  }
  async function generate() {
    if (busy || approved || !store.auth) return;
    try {
      validateSource(japanese, intent);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => request.abort(), 55000);
    try {
      const response = await fetch("/api/revision-card", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": store.auth.csrf,
        },
        signal: request.signal,
        body: JSON.stringify({
          japanese,
          intent,
          ...(draft ? { previous: draft, hint } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not prepare a draft. Please retry.");
      if (
        !alive.current ||
        controller.current !== request ||
        store.auth?.user.id !== owner
      )
        return;
      if (data.userId !== owner)
        throw Error("Your account changed. Close this dialog and reconnect.");
      validateCard(data.card);
      if (data.card.japanese !== japanese || data.card.intent !== intent)
        throw Error("The draft changed your original text. Please retry.");
      setDraft(data.card);
      setEditing(false);
    } catch (e) {
      if (alive.current && controller.current === request)
        setError(
          request.signal.aborted
            ? "Draft generation timed out. Your input is still here; try again."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (alive.current && controller.current === request) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  async function save() {
    if (!draft || store.busy || busy || store.auth?.user.id !== owner) return;
    try {
      validateCard(draft);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError("");
    setApproved(true);
    const ok = approved
      ? await store.load()
      : await store.mutate({
          action: "add-card",
          entryId: cardId.current,
          card: draft,
        });
    if (!alive.current || store.auth?.user.id !== owner) return;
    if (ok && store.has(cardId.current)) {
      setOpen(false);
      setNotice("Revision card added. It’s ready for review.");
    } else {
      const pending = store.auth && store.pending().length > 0;
      setApproved(!!pending);
      setError(
        store.error || "Could not confirm the save. Retry to check its status.",
      );
    }
  }
  const locked = busy || store.busy || approved;
  return (
    <>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <Button
            disabled={
              !store.auth ||
              store.busy ||
              !!(mounted && store.auth && store.pending().length)
            }
            variant="outline"
          >
            Create revision card
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          showCloseButton={!store.busy}
        >
          <DialogHeader>
            <DialogTitle>Create a revision card</DialogTitle>
            <DialogDescription>
              Choose one thing to learn. Preview and edit both sides before
              adding it to your reviews.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2">
            Japanese sentence or word
            <textarea
              className={fieldClass}
              lang="ja"
              maxLength={500}
              value={japanese}
              disabled={locked || !!draft}
              onChange={(e) => setJapanese(e.target.value)}
            />
          </label>
          <label className="grid gap-2">
            What should this card teach you?
            <textarea
              className={fieldClass}
              maxLength={500}
              placeholder="For example: how てしまう changes the meaning here"
              value={intent}
              disabled={locked || !!draft}
              onChange={(e) => setIntent(e.target.value)}
            />
          </label>
          {!draft && (
            <Button
              disabled={busy || !japanese.trim() || !intent.trim()}
              onClick={() => void generate()}
            >
              {busy ? "Preparing draft…" : "Generate preview"}
            </Button>
          )}
          {draft && (
            <>
              <div
                className="grid gap-3 sm:grid-cols-2"
                aria-label="Card preview"
              >
                <section
                  className="min-w-0 rounded-lg border p-4 space-y-3"
                  aria-label="Front preview"
                >
                  <h3 className="text-sm text-muted-foreground">Front</h3>
                  <p className="break-words">{draft.prompt}</p>
                  <p className="text-xl">
                    <CardJapanese card={draft} />
                  </p>
                </section>
                <section
                  className="min-w-0 rounded-lg border p-4 space-y-3"
                  aria-label="Back preview"
                >
                  <h3 className="text-sm text-muted-foreground">Back</h3>
                  <p className="whitespace-pre-wrap break-words">
                    {draft.answer}
                  </p>
                </section>
              </div>
              <p className="text-sm text-muted-foreground">
                AI draft — check the explanation and readings before adding.
              </p>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Finish editing" : "Edit card"}
              </Button>
              {editing && (
                <fieldset disabled={locked} className="grid gap-3 min-w-0">
                  <legend className="mb-2 font-medium">Edit the draft</legend>
                  <label className="grid gap-2">
                    Front question
                    <textarea
                      className={fieldClass}
                      aria-label="Front question"
                      maxLength={300}
                      value={draft.prompt}
                      onChange={(e) =>
                        setDraft({ ...draft, prompt: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2">
                    Back answer
                    <textarea
                      className={fieldClass}
                      aria-label="Back answer"
                      maxLength={800}
                      value={draft.answer}
                      onChange={(e) =>
                        setDraft({ ...draft, answer: e.target.value })
                      }
                    />
                  </label>
                  <p className="text-sm">
                    Hiragana readings (the original Japanese stays unchanged)
                  </p>
                  {draft.segments.map((segment, i) => (
                    <label
                      key={i}
                      className="grid grid-cols-2 items-center gap-3 min-w-0"
                    >
                      <span
                        lang="ja"
                        className="break-words whitespace-pre-wrap"
                      >
                        {segment.text}
                      </span>
                      <Input
                        aria-label={`Reading ${i + 1}: ${segment.text}`}
                        lang="ja"
                        maxLength={200}
                        value={segment.reading}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            segments: draft.segments.map((s, index) =>
                              index === i
                                ? { ...s, reading: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              )}
              <label className="grid gap-2">
                Retry hint (optional)
                <Input
                  maxLength={500}
                  disabled={locked}
                  value={hint}
                  placeholder="Focus on regret; make the answer shorter"
                  onChange={(e) => setHint(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void generate()}
                >
                  {busy ? "Preparing draft…" : "Retry draft"}
                </Button>
                <Button
                  disabled={busy || store.busy}
                  onClick={() => void save()}
                >
                  {store.busy
                    ? "Saving…"
                    : approved
                      ? "Retry approved save"
                      : "Add to my reviews"}
                </Button>
              </div>
              {approved && (
                <p role="status">
                  You approved this card. If the connection failed, retry the
                  same save to confirm it; don’t create another copy.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="ghost"
            disabled={store.busy}
            onClick={() => changeOpen(false)}
          >
            {approved ? "Close" : "Cancel"}
          </Button>
        </DialogContent>
      </Dialog>
      {notice && (
        <p role="status" className="w-full text-sm">
          {notice}
        </p>
      )}
    </>
  );
}

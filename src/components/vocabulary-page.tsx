"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "./account-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { VocabularyItem } from "../lib/types";
export function VocabularyPage() {
  const { vocabulary: store, version } = useAccount();
  const [view, setView] = useState("due"),
    [query, setQuery] = useState(""),
    [revealed, setRevealed] = useState(false),
    [revealedFor, setRevealedFor] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [phone, setPhone] = useState(false),
    [preferred, setPreferred] = useState<string | null>(null);
  const answer = useRef<HTMLDivElement>(null),
    reveal = useRef<HTMLButtonElement>(null),
    pointer = useRef<{
      id: number;
      x: number;
      y: number;
      at: number;
      entry: string;
      peakX: number;
      peakY: number;
    } | null>(null);
  const [localNow, setLocalNow] = useState(0);
  const dueNow = Math.max(
    localNow,
    Date.parse(store?.data?.serverNow || "") || 0,
  );
  const items = store?.data?.items || [],
    due = items.filter((item) => Date.parse(item.due_at) <= dueNow);
  useEffect(() => {
    if (!localNow) setLocalNow(Date.now());
    const nextDue = Math.min(
      ...items
        .map((item) => Date.parse(item.due_at))
        .filter((at) => at > Math.max(dueNow, Date.now())),
    );
    if (!Number.isFinite(nextDue)) return;
    // A single local deadline updates the due view; it never fetches account data.
    const timeout = setTimeout(
      () => setLocalNow(Date.now()),
      Math.min(2147483647, Math.max(1, nextDue - Date.now() + 1)),
    );
    return () => clearTimeout(timeout);
  }, [store?.data, localNow]);
  const current = due.find((i) => i.entry_id === preferred) || due[0] || null;
  const identity = `${store?.auth?.user.id}:${current?.entry_id}:${current?.revision}`;
  const isRevealed = revealed && revealedFor === identity;
  useEffect(() => {
    setRevealed(false);
    setPage(0);
    pointer.current = null;
  }, [identity]);
  useEffect(() => {
    const coarse = matchMedia(
        "(max-width: 760px) and (pointer: coarse) and (hover: none)",
      ),
      fine = matchMedia("(any-pointer: fine)");
    const update = () => setPhone(coarse.matches && !fine.matches);
    update();
    coarse.addEventListener("change", update);
    fine.addEventListener("change", update);
    return () => {
      coarse.removeEventListener("change", update);
      fine.removeEventListener("change", update);
    };
  }, []);
  async function rate(rating: string) {
    if (!current || !isRevealed || store?.busy) return;
    if (
      await store?.mutate({
        action: "rate",
        entryId: current.entry_id,
        revision: current.revision,
        rating,
      })
    ) {
      setRevealed(false);
      setPreferred(null);
      setTimeout(() => reveal.current?.focus(), 0);
    }
  }
  async function undo() {
    const last = store?.lastRating;
    if (
      last &&
      !store?.busy &&
      (await store?.mutate({
        action: "undo",
        ratingId: last.id,
        revision: last.revision,
      }))
    ) {
      setPreferred(last.entryId);
      setRevealed(false);
      setPage(0);
      setTimeout(() => reveal.current?.focus(), 0);
    }
  }
  const word = (item: VocabularyItem) =>
    item.reading && /[\u3400-\u9fff々]/u.test(item.word) ? (
      <ruby>
        {item.word}
        <rt>{item.reading}</rt>
      </ruby>
    ) : (
      item.word
    );
  return (
    <main
      id="study-content"
      tabIndex={-1}
      className={`vocabulary-page ${phone ? "vocabulary-phone" : ""}`}
    >
      <p className="eyebrow">A little practice, every day</p>
      <h1>Vocabulary</h1>
      <p id="vocabulary-count">
        {store?.data
          ? `${due.length} due · ${items.length} saved words`
          : "Your vocabulary follows your account."}
      </p>
      <div className="flex flex-wrap gap-2 my-5">
        <Button
          aria-pressed={view === "due"}
          variant={view === "due" ? "default" : "outline"}
          onClick={() => setView("due")}
        >
          Due for review
        </Button>
        <Button
          aria-pressed={view === "all"}
          variant={view === "all" ? "default" : "outline"}
          onClick={() => setView("all")}
        >
          All words
        </Button>
        <Button
          variant="ghost"
          disabled={store?.busy}
          onClick={() => void store?.load()}
        >
          Refresh
        </Button>
      </div>
      {store?.error && (
        <p role="alert" className="app-feedback">
          {store.error}
        </p>
      )}
      {!store?.auth && !store?.busy && (
        <a href="/api/auth/authorize">Sign in to review vocabulary</a>
      )}
      {store?.lastRating && (
        <div className="undo-notice">
          <span>
            {store.lastRating.rating === "good"
              ? "Remembered — next review scheduled."
              : "Again — back in 10 minutes."}
          </span>
          <Button
            id="undo-rating"
            variant="outline"
            disabled={store.busy}
            onClick={() => void undo()}
          >
            Undo last rating
          </Button>
        </div>
      )}
      {view === "due" ? (
        <section id="vocabulary-review">
          {current ? (
            <article
              className="vocabulary-card"
              aria-label="Vocabulary review card"
            >
              <p>What does this word mean?</p>
              <h2 lang="ja">{word(current)}</h2>
              {!isRevealed ? (
                <Button
                  ref={reveal}
                  className="reveal-meaning"
                  disabled={store?.busy}
                  onClick={() => {
                    setRevealedFor(identity);
                    setRevealed(true);
                    setPage(0);
                    setTimeout(() => answer.current?.focus(), 0);
                  }}
                >
                  Reveal meaning
                </Button>
              ) : (
                <>
                  <div
                    ref={answer}
                    className="vocabulary-answer"
                    tabIndex={0}
                    role="region"
                    aria-label="English meanings. Left: Good. Right: Again. Up: Undo."
                    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp"
                    onKeyDown={(e) => {
                      if (
                        e.target !== e.currentTarget ||
                        e.altKey ||
                        e.ctrlKey ||
                        e.metaKey ||
                        e.shiftKey
                      )
                        return;
                      if (
                        ["ArrowLeft", "ArrowRight", "ArrowUp"].includes(e.key)
                      ) {
                        e.preventDefault();
                        if (e.key === "ArrowUp") void undo();
                        else
                          void rate(e.key === "ArrowLeft" ? "good" : "again");
                      }
                    }}
                    onPointerDown={(e) => {
                      if (!e.isPrimary) {
                        pointer.current = null;
                        return;
                      }
                      if (
                        store?.busy ||
                        e.button !== 0 ||
                        (e.target as HTMLElement).closest("button,a,input")
                      )
                        return;
                      pointer.current = {
                        id: e.pointerId,
                        x: e.clientX,
                        y: e.clientY,
                        at: Date.now(),
                        entry: current.entry_id,
                        peakX: 0,
                        peakY: 0,
                      };
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const p = pointer.current;
                      if (p?.id === e.pointerId) {
                        p.peakX = Math.max(p.peakX, Math.abs(e.clientX - p.x));
                        p.peakY = Math.max(p.peakY, Math.abs(e.clientY - p.y));
                      }
                    }}
                    onPointerCancel={() => (pointer.current = null)}
                    onLostPointerCapture={() => (pointer.current = null)}
                    onPointerUp={(e) => {
                      const p = pointer.current;
                      pointer.current = null;
                      if (
                        !p ||
                        p.id !== e.pointerId ||
                        p.entry !== current.entry_id ||
                        store?.busy ||
                        Date.now() - p.at > 1500
                      )
                        return;
                      const dx = e.clientX - p.x,
                        dy = e.clientY - p.y;
                      if (
                        dy <= -88 &&
                        Math.abs(dy) > Math.abs(dx) * 1.8 &&
                        p.peakX < Math.abs(dy) / 1.8
                      )
                        void undo();
                      else if (
                        Math.abs(dx) >=
                          Math.max(64, e.currentTarget.clientWidth * 0.22) &&
                        Math.abs(dx) > Math.abs(dy) * 1.6 &&
                        p.peakY < Math.abs(dx) / 1.6
                      )
                        void rate(dx < 0 ? "good" : "again");
                    }}
                  >
                    <p lang="ja">{current.readings.join(" · ")}</p>
                    <ul>
                      {(phone
                        ? current.meanings.slice(page * 3, page * 3 + 3)
                        : current.meanings
                      ).map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                    {phone && current.meanings.length > 3 && (
                      <nav aria-label="Meaning pages">
                        <small>
                          Meanings {page * 3 + 1}–
                          {Math.min(page * 3 + 3, current.meanings.length)} of{" "}
                          {current.meanings.length}
                        </small>
                        <Button
                          variant="outline"
                          disabled={page === 0}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous meanings
                        </Button>
                        <Button
                          variant="outline"
                          disabled={(page + 1) * 3 >= current.meanings.length}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          More meanings
                        </Button>
                      </nav>
                    )}
                  </div>
                  <div className="vocabulary-ratings">
                    <Button
                      disabled={store?.busy}
                      onClick={() => void rate("good")}
                    >
                      ← Good / remembered
                    </Button>
                    <Button
                      disabled={store?.busy}
                      variant="outline"
                      onClick={() => void rate("again")}
                    >
                      Again / not good →
                    </Button>
                  </div>
                  <p className="gesture-hint">
                    Swipe left: Good · Right: Again · Up: Undo
                  </p>
                </>
              )}
            </article>
          ) : (
            <div className="empty-state">
              <h2>{store?.busy ? "Loading…" : "You’re all caught up."}</h2>
              <p>
                Save words from an article or transcript, then come back when
                they’re due.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section>
          <label htmlFor="word-search">Search your words</label>
          <Input
            id="word-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Japanese, reading, or meaning"
          />
          {items
            .filter((i) =>
              [i.word, ...i.readings, ...i.meanings]
                .join(" ")
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            )
            .map((item) => (
              <details key={item.entry_id} className="vocabulary-list-word">
                <summary>
                  <span lang="ja">{word(item)}</span>
                  <small>Due {new Date(item.due_at).toLocaleString()}</small>
                </summary>
                <p lang="ja">{item.readings.join(" · ")}</p>
                <ul>
                  {item.meanings.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p>Schedule stage {item.stage} of 6</p>
              </details>
            ))}
        </section>
      )}
    </main>
  );
}

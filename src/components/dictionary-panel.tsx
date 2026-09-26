"use client";
import { useEffect } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { useAccount } from "./account-provider";
import type { LookupData, Token } from "../lib/types";
export function DictionaryPanel({
  token,
  data,
  onClose,
}: {
  token: Token | null;
  data: LookupData | null;
  onClose: () => void;
}) {
  const { vocabulary: store } = useAccount();
  useEffect(() => {
    if (token && store && !store.data && !store.busy) void store.load();
  }, [token, store]);
  const ids = [...new Set(token?.entries || [])].filter(
    (id) => data?.dictionary[id],
  );
  return (
    <Sheet
      open={!!token}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className="dictionary-sheet"
        side="right"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <SheetTitle lang="ja">
          {token?.surface || token?.lemma || "Dictionary"}
        </SheetTitle>
        <SheetDescription>English meanings</SheetDescription>
        <div className="dictionary-results">
          {ids.length > 1 && (
            <p>Choose the dictionary entry you want to review.</p>
          )}
          {ids.map((id) => {
            const entry = data!.dictionary[id];
            const meanings = [...new Set(entry.senses.flatMap((s) => s.gloss))];
            return (
              <section key={id}>
                <h3 lang="ja">{entry.forms?.[0] || entry.readings?.[0]}</h3>
                <p lang="ja">{entry.readings?.join(" · ")}</p>
                <ul>
                  {meanings.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <Button
                  disabled={!store?.auth || store.busy || store.has(id)}
                  onClick={() =>
                    void store?.mutate({ action: "add", entryId: id })
                  }
                >
                  {store?.has(id) ? "Added ✓" : "Add to review"}
                </Button>
              </section>
            );
          })}
          {!ids.length && <p>No English meaning found.</p>}
          {store?.error && (
            <p role="status">
              {store.error}
              <Button variant="outline" onClick={() => void store.load()}>
                Retry
              </Button>
            </p>
          )}
          {!store?.auth && (
            <a href="/api/auth/authorize">Sign in to save vocabulary</a>
          )}
          <p className="dictionary-credit">
            <a
              href="https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html"
              target="_blank"
              rel="noopener"
            >
              JMdict
            </a>{" "}
            ·{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener"
            >
              CC BY-SA 4.0
            </a>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

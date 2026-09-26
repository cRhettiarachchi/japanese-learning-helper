"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "./account-provider";
import { request, safeStorage } from "../lib/request";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Input } from "./ui/input";
import type { TimerData } from "../lib/types";
interface Draft {
  id: string;
  local: true;
  state: "active" | "review";
  owner_client: string;
  elapsed_ms: number;
  updatedAt: number;
  recovered?: boolean;
}
interface Saved {
  id: string;
  state: string;
  confirmed_seconds: number;
  elapsed_ms: number;
  revision: number;
  started_at: string;
}
const format = (s: number) => {
  s = Math.floor(s);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export function StudyTimer() {
  const { progress, snapshot } = useAccount();
  const user = progress?.user?.id,
    csrf = progress?.csrf;
  const [draft, setDraft] = useState<Draft | null>(null),
    [data, setData] = useState<TimerData | null>(snapshot.timer),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"review" | "history" | null>(null),
    [editing, setEditing] = useState<Draft | Saved | null>(null),
    [duration, setDuration] = useState([0, 0, 0]),
    [adjust, setAdjust] = useState(false),
    [draftBlocked, setDraftBlocked] = useState(false);
  const current = useRef<Draft | null>(null),
    owner = useRef<string | undefined>(undefined),
    client = useRef(""),
    lastTick = useRef(0),
    busyRef = useRef(false),
    generation = useRef(0),
    reload = useRef(false),
    loadRef = useRef<() => void>(() => {});
  const key = (id: string) => `learner.timer.draft.v1.${id}`,
    journal = (id: string) => `learner.timer.commit.${id}.${client.current}`;
  // Recover receipts from a closed tab too; replay uses the original mutation/client IDs.
  const pendingFor = (id: string) => {
    const storage = safeStorage(),
      prefix = `learner.timer.commit.${id}.`;
    const result: { key: string; op: Record<string, unknown> }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix))
        result.push({ key, op: JSON.parse(storage.getItem(key)!) });
    }
    return result;
  };
  const change = (next: Draft | null, persist = true) => {
    current.current = next;
    setDraft(next ? { ...next } : null);
    if (persist && owner.current) {
      try {
        if (next)
          safeStorage().setItem(key(owner.current), JSON.stringify(next));
        else safeStorage().removeItem(key(owner.current));
      } catch {
        if (next) next.state = "review";
        setDraft(next ? { ...next } : null);
        setError(
          "Draft storage unavailable. Keep this page open and save your time.",
        );
      }
    }
  };
  const tick = () => {
    const now = performance.now(),
      delta = now - lastTick.current;
    lastTick.current = now;
    const d = current.current;
    if (d?.state === "active" && d.owner_client === client.current) {
      if (delta > 5000 || delta < 0) {
        d.state = "review";
        d.recovered = true;
      } else d.elapsed_ms = Math.min(86400000, d.elapsed_ms + delta);
      if (d.elapsed_ms === 86400000) d.state = "review";
      d.updatedAt = Date.now();
      change(d);
    }
  };
  const pause = () => {
    const d = current.current;
    if (d?.state === "active" && d.owner_client === client.current) {
      tick();
      d.state = "review";
      d.recovered = true;
      change(d);
    }
  };
  useEffect(() => {
    try {
      client.current =
        sessionStorage.getItem("learner.timer.client") || crypto.randomUUID();
      sessionStorage.setItem("learner.timer.client", client.current);
    } catch {
      setError("Enable browser session storage to start a timer.");
    }
    lastTick.current = performance.now();
    const timer = setInterval(tick, 1000);
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      pause();
      clearInterval(timer);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function load(retry = true, fetchHistory = true) {
    if (!user || !csrf) return;
    if (busyRef.current) {
      reload.current = true;
      return;
    }
    const g = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      for (const pending of retry ? pendingFor(user) : []) {
        const op = pending.op;
        try {
          const result = await request<TimerData>("/api/study-time", {
            method: "POST",
            csrf,
            body: op,
          });
          if (g !== generation.current || result.userId !== user) return;
          safeStorage().removeItem(pending.key);
          if (op.action === "commit" && current.current?.id === op.id)
            change(null);
          setData(result);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 400 || status === 409)
            safeStorage().removeItem(pending.key);
          throw error;
        }
      }
      if (!fetchHistory) {
        setError("");
        return;
      }
      const result = await request<TimerData>("/api/study-time");
      if (g !== generation.current) return;
      if (result.userId !== user)
        throw Error("Account changed. Please sign in again.");
      setData(result);
      setError("");
    } catch (e) {
      if (g === generation.current)
        setError((e as Error).message || "Cannot connect. Your draft is kept.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (reload.current) {
        reload.current = false;
        queueMicrotask(() => loadRef.current());
      }
    }
  }
  loadRef.current = () => {
    void load();
  };
  useEffect(() => {
    pause();
    generation.current++;
    owner.current = user;
    change(null, false);
    setData(snapshot.timer?.userId === user ? snapshot.timer : null);
    setModal(null);
    setError("");
    setDraftBlocked(false);
    if (!user) return;
    try {
      const stored = JSON.parse(
        safeStorage().getItem(key(user)) || "null",
      ) as Draft | null;
      if (stored) {
        if (
          typeof stored.id !== "string" ||
          !["active", "review"].includes(stored.state) ||
          !Number.isFinite(stored.elapsed_ms) ||
          stored.elapsed_ms < 0 ||
          stored.elapsed_ms > 86400000 ||
          typeof stored.owner_client !== "string" ||
          !Number.isFinite(stored.updatedAt)
        )
          throw Error("Invalid draft");
        if (
          stored.state === "active" &&
          (stored.owner_client === client.current ||
            Date.now() - stored.updatedAt > 5000)
        ) {
          stored.state = "review";
          stored.recovered = true;
        }
        change(stored);
      }
    } catch {
      setDraftBlocked(true);
      setError(
        "The saved draft could not be read. It has been kept unchanged.",
      );
    }
    try {
      if (pendingFor(user).length) void load(true, false);
    } catch {
      setError(
        "Pending timer changes could not be read. They were kept unchanged.",
      );
    }
  }, [user]);
  useEffect(() => {
    const refresh = () => {
      try {
        if (!document.hidden && user && pendingFor(user).length)
          void load(true, false);
      } catch {
        setError(
          "Pending timer changes could not be read. They were kept unchanged.",
        );
      }
    };
    const storage = (event: StorageEvent) => {
      if (user && event.key === key(user)) {
        try {
          change(JSON.parse(event.newValue || "null"), false);
        } catch {
          setError("Draft could not be read.");
        }
      }
    };
    window.addEventListener("online", refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", storage);
    };
  }, [user, csrf]);
  useEffect(() => {
    if (snapshot.timer?.userId !== user || busyRef.current) return;
    setData((previous) =>
      !previous ||
      !previous.serverNow ||
      !snapshot.timer?.serverNow ||
      new Date(snapshot.timer.serverNow) >= new Date(previous.serverNow)
        ? snapshot.timer
        : previous,
    );
  }, [snapshot.timer, user]);
  function review(row: Draft | Saved) {
    setEditing({ ...row });
    const seconds =
      "local" in row
        ? Math.floor(row.elapsed_ms / 1000)
        : (row.confirmed_seconds ?? Math.floor(row.elapsed_ms / 1000));
    setDuration([
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ]);
    setAdjust(false);
    setModal("review");
  }
  function main() {
    if (owner.current !== user) return;
    if (!user) {
      location.href = "/api/auth/authorize";
      return;
    }
    if (draft?.state === "review") {
      review(draft);
      return;
    }
    if (draft?.state === "active") {
      if (draft.owner_client !== client.current) return;
      tick();
      const d = { ...current.current!, state: "review" as const };
      change(d);
      review(d);
      return;
    }
    lastTick.current = performance.now();
    change({
      id: crypto.randomUUID(),
      local: true,
      state: "active",
      owner_client: client.current,
      elapsed_ms: 0,
      updatedAt: Date.now(),
    });
  }
  async function mutate(action: string) {
    if (!user || !csrf || !editing || busyRef.current || owner.current !== user)
      return;
    const seconds = duration[0] * 3600 + duration[1] * 60 + duration[2];
    if (
      duration.some((n) => !Number.isInteger(n) || n < 0) ||
      duration[1] > 59 ||
      duration[2] > 59 ||
      seconds > 86400
    ) {
      setError("Enter a duration from 0 to 24 hours.");
      return;
    }
    if ("local" in editing && action === "discard") {
      if (pendingFor(user).length) {
        setError("Retry the pending save before discarding.");
        return;
      }
      change(null);
      setModal(null);
      return;
    }
    const op = {
      action:
        action === "discard"
          ? "discard"
          : "local" in editing
            ? "commit"
            : editing.state === "saved"
              ? "adjust"
              : "save",
      id: editing.id,
      ...("local" in editing ? {} : { revision: editing.revision }),
      ...(action === "discard" ? {} : { seconds }),
      clientId: client.current,
      mutationId: crypto.randomUUID(),
    };
    const g = generation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      if (pendingFor(user).length)
        throw Error("Retry the pending save before another change.");
      safeStorage().setItem(journal(user), JSON.stringify(op));
      const result = await request<TimerData>("/api/study-time", {
        method: "POST",
        csrf,
        body: op,
      });
      if (g !== generation.current || result.userId !== user) return;
      safeStorage().removeItem(journal(user));
      if (op.action === "commit") change(null);
      setData(result);
      setError("");
      setModal(null);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status && err.status < 500)
        safeStorage().removeItem(journal(user));
      if (g === generation.current)
        setError(
          err.status === 409
            ? "This session changed. Retry to load the latest version."
            : err.message,
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (reload.current) {
        reload.current = false;
        queueMicrotask(() => loadRef.current());
      }
    }
  }
  return (
    <>
      <section className="timer-bar" aria-label="Study timer">
        <div>
          <strong>Study time</strong>{" "}
          <span data-timer-total>
            {data ? `${(data.totalSeconds / 3600).toFixed(2)} hours saved` : ""}
          </span>
          {draft?.state === "review" && <small>Draft ready to review</small>}
        </div>
        <div className="flex items-center gap-2">
          <span data-timer-clock className="tabular-nums">
            {draft ? format(draft.elapsed_ms / 1000) : ""}
          </span>
          <Button
            data-timer-main
            size="sm"
            disabled={
              draftBlocked ||
              busy ||
              (!!user && !client.current) ||
              (draft?.state === "active" &&
                draft.owner_client !== client.current)
            }
            onClick={main}
          >
            {!user
              ? "Sign in"
              : draft?.state === "active"
                ? "Stop"
                : draft?.state === "review"
                  ? "Review time"
                  : "Start"}
          </Button>
          <Button
            data-timer-history
            size="sm"
            variant="ghost"
            disabled={!user || busy}
            onClick={async () => {
              await load();
              setModal("history");
            }}
          >
            History
          </Button>
        </div>
      </section>
      {error && (
        <p role="alert" className="app-feedback">
          {error}{" "}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) setModal(null);
        }}
      >
        <DialogContent className="timer-dialog">
          <DialogTitle>
            {modal === "history" ? "Your study time" : "Review study time"}
          </DialogTitle>
          <DialogDescription>
            {modal === "history"
              ? "Saved sessions belong to your account. Active drafts stay in this browser."
              : "Only Save time commits this duration. Backgrounding or closing the app pauses the draft."}
          </DialogDescription>
          {modal === "history" ? (
            <>
              <p>
                {data
                  ? `${(data.totalSeconds / 3600).toFixed(2)} hours saved`
                  : "Loading…"}
              </p>
              <ul className="timer-history">
                {[
                  ...(data?.current ? [data.current] : []),
                  ...(data?.history || []),
                ].map((row) => (
                  <li key={row.id}>
                    <span>
                      {new Date(row.started_at).toLocaleString()} ·{" "}
                      {format(row.confirmed_seconds ?? row.elapsed_ms / 1000)}
                    </span>
                    <Button variant="outline" onClick={() => review(row)}>
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
              {!data?.history.length && !data?.current && (
                <p>No saved sessions yet.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-3xl tabular-nums">
                {format(duration[0] * 3600 + duration[1] * 60 + duration[2])}
              </p>
              {adjust && (
                <div className="flex gap-2">
                  {["Hours", "Minutes", "Seconds"].map((label, i) => (
                    <label key={label}>
                      {label}
                      <Input
                        type="number"
                        min={0}
                        max={i ? 59 : 24}
                        value={duration[i]}
                        onChange={(e) => {
                          const next = duration.map((n, j) =>
                            j === i ? Number(e.target.value) : n,
                          );
                          setDuration(next);
                          if (
                            editing &&
                            "local" in editing &&
                            current.current?.id === editing.id &&
                            next.every((n) => Number.isInteger(n) && n >= 0) &&
                            next[1] < 60 &&
                            next[2] < 60 &&
                            next[0] * 3600 + next[1] * 60 + next[2] <= 86400
                          )
                            change({
                              ...current.current,
                              elapsed_ms:
                                (next[0] * 3600 + next[1] * 60 + next[2]) *
                                1000,
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void mutate("save")}>
                  Save time
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setAdjust(true)}
                >
                  Adjust time
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void mutate("discard")}
                >
                  Discard
                </Button>
                <Button variant="ghost" onClick={() => setModal(null)}>
                  Review later
                </Button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

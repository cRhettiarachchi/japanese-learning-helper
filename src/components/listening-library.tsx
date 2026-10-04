"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "./account-provider";
import { request } from "../lib/request";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DictionaryPanel } from "./dictionary-panel";
import type { Token, DictionaryEntry } from "../lib/types";
type WordPart = { text: string; reading?: string; entries?: string[] };
type Cue = {
  start: number;
  end: number;
  text: string;
  parts?: { text: string; reading?: string }[];
};
type Item = {
  video_id: string;
  title: string;
  cues: Cue[];
  revision: number;
  lookup?: { rows: WordPart[][]; dictionary: Record<string, DictionaryEntry> };
};
type Library = { userId: string; available: boolean; items: Item[] };
let apiPromise: Promise<any> | undefined;
function youtube() {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!apiPromise)
    apiPromise = new Promise((resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      const timeout = setTimeout(() => {
        apiPromise = undefined;
        reject(
          Error(
            "YouTube could not load. Check your connection or content blocker.",
          ),
        );
      }, 15000);
      const ready = () => {
        if (w.YT?.ready)
          w.YT.ready(() => {
            clearTimeout(timeout);
            resolve(w.YT);
          });
      };
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onload = ready;
        script.onerror = () => {
          clearTimeout(timeout);
          apiPromise = undefined;
          script?.remove();
          reject(Error("YouTube could not load."));
        };
        document.head.append(script);
      } else ready();
    });
  return apiPromise;
}
function Video({ item }: { item: Item }) {
  const [lookup, setLookup] = useState<Token | null>(null);
  const lookupRef = useRef(false),
    resume = useRef(false),
    trigger = useRef<HTMLButtonElement | null>(null);
  function closeLookup() {
    setLookup(null);
    lookupRef.current = false;
    const shouldResume = resume.current;
    resume.current = false;
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
    if (shouldResume) player.current?.playVideo();
  }
  function openLookup(part: WordPart, element: HTMLButtonElement) {
    resume.current = player.current?.getPlayerState?.() === 1;
    lookupRef.current = true;
    player.current?.pauseVideo();
    trigger.current = element;
    setLookup({ surface: part.text, entries: part.entries || [] });
  }
  function seek(seconds: number) {
    if (lookupRef.current) return;
    player.current?.seekTo(seconds, true);
    player.current?.playVideo();
    setTime(seconds);
  }

  const host = useRef<HTMLDivElement>(null),
    player = useRef<any>(null);
  const [time, setTime] = useState(-1),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      frame = 0;
    setTime(-1);
    setError("");
    setReady(false);
    function clock() {
      if (disposed) return;
      setTime(player.current?.getCurrentTime() ?? -1);
      frame = requestAnimationFrame(clock);
    }
    youtube()
      .then((YT) => {
        if (disposed || !host.current) return;
        const mount = document.createElement("div");
        host.current.replaceChildren(mount);
        player.current = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          videoId: item.video_id,
          playerVars: { playsinline: 1, origin: location.origin },
          events: {
            onReady: () => {
              if (!disposed) setReady(true);
            },
            onStateChange: (e: any) => {
              cancelAnimationFrame(frame);
              if (e.data === YT.PlayerState.PLAYING) {
                if (lookupRef.current) player.current?.pauseVideo();
                else clock();
              } else if (!disposed)
                setTime(player.current?.getCurrentTime() ?? -1);
            },
            onError: () => {
              cancelAnimationFrame(frame);
              setError(
                "This video cannot play here. It may be private, removed, or have embedding disabled. Open it on YouTube instead.",
              );
            },
          },
        });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      player.current?.destroy();
      player.current = null;
    };
  }, [item.video_id]);
  const active = item.cues.reduce(
    (found, cue, i) => (time >= cue.start && time < cue.end ? i : found),
    -1,
  );
  return (
    <section className="space-y-4" aria-label="Video and transcript">
      <h2 className="text-xl font-semibold">{item.title}</h2>
      <div
        ref={host}
        className="aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black"
      />
      {error && <p role="alert">{error}</p>}
      <a
        className="underline"
        href={`https://www.youtube.com/watch?v=${item.video_id}`}
        target="_blank"
        rel="noreferrer"
      >
        Open original video on YouTube
      </a>
      {!item.cues.length ? (
        <p className="rounded-lg border p-4">
          Subtitles needed. You can watch now and upload an SRT or VTT file
          below.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Tap a word for its meaning; tap the timestamp or the rest of a line
            to seek. Highlighting follows subtitle timing; accuracy depends on
            your file. Uploaded ruby readings are preserved; no readings are
            generated.
          </p>
          <ol
            className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border p-3"
            aria-label="Timed transcript"
          >
            {item.cues.map((cue, i) => {
              const stamp = `${Math.floor(cue.start / 60)}:${String(Math.floor(cue.start % 60)).padStart(2, "0")}`;
              const parts = item.lookup?.rows[i] ||
                cue.parts || [{ text: cue.text }];
              return (
                <li
                  key={i}
                  aria-current={active === i ? "true" : undefined}
                  className={`rounded-lg p-3 whitespace-pre-wrap ${active === i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => ready && seek(cue.start)}
                >
                  <button
                    type="button"
                    disabled={!ready}
                    aria-label={`Seek to ${stamp}`}
                    className="mr-3 rounded px-1 font-mono text-xs underline focus-visible:outline-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(cue.start);
                    }}
                  >
                    {stamp}
                  </button>
                  <span lang="ja">
                    {parts.map((part: WordPart, j: number) => {
                      const content = part.reading ? (
                        <ruby>
                          {part.text}
                          <rt
                            style={{
                              color: active === i ? "inherit" : undefined,
                            }}
                          >
                            {part.reading}
                          </rt>
                        </ruby>
                      ) : (
                        part.text
                      );
                      return part.entries ? (
                        <button
                          key={j}
                          type="button"
                          className="word rounded px-0.5 focus-visible:outline-2"
                          aria-label={`Look up ${part.text}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openLookup(part, e.currentTarget);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <span key={j}>{content}</span>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <DictionaryPanel
        token={lookup}
        data={{
          tokens: {},
          sentences: [],
          dictionary: item.lookup?.dictionary || {},
        }}
        onClose={closeLookup}
      />
    </section>
  );
}
export function ListeningLibrary({
  initial,
  initialError,
}: {
  initial: Library | null;
  initialError: string;
}) {
  const { snapshot } = useAccount(),
    router = useRouter();
  const owner = snapshot.auth?.user.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [data, setData] = useState(initial),
    [selected, setSelected] = useState(initial?.items[0]?.video_id || "");
  const [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [subtitles, setSubtitles] = useState<string | undefined>("");
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    fileVersion = useRef(0);
  useEffect(() => {
    setData(initial);
    setSelected(initial?.items[0]?.video_id || "");
    setError(initialError);
  }, [initial, initialError]);
  useEffect(() => {
    setEditing(null);
    setUrl("");
    setTitle("");
    setSubtitles("");
    setNotice("");
    fileVersion.current++;
    if (fileRef.current) fileRef.current.value = "";
  }, [owner]);
  const visible = data?.userId === owner ? data : null;
  const item = visible?.items.find((x) => x.video_id === selected);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!owner || !snapshot.auth) return;
    const requestOwner = owner;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<Library>("/api/listening", {
        method: "POST",
        csrf: snapshot.auth.csrf,
        body: {
          url,
          title,
          subtitles,
          expectedRevision: editing?.revision || 0,
        },
      });
      if (ownerRef.current !== requestOwner) return;
      if (result.userId !== requestOwner)
        throw Error("Account changed. Reload before continuing.");
      setData(result);
      setSelected(result.items[0]?.video_id || "");
      setEditing(null);
      setUrl("");
      setTitle("");
      setSubtitles("");
      fileVersion.current++;
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Saved to your library. No deployment needed.");
    } catch (e: any) {
      if (ownerRef.current === requestOwner) setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function edit(x: Item) {
    setEditing(x);
    setUrl(`https://www.youtube.com/watch?v=${x.video_id}`);
    setTitle(x.title);
    setSubtitles(undefined);
    fileVersion.current++;
    if (fileRef.current) fileRef.current.value = "";
    setError("");
    setNotice("");
  }
  return (
    <main id="study-content" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Your listening library</h1>
        <p>Save a YouTube video and study with timed subtitles.</p>
        <Link className="underline" href="/listening/teppei-1586.html">
          Open existing listening lessons
        </Link>
      </header>
      {!owner ? (
        <p>Sign in from the account menu to save and open your videos.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="rounded-lg border p-3">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {!visible?.available ? (
            <div>
              <p>
                {visible && !visible.available
                  ? "Your listening library needs a one-time storage setup on this server. Existing lessons are still available."
                  : "Could not load your personal listening library."}
              </p>
              <Button variant="outline" onClick={() => router.refresh()}>
                Reload library
              </Button>
            </div>
          ) : (
            <>
              <nav className="flex flex-wrap gap-2" aria-label="Saved videos">
                {visible.items.map((x) => (
                  <Button
                    className="h-auto max-w-full whitespace-normal text-left"
                    key={x.video_id}
                    variant={selected === x.video_id ? "default" : "outline"}
                    onClick={() => setSelected(x.video_id)}
                  >
                    {x.title}
                    {!x.cues.length ? " · Subtitles needed" : ""}
                  </Button>
                ))}
              </nav>
              {item && (
                <>
                  <Video key={`${owner}:${item.video_id}`} item={item} />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => edit(item)}
                  >
                    Edit title or upload subtitles
                  </Button>
                </>
              )}
              <form
                onSubmit={submit}
                className="space-y-4 rounded-xl border p-5"
              >
                <h2 className="text-xl font-semibold">
                  {editing ? "Update saved video" : "Add a YouTube video"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Public YouTube links do not provide reliable automatic
                  subtitle access. Upload subtitles you are authorized to use,
                  or save the video and add them later. SRT/VTT, up to 500 KB.
                </p>
                <label className="block space-y-1">
                  YouTube link
                  <Input
                    required
                    type="url"
                    disabled={busy || !!editing}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </label>
                <label className="block space-y-1">
                  Title
                  <Input
                    required
                    maxLength={200}
                    disabled={busy}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  Subtitles (optional)
                  <Input
                    ref={fileRef}
                    type="file"
                    accept=".srt,.vtt,text/vtt"
                    disabled={busy}
                    onChange={async (e) => {
                      const version = ++fileVersion.current;
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500000) {
                        setError("Subtitles must be under 500 KB.");
                        e.target.value = "";
                        return;
                      }
                      setBusy(true);
                      try {
                        const text = await file.text();
                        if (fileVersion.current === version) {
                          setSubtitles(text);
                          setError("");
                        }
                      } catch {
                        setError("Could not read the subtitle file.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                {editing && (
                  <p className="text-sm">
                    Existing subtitles are kept unless you choose a replacement
                    file.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button disabled={busy} type="submit">
                    {busy
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Add to library"}
                  </Button>
                  {editing && (
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(null);
                        setUrl("");
                        setTitle("");
                        setSubtitles("");
                        fileVersion.current++;
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      Cancel edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => router.refresh()}
                  >
                    Reload library
                  </Button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </main>
  );
}

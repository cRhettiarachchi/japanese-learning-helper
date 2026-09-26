"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import parse, {
  attributesToProps,
  domToReact,
  Element,
  type DOMNode,
  type HTMLReactParserOptions,
} from "html-react-parser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "./account-provider";
import { ReaderSettings, useReaderSettings } from "./reader-settings";
import { DictionaryPanel } from "./dictionary-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { bindAudioProgress } from "../core/audio.cjs";
import type { StudyDocument, Token, GrammarRow } from "../lib/types";
export function StudyPage({ doc }: { doc: StudyDocument }) {
  const { progress, version } = useAccount(),
    router = useRouter();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [lookup, setLookup] = useState<Token | null>(null),
    [focused, setFocused] = useState(false),
    [follow, setFollow] = useState(true),
    [current, setCurrent] = useState(0),
    [speaking, setSpeaking] = useState<string | null>(null),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState("1"),
    [playerError, setPlayerError] = useState("");
  const reader = useReaderSettings(),
    audio = useRef<HTMLAudioElement>(null),
    checkbox = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    triggerWord = useRef<string | null>(null),
    resume = useRef(false),
    lookupRef = useRef(false),
    content = useRef<HTMLDivElement>(null);
  const sentences = doc.data?.sentences || [];
  const kind = doc.kind === "grammar" ? "grammar" : "article";
  const count = doc.keys.filter((k) => progress?.get(kind, k.id)).length;
  const closeLookup = (restore = true) => {
    setLookup(null);
    lookupRef.current = false;
    const should = resume.current;
    resume.current = false;
    if (restore) {
      // Wait until the sheet focus trap has released; a React update may replace the word node.
      requestAnimationFrame(() => {
        const target = trigger.current?.isConnected
          ? trigger.current
          : triggerWord.current
            ? content.current?.querySelector<HTMLElement>(
                `[data-word="${CSS.escape(triggerWord.current)}"]`,
              )
            : null;
        target?.focus({ preventScroll: true });
      });
      if (should)
        void audio.current
          ?.play()
          .catch(() => setPlayerError("Press play to resume audio."));
    }
  };
  const openLookup = (id: string, element: HTMLElement) => {
    const token = doc.data?.tokens[id];
    if (!token) return;
    if (!lookupRef.current)
      resume.current =
        !!audio.current && !audio.current.paused && !audio.current.ended;
    lookupRef.current = true;
    audio.current?.pause();
    trigger.current = element;
    triggerWord.current = id;
    setLookup(token);
  };
  function seek(time: number) {
    if (lookupRef.current) closeLookup(false);
    if (audio.current) {
      audio.current.currentTime = time;
      void audio.current
        .play()
        .catch(() =>
          setPlayerError("Press play in the audio player to begin."),
        );
    }
  }
  useEffect(() => {
    if (!audio.current || !checkbox.current || !progress) return;
    const id = audio.current
      .getAttribute("src")!
      .split("/")
      .pop()!
      .replace(".mp3", "");
    const controller = bindAudioProgress({
      audio: audio.current,
      checkbox: checkbox.current,
      progress,
      id,
      storage: null,
    });
    const sync = () => controller.refreshDone();
    const off = progress.subscribe(sync);
    const hidden = () => {
      if (document.hidden) controller.save();
    };
    window.addEventListener("pagehide", controller.save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      controller.save();
      controller.dispose();
      off();
      window.removeEventListener("pagehide", controller.save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [progress, doc.route]);
  useEffect(() => {
    if (!sentences.length) return;
    let frame = 0;
    const update = () => {
      const a = audio.current;
      if (a) {
        let index = 0;
        for (let i = 0; i < sentences.length; i++) {
          if (sentences[i].start <= a.currentTime) index = i;
          else break;
        }
        setCurrent(index);
        const word = !a.paused
          ? sentences[index].words.find((id) => {
              const t = doc.data?.tokens[id]?.timing;
              return t && a.currentTime >= t[0] && a.currentTime < t[1];
            })
          : null;
        setSpeaking(word || null);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [doc, sentences]);
  useEffect(() => {
    if (follow && playing && !focused && !lookupRef.current)
      content.current
        ?.querySelector(`[data-sentence="${current}"]`)
        ?.scrollIntoView({
          block: "center",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
  }, [current, follow, playing, focused]);
  useEffect(() => {
    if (location.hash) {
      try {
        document
          .getElementById(decodeURIComponent(location.hash.slice(1)))
          ?.scrollIntoView();
      } catch {}
    }
  }, [doc.route]);
  const continueReading = () => {
    const next = doc.keys.find((k) => !progress?.get(kind, k.id));
    if (!next) return;
    setQuery("");
    setStatus("all");
    router.push(doc.route + "#" + next.anchor);
    setTimeout(() => {
      document.getElementById(next.anchor)?.scrollIntoView();
      (
        document
          .getElementById(next.anchor)
          ?.querySelector("input") as HTMLElement
      )?.focus({ preventScroll: true });
    }, 0);
  };
  const grammarRows = doc.grammarRows || [];
  const matchesRow = (row: GrammarRow) => {
    const done = row.lesson && progress?.get("grammar", row.lesson);
    return (
      row.topic.includes(query.toLocaleLowerCase().trim()) &&
      (status === "all" ||
        (status === "gaps" && !row.lesson) ||
        (status === "done" && done) ||
        (status === "todo" && row.lesson && !done))
    );
  };
  const shown = grammarRows.filter(matchesRow).length;
  const options: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element)) return;
      const a = node.attribs,
        id = a.id,
        children = () => domToReact(node.children as DOMNode[], options);
      const props = attributesToProps(a);
      if (node.name === "script" || node.name === "style") return <></>;
      if (node.name === "a") {
        const href = a.href || "";
        if (href.startsWith("#stage-"))
          return (
            <a
              {...props}
              href={href}
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              {children()}
            </a>
          );
        if (
          href.startsWith("/") &&
          !href.startsWith("/api/") &&
          !("download" in a) &&
          a.target !== "_blank" &&
          (/\.html(?:#|$)/.test(href) || href === "/")
        )
          return (
            <Link {...props} href={href}>
              {children()}
            </Link>
          );
        return;
      }
      if (a["data-word"])
        return (
          <button
            {...props}
            type="button"
            className={`${a.class || ""} ${speaking === a["data-word"] ? "speaking" : ""} ${lookup === doc.data?.tokens[a["data-word"]] ? "selected" : ""}`}
            onClick={(e) => openLookup(a["data-word"], e.currentTarget)}
          >
            {children()}
          </button>
        );
      const completion = a["data-reading-key"] || a["data-lesson"];
      if (completion)
        return (
          <input
            {...props}
            type="checkbox"
            checked={
              !!progress?.get(
                a["data-lesson"] ? "grammar" : "article",
                completion,
              )
            }
            disabled={!progress?.canEdit()}
            onChange={(e) =>
              progress?.set(
                a["data-lesson"] ? "grammar" : "article",
                completion,
                "done",
                e.target.checked,
              )
            }
          />
        );
      if (a["data-read-indicator"])
        return (
          <span {...props}>
            {progress?.get("article", a["data-read-indicator"])
              ? "· Read ✓"
              : ""}
          </span>
        );
      if (id === "reading-date")
        return (
          <select
            {...props}
            value={doc.route === "/index.html" ? undefined : doc.route}
            defaultValue={doc.route === "/index.html" ? undefined : undefined}
            onChange={(e) => router.push(e.target.value)}
          >
            {children()}
          </select>
        );
      if (node.name === "option")
        return <option value={a.value}>{children()}</option>;
      if (id === "reading-progress" || id === "progress-label")
        return (
          <p {...props}>
            {count} of {doc.keys.length}{" "}
            {kind === "article" ? "articles read" : "lessons complete"}
          </p>
        );
      if (id === "progress")
        return <progress {...props} max={doc.keys.length} value={count} />;
      if (id === "continue-reading" || id === "continue")
        return (
          <Button
            {...props}
            disabled={count === doc.keys.length}
            onClick={continueReading}
          >
            {count === doc.keys.length
              ? "All complete ✓"
              : kind === "article"
                ? "Continue reading →"
                : "Continue learning →"}
          </Button>
        );
      if (id === "storage-warning" || id === "reading-storage-warning")
        return <></>;
      if (id === "search")
        return (
          <Input
            {...props}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        );
      if (id === "status")
        return (
          <select
            {...props}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {children()}
          </select>
        );
      if (id === "results")
        return (
          <p {...props}>
            {shown} of {grammarRows.length} entries shown · Lesson order stays
            the same
          </p>
        );
      if (id === "empty")
        return (
          <p {...props} hidden={shown !== 0}>
            No lessons match these filters.
          </p>
        );
      if (node.name === "tr" && a["data-topic"]) {
        const lesson = doc.keys.find((k) => k.anchor === id),
          done = lesson && progress?.get("grammar", lesson.id);
        const visible =
          a["data-topic"].includes(query.toLocaleLowerCase().trim()) &&
          (status === "all" ||
            (status === "gaps" && !lesson) ||
            (status === "done" && done) ||
            (status === "todo" && lesson && !done));
        return (
          <tr {...props} hidden={!visible} className={done ? "complete" : ""}>
            {children()}
          </tr>
        );
      }
      if (a.class === "stage-count") {
        const section = node.parent?.parent?.parent as Element;
        const ids = grammarRows
          .filter((row) => row.stage === section.attribs.id && row.lesson)
          .map((row) => row.lesson!);
        return (
          <span className="stage-count">
            {ids.length
              ? `${ids.filter((k) => progress?.get("grammar", k)).length} / ${ids.length} complete`
              : "Coverage gaps"}
          </span>
        );
      }
      if (node.name === "section" && a.class === "stage") {
        const rows = grammarRows.filter((row) => row.stage === id);
        return (
          <section {...props} hidden={!rows.some(matchesRow)}>
            {children()}
          </section>
        );
      }
      if (node.name === "article" && doc.kind === "reading") {
        const item = doc.keys.find((k) => k.anchor === id);
        return (
          <article
            {...props}
            className={`${a.class || ""} ${item && progress?.get("article", item.id) ? "is-read" : ""}`}
          >
            {children()}
          </article>
        );
      }
      if ("data-print" in a)
        return (
          <Button onClick={() => window.print()}>
            Print {doc.route.includes("answers") ? "answer guide" : "test"}
          </Button>
        );
      if (id === "episode-audio") {
        const audioId = a.src.split("/").pop()!.replace(".mp3", "");
        return (
          <>
            <audio
              {...props}
              ref={audio}
              controls
              onPlay={() => {
                if (lookupRef.current) audio.current?.pause();
                else setPlaying(true);
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <label className="audio-completion">
              <input
                ref={checkbox}
                id="audio-done"
                type="checkbox"
                checked={!!progress?.get("audio", audioId)}
                disabled={!progress?.canEdit()}
                onChange={() => {}}
              />{" "}
              Mark audio as done
            </label>
          </>
        );
      }
      if (id === "playback-speed")
        return (
          <select
            {...props}
            value={speed}
            onChange={(e) => {
              setSpeed(e.target.value);
              if (audio.current)
                audio.current.playbackRate = Number(e.target.value);
            }}
          >
            {children()}
          </select>
        );
      if (id === "show-readings")
        return (
          <input
            {...props}
            type="checkbox"
            checked={reader.settings.readings}
            onChange={(e) => reader.update({ readings: e.target.checked })}
          />
        );
      if (id === "follow-audio")
        return (
          <input
            {...props}
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
        );
      if (id === "view-full" || id === "view-focus")
        return (
          <Button
            variant={(id === "view-focus") === focused ? "default" : "outline"}
            id={id}
            aria-pressed={(id === "view-focus") === focused}
            onClick={() => setFocused(id === "view-focus")}
          >
            {children()}
          </Button>
        );
      if (id === "player-status") return <p role="status">{playerError}</p>;
      if (id === "transcript")
        return (
          <article {...props} hidden={focused}>
            {children()}
          </article>
        );
      if (a["data-sentence"])
        return (
          <span
            {...props}
            className={`${a.class || ""} ${Number(a["data-sentence"]) === current ? "current" : ""}`}
          >
            {children()}
          </span>
        );
      if (a["data-start"] !== undefined || a["data-seek"] !== undefined)
        return (
          <button
            {...props}
            onClick={() => seek(Number(a["data-start"] ?? a["data-seek"]))}
          >
            {children()}
          </button>
        );
      if (id === "focus-view")
        return (
          <section {...props} hidden={!focused}>
            <div className="focus-navigation">
              <Button
                id="previous-sentence"
                variant="outline"
                disabled={current === 0}
                onClick={() => seek(sentences[current - 1].start)}
              >
                Previous sentence
              </Button>
              <p id="sentence-position">
                Sentence {current + 1} of {sentences.length}
              </p>
              <Button
                id="next-sentence"
                variant="outline"
                disabled={current === sentences.length - 1}
                onClick={() => seek(sentences[current + 1].start)}
              >
                Next sentence
              </Button>
            </div>
            <div id="focus-window">
              {sentences
                .slice(Math.max(0, current - 2), current + 3)
                .map((s, i) => (
                  <div
                    key={s.start}
                    className={`focus-row ${s === sentences[current] ? "current" : ""}`}
                    aria-current={s === sentences[current] ? "true" : undefined}
                  >
                    <button className="timestamp" onClick={() => seek(s.start)}>
                      {Math.floor(s.start / 60)}:
                      {String(Math.floor(s.start) % 60).padStart(2, "0")} ▶
                    </button>
                    <p>{parse(s.html, options)}</p>
                  </div>
                ))}
            </div>
          </section>
        );
    },
  };
  return (
    <div
      id="study-content"
      tabIndex={-1}
      ref={content}
      className={`study-document ${doc.kind} ${reader.settings.readings ? "" : "hide-readings"}`}
      style={reader.style}
    >
      {(doc.kind === "reading" || doc.kind === "listening") && (
        <ReaderSettings {...reader} />
      )}{" "}
      {parse(doc.html, options)}
      <DictionaryPanel
        token={lookup}
        data={doc.data}
        onClose={() => closeLookup()}
      />
    </div>
  );
}

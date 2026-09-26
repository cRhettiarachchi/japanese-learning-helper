"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "./account-provider";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

type Feedback = {
  id: string;
  verdict: "correct" | "less_natural" | "incorrect";
  explanation: string;
  exampleAnswer: string;
};
type Practice = {
  userId: string;
  setId: string;
  lessonId: string;
  revision: number;
  expiresAt: string;
  questions: { id: string; prompt: string; type: string }[];
  feedback: Feedback[] | null;
};
export function GrammarPractice({
  lesson,
  onClose,
}: {
  lesson: { id: string; title: string };
  onClose: () => void;
}) {
  const { progress } = useAccount();
  const owner = progress.user?.id;
  // Account changes destroy all in-memory questions/answers and cancel stale UI responses.
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="practice-dialog"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>Practice · {lesson.title}</DialogTitle>
        <DialogDescription>
          Ten short written answers. AI feedback can make mistakes; valid
          alternatives are welcome.
        </DialogDescription>
        {owner ? (
          <PracticeForm
            key={`${owner}:${lesson.id}`}
            lesson={lesson}
            owner={owner}
            onClose={onClose}
          />
        ) : (
          <>
            <p>Sign in to generate practice questions.</p>
            <Button onClick={onClose}>Done</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
function PracticeForm({
  lesson,
  owner,
  onClose,
}: {
  lesson: { id: string; title: string };
  owner: string;
  onClose: () => void;
}) {
  const { progress } = useAccount();
  const [set, setPractice] = useState<Practice | null>(null),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retrying, setRetrying] = useState(false);
  const active = useRef(true),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false),
    requestId = useRef<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  async function send(body: unknown) {
    if (progress.user?.id !== owner || !progress.csrf)
      throw Error("Sign in again before continuing.");
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 55000);
    try {
      const response = await fetch("/api/grammar-practice", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.current.signal,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": progress.csrf,
        },
        body: JSON.stringify(body),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw Error("Sign in again before continuing.");
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Practice could not finish. Please retry.");
      if (data.userId !== owner)
        throw Error("Account changed. Reopen practice.");
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Connection interrupted. Your answers are still here; please retry.",
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function generate() {
    requestId.current ||= crypto.randomUUID();
    await perform(async () => {
      const data = await send({
        action: "generate",
        lessonId: lesson.id,
        requestId: requestId.current,
      });
      if (active.current) setPractice(data);
    });
  }
  // The parent button opens a deliberate generation action; this runs once per mounted form.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void generate();
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const completed =
    set?.questions.filter((q) => answers[q.id]?.trim()).length || 0;
  const mistakes =
    set?.feedback?.filter((f) => f.verdict === "incorrect") || [];
  async function grade() {
    if (!set || completed !== 10) return;
    await perform(async () => {
      const data = await send({
        action: "grade",
        setId: set.setId,
        revision: set.revision,
        answers: set.questions.map((q) => ({ id: q.id, text: answers[q.id] })),
      });
      if (active.current) {
        setPractice(data);
        setRetrying(false);
      }
    });
  }
  async function done() {
    await perform(async () => {
      if (set) await send({ action: "done", setId: set.setId });
      if (active.current) onClose();
    });
  }
  return (
    <div className="practice-form">
      <p className="practice-note">
        Questions and answers are sent to OpenAI when you generate or submit.
        Only a small learning summary is kept long-term. This set lasts two
        hours; keep this page open to retain typed answers.
      </p>
      {busy && (
        <p role="status">
          {set ? "Working on your practice…" : "Preparing ten questions…"}
        </p>
      )}
      {error && (
        <p role="alert" className="practice-error">
          {error}
        </p>
      )}
      {!set && !busy && (
        <Button onClick={() => void generate()}>Try generating again</Button>
      )}
      {set && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void grade();
          }}
        >
          <p aria-live="polite">
            {set.feedback && !retrying
              ? `${10 - mistakes.length} of 10 accepted`
              : `${completed} of 10 answered`}
          </p>
          <ol className="practice-questions">
            {set.questions.map((q, i) => {
              const feedback = set.feedback?.find((f) => f.id === q.id);
              const editable =
                !feedback || (retrying && feedback.verdict === "incorrect");
              return (
                <li key={q.id}>
                  <label htmlFor={`practice-${q.id}`}>
                    {i + 1}. {q.prompt}
                  </label>
                  <textarea
                    id={`practice-${q.id}`}
                    lang="ja"
                    rows={2}
                    maxLength={500}
                    required
                    disabled={busy}
                    readOnly={!editable}
                    value={answers[q.id] || ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                    }
                    aria-describedby={feedback ? `feedback-${q.id}` : undefined}
                  />
                  {feedback && (
                    <div
                      id={`feedback-${q.id}`}
                      className={`practice-feedback ${feedback.verdict}`}
                    >
                      <strong>
                        {feedback.verdict === "incorrect"
                          ? "Try again"
                          : feedback.verdict === "less_natural"
                            ? "Accepted · wording suggestion"
                            : "Correct"}
                      </strong>
                      <p>{feedback.explanation}</p>
                      <p lang="ja">
                        <span lang="en">Example: </span>
                        {feedback.exampleAnswer}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {(!set.feedback || retrying) && (
            <Button type="submit" disabled={busy || completed !== 10}>
              {retrying ? "Check answers again" : "Submit all ten"}
            </Button>
          )}
          {!!mistakes.length && !retrying && (
            <Button
              type="button"
              disabled={busy || set.revision >= 4}
              onClick={() => setRetrying(true)}
            >
              Retry mistakes
            </Button>
          )}
          {set.revision >= 4 && (
            <p>
              Retry limit reached. Choose Done and generate another set when
              ready.
            </p>
          )}
        </form>
      )}
      <Button variant="outline" disabled={busy} onClick={() => void done()}>
        Done
      </Button>
    </div>
  );
}

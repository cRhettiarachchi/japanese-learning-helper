"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider } from "next-themes";
import { ProgressStore } from "../core/progress.cjs";
import { VocabularyStore } from "../core/vocabulary.cjs";
import { request, safeStorage } from "../lib/request";
import type {
  AccountSnapshot,
  ProgressModel,
  VocabularyModel,
} from "../lib/types";
interface Account {
  progress: ProgressModel;
  vocabulary: VocabularyModel | null;
  snapshot: AccountSnapshot;
  version: number;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Context = createContext<Account | null>(null);
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw Error("Account provider missing");
  return value;
}
// Methods defer browser access until effects/actions. Constructors and SSR hydration do no storage I/O.
const storage: Storage = {
  get length() {
    return safeStorage().length;
  },
  key: (i) => safeStorage().key(i),
  getItem: (key) => safeStorage().getItem(key),
  setItem: (key, value) => safeStorage().setItem(key, value),
  removeItem: (key) => safeStorage().removeItem(key),
  clear: () => safeStorage().clear(),
};
export function AccountProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: AccountSnapshot;
}) {
  const [error, setError] = useState(initial.error || ""),
    [version, render] = useState(0),
    [snapshot, setSnapshot] = useState(initial);
  const [progress] = useState<ProgressModel>(() => {
    const store = new ProgressStore({
      storage,
      request,
      notify: setError,
      catalog: initial.catalog,
    });
    store.hydrate(initial);
    return store;
  });
  function vocabularyFor(data: AccountSnapshot): VocabularyModel | null {
    if (!data.auth) return null;
    const owner = data.auth.user.id;
    const scopedRequest = async (url: string, options?: any) => {
      const result = await request(url, options);
      if (
        (result.user?.id && result.user.id !== owner) ||
        (result.userId && result.userId !== owner)
      )
        throw Object.assign(
          Error("Account changed. Reconnect before saving."),
          { status: 403 },
        );
      return result;
    };
    const next: VocabularyModel = new VocabularyStore({
      storage,
      request: scopedRequest,
      getAuth: async () => {
        if (progress.user?.id !== owner || !progress.csrf)
          throw Object.assign(Error("Sign in required"), { status: 401 });
        return { user: progress.user, csrf: progress.csrf };
      },
    });
    next.auth = data.auth;
    next.data = data.vocabulary;
    return next;
  }
  const [vocabulary, setVocabulary] = useState<VocabularyModel | null>(() =>
    vocabularyFor(initial),
  );
  const latest = useRef(snapshot),
    refreshing = useRef<Promise<void> | null>(null),
    epoch = useRef(0);
  latest.current = snapshot;
  progress.snapshot = async () => {
    const started = epoch.current;
    const result = await request<AccountSnapshot>("/api/account");
    if (started !== epoch.current) return latest.current;
    latest.current = result;
    setSnapshot(result);
    return result;
  };
  async function refresh() {
    if (refreshing.current) return refreshing.current;
    const run = progress.refresh();
    refreshing.current = run;
    try {
      await run;
    } finally {
      refreshing.current = null;
    }
  }
  useEffect(() => {
    const off = progress.subscribe(() => render((n) => n + 1));
    void progress.recover();
    return off;
  }, [progress]);
  const owner = progress.user?.id || null;
  useEffect(() => {
    if (!owner) {
      setVocabulary(null);
      return;
    }
    if (vocabulary?.auth?.user.id !== owner) {
      const data = latest.current;
      if (data.auth?.user.id === owner) setVocabulary(vocabularyFor(data));
    } else if (
      snapshot.vocabulary?.userId === owner &&
      !vocabulary.busy &&
      (!vocabulary.data ||
        new Date(snapshot.vocabulary.serverNow) >=
          new Date(vocabulary.data.serverNow))
    )
      vocabulary.accept(snapshot.vocabulary);
  }, [owner, snapshot]);
  useEffect(() => {
    if (!vocabulary) return;
    const off = vocabulary.subscribe(() => render((n) => n + 1));
    try {
      if (vocabulary.pending().length) void vocabulary.load();
    } catch {
      setError(
        "Pending vocabulary changes could not be read. They were kept unchanged.",
      );
    }
    return off;
  }, [vocabulary]);
  useEffect(() => {
    let eventRefresh: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (document.hidden) return;
      clearTimeout(eventRefresh);
      eventRefresh = setTimeout(() => void refresh(), 100);
    };
    const changed = (event: StorageEvent) => {
      if (
        event.key === "learner.account.changed" ||
        event.key === null ||
        event.key?.startsWith(
          `japanese-learner-account-v1:${progress.user?.id}:pending:`,
        )
      )
        update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("storage", changed);
    return () => {
      clearTimeout(eventRefresh);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("storage", changed);
    };
  }, [progress]);
  async function signOut() {
    try {
      await request("/api/auth/signout", {
        method: "POST",
        body: {},
        csrf: progress.csrf,
      });
      const empty: AccountSnapshot = {
        ...snapshot,
        status: "signedout",
        auth: null,
        progress: null,
        timer: null,
        vocabulary: null,
        error: null,
      };
      epoch.current++;
      latest.current = empty;
      progress.hydrate(empty);
      setSnapshot(empty);
      setVocabulary(null);
      setError("");
      render((n) => n + 1);
      try {
        storage.setItem("learner.account.changed", crypto.randomUUID());
      } catch {}
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Context.Provider
        value={{
          progress,
          vocabulary:
            owner && (!vocabulary?.auth || vocabulary.auth.user.id === owner)
              ? vocabulary
              : null,
          snapshot,
          version,
          error,
          refresh,
          signOut,
        }}
      >
        {children}
      </Context.Provider>
    </ThemeProvider>
  );
}

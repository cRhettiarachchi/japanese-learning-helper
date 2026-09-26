"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider } from "next-themes";
import { ProgressStore } from "../core/progress.cjs";
import { VocabularyStore } from "../core/vocabulary.cjs";
import { request, safeStorage } from "../lib/request";
import type { ProgressModel, VocabularyModel } from "../lib/types";
interface Account {
  progress: ProgressModel | null;
  vocabulary: VocabularyModel | null;
  version: number;
  error: string;
  signOut: () => Promise<void>;
}
const Context = createContext<Account>({
  progress: null,
  vocabulary: null,
  version: 0,
  error: "",
  signOut: async () => {},
});
export function useAccount() {
  return useContext(Context);
}
export function AccountProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<{
      progress: ProgressModel;
    } | null>(null),
    [accountVocabulary, setAccountVocabulary] =
      useState<VocabularyModel | null>(null),
    [version, render] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const storage = safeStorage();
    const progress: ProgressModel = new ProgressStore({
      storage,
      request,
      notify: setError,
    });
    let alive = true;
    const update = () => {
      if (alive) render((n) => n + 1);
    };
    const off = progress.subscribe(update);
    setStores({ progress });
    void (async () => {
      try {
        progress.catalog = await request("/progress-catalog.json");
      } catch {}
      if (alive) await progress.refresh();
    })();
    const refresh = () => {
      if (!document.hidden) void progress.refresh();
    };
    const storageChanged = (e: StorageEvent) => {
      if (e.key === null || e.key.includes(":pending:")) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const user = stores?.progress.user?.id || null;
  useEffect(() => {
    setAccountVocabulary(null);
    if (!stores || !user) return;
    const scopedRequest = async (url: string, options?: any) => {
      const result = await request(url, options);
      if (
        (result.user?.id && result.user.id !== user) ||
        (result.userId && result.userId !== user)
      )
        throw Object.assign(Error("Account changed. Reconnecting."), {
          status: 403,
        });
      return result;
    };
    const next: VocabularyModel = new VocabularyStore({
      storage: safeStorage(),
      request: scopedRequest,
    });
    setAccountVocabulary(next);
    const off = next.subscribe(() => render((n) => n + 1));
    void next.load();
    return off;
  }, [stores, user]);
  async function signOut() {
    if (!stores) return;
    try {
      await request("/api/auth/signout", {
        method: "POST",
        body: {},
        csrf: stores.progress.csrf,
      });
      await stores.progress.refresh();
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
          progress: stores?.progress || null,
          vocabulary:
            user &&
            (!accountVocabulary?.auth ||
              accountVocabulary.auth.user.id === user)
              ? accountVocabulary
              : null,
          version,
          error,
          signOut,
        }}
      >
        {children}
      </Context.Provider>
    </ThemeProvider>
  );
}

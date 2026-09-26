export interface User {
  id: string;
  name: string;
}
export interface Auth {
  user: User;
  csrf: string;
}
export interface Token {
  entries: string[];
  surface?: string;
  lemma?: string;
  timing?: number[];
}
export interface DictionaryEntry {
  forms?: string[];
  readings?: string[];
  senses: { gloss: string[] }[];
}
export interface Sentence {
  start: number;
  html: string;
  words: string[];
}
export interface LookupData {
  tokens: Record<string, Token>;
  dictionary: Record<string, DictionaryEntry>;
  sentences?: Sentence[];
}
export interface GrammarRow {
  id: string;
  topic: string;
  lesson: string | null;
  stage: string;
}
export interface StudyDocument {
  grammarRows: GrammarRow[];
  route: string;
  title: string;
  kind: "reading" | "grammar" | "listening" | "revision";
  html: string;
  styles: string;
  keys: { id: string; anchor: string }[];
  data: LookupData | null;
}
export interface VocabularyItem {
  entry_id: string;
  word: string;
  reading: string;
  readings: string[];
  meanings: string[];
  stage: number;
  due_at: string;
  revision: number;
}
export interface VocabularyData {
  userId: string;
  items: VocabularyItem[];
  dueCount: number;
  serverNow: string;
  lastRating?: Rating;
}
export interface Rating {
  id: string;
  entryId: string;
  revision: number;
  rating: string;
}
export type ProgressKind = "article" | "grammar" | "audio";
export interface ProgressModel {
  user: User | null;
  csrf: string | null;
  busy: boolean;
  loading: boolean;
  loaded: boolean;
  catalog: unknown;
  canEdit(): boolean;
  get(kind: ProgressKind, id: string, field?: string): any;
  set(kind: ProgressKind, id: string, field: string, value: unknown): void;
  refresh(): Promise<void>;
  subscribe(fn: () => void): () => void;
}
export interface VocabularyModel {
  auth: Auth | null;
  data: VocabularyData | null;
  busy: boolean;
  error: string;
  lastRating: Rating | null;
  subscribe(fn: () => void): () => void;
  load(): Promise<boolean>;
  mutate(input: Record<string, unknown>): Promise<boolean>;
  has(id: string): boolean;
}

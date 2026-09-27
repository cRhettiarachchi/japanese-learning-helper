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
export interface GrammarVideo {
  id: string;
  title: string;
}
export interface GrammarRow {
  videos?: GrammarVideo[];
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
export interface RevisionCard {
  japanese: string;
  intent: string;
  prompt: string;
  answer: string;
  segments: { text: string; reading: string }[];
}
export interface VocabularyItem {
  card?: RevisionCard | null;
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
  hydrate(snapshot: AccountSnapshot): void;
  recover(): Promise<void>;
  snapshot?: () => Promise<AccountSnapshot>;
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
  accept(data: VocabularyData): void;
  pending(): unknown[];
  has(id: string): boolean;
}

export interface ProgressRow {
  kind: ProgressKind;
  id: string;
  field: string;
  value: unknown;
  revision: number;
}
export interface SavedStudySession {
  id: string;
  state: string;
  confirmed_seconds: number;
  elapsed_ms: number;
  revision: number;
  started_at: string;
}
export interface TimerData {
  userId: string;
  totalSeconds: number;
  history: SavedStudySession[];
  current?: SavedStudySession | null;
  serverNow?: string;
}
export interface NoteNode {
  type: string;
  text?: string;
  attrs?: { level?: number; start?: number };
  marks?: { type: string }[];
  content?: NoteNode[];
}
export interface VideoNote {
  video_id: string;
  document: NoteNode | null;
  revision: number;
  updated_at: string;
}
export interface NoteSnapshot {
  userId: string;
  available: boolean;
  items: VideoNote[];
}
export interface NoteSave {
  videoId: string;
  document: NoteNode | null;
  expectedRevision: number;
  mutationId: string;
}
export interface VideoNoteModel {
  auth: Auth;
  data: NoteSnapshot;
  busy: boolean;
  subscribe(fn: () => void): () => void;
  accept(data: NoteSnapshot): void;
  get(id: string): VideoNote | null;
  load(): Promise<void>;
  save(body: NoteSave): Promise<void>;
}
export interface AccountSnapshot {
  notes?: NoteSnapshot | null;
  status: "account" | "signedout" | "unavailable";
  auth: Auth | null;
  progress: { userId: string; rows: ProgressRow[] } | null;
  timer: TimerData | null;
  vocabulary: VocabularyData | null;
  catalog: unknown;
  error: string | null;
}

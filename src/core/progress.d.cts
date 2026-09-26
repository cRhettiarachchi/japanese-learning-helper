import type { ProgressModel } from "../lib/types";
export const ProgressStore: {
  new (options: {
    storage: Storage;
    request: (url: string, options?: any) => Promise<any>;
    notify?: (message: string) => void;
    uuid?: () => string;
    catalog?: unknown;
  }): ProgressModel;
};
export function keyOf(kind: string, id: string, field: string): string;
export const legacyKeys: Record<string, string>;

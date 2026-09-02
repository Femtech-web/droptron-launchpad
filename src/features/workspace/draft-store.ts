export type WorkspaceDraft = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

export function readDrafts(storageKey: string): WorkspaceDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveDraft(storageKey: string, draft: WorkspaceDraft) {
  window.localStorage.setItem(storageKey, JSON.stringify([draft, ...readDrafts(storageKey)]));
}

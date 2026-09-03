export type WorkspaceDraft = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  values?: Record<string, string>;
};

export type DraftSaveResult = {
  draft: WorkspaceDraft;
  synced: boolean;
};

type ResourceType = "launch" | "distribution";

function resourceTypeFor(storageKey: string): ResourceType {
  if (storageKey === "droptron.launches.v1") return "launch";
  if (storageKey === "droptron.distributions.v1") return "distribution";
  throw new Error("This workspace cannot be synced yet.");
}

export function readDrafts(storageKey: string): WorkspaceDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalDrafts(storageKey: string, drafts: WorkspaceDraft[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(drafts));
}

function saveLocalDraft(storageKey: string, draft: WorkspaceDraft) {
  const drafts = readDrafts(storageKey).filter((item) => item.id !== draft.id);
  writeLocalDrafts(storageKey, [draft, ...drafts]);
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Workspace sync is unavailable.");
  return body;
}

async function remoteDrafts(storageKey: string) {
  const type = resourceTypeFor(storageKey);
  const body = await request<{ drafts: WorkspaceDraft[] }>(`/api/workspace/drafts?type=${type}`, { cache: "no-store" });
  return body.drafts;
}

/** Load the signed wallet workspace and import pre-existing browser drafts once. */
export async function loadDrafts(storageKey: string, syncEnabled: boolean) {
  const localDrafts = readDrafts(storageKey);
  if (!syncEnabled) return localDrafts;

  try {
    if (localDrafts.length > 0) {
      for (const draft of [...localDrafts].reverse()) {
        await request("/api/workspace/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resourceType: resourceTypeFor(storageKey), draft }),
        });
      }
      window.localStorage.removeItem(storageKey);
    }
    return await remoteDrafts(storageKey);
  } catch (error) {
    console.error("[Droptron workspace] synced load failed", error);
    return localDrafts;
  }
}

export async function saveDraft(storageKey: string, draft: WorkspaceDraft, syncEnabled: boolean): Promise<DraftSaveResult> {
  if (!syncEnabled) {
    saveLocalDraft(storageKey, draft);
    return { draft, synced: false };
  }

  try {
    const body = await request<{ draft: WorkspaceDraft }>("/api/workspace/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceType: resourceTypeFor(storageKey), draft }),
    });
    const remaining = readDrafts(storageKey).filter((item) => item.id !== draft.id);
    if (remaining.length > 0) writeLocalDrafts(storageKey, remaining);
    else window.localStorage.removeItem(storageKey);
    return { draft: body.draft, synced: true };
  } catch (error) {
    console.error("[Droptron workspace] synced save failed", error);
    saveLocalDraft(storageKey, draft);
    return { draft, synced: false };
  }
}

function mergeDraft(draft: WorkspaceDraft, update: Partial<WorkspaceDraft>) {
  return {
    ...draft,
    ...update,
    values: update.values ? { ...draft.values, ...update.values } : draft.values,
  };
}

export async function updateDraft(storageKey: string, id: string, update: Partial<WorkspaceDraft>, syncEnabled: boolean): Promise<DraftSaveResult | null> {
  if (syncEnabled) {
    try {
      const body = await request<{ draft: WorkspaceDraft }>("/api/workspace/drafts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, resourceType: resourceTypeFor(storageKey), update }),
      });
      return { draft: body.draft, synced: true };
    } catch (error) {
      console.error("[Droptron workspace] synced update failed", error);
    }
  }

  const drafts = readDrafts(storageKey);
  const existing = drafts.find((draft) => draft.id === id);
  if (!existing) return null;
  const nextDraft = mergeDraft(existing, update);
  writeLocalDrafts(storageKey, drafts.map((draft) => draft.id === id ? nextDraft : draft));
  return { draft: nextDraft, synced: false };
}

export async function loadDraft(storageKey: string, id: string, syncEnabled: boolean) {
  return (await loadDrafts(storageKey, syncEnabled)).find((draft) => draft.id === id) ?? null;
}

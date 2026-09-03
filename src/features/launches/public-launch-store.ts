import type { WorkspaceDraft } from "@/features/workspace/draft-store";

async function responseJson<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Launch discovery is unavailable.");
  return body;
}

export async function loadPublicLaunches() {
  const response = await fetch("/api/launches", { cache: "no-store" });
  return (await responseJson<{ launches: WorkspaceDraft[] }>(response)).launches;
}

export async function loadPublicLaunch(id: string) {
  const response = await fetch(`/api/launches?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  return (await responseJson<{ launch: WorkspaceDraft | null }>(response)).launch;
}

export async function publishLaunch(draft: WorkspaceDraft) {
  const response = await fetch("/api/launches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  return (await responseJson<{ launch: WorkspaceDraft }>(response)).launch;
}

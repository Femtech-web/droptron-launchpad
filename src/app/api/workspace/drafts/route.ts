import { NextResponse } from "next/server";

import { decryptRecipientManifest, encryptRecipientManifest } from "@/lib/recipient-manifest";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { currentWalletSession } from "@/lib/wallet-session";

type ResourceType = "launch" | "distribution";
type DraftInput = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  values?: Record<string, string>;
};

const RECIPIENT_FIELDS = ["recipients", "recipientsInput", "recipientInput", "recipient_list"] as const;

function extractRecipientManifest(values: Record<string, string>) {
  const manifest = values.recipients;
  for (const field of RECIPIENT_FIELDS) delete values[field];
  return manifest;
}

function resourceType(value: unknown): ResourceType | null {
  return value === "launch" || value === "distribution" ? value : null;
}

function validDraft(value: unknown): value is DraftInput {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<DraftInput>;
  return typeof draft.id === "string"
    && /^[0-9a-fA-F-]{36}$/.test(draft.id)
    && typeof draft.title === "string"
    && draft.title.trim().length > 0
    && draft.title.trim().length <= 120
    && typeof draft.detail === "string"
    && typeof draft.createdAt === "string"
    && !Number.isNaN(new Date(draft.createdAt).getTime())
    && (draft.values === undefined || (
      typeof draft.values === "object"
      && !Array.isArray(draft.values)
      && Object.values(draft.values).every((item) => typeof item === "string")
    ));
}

function databaseDraft(row: {
  client_id: string;
  title: string;
  summary: string;
  payload: { values?: Record<string, string> } | null;
  recipient_manifest_ciphertext: string | null;
  created_at: string;
}) {
  const values = { ...(row.payload?.values ?? {}) };
  if (row.recipient_manifest_ciphertext) {
    values.recipients = decryptRecipientManifest(row.recipient_manifest_ciphertext);
  }
  return { id: row.client_id, title: row.title, detail: row.summary, values, createdAt: row.created_at };
}

async function context() {
  const [session, supabase] = await Promise.all([
    currentWalletSession(),
    Promise.resolve(getSupabaseAdminClient()),
  ]);
  return { session, supabase };
}

export async function GET(request: Request) {
  const type = resourceType(new URL(request.url).searchParams.get("type"));
  const { session, supabase } = await context();
  if (!type) return NextResponse.json({ error: "Unknown workspace type." }, { status: 400 });
  if (!session) return NextResponse.json({ error: "Reconnect your wallet to sync this workspace." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Workspace sync is unavailable." }, { status: 503 });

  const { data, error } = await supabase
    .from("workspace_drafts")
    .select("client_id, title, summary, payload, recipient_manifest_ciphertext, created_at")
    .eq("wallet_identity_id", session.walletIdentityId)
    .eq("resource_type", type)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[Droptron drafts] read failed", error);
    return NextResponse.json({ error: "Could not load your synced workspace." }, { status: 500 });
  }

  try {
    return NextResponse.json({ drafts: data.map(databaseDraft) });
  } catch (error) {
    console.error("[Droptron drafts] manifest decryption failed", error);
    return NextResponse.json({ error: "A private recipient list could not be opened." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, supabase } = await context();
  if (!session) return NextResponse.json({ error: "Reconnect your wallet to sync this workspace." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Workspace sync is unavailable." }, { status: 503 });

  const body = await request.json().catch(() => null) as { draft?: unknown; resourceType?: unknown } | null;
  const type = resourceType(body?.resourceType);
  if (!type || !validDraft(body?.draft)) {
    return NextResponse.json({ error: "This draft could not be saved." }, { status: 400 });
  }

  const draft = body.draft;
  const values = { ...(draft.values ?? {}) };
  const recipients = extractRecipientManifest(values);
  if (recipients && recipients.length > 5_000_000) {
    return NextResponse.json({ error: "This recipient list is too large." }, { status: 413 });
  }

  let encryptedRecipients: string | null = null;
  try {
    encryptedRecipients = recipients ? encryptRecipientManifest(recipients) : null;
  } catch (error) {
    console.error("[Droptron drafts] manifest encryption failed", error);
    return NextResponse.json({ error: "Private recipient storage is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("workspace_drafts")
    .upsert({
      wallet_identity_id: session.walletIdentityId,
      chain_id: session.chainId,
      owner_wallet_address: session.walletAddress,
      client_id: draft.id,
      resource_type: type,
      title: draft.title.trim(),
      summary: draft.detail,
      payload: { values },
      recipient_manifest_ciphertext: encryptedRecipients,
      created_at: draft.createdAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "wallet_identity_id,client_id" })
    .select("client_id, title, summary, payload, recipient_manifest_ciphertext, created_at")
    .single();
  if (error) {
    console.error("[Droptron drafts] save failed", error);
    return NextResponse.json({ error: "Could not sync this draft." }, { status: 500 });
  }

  return NextResponse.json({ draft: databaseDraft(data) });
}

export async function PATCH(request: Request) {
  const { session, supabase } = await context();
  if (!session) return NextResponse.json({ error: "Reconnect your wallet to sync this workspace." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Workspace sync is unavailable." }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    id?: unknown;
    resourceType?: unknown;
    update?: { title?: unknown; detail?: unknown; values?: unknown };
  } | null;
  const type = resourceType(body?.resourceType);
  if (!type || typeof body?.id !== "string" || !body.update || typeof body.update !== "object") {
    return NextResponse.json({ error: "This draft update is invalid." }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("workspace_drafts")
    .select("title, summary, payload, recipient_manifest_ciphertext")
    .eq("wallet_identity_id", session.walletIdentityId)
    .eq("resource_type", type)
    .eq("client_id", body.id)
    .maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const updateValues = body.update.values;
  if (updateValues !== undefined && (
    typeof updateValues !== "object"
    || Array.isArray(updateValues)
    || Object.values(updateValues as Record<string, unknown>).some((item) => typeof item !== "string")
  )) return NextResponse.json({ error: "This draft update is invalid." }, { status: 400 });

  const values = {
    ...((existing.payload as { values?: Record<string, string> } | null)?.values ?? {}),
    ...((updateValues as Record<string, string> | undefined) ?? {}),
  };
  const recipients = extractRecipientManifest(values);
  let encryptedRecipients = existing.recipient_manifest_ciphertext as string | null;
  if (recipients !== undefined) encryptedRecipients = encryptRecipientManifest(recipients);

  const title = typeof body.update.title === "string" ? body.update.title.trim() : existing.title;
  const summary = typeof body.update.detail === "string" ? body.update.detail : existing.summary;
  if (!title || title.length > 120) return NextResponse.json({ error: "This draft update is invalid." }, { status: 400 });

  const { data, error } = await supabase
    .from("workspace_drafts")
    .update({ title, summary, payload: { values }, recipient_manifest_ciphertext: encryptedRecipients })
    .eq("wallet_identity_id", session.walletIdentityId)
    .eq("resource_type", type)
    .eq("client_id", body.id)
    .select("client_id, title, summary, payload, recipient_manifest_ciphertext, created_at")
    .single();
  if (error) {
    console.error("[Droptron drafts] update failed", error);
    return NextResponse.json({ error: "Could not sync this draft update." }, { status: 500 });
  }
  return NextResponse.json({ draft: databaseDraft(data) });
}

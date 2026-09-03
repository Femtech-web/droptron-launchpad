"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { LaunchDeploymentPanel } from "./launch-deployment-panel";
import { LaunchParticipationPanel } from "./launch-participation-panel";
import { loadPublicLaunch } from "./public-launch-store";

const STORAGE_KEY = "droptron.launches.v1";

const fieldRows: Array<{ key: string; label: string; format?: (value: string) => string }> = [
  { key: "saleToken", label: "Sale token" },
  { key: "paymentToken", label: "Payment token" },
  { key: "pricing", label: "Pricing", format: (value) => value === "linear" ? "Linear bonding curve" : "Fixed price" },
  { key: "initialPrice", label: "Initial price" },
  { key: "curveSlope", label: "Curve slope" },
  { key: "saleAllocation", label: "Sale allocation" },
  { key: "raiseLimit", label: "Raise limit" },
  { key: "startsAt", label: "Starts", format: formatDate },
  { key: "endsAt", label: "Ends", format: formatDate },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortAddress(value: string) {
  return value.startsWith("0x") && value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function sameAddress(left?: string | null, right?: string | null) {
  try { return Boolean(left && right && BigInt(left) === BigInt(right)); } catch { return false; }
}

export function LaunchDetailWorkspace() {
  const { address } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState<WorkspaceDraft | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadDraft(STORAGE_KEY, params.id, sessionStatus === "synced"),
      loadPublicLaunch(params.id).catch(() => null),
    ]).then(([owned, published]) => {
      if (active) setDraft(owned ?? published);
    });
    return () => { active = false; };
  }, [params.id, sessionStatus]);

  if (draft === undefined) return <main className="launch-detail" id="main-content"><p className="launch-detail__loading">Loading launch…</p></main>;
  if (!draft) return <main className="launch-detail" id="main-content"><section className="launch-detail__missing"><h1>Launch not found</h1><p>This launch is not available in the connected wallet workspace.</p><Link href="/app">Return to launches →</Link></section></main>;

  const values = draft.values ?? {};
  const canManage = sameAddress(address, values.owner);
  return <main className="launch-detail" id="main-content" tabIndex={-1}>
    <header className="launch-detail__heading"><div><Link href="/app">← Launches</Link><p className="app-eyebrow">{values.funded === "true" ? "Live launch" : "Creator workspace"}</p><h1>{draft.title}</h1><p>{values.funded === "true" ? "Review the sale and enter through its private participation route." : "Review, deploy and fund the public sale terms."}</p></div><span>{values.funded === "true" ? "Funded" : values.contractAddress ? "Deployed" : "Draft"}</span></header>
    <section className={`launch-detail__body${canManage ? "" : " launch-detail__body--public"}`}>
      <div className="launch-detail__terms"><header><div><p className="app-eyebrow">Configuration</p><h2>Launch terms</h2></div><p>These values become public contract configuration when deployed.</p></header><dl>{fieldRows.filter((field) => values[field.key]).map((field) => <div key={field.key}><dt>{field.label}</dt><dd title={values[field.key]}>{field.format ? field.format(values[field.key]) : shortAddress(values[field.key])}</dd></div>)}</dl></div>
      {canManage && <LaunchDeploymentPanel draft={draft} onUpdated={setDraft} />}
    </section>
    <section className="launch-detail__route"><div><p className="app-eyebrow">Participant experience</p><h2>Choose allocation.<br />Complete privately.</h2><dl><div><dt>Visible</dt><dd>Price, timing and aggregate activity</dd></div><div><dt>Protected</dt><dd>Your address and allocation ownership</dd></div></dl></div><LaunchParticipationPanel draft={draft} /></section>
  </main>;
}

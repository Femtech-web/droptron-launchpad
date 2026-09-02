"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";
import { readDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";

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

export function LaunchDetailWorkspace() {
  const { address } = useWallet();
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState<WorkspaceDraft | null | undefined>(undefined);

  useEffect(() => setDraft(readDraft(STORAGE_KEY, params.id)), [params.id]);

  if (!address) return <WalletGate />;
  if (draft === undefined) return <main className="launch-detail" id="main-content"><p className="launch-detail__loading">Loading launch…</p></main>;
  if (!draft) return <main className="launch-detail" id="main-content"><section className="launch-detail__missing"><h1>Launch not found</h1><p>This local draft may have been removed from this browser.</p><Link href="/app">Return to launches →</Link></section></main>;

  const values = draft.values ?? {};
  return <main className="launch-detail" id="main-content" tabIndex={-1}>
    <header className="launch-detail__heading"><div><Link href="/app">← Launches</Link><p className="app-eyebrow">Draft launch</p><h1>{draft.title}</h1><p>Review the public market terms before generating contract calldata.</p></div><span>Local draft</span></header>
    <section className="launch-detail__body">
      <div className="launch-detail__terms"><header><div><p className="app-eyebrow">Configuration</p><h2>Launch terms</h2></div><p>These values become public contract configuration when deployed.</p></header><dl>{fieldRows.filter((field) => values[field.key]).map((field) => <div key={field.key}><dt>{field.label}</dt><dd title={values[field.key]}>{field.format ? field.format(values[field.key]) : shortAddress(values[field.key])}</dd></div>)}</dl></div>
      <aside className="launch-detail__readiness"><p className="app-eyebrow">Deployment readiness</p><h2>Contract binding pending</h2><p>The draft is valid, but no transaction is available until the reviewed Cairo launch contract and token-decimal checks are connected.</p><ol><li><i />Form validation complete</li><li><i />Token metadata check pending</li><li><i />Cairo artifact pending</li></ol></aside>
    </section>
    <section className="launch-detail__route"><div><p className="app-eyebrow">Private participation route</p><h2>Public execution.<br />Shielded allocation.</h2></div><div><p>The launch contract receives a purchase from Droptron’s shared anonymizer and returns sale tokens to it. STRK20 then credits the output to the participant’s private note.</p><dl><div><dt>Visible</dt><dd>Price, amount, timing, aggregate activity</dd></div><div><dt>Protected</dt><dd>Participant identity and allocation ownership</dd></div></dl></div></section>
  </main>;
}

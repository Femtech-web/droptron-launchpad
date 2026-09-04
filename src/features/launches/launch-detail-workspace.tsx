"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { knownTokenDetails } from "@/features/wallet/wallet-assets";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { LaunchDeploymentPanel } from "./launch-deployment-panel";
import { LaunchParticipationPanel } from "./launch-participation-panel";
import { LaunchParticipationHistory } from "./launch-participation-history";
import { LaunchSettlementPanel } from "./launch-settlement-panel";
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

function formatAmount(value?: string) {
  if (!value) return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en", { maximumFractionDigits: 8 }).format(amount)
    : value;
}

function sameAddress(left?: string | null, right?: string | null) {
  try { return Boolean(left && right && BigInt(left) === BigInt(right)); } catch { return false; }
}

export function LaunchDetailWorkspace() {
  const { address } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<WorkspaceDraft | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadDraft(STORAGE_KEY, params.id, sessionStatus === "synced"),
      loadPublicLaunch(params.id).catch(() => null),
    ]).then(([owned, published]) => {
      if (active) {
        setDraft(owned ?? published);
      }
    });
    return () => { active = false; };
  }, [params.id, sessionStatus]);

  if (draft === undefined) return <main className="launch-detail" id="main-content"><p className="launch-detail__loading">Loading launch…</p></main>;
  if (!draft) return <main className="launch-detail" id="main-content"><section className="launch-detail__missing"><h1>Launch not found</h1><p>This launch is not available in the connected wallet workspace.</p><Link href="/app">Return to launches →</Link></section></main>;

  const values = draft.values ?? {};
  // Published routes remain manageable by their verified on-chain owner even
  // when the original creator draft is no longer available in this session.
  const canManage = searchParams.get("mode") === "manage" && sameAddress(address, values.owner);
  const contractAddress = values.contractAddress;
  const funded = values.funded === "true";
  const published = values.published === "true";
  const saleSymbol = knownTokenDetails(values.saleToken)?.symbol ?? "tokens";
  const paymentSymbol = knownTokenDetails(values.paymentToken)?.symbol ?? "payment tokens";
  const status = published ? "Live" : funded ? "Funded" : contractAddress ? "Deployed" : "Draft";
  const priceDescription = values.pricing === "linear"
    ? `Starts at ${formatAmount(values.initialPrice)} ${paymentSymbol}`
    : `1 ${saleSymbol} = ${formatAmount(values.initialPrice)} ${paymentSymbol}`;

  return <main className="launch-detail" id="main-content" tabIndex={-1}>
    <header className="launch-detail__heading"><div><Link href="/app">← Launches</Link><p className="app-eyebrow">{canManage ? "Creator workspace" : "Public launch"}</p><h1>{draft.title}</h1><p>{canManage ? "Review the sale and manage its on-chain lifecycle." : "Review the terms and participate privately with a supported wallet."}</p></div><span data-state={status.toLowerCase()}>{status}</span></header>
    <section className={`launch-detail__body${canManage ? "" : " launch-detail__body--public"}`}>
      <div className="launch-detail__terms">
        <header><div><p className="app-eyebrow">Sale overview</p><h2>Launch terms</h2></div></header>
        <div className="launch-summary-grid">
          <article><span>Tokens offered</span><strong>{formatAmount(values.saleAllocation)} {saleSymbol}</strong><small>Available across this launch</small></article>
          <article><span>Price</span><strong>{priceDescription}</strong><small>{values.pricing === "linear" ? "Linear pricing" : "Fixed for the full sale"}</small></article>
          <article><span>Maximum raise</span><strong>{formatAmount(values.raiseLimit)} {paymentSymbol}</strong><small>The most the launch can collect</small></article>
        </div>
        <div className="launch-detail__schedule">
          <article><span>Starts</span><strong>{formatDate(values.startsAt)}</strong></article>
          <article><span>Ends</span><strong>{formatDate(values.endsAt)}</strong></article>
        </div>
        <details className="launch-technical">
          <summary>View contract configuration</summary>
          <dl>{fieldRows.filter((field) => values[field.key]).map((field) => <div key={field.key}><dt>{field.label}</dt><dd title={values[field.key]}>{field.format ? field.format(values[field.key]) : shortAddress(values[field.key])}</dd></div>)}</dl>
        </details>
      </div>
      {canManage && <LaunchDeploymentPanel draft={draft} onUpdated={setDraft} />}
    </section>
    {!canManage && published ? <section className="launch-detail__participation">
      <header><div><p className="app-eyebrow">Participant experience</p><h2>Participate privately</h2></div></header>
      <div className="launch-detail__participation-body"><dl><div><dt>Public</dt><dd>Price, schedule and aggregate activity</dd></div><div><dt>Private</dt><dd>Your address and allocation ownership</dd></div></dl><LaunchParticipationPanel draft={draft} /></div>
    </section> : !canManage && <section className="launch-detail__participant-preview">
      <div><p className="app-eyebrow">Participant page</p><h2>Unlocks when setup is complete</h2><p>After the contract is deployed and funded, Droptron publishes this launch to Explore and enables private participation.</p></div>
      <dl><div><dt>Participants will see</dt><dd>{priceDescription}, {formatAmount(values.saleAllocation)} {saleSymbol} offered</dd></div><div><dt>They will do</dt><dd>Choose an amount and confirm one private purchase in a supported wallet</dd></div></dl>
    </section>}
    {!canManage && published && <LaunchParticipationHistory draft={draft} />}
    {canManage && contractAddress && <LaunchSettlementPanel draft={draft} />}
  </main>;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadDrafts, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { loadPublicLaunches } from "./public-launch-store";

function LaunchList({ launches, emptyTitle, emptyDescription }: { launches: WorkspaceDraft[]; emptyTitle: string; emptyDescription: string }) {
  if (launches.length === 0) return <section className="empty-workspace launch-list-empty"><div className="empty-workspace__mark empty-workspace__mark--launch" aria-hidden="true"><span /><i /></div><h2>{emptyTitle}</h2><p>{emptyDescription}</p></section>;
  return <section className="draft-register" aria-label="Launches"><header><span>Launch</span><span>Terms</span><span>Status</span></header>{launches.map((launch) => <article key={launch.id}><div><Link href={`/app/launches/${launch.id}`}><strong>{launch.title}</strong></Link><small>{new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(launch.createdAt))}</small></div><p>{launch.detail}</p><Link className="draft-register__open" href={`/app/launches/${launch.id}`}>{launch.values?.funded === "true" ? "Open" : "Manage"} →</Link></article>)}</section>;
}

export function LaunchesWorkspace() {
  const { address, chainId } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const [view, setView] = useState<"explore" | "manage">("explore");
  const [publicEntry, setPublicEntry] = useState(false);
  const [launches, setLaunches] = useState<WorkspaceDraft[]>([]);
  const [publicLaunches, setPublicLaunches] = useState<WorkspaceDraft[]>([]);
  useEffect(() => {
    let active = true;
    void loadDrafts("droptron.launches.v1", sessionStatus === "synced").then((items) => {
      if (active) setLaunches(items);
    });
    return () => { active = false; };
  }, [sessionStatus]);
  useEffect(() => {
    let active = true;
    void loadPublicLaunches().then((items) => {
      if (active) setPublicLaunches(items);
    }).catch((error) => {
      console.error("[Droptron launches] public discovery failed", error);
      if (active) setPublicLaunches([]);
    });
    return () => { active = false; };
  }, []);
  const liveLaunches = useMemo(() => {
    const selectedChain = chainId ?? "SN_MAIN";
    return publicLaunches.filter((launch) => launch.values?.chainId === selectedChain);
  }, [chainId, publicLaunches]);
  const ownedLaunches = useMemo(() => launches.filter((launch) => {
    if (!address || !launch.values?.owner) return false;
    try { return BigInt(launch.values.owner) === BigInt(address); } catch { return false; }
  }), [address, launches]);

  if (!address && !publicEntry) return <WalletGate secondaryLabel="Explore launches" onSecondary={() => setPublicEntry(true)} />;

  return <main className="product-workspace launches-desk" id="main-content" tabIndex={-1}>
    <header className="product-workspace__heading"><div><p className="app-eyebrow">Launches</p><h1>{view === "explore" ? "Explore launches" : "Manage launches"}</h1><p>{view === "explore" ? "Browse live launches. Connect a compatible wallet when you are ready to participate." : "Create public sale terms, deploy the contract, and fund its allocation."}</p></div>{view === "manage" && address && <Link className="product-workspace__action" href="/app/launches/new">New launch<span>→</span></Link>}</header>
    <nav className="launch-role-switch" aria-label="Launch view"><button type="button" aria-pressed={view === "explore"} onClick={() => setView("explore")}><span>Participant</span><strong>Explore</strong><small>View and join live launches</small></button><button type="button" aria-pressed={view === "manage"} onClick={() => setView("manage")}><span>Creator</span><strong>Manage</strong><small>Configure, deploy and fund</small></button></nav>
    {view === "explore" ? <LaunchList launches={liveLaunches} emptyTitle="No live launches yet" emptyDescription="Funded launches will appear here when they are ready for participation." /> : !address ? <WalletGate /> : <LaunchList launches={ownedLaunches} emptyTitle="No launch drafts yet" emptyDescription="Create a launch to define its public terms before deployment." />}
  </main>;
}

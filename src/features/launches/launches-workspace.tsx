"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { networkFromChainId } from "@/features/wallet/wallet-networks";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadDrafts, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { loadPublicLaunches } from "./public-launch-store";

function LaunchList({ launches, emptyTitle, emptyDescription, manage = false }: { launches: WorkspaceDraft[]; emptyTitle: string; emptyDescription: string; manage?: boolean }) {
  if (launches.length === 0) return <section className="empty-workspace launch-list-empty"><div className="empty-workspace__mark empty-workspace__mark--launch" aria-hidden="true"><span /><i /></div><h2>{emptyTitle}</h2><p>{emptyDescription}</p></section>;
  return <section className="draft-register" aria-label="Launches"><header><span>Launch</span><span>Terms</span><span>Status</span></header>{launches.map((launch) => {
    const href = `/app/launches/${launch.id}${manage ? "?mode=manage" : ""}`;
    return <article key={launch.id}><div><Link href={href}><strong>{launch.title}</strong></Link><small>{new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(launch.createdAt))}</small></div><p>{launch.detail}</p><Link className="draft-register__open" href={href}>{manage ? "Manage" : "Open"} →</Link></article>;
  })}</section>;
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
  }, [address, sessionStatus]);
  useEffect(() => {
    let active = true;
    const refreshPublicLaunches = () => {
      void loadPublicLaunches().then((items) => {
        if (active) setPublicLaunches(items);
      }).catch((error) => {
        console.error("[Droptron launches] public discovery failed", error);
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshPublicLaunches();
    };
    refreshPublicLaunches();
    window.addEventListener("focus", refreshPublicLaunches);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshPublicLaunches);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  const liveLaunches = useMemo(() => {
    const selectedNetwork = networkFromChainId(chainId) ?? "mainnet";
    return publicLaunches.filter(
      (launch) => networkFromChainId(launch.values?.chainId ?? null) === selectedNetwork,
    );
  }, [chainId, publicLaunches]);
  const ownedLaunches = useMemo(() => {
    if (!address) return [];
    const owns = (launch: WorkspaceDraft) => {
      try { return Boolean(launch.values?.owner) && BigInt(launch.values!.owner) === BigInt(address); } catch { return false; }
    };
    // The public index is also an ownership recovery source. A published launch
    // must not disappear from Manage merely because its mutable draft session
    // was recreated or imported under an earlier wallet-session identity.
    const combined = [...launches.filter(owns), ...publicLaunches.filter(owns)];
    const seen = new Set<string>();
    return combined.filter((launch) => {
      const key = launch.values?.contractAddress
        ? `contract:${BigInt(launch.values.contractAddress).toString()}`
        : `draft:${launch.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [address, launches, publicLaunches]);

  if (!address && !publicEntry) return <WalletGate secondaryLabel="Explore launches" onSecondary={() => setPublicEntry(true)} />;

  return <main className="product-workspace launches-desk" id="main-content" tabIndex={-1}>
    <header className="product-workspace__heading"><div><p className="app-eyebrow">Launches</p><h1>{view === "explore" ? "Explore launches" : "Manage launches"}</h1><p>{view === "explore" ? "Browse live launches. Connect a compatible wallet when you are ready to participate." : "Create public sale terms, deploy the contract, and fund its allocation."}</p></div>{view === "manage" && address && <Link className="product-workspace__action" href="/app/launches/new">New launch<span>→</span></Link>}</header>
    <nav className="launch-role-switch" aria-label="Launch view"><button type="button" aria-pressed={view === "explore"} onClick={() => setView("explore")}><span>Participant</span><strong>Explore</strong><small>View and join live launches</small></button><button type="button" aria-pressed={view === "manage"} onClick={() => setView("manage")}><span>Creator</span><strong>Manage</strong><small>Configure, deploy and fund</small></button></nav>
    {view === "explore" ? <LaunchList launches={liveLaunches} emptyTitle="No live launches yet" emptyDescription="Funded launches will appear here when they are ready for participation." /> : !address ? <WalletGate /> : <LaunchList manage launches={ownedLaunches} emptyTitle="No launch drafts yet" emptyDescription="Create a launch to define its public terms before deployment." />}
  </main>;
}

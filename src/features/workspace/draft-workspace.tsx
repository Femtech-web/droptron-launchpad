"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";

import { readDrafts, type WorkspaceDraft } from "./draft-store";

type DraftWorkspaceProps = {
  storageKey: string;
  section: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  mark: "launch" | "distribution" | "vesting";
  actionHref: string;
  actionLabel: string;
  itemHrefBase?: string;
};

export function DraftWorkspace(props: DraftWorkspaceProps) {
  const { address } = useWallet();
  const [drafts, setDrafts] = useState<WorkspaceDraft[]>([]);

  useEffect(() => setDrafts(readDrafts(props.storageKey)), [props.storageKey]);

  if (!address) return <WalletGate />;

  return <main className="product-workspace" id="main-content" tabIndex={-1}>
    <header className="product-workspace__heading">
      <div><p className="app-eyebrow">{props.section}</p><h1>{props.title}</h1><p>{props.description}</p></div>
      <Link className="product-workspace__action" href={props.actionHref}>{props.actionLabel}<span>→</span></Link>
    </header>
    {drafts.length === 0 ? <section className="empty-workspace" aria-labelledby={`${props.mark}-empty-title`}>
      <div className={`empty-workspace__mark empty-workspace__mark--${props.mark}`} aria-hidden="true"><span /><i /></div>
      <h2 id={`${props.mark}-empty-title`}>{props.emptyTitle}</h2>
      <p>{props.emptyDescription}</p>
    </section> : <section className="draft-register" aria-label={`${props.section} drafts`}>
      <header><span>Name</span><span>Configuration</span><span>Status</span></header>
      {drafts.map((draft) => <article key={draft.id}><div>{props.itemHrefBase ? <Link href={`${props.itemHrefBase}/${draft.id}`}><strong>{draft.title}</strong></Link> : <strong>{draft.title}</strong>}<small>{new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(draft.createdAt))}</small></div><p>{draft.detail}</p>{props.itemHrefBase ? <Link className="draft-register__open" href={`${props.itemHrefBase}/${draft.id}`}>Open →</Link> : <span>Draft</span>}</article>)}
    </section>}
  </main>;
}

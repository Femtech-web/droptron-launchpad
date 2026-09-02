"use client";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";

type EmptyWorkspaceProps = {
  section: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  mark: "launch" | "distribution" | "vesting" | "claim";
};

export function EmptyWorkspace({ section, title, description, emptyTitle, emptyDescription, mark }: EmptyWorkspaceProps) {
  const { address } = useWallet();

  if (!address) return <WalletGate />;

  return <main className="product-workspace" id="main-content" tabIndex={-1}>
    <header className="product-workspace__heading">
      <div><p className="app-eyebrow">{section}</p><h1>{title}</h1><p>{description}</p></div>
    </header>
    <section className="empty-workspace" aria-labelledby={`${mark}-empty-title`}>
      <div className={`empty-workspace__mark empty-workspace__mark--${mark}`} aria-hidden="true"><span /><i /></div>
      <h2 id={`${mark}-empty-title`}>{emptyTitle}</h2>
      <p>{emptyDescription}</p>
    </section>
  </main>;
}

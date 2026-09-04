"use client";

import { useEffect, useMemo, useState } from "react";

import { networkFromChainId } from "@/features/wallet/wallet-networks";
import { useWallet } from "@/features/wallet/wallet-provider";
import type { WorkspaceDraft } from "@/features/workspace/draft-store";

const STORAGE_KEY = "droptron.private-launch-activity.v1";
const PAGE_SIZE = 10;

export type LaunchParticipationRecord = {
  id: string;
  walletAddress: string;
  chainId: string;
  launchAddress: string;
  transactionHash: string;
  saleAmount: string;
  saleSymbol: string;
  paymentAmount: string;
  paymentSymbol: string;
  submittedAt: string;
};

function addressKey(value?: string | null) {
  try { return BigInt(value ?? "").toString(); } catch { return value?.toLowerCase() ?? ""; }
}

function readRecords() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value as LaunchParticipationRecord[] : [];
  } catch {
    return [];
  }
}

export function recordLaunchParticipation(record: LaunchParticipationRecord) {
  const records = readRecords().filter((item) => item.transactionHash !== record.transactionHash);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...records].slice(0, 200)));
  window.dispatchEvent(new CustomEvent("droptron:launch-participation-recorded", { detail: record }));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortHash(value: string) {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function LaunchParticipationHistory({ draft }: { draft: WorkspaceDraft }) {
  const { address, chainId } = useWallet();
  const [records, setRecords] = useState<LaunchParticipationRecord[]>([]);
  const [page, setPage] = useState(1);
  const launchAddress = draft.values?.contractAddress;

  useEffect(() => {
    const load = () => {
      if (!address || !launchAddress) {
        setRecords([]);
        return;
      }
      const wallet = addressKey(address);
      const launch = addressKey(launchAddress);
      const network = networkFromChainId(chainId);
      setRecords(readRecords().filter((item) =>
        addressKey(item.walletAddress) === wallet
        && addressKey(item.launchAddress) === launch
        && networkFromChainId(item.chainId) === network
      ));
      setPage(1);
    };
    load();
    window.addEventListener("droptron:launch-participation-recorded", load);
    return () => window.removeEventListener("droptron:launch-participation-recorded", load);
  }, [address, chainId, launchAddress]);

  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const visible = useMemo(
    () => records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, records],
  );
  if (!address || !launchAddress) return null;

  const explorer = networkFromChainId(chainId) === "sepolia"
    ? "https://sepolia.voyager.online"
    : "https://voyager.online";

  return <section className="launch-participation-history" aria-labelledby="participation-history-title">
    <header>
      <div><p className="app-eyebrow">Private activity</p><h2 id="participation-history-title">Your participation</h2></div>
      <span>{records.length} {records.length === 1 ? "purchase" : "purchases"}</span>
    </header>
    {records.length > 0 ? <>
      <div className="launch-participation-history__head" aria-hidden="true"><span>Received</span><span>Paid</span><span>Date</span><span>Transaction</span></div>
      <div className="launch-participation-history__rows">
        {visible.map((record) => <article key={record.id}>
          <strong>{record.saleAmount} {record.saleSymbol}</strong>
          <span>{record.paymentAmount} {record.paymentSymbol}</span>
          <time dateTime={record.submittedAt}>{formatDate(record.submittedAt)}</time>
          <a href={`${explorer}/tx/${record.transactionHash}`} target="_blank" rel="noreferrer" title={record.transactionHash}>{shortHash(record.transactionHash)} <i aria-hidden="true">↗</i></a>
        </article>)}
      </div>
    </> : <div className="launch-participation-history__empty">
      <strong>No purchases saved on this device</strong>
      <p>New purchases will appear here automatically. Restore an earlier purchase using its transaction hash.</p>
    </div>}
    <footer><p>Visible only for this wallet on this device.</p>{pageCount > 1 && <nav aria-label="Participation history pages"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>←</button><span>{page} of {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>→</button></nav>}</footer>
  </section>;
}

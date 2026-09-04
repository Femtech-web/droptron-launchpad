"use client";

import type { STRK20_ACTION } from "@starknet-io/types-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { num, RpcProvider } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { PrivateActionPanel } from "@/features/privacy/private-action-panel";
import { readPrivacyPoolFee } from "@/features/privacy/privacy-pool";
import { submitPrivateActions } from "@/features/privacy/strk20-actions";
import { formatTokenAmount, formatTokenInputAmount, privateTokenBalance, STRK_TOKEN_ADDRESS } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";

type PublicCampaign = { id: string; title: string; values: Record<string, string> };
type Claim = { campaignId: string; campaignTitle: string; kind: string; series: string; token: string; decimals: number; amount: bigint; unlockAt: number; expiresAt: number };
type ClaimGroup = { key: string; campaignTitle: string; kind: string; claims: Claim[] };

function sameAddress(left: string, right: string) {
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

function explorerTransaction(chainId: string | null, transactionHash: string) {
  return `${networkFromChainId(chainId) === "sepolia" ? "https://sepolia.voyager.online" : "https://voyager.online"}/tx/${transactionHash}`;
}

function redemptionHelper(chainId: string | null) {
  return networkFromChainId(chainId) === "mainnet" ? process.env.NEXT_PUBLIC_MAINNET_CLAIM_REDEMPTION_ADDRESS?.trim() || null : null;
}

function formatClaimDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp * 1_000));
}

export function ClaimsWorkspace() {
  const { address, chainId, connectionRequestId, privacyStatus, walletAccount } = useWallet();
  const showToast = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [hasChecked, setHasChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [expandedVestings, setExpandedVestings] = useState<Set<string>>(() => new Set());
  const [feeShield, setFeeShield] = useState<{ amount: string; message: string } | null>(null);
  const [feeShieldOpen, setFeeShieldOpen] = useState(false);
  const [feeShieldSubmittedAt, setFeeShieldSubmittedAt] = useState<number | null>(null);
  const lock = useRef(false);
  const discoveryLock = useRef(false);
  const automaticDiscoveryRef = useRef<string | null>(null);
  const now = Math.floor(Date.now() / 1_000);
  const available = useMemo(() => claims.filter((claim) => claim.unlockAt <= now && (!claim.expiresAt || now < claim.expiresAt)), [claims, now]);
  const claimGroups = useMemo<ClaimGroup[]>(() => {
    const grouped = new Map<string, ClaimGroup>();
    claims.forEach((claim) => {
      const key = claim.kind === "vesting" ? `vesting:${claim.campaignId}` : `claim:${claim.series}`;
      const current = grouped.get(key);
      if (current) current.claims.push(claim);
      else grouped.set(key, { key, campaignTitle: claim.campaignTitle, kind: claim.kind, claims: [claim] });
    });
    return Array.from(grouped.values()).map((group) => ({ ...group, claims: [...group.claims].sort((left, right) => left.unlockAt - right.unlockAt) }));
  }, [claims]);

  const discover = useCallback(async () => {
    if (!walletAccount || discoveryLock.current) return;
    discoveryLock.current = true;
    setChecking(true);
    try {
      const response = await fetch("/api/distributions", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { distributions?: PublicCampaign[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Claims could not be loaded.");
      const campaigns = (body.distributions ?? []).filter((campaign) => networkFromChainId(campaign.values.chainId) === networkFromChainId(chainId));
      const entries = campaigns.flatMap((campaign) => {
        let series: string[] = [];
        try { series = JSON.parse(campaign.values.seriesAddresses ?? "[]"); } catch { /* Ignore malformed metadata. */ }
        return series.map((seriesAddress) => ({ campaign, series: seriesAddress }));
      });
      if (!entries.length) { setClaims([]); setHasChecked(true); return; }
      const balances = await walletAccount.strk20Balances(entries.map((entry) => entry.series));
      const held = entries.filter((entry) => privateTokenBalance(balances, entry.series) > BigInt(0));
      const nodeUrl = rpcUrlForChain(chainId); if (!nodeUrl) throw new Error("The selected network RPC is unavailable.");
      const provider = new RpcProvider({ nodeUrl });
      const next = await Promise.all(held.map(async (entry) => {
        const terms = await provider.callContract({ contractAddress: entry.series, entrypoint: "terms" });
        return {
          campaignId: entry.campaign.id,
          campaignTitle: entry.campaign.title,
          kind: entry.campaign.values.kind,
          series: entry.series,
          token: terms[1],
          decimals: Number(BigInt(terms[2] ?? 18)),
          amount: privateTokenBalance(balances, entry.series),
          unlockAt: Number(BigInt(terms[4] ?? 0)),
          expiresAt: Number(BigInt(terms[5] ?? 0)),
        } satisfies Claim;
      }));
      setClaims(next);
      setHasChecked(true);
    } catch (error) {
      const message = productErrorMessage(error, error instanceof Error ? error.message : "Claims could not be discovered.");
      showToast({ tone: "error", message });
    } finally {
      discoveryLock.current = false;
      setChecking(false);
    }
  }, [chainId, showToast, walletAccount]);

  useEffect(() => {
    if (!address || !walletAccount || privacyStatus !== "supported") {
      automaticDiscoveryRef.current = null;
      setClaims([]);
      setHasChecked(false);
      return;
    }
    let canonicalAddress = address.toLowerCase();
    try { canonicalAddress = `0x${BigInt(address).toString(16)}`; } catch { /* Keep the wallet value. */ }
    const identity = `${canonicalAddress}:${chainId ?? ""}:${connectionRequestId}`;
    if (automaticDiscoveryRef.current === identity) return;
    automaticDiscoveryRef.current = identity;
    void discover();
  }, [address, chainId, connectionRequestId, discover, privacyStatus, walletAccount]);

  if (!address) return <WalletGate />;

  async function redeem(claim: Claim) {
    if (!walletAccount || !address || lock.current) return;
    const helper = redemptionHelper(chainId);
    if (!helper) return showToast({ tone: "error", message: "Private claim redemption is not configured on this network." });
    lock.current = true; setClaiming(claim.series);
    try {
      const fee = await readPrivacyPoolFee(chainId);
      if (fee === null) throw new Error("The current STRK20 pool fee could not be loaded.");
      const balances = await walletAccount.strk20Balances([claim.series, STRK_TOKEN_ADDRESS]);
      if (privateTokenBalance(balances, claim.series) < claim.amount) throw new Error("This claim ticket is no longer available.");
      const privateStrk = privateTokenBalance(balances, STRK_TOKEN_ADDRESS);
      if (privateStrk < fee) {
        if (feeShieldSubmittedAt && Date.now() - feeShieldSubmittedAt < 10 * 60 * 1_000) {
          showToast({ tone: "info", message: "Your STRK shield is still settling. Wait about 10 blocks, then try the claim again." });
          return;
        }
        const shortfall = fee - privateStrk;
        // Shielding STRK consumes the same live pool fee. Gross up the public
        // deposit so the matured note still covers the later claim operation.
        const shieldAmount = shortfall + fee;
        const amount = formatTokenInputAmount(shieldAmount, 18);
        setFeeShield({
          amount,
          message: `You have ${formatTokenAmount(privateStrk, 18)} private STRK and need ${formatTokenAmount(fee, 18)} for this claim. Shield ${amount} STRK to cover the shortfall and the shielding fee.`,
        });
        setFeeShieldOpen(true);
        showToast({ tone: "info", message: "Your private STRK balance is short. The Shield form is ready with the required amount." });
        return;
      }
      const amount = num.toHex(claim.amount);
      const actions: STRK20_ACTION[] = [
        { type: "withdraw", token: num.toHex(BigInt(claim.series)), amount, recipient: num.toHex(BigInt(helper)) },
        { type: "transfer", token: num.toHex(BigInt(claim.token)), amount: "OPEN", recipient: num.toHex(BigInt(address)) },
        { type: "invoke", contract: num.toHex(BigInt(helper)), calldata: [num.toHex(BigInt(claim.series)), amount, "${openNoteIds[0]}"] },
      ];
      const result = await submitPrivateActions(walletAccount, actions);
      setClaims((current) => current.filter((item) => !sameAddress(item.series, claim.series)));
      showToast({ tone: "success", message: "Private claim submitted. Your token note will appear after it matures.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) {
      const message = productErrorMessage(error, error instanceof Error ? error.message : "The private claim was not completed.");
      showToast({ tone: message.startsWith("Request cancelled") ? "info" : "error", message });
    } finally { lock.current = false; setClaiming(null); }
  }

  return <main className="claims-workspace" id="main-content" tabIndex={-1}>
    <header className="product-workspace__heading"><div><p className="app-eyebrow">Claims</p><h1>Your claims</h1><p>Find private airdrops and vesting schedules held by this wallet.</p></div><button type="button" disabled={checking || privacyStatus !== "supported"} onClick={() => void discover()}>{checking ? "Checking…" : hasChecked ? "Refresh claims" : "Find my claims"}<span>→</span></button></header>
    {!hasChecked ? <section className="claims-intro"><div className="empty-workspace__mark empty-workspace__mark--claim" aria-hidden="true"><span /><i /></div><h2>Check your private tickets</h2><p>Droptron asks your wallet which published claim tickets it holds. The result stays in this browser.</p></section> : claims.length === 0 ? <section className="claims-intro"><div className="empty-workspace__mark empty-workspace__mark--claim" aria-hidden="true"><span /><i /></div><h2>Nothing to claim yet</h2><p>No published airdrop or vesting tickets were found in this wallet.</p></section> : <section className="claim-list"><header><span>Campaign</span><span>Allocation</span><span>Next unlock</span><span>Action</span></header>{claimGroups.map((group) => {
      if (group.kind !== "vesting") {
        const claim = group.claims[0];
        const unlocked = claim.unlockAt <= now && (!claim.expiresAt || now < claim.expiresAt);
        return <article key={group.key}><div><strong>{claim.campaignTitle}</strong><small>Airdrop</small></div><strong>{formatTokenAmount(claim.amount, claim.decimals)} tokens</strong><time dateTime={new Date(claim.unlockAt * 1_000).toISOString()}>{formatClaimDate(claim.unlockAt)}</time><button type="button" disabled={!unlocked || claiming !== null} onClick={() => void redeem(claim)}>{claiming === claim.series ? "Claiming…" : unlocked ? "Claim privately" : "Locked"}</button></article>;
      }
      const expanded = expandedVestings.has(group.key);
      const total = group.claims.reduce((sum, claim) => sum + claim.amount, BigInt(0));
      const unlockedCount = group.claims.filter((claim) => claim.unlockAt <= now && (!claim.expiresAt || now < claim.expiresAt)).length;
      const nextLocked = group.claims.find((claim) => claim.unlockAt > now);
      const panelId = `vesting-unlocks-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      return <article className="claim-list__campaign" key={group.key}>
        <div className="claim-list__campaign-row"><div><strong>{group.campaignTitle}</strong><small>Vesting schedule · {group.claims.length} {group.claims.length === 1 ? "unlock" : "unlocks"}</small></div><strong>{formatTokenAmount(total, group.claims[0].decimals)} tokens</strong><div className="claim-list__next">{unlockedCount > 0 ? <strong>{unlockedCount} available now</strong> : nextLocked ? <time dateTime={new Date(nextLocked.unlockAt * 1_000).toISOString()}>{formatClaimDate(nextLocked.unlockAt)}</time> : <span>Schedule complete</span>}{unlockedCount > 0 && nextLocked && <small>Next {formatClaimDate(nextLocked.unlockAt)}</small>}</div><button className="claim-list__campaign-toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpandedVestings((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>{expanded ? "Hide unlocks" : `View ${group.claims.length} unlocks`}</button></div>
        {expanded && <div className="claim-list__tranches" id={panelId}>{group.claims.map((claim, index) => {
          const unlocked = claim.unlockAt <= now && (!claim.expiresAt || now < claim.expiresAt);
          return <div className="claim-list__tranche" key={claim.series}><div><strong>Unlock {index + 1}</strong><small>{unlocked ? "Available" : "Scheduled"}</small></div><strong>{formatTokenAmount(claim.amount, claim.decimals)} tokens</strong><time dateTime={new Date(claim.unlockAt * 1_000).toISOString()}>{formatClaimDate(claim.unlockAt)}</time><button type="button" disabled={!unlocked || claiming !== null} onClick={() => void redeem(claim)}>{claiming === claim.series ? "Claiming…" : unlocked ? "Claim privately" : "Locked"}</button></div>;
        })}</div>}
      </article>;
    })}</section>}
    {available.length > 0 && <p className="claims-workspace__note">Each claim uses one private wallet confirmation and returns tokens to your shielded balance.</p>}
    {feeShieldOpen && feeShield && <PrivateActionPanel
      defaultKind="deposit"
      defaultToken={STRK_TOKEN_ADDRESS}
      tokenLabel="STRK"
      defaultAmount={feeShield.amount}
      notice={feeShield.message}
      modal
      onClose={() => setFeeShieldOpen(false)}
      onSubmitted={() => {
        setFeeShieldSubmittedAt(Date.now());
        setFeeShieldOpen(false);
        setFeeShield(null);
      }}
    />}
  </main>;
}

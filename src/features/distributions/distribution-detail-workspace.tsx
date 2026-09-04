"use client";

import type { STRK20_ACTION } from "@starknet-io/types-js";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { hash, num, RpcProvider } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { PrivateActionPanel } from "@/features/privacy/private-action-panel";
import { readPrivacyPoolFee } from "@/features/privacy/privacy-pool";
import { privacyPoolAddress } from "@/features/privacy/privacy-pool";
import { privacySetupIssue } from "@/features/privacy/privacy-registration";
import { submitPrivateActions } from "@/features/privacy/strk20-actions";
import { formatTokenAmount, formatTokenInputAmount, knownTokenDetails, parseTokenAmount, privateTokenBalance, STRK_TOKEN_ADDRESS } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadDraft, updateDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";

type Recipient = { address: string; amount: string };
type TicketTranche = { series: string; allocation: string; unlockAt: number; expiresAt: number; recipientAmounts: string[] };
type ReceiptView = { events?: Array<{ from_address: string; keys: string[]; data: string[] }> };
type ShieldPlan = { token: string; label: string; amount: string; message: string };

const STORAGE_KEY = "droptron.distributions.v1";
const MAX_ATOMIC_RECIPIENTS = 50;
const RECIPIENT_PAGE_SIZE = 10;

function sameAddress(left?: string | null, right?: string | null) {
  try { return Boolean(left && right && BigInt(left) === BigInt(right)); } catch { return false; }
}

function explorerTransaction(chainId: string | null, transactionHash: string) {
  const origin = networkFromChainId(chainId) === "sepolia" ? "https://sepolia.voyager.online" : "https://voyager.online";
  return `${origin}/tx/${transactionHash}`;
}

function formatScheduleDate(value?: string | number) {
  const date = typeof value === "number" ? new Date(value * 1_000) : new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function compactAddress(value?: string) {
  if (!value) return "Not set";
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function parseRecipients(value?: string): Recipient[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.address === "string" && typeof item.amount === "string") : [];
  } catch { return []; }
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  return num.toHex(BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`));
}

function addCadence(timestamp: number, cadence: string, index: number) {
  const date = new Date(timestamp * 1_000);
  if (cadence === "monthly") date.setUTCMonth(date.getUTCMonth() + index);
  else date.setUTCDate(date.getUTCDate() + index * 7);
  return Math.floor(date.getTime() / 1_000);
}

function splitRaw(total: bigint, count: number, firstPercent: number) {
  if (count === 1) return [total];
  if (firstPercent > 0) {
    const first = total * BigInt(firstPercent) / BigInt(100);
    const remaining = total - first;
    const base = remaining / BigInt(count - 1);
    return [first, ...Array.from({ length: count - 1 }, (_, index) => index === count - 2 ? remaining - base * BigInt(count - 2) : base)];
  }
  const base = total / BigInt(count);
  return Array.from({ length: count }, (_, index) => index === count - 1 ? total - base * BigInt(count - 1) : base);
}

async function tokenDecimals(provider: RpcProvider, token: string) {
  const result = await provider.callContract({ contractAddress: token, entrypoint: "decimals" });
  const value = Number(BigInt(result[0] ?? 0));
  if (!Number.isInteger(value) || value < 0 || value > 18) throw new Error("This token's decimals are not supported.");
  return value;
}

async function waitForReceipt(provider: RpcProvider, transactionHash: string) {
  await provider.waitForTransaction(transactionHash, { retryInterval: 3_000 });
  return provider.getTransactionReceipt(transactionHash) as unknown as ReceiptView;
}

function distributionFactory(chainId: string | null) {
  return networkFromChainId(chainId) === "mainnet" ? process.env.NEXT_PUBLIC_MAINNET_DISTRIBUTION_FACTORY_ADDRESS?.trim() || null : null;
}

function campaignPlan(values: Record<string, string>, recipients: Recipient[], decimals: number) {
  const kind = values.kind;
  const count = kind === "vesting" ? Math.min(24, Math.max(1, Number(values.tranches ?? 1))) : 1;
  const firstPercent = kind === "vesting" ? Math.max(0, Math.min(100, Number(values.initialUnlock ?? 0))) : 0;
  const firstUnlock = Math.floor(new Date(kind === "airdrop" ? values.startsAt : values.firstUnlock).getTime() / 1_000);
  const expiresAt = kind === "airdrop" ? Math.floor(new Date(values.endsAt).getTime() / 1_000) : 0;
  const recipientSplits = recipients.map((recipient) => {
    const raw = parseTokenAmount(recipient.amount, decimals);
    if (!raw || raw <= BigInt(0)) throw new Error("A recipient amount is invalid.");
    return splitRaw(raw, count, firstPercent);
  });
  const plan = Array.from({ length: count }, (_, index) => ({
    series: "",
    allocation: recipientSplits.reduce((sum, amounts) => sum + amounts[index], BigInt(0)).toString(),
    unlockAt: kind === "vesting" ? addCadence(firstUnlock, values.cadence, index) : firstUnlock,
    expiresAt,
    recipientAmounts: recipientSplits.map((amounts) => amounts[index].toString()),
  } satisfies TicketTranche));
  const maxU128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  if (plan.some((tranche) => BigInt(tranche.allocation) <= BigInt(0) || BigInt(tranche.allocation) > maxU128)) {
    throw new Error("Every tranche must have a non-zero allocation that fits the claim contract.");
  }
  return plan;
}

export function DistributionDetailWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const showToast = useToast();
  const [draft, setDraft] = useState<WorkspaceDraft | null | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shieldPlan, setShieldPlan] = useState<ShieldPlan | null>(null);
  const [shieldModalOpen, setShieldModalOpen] = useState(false);
  const [pendingShield, setPendingShield] = useState<{ token: string; submittedAt: number } | null>(null);
  const [recipientPage, setRecipientPage] = useState(1);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    void loadDraft(STORAGE_KEY, params.id, sessionStatus === "synced").then((value) => { if (active) setDraft(value); });
    return () => { active = false; };
  }, [params.id, sessionStatus]);

  const values = draft?.values ?? {};
  const recipients = useMemo(() => parseRecipients(values.recipients), [values.recipients]);
  const recipientPageCount = Math.max(1, Math.ceil(recipients.length / RECIPIENT_PAGE_SIZE));
  const recipientPageStart = (recipientPage - 1) * RECIPIENT_PAGE_SIZE;
  const visibleRecipients = recipients.slice(recipientPageStart, recipientPageStart + RECIPIENT_PAGE_SIZE);
  const symbol = knownTokenDetails(values.token)?.symbol ?? "tokens";
  const plan = useMemo<TicketTranche[]>(() => {
    try { return JSON.parse(values.ticketPlan ?? "[]") as TicketTranche[]; } catch { return []; }
  }, [values.ticketPlan]);

  useEffect(() => {
    setRecipientPage((current) => Math.min(current, recipientPageCount));
  }, [recipientPageCount]);

  if (draft === undefined) return <main className="distribution-detail"><p>Loading distribution…</p></main>;
  if (!draft) return <main className="distribution-detail"><section className="launch-detail__missing"><h1>Distribution not found</h1><p>This distribution is not in the connected wallet workspace.</p><Link href="/app/distributions">Return to distributions →</Link></section></main>;
  const loadedDraft = draft;

  const networkMatches = !values.chainId || values.chainId === chainId;
  const isOwner = !values.owner || sameAddress(values.owner, address);
  const kind = values.kind ?? "disperse";
  const trancheCount = Math.min(24, Math.max(1, Number(values.tranches ?? 1)));
  const initialUnlock = Math.max(0, Math.min(100, Number(values.initialUnlock ?? 0)));
  const firstUnlockTimestamp = Math.floor(new Date(values.firstUnlock ?? "").getTime() / 1_000);
  const finalUnlockTimestamp = Number.isFinite(firstUnlockTimestamp)
    ? addCadence(firstUnlockTimestamp, values.cadence, trancheCount - 1)
    : Number.NaN;
  const allocationPattern = trancheCount === 1
    ? "100% at first unlock"
    : initialUnlock > 0
      ? `${initialUnlock}% first, remainder across ${trancheCount - 1}`
      : `Evenly across ${trancheCount} tranches`;
  const stage = kind === "disperse"
    ? values.executionTx ? "complete" : "ready"
    : values.publishedClaims === "true" ? "live" : values.deliveryTx ? "publish" : values.ticketsShieldedTx ? "deliver" : values.ticketsApprovedTx ? "shield" : values.fundingTx ? "approve" : values.ticketPlan ? "fund" : "create";

  async function save(nextValues: Record<string, string>) {
    const result = await updateDraft(STORAGE_KEY, loadedDraft.id, { values: nextValues }, sessionStatus === "synced");
    if (!result) throw new Error("The distribution workspace could not be updated.");
    setDraft(result.draft);
    return result.draft;
  }

  async function requireRecipientsRegistered() {
    setMessage("Checking that every recipient can receive private tokens…");
    const checks = await Promise.all(recipients.map((recipient) => privacySetupIssue(recipient.address, chainId)));
    const missing = checks.reduce<number[]>((items, status, index) => status === "registered" ? items : [...items, index + 1], []);
    if (missing.length) throw new Error(`Recipients ${missing.join(", ")} must enable private tokens before delivery.`);
  }

  function requestShield(nextPlan: ShieldPlan) {
    const stillSettling = pendingShield
      && sameAddress(pendingShield.token, nextPlan.token)
      && Date.now() - pendingShield.submittedAt < 10 * 60 * 1_000;
    if (stillSettling) {
      setMessage(`Your ${nextPlan.label} shield is still settling. Wait about 10 blocks, then check the shielded balance again.`);
      return false;
    }
    setShieldPlan(nextPlan);
    setShieldModalOpen(true);
    setMessage(`Shield ${nextPlan.amount} ${nextPlan.label} before continuing.`);
    showToast({ tone: "info", message: `Your private ${nextPlan.label} balance is short. The Shield form is ready with the required amount.` });
    return false;
  }

  async function ensurePrivateStrk(requiredOperations: number, reason: string) {
    const fee = await readPrivacyPoolFee(chainId);
    if (fee === null) throw new Error("The current STRK20 pool fee could not be loaded.");
    const balances = await walletAccount?.strk20Balances([STRK_TOKEN_ADDRESS]);
    if (!balances) throw new Error("Your private STRK balance could not be loaded.");
    const privateStrk = privateTokenBalance(balances, STRK_TOKEN_ADDRESS);
    const required = fee * BigInt(requiredOperations);
    if (privateStrk >= required) return true;
    const shortfall = required - privateStrk;
    // Shielding STRK is itself a fee-bearing private operation. Gross up the
    // public deposit so the resulting note covers every remaining operation.
    const shieldAmount = shortfall + fee;
    return requestShield({
      token: STRK_TOKEN_ADDRESS,
      label: "STRK",
      amount: formatTokenInputAmount(shieldAmount, 18),
      message: `You have ${formatTokenAmount(privateStrk, 18)} private STRK and need ${formatTokenAmount(required, 18)} for ${reason}. Shield ${formatTokenAmount(shieldAmount, 18)} STRK; this also covers the shielding fee.`,
    });
  }

  async function executeDisperse() {
    if (!walletAccount || !address || stage !== "ready" || values.executionTx || lock.current) return;
    lock.current = true;
    setWorking(true);
    try {
      if (recipients.length > MAX_ATOMIC_RECIPIENTS) throw new Error(`This first atomic batch supports up to ${MAX_ATOMIC_RECIPIENTS} recipients. Split this list before submitting.`);
      const nodeUrl = rpcUrlForChain(chainId);
      if (!nodeUrl) throw new Error("The selected network RPC is unavailable.");
      const provider = new RpcProvider({ nodeUrl });
      const decimals = await tokenDecimals(provider, values.token);
      await requireRecipientsRegistered();
      const actions: STRK20_ACTION[] = recipients.map((recipient) => {
        const amount = parseTokenAmount(recipient.amount, decimals);
        if (!amount) throw new Error("A recipient amount is invalid.");
        return { type: "transfer", token: num.toHex(BigInt(values.token)), amount: num.toHex(amount), recipient: num.toHex(BigInt(recipient.address)) };
      });
      const total = recipients.reduce((sum, recipient) => sum + (parseTokenAmount(recipient.amount, decimals) ?? BigInt(0)), BigInt(0));
      const fee = await readPrivacyPoolFee(chainId) ?? BigInt(0);
      setMessage("Checking your private balances…");
      const balances = await walletAccount.strk20Balances([values.token, STRK_TOKEN_ADDRESS]);
      const privateToken = privateTokenBalance(balances, values.token);
      const privateStrk = privateTokenBalance(balances, STRK_TOKEN_ADDRESS);
      const distributesStrk = sameAddress(values.token, STRK_TOKEN_ADDRESS);
      const tokenNeedsShield = !distributesStrk && privateToken < total;
      // A non-STRK token shield consumes one STRK20 pool fee, and the later
      // private delivery consumes another. Reserve both before opening the
      // token shield so Ready does not discover a fee shortfall mid-flow.
      const requiredStrk = distributesStrk ? total + fee : fee * BigInt(tokenNeedsShield ? 2 : 1);
      if (sameAddress(values.token, STRK_TOKEN_ADDRESS) && privateStrk < requiredStrk) {
        const shortfall = requiredStrk - privateStrk;
        const shieldAmount = shortfall + fee;
        return requestShield({
          token: STRK_TOKEN_ADDRESS,
          label: "STRK",
          amount: formatTokenInputAmount(shieldAmount, 18),
          message: `You have ${formatTokenAmount(privateStrk, 18)} private STRK and need ${formatTokenAmount(requiredStrk, 18)} for this batch. The shield amount also covers the shielding fee.`,
        });
      }
      if (privateStrk < requiredStrk) {
        const shortfall = requiredStrk - privateStrk;
        const shieldAmount = shortfall + fee;
        return requestShield({
          token: STRK_TOKEN_ADDRESS,
          label: "STRK",
          amount: formatTokenInputAmount(shieldAmount, 18),
          message: tokenNeedsShield
            ? `Before shielding ${symbol}, this flow needs ${formatTokenAmount(requiredStrk, 18)} private STRK: one pool fee for shielding and one for delivery. The suggested STRK amount also covers its own shielding fee.`
            : `This private batch needs ${formatTokenAmount(requiredStrk, 18)} STRK for the pool fee. The suggested STRK amount also covers its own shielding fee.`,
        });
      }
      if (tokenNeedsShield) {
        const shortfall = total - privateToken;
        return requestShield({
          token: values.token,
          label: symbol,
          amount: formatTokenInputAmount(shortfall, decimals),
          message: `You have ${formatTokenAmount(privateToken, decimals)} private ${symbol} and need ${formatTokenAmount(total, decimals)}. Shield the ${formatTokenAmount(shortfall, decimals)} ${symbol} shortfall before delivery.`,
        });
      }
      setPendingShield(null);
      setMessage(`Confirm one private batch for ${recipients.length} recipients in your wallet.`);
      const result = await submitPrivateActions(walletAccount, actions, {
        idempotencyKey: `distribution:${chainId ?? values.chainId ?? "unknown"}:${loadedDraft.id}:disperse`,
      });
      await save({ executionTx: result.transaction_hash, status: "complete", tokenDecimals: String(decimals) });
      setMessage("Distribution submitted. Recipient notes may take several blocks to appear.");
      showToast({ tone: "success", message: "Private distribution submitted.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) {
      const next = productErrorMessage(error, error instanceof Error ? error.message : "The distribution was not completed.");
      setMessage(next);
      showToast({ tone: next.startsWith("Request cancelled") ? "info" : "error", message: next });
    } finally { lock.current = false; setWorking(false); }
  }

  async function createCampaign() {
    if (!walletAccount || stage !== "create" || values.ticketPlan || lock.current) return;
    lock.current = true;
    setWorking(true);
    try {
      const factory = distributionFactory(chainId);
      const nodeUrl = rpcUrlForChain(chainId);
      if (!factory || !nodeUrl) throw new Error("Claim infrastructure is not configured for this network.");
      const provider = new RpcProvider({ nodeUrl });
      const decimals = await tokenDecimals(provider, values.token);
      const nextPlan = campaignPlan(values, recipients, decimals);
      const salt = randomSalt();
      const calldata: Array<string | number | bigint> = [values.token, decimals, salt, nextPlan.length];
      nextPlan.forEach((tranche) => calldata.push(tranche.allocation, tranche.unlockAt, tranche.expiresAt));
      setMessage(`Confirm creation of ${nextPlan.length} claim ${nextPlan.length === 1 ? "series" : "series"} in your wallet.`);
      const result = await walletAccount.execute({ contractAddress: factory, entrypoint: "create_campaign", calldata });
      const receipt = await waitForReceipt(provider, result.transaction_hash);
      const selector = BigInt(hash.getSelectorFromName("SeriesCreated"));
      const series = (receipt.events ?? [])
        .filter((item) => sameAddress(item.from_address, factory) && item.keys?.[0] && BigInt(item.keys[0]) === selector)
        .map((item) => item.data?.[1])
        .filter((item): item is string => Boolean(item));
      if (series.length !== nextPlan.length) throw new Error("The created claim series could not be read from the confirmed transaction.");
      const completedPlan = nextPlan.map((tranche, index) => ({ ...tranche, series: num.toHex(BigInt(series[index])) }));
      await save({ ticketPlan: JSON.stringify(completedPlan), campaignSalt: salt, deploymentTx: result.transaction_hash, tokenDecimals: String(decimals), status: "deploying" });
      setMessage("Claim series created. Fund their token reserves next.");
      showToast({ tone: "success", message: "Claim series created.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) {
      const next = productErrorMessage(error, error instanceof Error ? error.message : "The claim series were not created.");
      setMessage(next); showToast({ tone: "error", message: next });
    } finally { lock.current = false; setWorking(false); }
  }

  async function fundCampaign() {
    if (!walletAccount || stage !== "fund" || values.fundingTx || lock.current || !plan.length) return;
    lock.current = true; setWorking(true);
    try {
      const nodeUrl = rpcUrlForChain(chainId); if (!nodeUrl) throw new Error("The selected network RPC is unavailable.");
      const calls = plan.flatMap((tranche) => [
        { contractAddress: values.token, entrypoint: "approve", calldata: [tranche.series, num.toHex(BigInt(tranche.allocation)), "0x0"] },
        { contractAddress: tranche.series, entrypoint: "fund", calldata: [] },
      ]);
      setMessage(`Confirm funding for ${plan.length} claim ${plan.length === 1 ? "series" : "series"}.`);
      const result = await walletAccount.execute(calls);
      await waitForReceipt(new RpcProvider({ nodeUrl }), result.transaction_hash);
      await save({ fundingTx: result.transaction_hash, status: "funding" });
      setMessage("Reserves funded. Approve the STRK20 pool to shield the claim tickets.");
      showToast({ tone: "success", message: "Claim reserves funded.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) {
      const next = productErrorMessage(error, error instanceof Error ? error.message : "Campaign funding was not completed."); setMessage(next); showToast({ tone: "error", message: next });
    } finally { lock.current = false; setWorking(false); }
  }

  async function approveTickets() {
    if (!walletAccount || stage !== "approve" || values.ticketsApprovedTx || lock.current || !plan.length) return;
    lock.current = true; setWorking(true);
    try {
      const pool = privacyPoolAddress(chainId); const nodeUrl = rpcUrlForChain(chainId);
      if (!pool || !nodeUrl) throw new Error("The STRK20 pool is unavailable.");
      setMessage(`Confirm ${plan.length} exact claim-ticket ${plan.length === 1 ? "approval" : "approvals"} to the configured STRK20 pool. Ready may display its standard high-risk warning for spending limits.`);
      const result = await walletAccount.execute(plan.map((tranche) => ({ contractAddress: tranche.series, entrypoint: "approve", calldata: [pool, num.toHex(BigInt(tranche.allocation)), "0x0"] })));
      await waitForReceipt(new RpcProvider({ nodeUrl }), result.transaction_hash);
      await save({ ticketsApprovedTx: result.transaction_hash });
      setMessage("Tickets approved. Shield them into your private balance next.");
      showToast({ tone: "success", message: "Claim tickets approved.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) { const next = productErrorMessage(error, "Ticket approval was not completed."); setMessage(next); showToast({ tone: "error", message: next }); }
    finally { lock.current = false; setWorking(false); }
  }

  async function shieldTickets() {
    if (!walletAccount || stage !== "shield" || values.ticketsShieldedTx || lock.current || !plan.length) return;
    lock.current = true; setWorking(true);
    try {
      setMessage("Checking the private STRK needed for ticket shielding and delivery…");
      if (!await ensurePrivateStrk(2, "ticket shielding and the following private delivery")) return;
      const actions: STRK20_ACTION[] = plan.map((tranche) => ({ type: "deposit", token: tranche.series, amount: num.toHex(BigInt(tranche.allocation)) }));
      setMessage("Confirm this claim-ticket Shield once. Its token approval was completed in the previous step.");
      const result = await submitPrivateActions(walletAccount, actions, {
        idempotencyKey: `distribution:${chainId ?? values.chainId ?? "unknown"}:${loadedDraft.id}:shield-tickets`,
      });
      await save({ ticketsShieldedTx: result.transaction_hash, ticketsShieldedAt: new Date().toISOString() });
      setMessage("Tickets shielded. Reject any wallet prompt that repeats the same claim-ticket Shield. Wait about 10 blocks for the notes to mature, then deliver them.");
      showToast({ tone: "success", message: "Claim tickets shielded. Reject any repeated Shield prompt.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) { const next = productErrorMessage(error, "Claim tickets were not shielded."); setMessage(next); showToast({ tone: "error", message: next }); }
    finally { lock.current = false; setWorking(false); }
  }

  async function deliverTickets() {
    if (!walletAccount || stage !== "deliver" || values.deliveryTx || lock.current || !plan.length) return;
    lock.current = true; setWorking(true);
    try {
      if (recipients.length > MAX_ATOMIC_RECIPIENTS) throw new Error(`This first atomic batch supports up to ${MAX_ATOMIC_RECIPIENTS} recipients.`);
      await requireRecipientsRegistered();
      setMessage("Checking that every shielded claim-ticket note has matured…");
      const ticketBalances = await walletAccount.strk20Balances(plan.map((tranche) => tranche.series));
      const ticketsReady = plan.every((tranche) => privateTokenBalance(ticketBalances, tranche.series) >= BigInt(tranche.allocation));
      if (!ticketsReady) {
        setMessage("The claim-ticket notes are still maturing. Wait about 10 blocks, then check again; no transaction was opened.");
        return;
      }
      setMessage("Checking the private STRK needed for delivery…");
      if (!await ensurePrivateStrk(1, "the private claim-ticket delivery")) return;
      const actions: STRK20_ACTION[] = [];
      plan.forEach((tranche) => tranche.recipientAmounts.forEach((amount, index) => {
        if (BigInt(amount) > BigInt(0)) actions.push({ type: "transfer", token: tranche.series, amount: num.toHex(BigInt(amount)), recipient: num.toHex(BigInt(recipients[index].address)) });
      }));
      if (actions.length > MAX_ATOMIC_RECIPIENTS) throw new Error(`This campaign creates ${actions.length} private allocations. Use at most ${MAX_ATOMIC_RECIPIENTS} allocations for one atomic delivery.`);
      setMessage(`Confirm one private delivery batch containing ${actions.length} allocations.`);
      const result = await submitPrivateActions(walletAccount, actions, {
        idempotencyKey: `distribution:${chainId ?? values.chainId ?? "unknown"}:${loadedDraft.id}:deliver-tickets`,
      });
      const deliveredDraft = await save({ deliveryTx: result.transaction_hash, status: "delivered" });
      await publishClaims(deliveredDraft);
      setMessage("Tickets delivered privately. Recipients can now discover them in Claims. Reject any wallet prompt that repeats this same recipient batch.");
      showToast({ tone: "success", message: "Allocations delivered. Reject any repeated delivery prompt.", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) { const next = productErrorMessage(error, error instanceof Error ? error.message : "Ticket delivery was not completed."); setMessage(next); showToast({ tone: "error", message: next }); }
    finally { lock.current = false; setWorking(false); }
  }

  async function publishClaims(sourceDraft: WorkspaceDraft = loadedDraft) {
    const response = await fetch("/api/distributions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sourceDraft) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Claims could not be published.");
    await save({ publishedClaims: "true", status: "live" });
  }

  async function retryPublishClaims() {
    if (stage !== "publish" || values.publishedClaims === "true" || lock.current) return;
    lock.current = true; setWorking(true);
    try {
      setMessage("Publishing claim discovery without resending recipient allocations…");
      await publishClaims();
      setMessage("Claims are published. Recipients can now find them in Claims.");
      showToast({ tone: "success", message: "Claims published." });
    } catch (error) {
      const next = productErrorMessage(error, error instanceof Error ? error.message : "Claims could not be published.");
      setMessage(next); showToast({ tone: "error", message: next });
    } finally { lock.current = false; setWorking(false); }
  }

  const action = kind === "disperse"
    ? stage === "complete" ? null : executeDisperse
    : stage === "create" ? createCampaign
      : stage === "fund" ? fundCampaign
        : stage === "approve" ? approveTickets
          : stage === "shield" ? shieldTickets
            : stage === "deliver" ? deliverTickets
              : stage === "publish" ? retryPublishClaims
                : null;
  const actionLabel = kind === "disperse" ? (stage === "complete" ? "Distribution complete" : pendingShield ? "Check shielded balance" : "Check & send privately") : ({ create: "Create claim series", fund: "Fund claim reserves", approve: `Review ${plan.length} exact ${plan.length === 1 ? "approval" : "approvals"}`, shield: pendingShield ? "Check shielded fee balance" : "Shield claim tickets", deliver: pendingShield ? "Check shielded fee balance" : "Check tickets & deliver", publish: "Publish claims", live: "Claims are live" } as Record<string, string>)[stage];

  return <main className="distribution-detail" id="main-content" tabIndex={-1}>
    <header className="distribution-detail__heading"><div><Link href="/app/distributions">← Distributions</Link><p className="app-eyebrow">{kind === "disperse" ? "Direct delivery" : kind === "airdrop" ? "Claim campaign" : "Vesting schedule"}</p><h1>{loadedDraft.title}</h1><p>{kind === "disperse" ? "Review and deliver the complete recipient batch privately." : "Create, fund, shield, and privately deliver recipient claim tickets."}</p></div><span>{stage === "complete" || stage === "live" ? "Complete" : "Draft"}</span></header>
    <section className="distribution-detail__grid">
      <div className="distribution-detail__summary"><header><p className="app-eyebrow">Distribution overview</p><h2>{kind === "disperse" ? "Private transfers" : kind === "airdrop" ? "Airdrop claims" : "Scheduled claims"}</h2></header><dl><div><dt>Token</dt><dd>{symbol}</dd></div><div><dt>Recipients</dt><dd>{recipients.length}</dd></div><div><dt>Total allocation</dt><dd>{values.total} {symbol}</dd></div><div><dt>Delivery</dt><dd>{kind === "disperse" ? "Immediate" : kind === "airdrop" ? "Claim window" : `${values.tranches} tranches`}</dd></div></dl>
        {kind === "vesting" && <section className="distribution-detail__schedule" aria-labelledby="vesting-schedule-title">
          <header><div><p className="app-eyebrow">Unlock schedule</p><h3 id="vesting-schedule-title">How the allocation unlocks</h3></div><span>{trancheCount} {trancheCount === 1 ? "checkpoint" : "checkpoints"}</span></header>
          <dl>
            <div><dt>First unlock</dt><dd>{formatScheduleDate(values.firstUnlock)}</dd></div>
            <div><dt>Cadence</dt><dd>{trancheCount === 1 ? "One-time unlock" : values.cadence === "weekly" ? "Every week" : "Every month"}</dd></div>
            <div><dt>Allocation pattern</dt><dd>{allocationPattern}</dd></div>
            <div><dt>Final unlock</dt><dd>{formatScheduleDate(finalUnlockTimestamp)}</dd></div>
          </dl>
        </section>}
        {kind === "airdrop" && <section className="distribution-detail__schedule" aria-labelledby="airdrop-window-title">
          <header><div><p className="app-eyebrow">Claim window</p><h3 id="airdrop-window-title">When recipients can claim</h3></div></header>
          <dl className="distribution-detail__schedule-grid--three">
            <div><dt>Opens</dt><dd>{formatScheduleDate(values.startsAt)}</dd></div>
            <div><dt>Closes</dt><dd>{formatScheduleDate(values.endsAt)}</dd></div>
            <div><dt>Unclaimed return to</dt><dd><code title={values.refundAddress}>{compactAddress(values.refundAddress)}</code></dd></div>
          </dl>
        </section>}
      </div>
      <aside className="distribution-detail__action"><p className="app-eyebrow">{stage === "complete" || stage === "live" ? "Status" : "Next action"}</p><h2>{actionLabel}</h2><p>{kind === "disperse" ? stage === "complete" ? "This private batch has been submitted. No further wallet action is required." : "Droptron checks recipient registration and private balances before opening one batch confirmation." : stage === "create" ? "Deploy the funded entitlement structure for this campaign." : stage === "fund" ? "Move the underlying allocation into the claim series." : stage === "approve" ? `Ready will show ${plan.length} spending-limit ${plan.length === 1 ? "approval" : "approvals"}: one exact claim-ticket allowance per tranche to the configured STRK20 pool. This step does not approve spending your underlying ${symbol}.` : stage === "shield" ? "Move claim tickets into your private balance before delivery." : stage === "deliver" ? "Send every recipient allocation as private claim tickets." : stage === "publish" ? "Delivery is complete. Publish public campaign metadata so recipients can discover their claims." : "Recipients can find and redeem their private allocations."}</p>{!networkMatches ? <small>Switch to the network used to create this distribution.</small> : !isOwner ? <small>Connect the creator wallet.</small> : privacyStatus !== "supported" ? <small>Connect a wallet that supports private tokens.</small> : action && <button type="button" disabled={working} onClick={() => void action()}>{working ? "Working…" : actionLabel}<span>→</span></button>}{message && <small role="status">{message}</small>}{values.executionTx && <a href={explorerTransaction(chainId, values.executionTx)} target="_blank" rel="noreferrer">View transaction ↗</a>}{values.deliveryTx && <a href={explorerTransaction(chainId, values.deliveryTx)} target="_blank" rel="noreferrer">View delivery ↗</a>}</aside>
    </section>
    <section className="distribution-recipients" aria-labelledby="distribution-recipients-title">
      <header><div><p className="app-eyebrow">Recipient allocation</p><h2 id="distribution-recipients-title">Recipients</h2></div><span>{recipients.length} {recipients.length === 1 ? "recipient" : "recipients"}</span></header>
      <div className="distribution-recipients__scroll">
        <table>
          <thead><tr><th scope="col">No.</th><th scope="col">Recipient</th><th scope="col">Allocation</th></tr></thead>
          <tbody>{visibleRecipients.map((recipient, index) => <tr key={`${recipient.address}-${recipientPageStart + index}`}><td>{String(recipientPageStart + index + 1).padStart(2, "0")}</td><td><span title={recipient.address}>{recipient.address.slice(0, 12)}…{recipient.address.slice(-10)}</span></td><td><strong>{recipient.amount} {symbol}</strong></td></tr>)}</tbody>
        </table>
      </div>
      {recipients.length > RECIPIENT_PAGE_SIZE && <nav className="distribution-recipients__pagination" aria-label="Recipient pages">
        <span>{recipientPageStart + 1}–{Math.min(recipientPageStart + RECIPIENT_PAGE_SIZE, recipients.length)} of {recipients.length}</span>
        <div><button type="button" disabled={recipientPage === 1} onClick={() => setRecipientPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {recipientPage} of {recipientPageCount}</span><button type="button" disabled={recipientPage === recipientPageCount} onClick={() => setRecipientPage((page) => Math.min(recipientPageCount, page + 1))}>Next</button></div>
      </nav>}
    </section>
    {shieldModalOpen && shieldPlan && <PrivateActionPanel
      defaultKind="deposit"
      defaultToken={shieldPlan.token}
      tokenLabel={shieldPlan.label}
      defaultAmount={shieldPlan.amount}
      notice={shieldPlan.message}
      modal
      onClose={() => setShieldModalOpen(false)}
      onSubmitted={() => {
        setPendingShield({ token: shieldPlan.token, submittedAt: Date.now() });
        setShieldModalOpen(false);
        setShieldPlan(null);
        setMessage("Shield submitted. Reject any wallet prompt that repeats the same Shield request. Wait about 10 blocks for the private note to mature, then check the shielded balance.");
        router.refresh();
      }}
    />}
  </main>;
}

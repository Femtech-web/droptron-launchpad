"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RpcProvider, type CompiledContract, type CompiledSierraCasm } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { productErrorMessage } from "@/features/wallet/product-error";
import { declareReviewedContract } from "@/features/wallet/declare-contract";
import { formatTokenAmount } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";

type Step = {
  id: string;
  kind: "declare" | "deploy";
  label: string;
  purpose: string;
  complete: boolean;
  available: boolean;
  classHash: string;
  compiledClassHash?: string;
  address?: string;
  dependsOn?: string[];
};

type DeploymentStatus = { admin: string; poolAddress: string; steps: Step[] };
type Estimate = {
  id: string;
  kind: "declare" | "deploy";
  label: string;
  estimatedFee: string;
  publicBalance: string;
  classHash?: string;
  compiledClassHash?: string;
  predictedAddress?: string;
  payload?: { classHash: string; constructorCalldata: string[]; salt: string; unique: boolean };
};
type Artifacts = { contract: CompiledContract; casm: CompiledSierraCasm; classHash: string; compiledClassHash: string };

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS?.trim() || null;

function sameAddress(left: string | null, right: string | null) {
  if (!left || !right) return false;
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

function shortHash(value?: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "—";
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "The deployment request could not be completed.";
}

export function MainnetDeploymentPanel() {
  const { address, chainId, walletAccount } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const showToast = useToast();
  const submissionLock = useRef(false);
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = sameAddress(address, ADMIN_ADDRESS);
  const isMainnet = networkFromChainId(chainId) === "mainnet";

  const loadStatus = useCallback(async () => {
    if (!isAdmin || !isMainnet || sessionStatus !== "synced") return;
    setLoading(true);
    try {
      const response = await fetch("/api/deployment/mainnet", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      setStatus(await response.json() as DeploymentStatus);
    } catch (error) {
      setMessage(productErrorMessage(error, "The Mainnet deployment status could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isMainnet, sessionStatus]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function reviewStep(step: Step) {
    if (loading || submitting || step.complete || !step.available) return;
    setLoading(true);
    setEstimate(null);
    setReviewed(false);
    setMessage(null);
    try {
      const response = await fetch("/api/deployment/mainnet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: step.id }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setEstimate(await response.json() as Estimate);
      setMessage("Estimate ready. Nothing has been submitted.");
    } catch (error) {
      const nextMessage = productErrorMessage(error, "The Mainnet estimate could not be completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function submitStep() {
    if (!estimate || !reviewed || !walletAccount || !address || submissionLock.current || !isAdmin || !isMainnet) return;
    if (BigInt(estimate.publicBalance) < BigInt(estimate.estimatedFee)) {
      setMessage("Add STRK before continuing. Your balance is below the estimated fee.");
      return;
    }
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) return setMessage("The Mainnet RPC is not configured.");
    submissionLock.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      let transactionHash: string;
      if (estimate.kind === "declare") {
        const response = await fetch(`/api/deployment/mainnet?artifact=${encodeURIComponent(estimate.id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await responseError(response));
        const artifacts = await response.json() as Artifacts;
        if (artifacts.classHash !== estimate.classHash || artifacts.compiledClassHash !== estimate.compiledClassHash) throw new Error("The reviewed contract changed. Review its fee again.");
        const result = await declareReviewedContract(walletAccount, artifacts);
        transactionHash = result.transaction_hash;
      } else {
        if (!estimate.payload) throw new Error("The reviewed deployment values are missing.");
        const result = await walletAccount.deploy(estimate.payload);
        const returnedAddress = result.contract_address[0];
        if (!returnedAddress || (estimate.predictedAddress && !sameAddress(returnedAddress, estimate.predictedAddress))) throw new Error("Ready returned an unexpected contract address. Check Voyager before continuing.");
        transactionHash = result.transaction_hash;
      }
      setMessage("Submitted. Waiting for Mainnet acceptance…");
      await provider.waitForTransaction(transactionHash, { retryInterval: 3_000 });
      setEstimate(null);
      setReviewed(false);
      setMessage("Step complete. Review the next fee when you are ready.");
      showToast({ message: `${estimate.label} completed.`, tone: "success", href: `https://voyager.online/tx/${transactionHash}`, linkLabel: "View transaction" });
      await loadStatus();
    } catch (error) {
      console.error("[Droptron Mainnet deployment] wallet step failed", error);
      const nextMessage = productErrorMessage(error, "The Mainnet step was not completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  if (!address) return <section className="deployment-lock"><span>Admin deployment</span><h1>Connect the authorized wallet.</h1><p>This workspace does not expose contract artifacts or actions until the admin wallet is connected.</p></section>;
  if (!isAdmin) return <section className="deployment-lock"><span>Restricted</span><h1>This route is not available to this wallet.</h1><p>Disconnect and use the authorized Droptron Mainnet account.</p></section>;
  if (!isMainnet) return <section className="deployment-lock"><span>Wrong network</span><h1>Switch Ready to Mainnet.</h1><p>Deployment actions are permanently disabled on any other network.</p></section>;
  if (sessionStatus !== "synced") return <section className="deployment-lock"><span>Verifying wallet</span><h1>Complete the wallet signature.</h1><p>The signed workspace session must match the connected Mainnet admin account.</p></section>;

  const declarations = status?.steps.filter((step) => step.kind === "declare") ?? [];
  const deployments = status?.steps.filter((step) => step.kind === "deploy") ?? [];
  const completed = status?.steps.filter((step) => step.complete).length ?? 0;
  const enoughBalance = estimate ? BigInt(estimate.publicBalance) >= BigInt(estimate.estimatedFee) : false;

  return <main className="deployment-page" id="main-content">
    <header className="deployment-hero">
      <div><p className="app-eyebrow">Mainnet operations</p><h1>Deployment runway</h1><p>Register each reviewed template, then deploy the three shared infrastructure contracts. Ready asks for one confirmation per step.</p></div>
      <div className="deployment-progress" aria-label={`${completed} of ${status?.steps.length ?? 9} steps complete`}><strong>{completed}</strong><span>of {status?.steps.length ?? 9}<br />complete</span></div>
    </header>
    <aside className="deployment-safety"><span aria-hidden="true">i</span><p><strong>No bulk deployment.</strong> A fee estimate never submits a transaction. Only the final button opens Ready for the selected step.</p></aside>
    {message && <p className="deployment-message" role="status">{message}</p>}
    <DeploymentGroup eyebrow="Contract classes" title="Register reusable templates" description="Declarations publish code once. They do not create a token, launch, or campaign." steps={declarations} estimate={estimate} loading={loading} submitting={submitting} onReview={reviewStep} />
    <DeploymentGroup eyebrow="Shared infrastructure" title="Deploy pinned instances" description="These deterministic instances connect launches, distributions, claims, and the STRK20 pool." steps={deployments} estimate={estimate} loading={loading} submitting={submitting} onReview={reviewStep} />
    {estimate && <section className="deployment-review" aria-labelledby="deployment-review-title">
      <header><div><p className="app-eyebrow">Final review</p><h2 id="deployment-review-title">{estimate.label}</h2></div><button type="button" onClick={() => { setEstimate(null); setReviewed(false); }}>Close</button></header>
      <dl><div><dt>Action</dt><dd>{estimate.kind === "declare" ? "Register class" : "Deploy contract"}</dd></div><div><dt>Estimated fee</dt><dd>{formatTokenAmount(BigInt(estimate.estimatedFee))} STRK</dd></div><div><dt>Wallet balance</dt><dd>{formatTokenAmount(BigInt(estimate.publicBalance))} STRK</dd></div>{estimate.predictedAddress && <div className="deployment-review__wide"><dt>Expected address</dt><dd><code>{estimate.predictedAddress}</code></dd></div>}</dl>
      <footer><label><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed this Mainnet action and its estimated fee.</span></label><button type="button" disabled={!reviewed || !enoughBalance || submitting} onClick={() => void submitStep()}>{submitting ? "Waiting for Ready…" : "Confirm in Ready"}<span>→</span></button></footer>
    </section>}
  </main>;
}

function DeploymentGroup({ eyebrow, title, description, steps, estimate, loading, submitting, onReview }: { eyebrow: string; title: string; description: string; steps: Step[]; estimate: Estimate | null; loading: boolean; submitting: boolean; onReview: (step: Step) => Promise<void> }) {
  return <section className="deployment-group">
    <header><div><p className="app-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div><span>{steps.filter((step) => step.complete).length}/{steps.length}</span></header>
    <div className="deployment-list">{steps.map((step, index) => <article key={step.id} className={step.complete ? "is-complete" : estimate?.id === step.id ? "is-active" : undefined}>
      <div className="deployment-list__index">{step.complete ? "✓" : String(index + 1).padStart(2, "0")}</div>
      <div className="deployment-list__copy"><strong>{step.label}</strong><p>{step.purpose}</p><code title={step.address ?? step.classHash}>{shortHash(step.address ?? step.classHash)}</code></div>
      <div className="deployment-list__action"><span>{step.complete ? "Complete" : step.available ? "Ready" : "Waiting"}</span><button type="button" disabled={step.complete || !step.available || loading || submitting} onClick={() => void onReview(step)}>{loading && estimate?.id === step.id ? "Estimating…" : "Review fee"}</button></div>
    </article>)}</div>
  </section>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { RpcProvider, shortString, type CompiledContract, type CompiledSierraCasm } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { formatTokenAmount, MAINNET_DROP_ADDRESS_KEY } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { useWallet } from "@/features/wallet/wallet-provider";
import { productErrorMessage } from "@/features/wallet/product-error";
import { declareReviewedContract } from "@/features/wallet/declare-contract";

type TokenDetails = {
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  baseUnits: string;
};

type CreatedToken = {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
  chainId: string | null;
  createdAt: string;
};

type Artifacts = {
  contract: CompiledContract;
  casm: CompiledSierraCasm;
  classHash: string;
  compiledClassHash: string;
};

type DeploymentEstimate = {
  stage: "declare" | "deploy";
  classDeclared: boolean;
  classHash: string;
  compiledClassHash: string;
  estimatedFee: string;
  publicBalance: string;
  predictedAddress?: string;
  deploymentSalt?: string;
  token?: TokenDetails;
};

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS?.trim() || null;
const APPROVED_STAGE = process.env.NEXT_PUBLIC_MAINNET_TOKEN_CREATION_STAGE?.trim() || "locked";

function sameAddress(left: string | null, right: string | null) {
  if (!left || !right) return false;
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

async function waitForAcceptance(provider: RpcProvider, transactionHash: string) {
  await provider.waitForTransaction(transactionHash, { retryInterval: 3_000 });
}

async function readError(response: Response) {
  const result = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof result?.error === "string" ? result.error : "The Mainnet estimate could not be completed.";
}

function storedTokens() {
  const key = "droptron.createdTokens.v1";
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(stored) ? stored as Partial<CreatedToken>[] : [];
  } catch {
    return [];
  }
}

function tokensForCreator(creator: string | null, chainId: string | null) {
  if (!creator) return [];
  return storedTokens().filter((token): token is CreatedToken => Boolean(
    token.address && token.creator && token.name && token.symbol && token.chainId === chainId
    && sameAddress(token.creator, creator),
  ));
}

function rememberToken(token: TokenDetails, tokenAddress: string, creator: string, logoUrl: string, chainId: string | null) {
  const key = "droptron.createdTokens.v1";
  const existing = storedTokens().filter((item) => !item.address || !sameAddress(item.address, tokenAddress));
  window.localStorage.setItem(key, JSON.stringify([
    { address: tokenAddress, creator, name: token.name, symbol: token.symbol, decimals: token.decimals, logoUrl, chainId, createdAt: new Date().toISOString() },
    ...existing,
  ]));
}

export function TokenCreationPanel() {
  const { address, chainId, walletAccount } = useWallet();
  const showToast = useToast();
  const submissionLock = useRef(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [totalSupply, setTotalSupply] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [logoUrl, setLogoUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [estimate, setEstimate] = useState<DeploymentEstimate | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isMainnet = networkFromChainId(chainId) === "mainnet";
  const isAdmin = sameAddress(address, ADMIN_ADDRESS);

  useEffect(() => {
    setEstimate(null);
    setReviewed(false);
    setMessage(null);
  }, [address, chainId]);

  async function requestEstimate() {
    if (!address || !isMainnet || isEstimating || isSubmitting) return;
    setIsEstimating(true);
    setMessage(null);
    setReviewed(false);
    try {
      const response = await fetch("/api/deployment/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, token: { name, symbol, totalSupply, decimals: Number(decimals) } }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setEstimate(await response.json() as DeploymentEstimate);
      setMessage("Estimate ready. Nothing has been submitted.");
    } catch (error) {
      console.error("[Droptron token] estimate failed", error);
      const nextMessage = productErrorMessage(error, "The Mainnet estimate could not be completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: "error" });
    } finally {
      setIsEstimating(false);
    }
  }

  async function submitStage() {
    if (
      submissionLock.current || !walletAccount || !address || !estimate || !reviewed
      || !isMainnet || APPROVED_STAGE !== estimate.stage
    ) return;
    if (BigInt(estimate.publicBalance) < BigInt(estimate.estimatedFee)) {
      setMessage("Add STRK before continuing. The estimated fee exceeds your balance.");
      return;
    }
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) return setMessage("The Mainnet RPC is not configured.");

    submissionLock.current = true;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const artifactResponse = await fetch("/api/deployment/token", { cache: "no-store" });
      if (!artifactResponse.ok) throw new Error("The token template could not be loaded.");
      const artifacts = await artifactResponse.json() as Artifacts;
      if (artifacts.classHash !== estimate.classHash || artifacts.compiledClassHash !== estimate.compiledClassHash) {
        throw new Error("The token template changed after estimation. Estimate again.");
      }

      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      if (estimate.stage === "declare") {
        const result = await declareReviewedContract(walletAccount, artifacts);
        setMessage("Waiting for Mainnet confirmation…");
        await waitForAcceptance(provider, result.transaction_hash);
        setEstimate(null);
        setReviewed(false);
        setMessage("Template registered. Token deployment remains locked until its estimate is approved.");
        showToast({ message: "Token template registered.", tone: "success", href: `https://voyager.online/tx/${result.transaction_hash}`, linkLabel: "View transaction" });
        return;
      }

      if (!estimate.deploymentSalt || !estimate.token) throw new Error("The reviewed token details are missing.");
      const token = estimate.token;
      const baseUnits = BigInt(token.baseUnits);
      const low = baseUnits & ((BigInt(1) << BigInt(128)) - BigInt(1));
      const high = baseUnits >> BigInt(128);
      const result = await walletAccount.deploy({
        classHash: artifacts.classHash,
        constructorCalldata: [
          address,
          low,
          high,
          shortString.encodeShortString(token.name),
          new TextEncoder().encode(token.name).length,
          shortString.encodeShortString(token.symbol),
          new TextEncoder().encode(token.symbol).length,
          token.decimals,
        ],
        salt: estimate.deploymentSalt,
        unique: true,
      });
      const nextAddress = result.contract_address[0];
      if (!nextAddress || (estimate.predictedAddress && !sameAddress(nextAddress, estimate.predictedAddress))) {
        throw new Error("Ready returned an unexpected token address. Check Voyager before continuing.");
      }
      setMessage("Waiting for Mainnet confirmation…");
      await waitForAcceptance(provider, result.transaction_hash);
      rememberToken(token, nextAddress, address, logoUrl.trim(), chainId);
      window.dispatchEvent(new CustomEvent("droptron:token-created", { detail: nextAddress }));
      if (isAdmin && token.symbol === "DROP") {
        window.localStorage.setItem(MAINNET_DROP_ADDRESS_KEY, nextAddress);
        window.dispatchEvent(new CustomEvent("droptron:drop-token-deployed", { detail: nextAddress }));
      }
      setEstimate(null);
      setReviewed(false);
      setMessage("Token created and selected for this launch.");
      showToast({ message: `${token.symbol} created and selected.`, tone: "success", href: `https://voyager.online/tx/${result.transaction_hash}`, linkLabel: "View transaction" });
    } catch (error) {
      console.error("[Droptron token] Mainnet step failed", error);
      const nextMessage = productErrorMessage(error, "The Mainnet token step was not completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  if (!isMainnet) return <div className="token-creator__notice">Switch to Mainnet to create a token.</div>;

  const enoughBalance = estimate ? BigInt(estimate.publicBalance) >= BigInt(estimate.estimatedFee) : false;
  const stageApproved = Boolean(estimate && APPROVED_STAGE === estimate.stage);
  const declarationPending = estimate?.stage === "declare";
  const canEstimate = Boolean(name.trim() && symbol.trim() && totalSupply.trim());

  return <section className="token-creator" aria-labelledby="token-creator-title">
    <header>
      <div><p className="app-eyebrow">Token creator</p><h2 id="token-creator-title">Create a fixed-supply token</h2><p>Set the token details and receive its full supply.</p></div>
    </header>
    <div className="token-creator__fields">
      <label><span>Token name</span><input value={name} onChange={(event) => { setName(event.target.value); setEstimate(null); }} maxLength={31} placeholder="Acme Token" /></label>
      <label><span>Symbol</span><input value={symbol} onChange={(event) => { setSymbol(event.target.value.toUpperCase()); setEstimate(null); }} maxLength={10} placeholder="ACME" /></label>
      <label><span>Total supply</span><input inputMode="decimal" value={totalSupply} onChange={(event) => { setTotalSupply(event.target.value); setEstimate(null); }} placeholder="1000000" /></label>
    </div>
    <button className="token-creator__advanced" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>Advanced <span>{showAdvanced ? "−" : "+"}</span></button>
    {showAdvanced && <div className="token-creator__advanced-fields">
      <label><span>Decimals</span><input type="number" min="0" max="18" value={decimals} onChange={(event) => { setDecimals(event.target.value); setEstimate(null); }} /></label>
      <label><span>Logo URL <i>Optional</i></span><input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://…" /></label>
    </div>}
    {estimate && <div className="token-creator__estimate">
      <div><span>Next step</span><strong>{declarationPending ? "Register reusable template" : `Create ${estimate.token?.symbol ?? "token"}`}</strong></div>
      <div><span>Estimated fee</span><strong>{formatTokenAmount(BigInt(estimate.estimatedFee))} STRK</strong></div>
      <div><span>Your balance</span><strong>{formatTokenAmount(BigInt(estimate.publicBalance))} STRK</strong></div>
      {estimate.predictedAddress && <div><span>Expected address</span><code>{estimate.predictedAddress}</code></div>}
    </div>}
    <footer>
      <div>
        {estimate && <label className="drop-admin__review"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I reviewed this Mainnet step and fee.</span></label>}
        {message && <small role="status">{message}</small>}
        {estimate && !stageApproved && <small>This step is locked until approved.</small>}
      </div>
      {!estimate
        ? <button type="button" onClick={() => void requestEstimate()} disabled={!walletAccount || isEstimating || !canEstimate}>{isEstimating ? "Estimating…" : "Review fee"}<span>→</span></button>
        : <button type="button" onClick={() => void submitStage()} disabled={!reviewed || !enoughBalance || !stageApproved || isSubmitting}>{isSubmitting ? "Waiting for Ready…" : declarationPending ? "Register template" : "Create token"}<span>→</span></button>}
    </footer>
  </section>;
}

const TOKEN_PAGE_SIZE = 10;

function compactAddress(value: string) {
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export function CreatedTokenLibrary({ selectedAddress }: { selectedAddress: string }) {
  const { address, chainId } = useWallet();
  const showToast = useToast();
  const [tokens, setTokens] = useState<CreatedToken[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const refresh = () => setTokens(tokensForCreator(address, chainId));
    refresh();
    window.addEventListener("droptron:token-created", refresh);
    return () => window.removeEventListener("droptron:token-created", refresh);
  }, [address, chainId]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (tokens.length === 0) return null;

  const selected = tokens.find((token) => sameAddress(token.address, selectedAddress)) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = tokens.filter((token) => !normalizedQuery || token.name.toLowerCase().includes(normalizedQuery) || token.symbol.toLowerCase().includes(normalizedQuery) || token.address.toLowerCase().includes(normalizedQuery));
  const pageCount = Math.max(1, Math.ceil(filtered.length / TOKEN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleTokens = filtered.slice(safePage * TOKEN_PAGE_SIZE, (safePage + 1) * TOKEN_PAGE_SIZE);

  function choose(token: CreatedToken) {
    window.dispatchEvent(new CustomEvent("droptron:token-created", { detail: token.address }));
    setOpen(false);
    showToast({ message: `${token.symbol} selected for this launch.`, tone: "success" });
  }

  return <>
    <section className="token-library" aria-label="Your token library">
      <div><span>Your token library</span>{selected ? <p><strong>{selected.symbol}</strong> {selected.name}<code>{compactAddress(selected.address)}</code></p> : <p>{tokens.length} {tokens.length === 1 ? "token" : "tokens"} created by this wallet</p>}</div>
      <button type="button" onClick={() => { setQuery(""); setPage(0); setOpen(true); }}>{selected ? "Change token" : "Browse tokens"}<span>→</span></button>
    </section>
    {open && <div className="token-library-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="token-library-title">
        <header><div><p className="app-eyebrow">Token library</p><h2 id="token-library-title">Choose a token</h2></div><button type="button" aria-label="Close token library" onClick={() => setOpen(false)}>×</button></header>
        <label><span className="sr-only">Search your tokens</span><input autoFocus type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search by name, symbol, or address" /></label>
        <div className="token-library-modal__list">{visibleTokens.length > 0 ? visibleTokens.map((token) => <article key={token.address} data-selected={sameAddress(token.address, selectedAddress)}><div><span><strong>{token.symbol}</strong><small>{token.name}</small><code title={token.address}>{compactAddress(token.address)}</code></span></div><button type="button" onClick={() => choose(token)}>{sameAddress(token.address, selectedAddress) ? "Selected" : "Use token"}</button></article>) : <p>No tokens match your search.</p>}</div>
        <footer><span>{filtered.length} {filtered.length === 1 ? "token" : "tokens"}</span>{pageCount > 1 && <nav aria-label="Token pages"><button type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>←</button><span>{safePage + 1} / {pageCount}</span><button type="button" disabled={safePage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>→</button></nav>}</footer>
      </section>
    </div>}
  </>;
}

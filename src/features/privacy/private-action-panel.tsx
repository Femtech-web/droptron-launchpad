"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { num, RpcProvider, type STRK20_ACTION } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { useWallet } from "@/features/wallet/wallet-provider";
import { formatTokenAmount, formatTokenInputAmount, knownTokenDetails, parseTokenAmount, privateTokenBalance, STRK_TOKEN_ADDRESS, type TokenDetails } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";

import { privateActionErrorMessage, walletErrorName } from "./private-action-errors";
import { readPrivacyPoolFee } from "./privacy-pool";
import { privacySetupIssue } from "./privacy-registration";
import { submitPrivateActions } from "./strk20-actions";

export type ActionKind = "deposit" | "transfer" | "withdraw";

function sameAddress(left: string, right: string) {
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

async function readPublicTokenBalance(provider: RpcProvider, token: string, account: string) {
  const result = await provider.callContract({
    contractAddress: token,
    entrypoint: "balance_of",
    calldata: [account],
  });
  return BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128));
}

async function waitForPublicBalanceIncrease(
  provider: RpcProvider,
  token: string,
  account: string,
  initialBalance: bigint,
  cancelled: () => boolean,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 4_000));
    if (cancelled()) throw new Error("Balance watch cancelled.");
    try {
      if (await readPublicTokenBalance(provider, token, account) > initialBalance) {
        return { confirmedByBalance: true as const };
      }
    } catch {
      // A transient RPC read should not interrupt a wallet request.
    }
  }
  throw new Error("Wallet response timed out after submission.");
}

async function waitForPublicBalanceDecrease(
  provider: RpcProvider,
  token: string,
  account: string,
  initialBalance: bigint,
  expectedDecrease: bigint,
  cancelled: () => boolean,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 4_000));
    if (cancelled()) throw new Error("Balance watch cancelled.");
    try {
      const currentBalance = await readPublicTokenBalance(provider, token, account);
      if (initialBalance >= expectedDecrease && currentBalance <= initialBalance - expectedDecrease) {
        return { confirmedByBalance: true as const };
      }
    } catch {
      // A transient RPC read should not interrupt a wallet request.
    }
  }
  throw new Error("Wallet response timed out after submission.");
}

const actionCopy: Record<ActionKind, { title: string; description: string; button: string }> = {
  deposit: { title: "Shield funds", description: "Move a public token balance into STRK20.", button: "Shield funds" },
  transfer: { title: "Private transfer", description: "Send shielded funds to a registered STRK20 recipient.", button: "Send privately" },
  withdraw: { title: "Unshield funds", description: "Withdraw shielded funds to a public Starknet address.", button: "Unshield funds" },
};

export function PrivateActionPanel({
  defaultToken = "",
  defaultKind = "deposit",
  tokenLabel,
  defaultAmount = "",
  notice,
  availableBalance,
  modal = false,
  onClose,
  onSubmitted,
}: {
  defaultToken?: string;
  defaultKind?: ActionKind;
  tokenLabel?: string;
  defaultAmount?: string;
  notice?: string;
  availableBalance?: bigint;
  modal?: boolean;
  onClose?: () => void;
  onSubmitted?: () => void;
}) {
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const showToast = useToast();
  const [kind, setKind] = useState<ActionKind>(defaultKind);
  const [token, setToken] = useState(defaultToken);
  const [amount, setAmount] = useState(defaultAmount);
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(() => knownTokenDetails(defaultToken));
  const [isReadingToken, setIsReadingToken] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<"idle" | "checking" | "registered" | "unregistered" | "unknown">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMaxLoading, setIsMaxLoading] = useState(false);
  const submissionLock = useRef(false);
  const [poolFee, setPoolFee] = useState<bigint | null>(null);
  const [isFeeLoading, setIsFeeLoading] = useState(false);
  const needsRecipient = kind === "transfer";
  const acceptsRecipient = kind !== "deposit";
  const amountInUnits = useMemo(() => tokenDetails ? parseTokenAmount(amount, tokenDetails.decimals) : null, [amount, tokenDetails]);
  const isStrkAction = sameAddress(token, STRK_TOKEN_ADDRESS);
  const isStrkDeposit = kind === "deposit" && isStrkAction;
  const feeBlocksShield = isStrkDeposit && poolFee !== null && amountInUnits !== null && amountInUnits <= poolFee;
  const knownBalanceBlocksAction = availableBalance !== undefined && amountInUnits !== null && (
    kind === "deposit"
      ? amountInUnits > availableBalance
      : isStrkAction && poolFee !== null && amountInUnits + poolFee > availableBalance
  );
  const recipientBlocksTransfer = needsRecipient && recipientStatus !== "registered";
  const canSubmit = privacyStatus === "supported" && Boolean(walletAccount) && Boolean(token) && amountInUnits !== null && amountInUnits > BigInt(0) && (!needsRecipient || Boolean(recipient)) && !recipientBlocksTransfer && !feeBlocksShield && !knownBalanceBlocksAction && !(isStrkAction && isFeeLoading);

  useEffect(() => {
    let cancelled = false;
    setPoolFee(null);
    setIsFeeLoading(true);
    void readPrivacyPoolFee(chainId).then((fee) => {
      if (!cancelled) setPoolFee(fee);
    }).catch((error) => {
      console.error("[Droptron STRK20] pool fee read failed", error);
    }).finally(() => {
      if (!cancelled) setIsFeeLoading(false);
    });
    return () => { cancelled = true; };
  }, [chainId]);

  useEffect(() => {
    const known = knownTokenDetails(token);
    if (known) {
      setTokenDetails(known);
      setIsReadingToken(false);
      return;
    }
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(token)) {
      setTokenDetails(null);
      setIsReadingToken(false);
      return;
    }
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) {
      setTokenDetails(null);
      return;
    }
    let cancelled = false;
    setIsReadingToken(true);
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    void provider.callContract({ contractAddress: token, entrypoint: "decimals" }).then((result) => {
      if (cancelled) return;
      const decimals = Number(BigInt(result[0] ?? "0"));
      setTokenDetails(Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? { symbol: "token", decimals } : null);
    }).catch(() => {
      if (!cancelled) setTokenDetails(null);
    }).finally(() => {
      if (!cancelled) setIsReadingToken(false);
    });
    return () => { cancelled = true; };
  }, [chainId, token]);

  useEffect(() => {
    if (kind !== "transfer" || !recipient) {
      setRecipientStatus("idle");
      return;
    }
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(recipient)) {
      setRecipientStatus("unknown");
      return;
    }
    let cancelled = false;
    setRecipientStatus("checking");
    const timer = window.setTimeout(() => {
      void privacySetupIssue(recipient, chainId).then((result) => {
        if (!cancelled) setRecipientStatus(result);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chainId, kind, recipient]);

  useEffect(() => {
    if (!modal) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose?.(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [modal, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || !walletAccount || !address || !canSubmit) return;
    submissionLock.current = true;
    setIsSubmitting(true);
    const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
    console.info("[Droptron STRK20] wallet request started", { requestId, kind });
    let cancelBalanceWatch = false;

    try {
      if (amountInUnits === null) return;
      const walletToken = num.toHex(BigInt(token));
      const walletAmount = num.toHex(amountInUnits);
      const walletRecipient = recipient || address;
      const action: STRK20_ACTION = kind === "deposit"
        ? { type: "deposit", token: walletToken, amount: walletAmount }
        : kind === "transfer"
          ? { type: "transfer", token: walletToken, amount: walletAmount, recipient: num.toHex(BigInt(recipient)) }
          : { type: "withdraw", token: walletToken, amount: walletAmount, recipient: num.toHex(BigInt(walletRecipient || "")) };
      const withdrawalRecipient = num.toHex(BigInt(walletRecipient || ""));
      const rpcUrl = rpcUrlForChain(chainId);
      const provider = (kind === "withdraw" || kind === "deposit") && rpcUrl ? new RpcProvider({ nodeUrl: rpcUrl }) : null;
      const watchedAccount = kind === "deposit" ? num.toHex(BigInt(address)) : withdrawalRecipient;
      let initialWatchedBalance: bigint | null = null;
      if (provider) {
        try {
          initialWatchedBalance = await readPublicTokenBalance(provider, walletToken, watchedAccount);
        } catch (error) {
          console.warn("[Droptron STRK20] public balance fallback unavailable", { kind, error });
        }
      }
      const walletRequest = submitPrivateActions(walletAccount, [action]);
      const balanceFallback = provider && initialWatchedBalance !== null
        ? kind === "deposit"
          ? waitForPublicBalanceDecrease(provider, walletToken, watchedAccount, initialWatchedBalance, amountInUnits, () => cancelBalanceWatch)
          : waitForPublicBalanceIncrease(provider, walletToken, watchedAccount, initialWatchedBalance, () => cancelBalanceWatch)
        : null;
      const result = balanceFallback
        ? await Promise.race([walletRequest, balanceFallback])
        : await walletRequest;
      cancelBalanceWatch = true;
      const label = kind === "deposit" ? "Shield" : kind === "transfer" ? "Private transfer" : "Unshield";
      const explorer = networkFromChainId(chainId) === "sepolia" ? "https://sepolia.voyager.online" : "https://voyager.online";
      const transactionHash = "transaction_hash" in result ? result.transaction_hash : null;
      console.info("[Droptron STRK20] wallet request returned", { requestId, kind, transactionHash, confirmedByBalance: !transactionHash });
      window.dispatchEvent(new CustomEvent("droptron:private-action-submitted", {
        detail: { kind, transactionHash },
      }));
      onSubmitted?.();
      const message = kind === "deposit"
        ? "Shield submitted. Your private balance will update after the note matures. Reject any wallet prompt that repeats this same Shield request."
        : kind === "transfer"
          ? "Private transfer submitted. The new note may take several blocks to appear."
          : "Unshield submitted. Your balances will refresh automatically.";
      showToast({ message, tone: "success", href: transactionHash ? `${explorer}/tx/${transactionHash}` : undefined, linkLabel: transactionHash ? "View transaction" : undefined });
      onClose?.();
    } catch (caught) {
      console.error("[Droptron STRK20] wallet action failed", { kind, error: caught });
      const setupIssue = await privacySetupIssue(address, chainId);
      const message = privateActionErrorMessage(caught, { kind, symbol: tokenLabel ?? tokenDetails?.symbol ?? "token", setupIssue });
      showToast({ message, tone: walletErrorName(caught) === "USER_REFUSED_OP" ? "info" : "error" });
    } finally {
      cancelBalanceWatch = true;
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  async function fillMax() {
    if (isMaxLoading || !address || !tokenDetails || !token) return;
    setIsMaxLoading(true);
    try {
      const walletToken = num.toHex(BigInt(token));
      let balance: bigint;
      if (availableBalance !== undefined) {
        balance = availableBalance;
      } else if (kind === "deposit") {
        const rpcUrl = rpcUrlForChain(chainId);
        if (!rpcUrl) throw new Error("No RPC is configured for this network.");
        const result = await new RpcProvider({ nodeUrl: rpcUrl }).callContract({
          contractAddress: walletToken,
          entrypoint: "balance_of",
          calldata: [address],
        });
        balance = BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128));
      } else {
        if (!walletAccount) throw new Error("Private balance access is not ready.");
        balance = privateTokenBalance(await walletAccount.strk20Balances([walletToken]), walletToken);
      }

      let available = balance;
      if (isStrkAction) {
        const fee = poolFee ?? await readPrivacyPoolFee(chainId);
        if (fee === null) throw new Error("The current pool fee could not be loaded.");
        available = balance > fee ? balance - fee : BigInt(0);
        if (available === BigInt(0)) {
          const location = kind === "deposit" ? "public" : "private";
          showToast({
            message: `Your ${location} STRK balance does not cover the ${formatTokenAmount(fee)} STRK pool fee.`,
            tone: "error",
          });
          return;
        }
      }
      setAmount(formatTokenInputAmount(available, tokenDetails.decimals));
    } catch (caught) {
      console.error("[Droptron STRK20] max balance request failed", { kind, error: caught });
      showToast({
        message: kind === "deposit" ? "Your public balance could not be loaded." : "Your wallet could not load your private balance.",
        tone: "error",
      });
    } finally {
      setIsMaxLoading(false);
    }
  }

  const panel = <section className={`private-actions${modal ? " private-actions--modal" : ""}`} aria-labelledby="private-actions-heading">
    <header><div><p className="app-eyebrow">{tokenLabel ?? "STRK20"}</p><h2 id="private-actions-heading">{modal ? actionCopy[kind].title : "Choose an action"}</h2></div>{modal && <button className="private-actions__close" type="button" aria-label="Close" onClick={onClose}>×</button>}</header>
    <div className="private-actions__body">
      {!modal && <div className="action-tabs" role="tablist" aria-label="Private action"><button type="button" role="tab" aria-selected={kind === "deposit"} onClick={() => setKind("deposit")}>Shield</button><button type="button" role="tab" aria-selected={kind === "transfer"} onClick={() => setKind("transfer")}>Transfer</button><button type="button" role="tab" aria-selected={kind === "withdraw"} onClick={() => setKind("withdraw")}>Unshield</button></div>}
      <form onSubmit={submit}>
        <p className="action-description">{actionCopy[kind].description}</p>
        {notice && <p className="private-actions__notice">{notice}</p>}
        {tokenLabel ? <div className="selected-action-asset"><span>Asset</span><strong>{tokenLabel}</strong></div> : <label><span>Token address</span><input value={token} onChange={(event) => setToken(event.target.value.trim())} placeholder="0x…" inputMode="text" required /></label>}
        <label><span>Amount</span><div className="amount-input"><input autoFocus={modal} value={amount} onChange={(event) => { const next = event.target.value; if (/^\d*(?:\.\d*)?$/.test(next)) setAmount(next); }} placeholder="0.0" inputMode="decimal" required /><button type="button" onClick={() => void fillMax()} disabled={isMaxLoading || isReadingToken || !tokenDetails}>{isMaxLoading ? "…" : "Max"}</button></div>{token && !isReadingToken && !tokenDetails && <small className="action-hint">Enter a valid token amount.</small>}{isStrkAction && poolFee !== null && <small className={feeBlocksShield || knownBalanceBlocksAction ? "action-hint action-hint--error" : "action-hint"}>{knownBalanceBlocksAction && kind !== "deposit" && amountInUnits !== null && availableBalance !== undefined ? `${formatTokenAmount(amountInUnits)} STRK + ${formatTokenAmount(poolFee)} STRK fee exceeds your ${formatTokenAmount(availableBalance)} STRK private balance.` : `Private actions require the current ${formatTokenAmount(poolFee)} STRK pool fee. Max leaves it aside.`}</small>}</label>
        {acceptsRecipient && <label><span>{kind === "withdraw" ? "Recipient address · optional" : "Recipient address"}</span><input value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder={kind === "withdraw" ? "Defaults to your connected wallet" : "0x…"} inputMode="text" required={needsRecipient} />{kind === "transfer" && recipientStatus === "checking" && <small className="action-hint">Checking private-token setup…</small>}{kind === "transfer" && recipientStatus === "registered" && <small className="action-hint action-hint--success">Ready to receive private tokens.</small>}{kind === "transfer" && recipientStatus === "unregistered" && <small className="action-hint action-hint--error">This address has not enabled private tokens. Ask the recipient to enable them in Ready first.</small>}{kind === "transfer" && recipientStatus === "unknown" && <small className="action-hint action-hint--error">This recipient could not be verified. Check the address and try again.</small>}</label>}
        {kind === "deposit" && <div className="private-actions__sequence" role="note"><strong>Two confirmations are expected</strong><ol><li><span>1</span><p><b>Approve</b> allows the pool to use this exact token amount.</p></li><li><span>2</span><p><b>Shield</b> moves it into your private balance.</p></li></ol><small>Confirm each once. After Droptron reports “Shield submitted,” reject any repeated Shield prompt.</small></div>}
        <button className="private-submit" type="submit" disabled={!canSubmit || isSubmitting}>{isSubmitting ? "Complete in wallet…" : actionCopy[kind].button} <span>→</span></button>
        {privacyStatus === "unsupported" && <small className="action-hint">This Starknet wallet does not provide STRK20 private actions. Connect Ready to use private balances and transactions.</small>}
        {privacyStatus === "supported" && !walletAccount && <small className="action-hint">No RPC is configured for the wallet’s current network.</small>}
      </form>
    </div>
  </section>;

  return modal
    ? <div className="private-action-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><div role="dialog" aria-modal="true" aria-labelledby="private-actions-heading">{panel}</div></div>
    : panel;
}

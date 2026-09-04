"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { num, RpcProvider, type STRK20_ACTION } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { PrivateActionPanel } from "@/features/privacy/private-action-panel";
import { readPrivacyPoolFee } from "@/features/privacy/privacy-pool";
import { submitPrivateActions } from "@/features/privacy/strk20-actions";
import {
  formatTokenAmount,
  formatTokenInputAmount,
  knownTokenDetails,
  parseTokenAmount,
  privateTokenBalance,
  STRK_TOKEN_ADDRESS,
} from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { useWallet } from "@/features/wallet/wallet-provider";
import type { WorkspaceDraft } from "@/features/workspace/draft-store";
import { recordLaunchParticipation } from "./launch-participation-history";

const MAX_U128 = (BigInt(1) << BigInt(128)) - BigInt(1);

function uint256(value: bigint) {
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1);
  return [num.toHex(value & mask), num.toHex(value >> BigInt(128))];
}

function readUint256(values: string[]) {
  return BigInt(values[0] ?? 0) + (BigInt(values[1] ?? 0) << BigInt(128));
}

function sameAddress(left?: string | null, right?: string | null) {
  try { return Boolean(left && right && BigInt(left) === BigInt(right)); } catch { return false; }
}

function helperAddress(chainId: string | null) {
  return networkFromChainId(chainId) === "sepolia"
    ? process.env.NEXT_PUBLIC_SEPOLIA_LAUNCH_PARTICIPATION_ADDRESS?.trim() || null
    : process.env.NEXT_PUBLIC_MAINNET_LAUNCH_PARTICIPATION_ADDRESS?.trim() || null;
}

function explorerTransaction(chainId: string | null, hash: string) {
  const origin = networkFromChainId(chainId) === "sepolia"
    ? "https://sepolia.voyager.online"
    : "https://voyager.online";
  return `${origin}/tx/${hash}`;
}

export function LaunchParticipationPanel({ draft }: { draft: WorkspaceDraft }) {
  const router = useRouter();
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const showToast = useToast();
  const values = draft.values ?? {};
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poolFee, setPoolFee] = useState<bigint | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<"unchecked" | "checking" | "short" | "enough">("unchecked");
  const [shieldPlan, setShieldPlan] = useState<{ amount: string; message: string } | null>(null);
  const [shieldModalOpen, setShieldModalOpen] = useState(false);
  const submissionLock = useRef(false);
  const saleDecimals = Number(values.saleDecimals || 18);
  const paymentDecimals = Number(values.paymentDecimals || 18);
  const saleDetails = knownTokenDetails(values.saleToken);
  const paymentDetails = knownTokenDetails(values.paymentToken);
  const saleSymbol = saleDetails?.symbol ?? "tokens";
  const paymentSymbol = paymentDetails?.symbol ?? "payment tokens";
  const amountRaw = useMemo(
    () => parseTokenAmount(amount, saleDecimals),
    [amount, saleDecimals],
  );
  const helper = helperAddress(chainId);
  const now = Date.now();
  const startsAt = new Date(values.startsAt).getTime();
  const endsAt = new Date(values.endsAt).getTime();
  const active = Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt;
  const launchNetwork = networkFromChainId(values.chainId ?? null);
  const walletNetwork = networkFromChainId(chainId);
  const matchesNetwork = !launchNetwork || launchNetwork === walletNetwork;
  const paysWithStrk = sameAddress(values.paymentToken, STRK_TOKEN_ADDRESS);
  const privateStrkRequired = paysWithStrk && quote !== null && poolFee !== null
    ? quote + poolFee
    : null;

  useEffect(() => {
    let cancelled = false;
    setPoolFee(null);
    void readPrivacyPoolFee(chainId).then((fee) => {
      if (!cancelled) setPoolFee(fee);
    }).catch((error) => {
      console.error("[Droptron launch] pool fee read failed", error);
    });
    return () => { cancelled = true; };
  }, [chainId]);

  useEffect(() => {
    setBalanceStatus("unchecked");
    setShieldPlan(null);
    setShieldModalOpen(false);
  }, [amountRaw]);

  useEffect(() => {
    if (!values.contractAddress || !amountRaw || amountRaw <= BigInt(0)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) {
      setQuote(null);
      setQuoteError("This network is not configured.");
      return;
    }

    let cancelled = false;
    setIsQuoting(true);
    setQuoteError(null);
    const timer = window.setTimeout(() => {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      void provider.callContract({
        contractAddress: values.contractAddress,
        entrypoint: "quote_exact_sale",
        calldata: uint256(amountRaw),
      }).then((result) => {
        if (cancelled) return;
        const nextQuote = readUint256(result);
        if (amountRaw > MAX_U128 || nextQuote > MAX_U128) {
          setQuote(null);
          setQuoteError("Choose a smaller participation amount.");
          return;
        }
        setQuote(nextQuote);
      }).catch((error) => {
        console.error("[Droptron launch] quote failed", error);
        if (!cancelled) {
          setQuote(null);
          setQuoteError("A live quote is unavailable for this amount.");
        }
      }).finally(() => {
        if (!cancelled) setIsQuoting(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amountRaw, chainId, values.contractAddress]);

  const blocker = !values.contractAddress || values.funded !== "true"
    ? "This launch is not funded yet."
    : !active
      ? now < startsAt ? "Participation has not opened yet." : "This launch has closed."
      : !address
        ? "Connect a wallet to participate privately."
        : !matchesNetwork
          ? "Switch your wallet to this launch’s network."
          : privacyStatus !== "supported" || !walletAccount
            ? "Use a wallet that supports STRK20 private transactions."
            : !helper
              ? "Private participation is awaiting its reviewed helper deployment."
              : null;
  const canSubmit = !blocker
    && (!paysWithStrk || poolFee !== null)
    && Boolean(amountRaw && amountRaw > BigInt(0) && quote && quote > BigInt(0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submissionLock.current
      || !canSubmit
      || !walletAccount
      || !address
      || !helper
      || !values.contractAddress
      || !amountRaw
      || !quote
    ) return;

    if (balanceStatus === "short" && shieldPlan) {
      setShieldModalOpen(true);
      return;
    }

    submissionLock.current = true;
    setIsSubmitting(true);
    setQuoteError(null);
    try {
      const paymentToken = num.toHex(BigInt(values.paymentToken));

      if (paysWithStrk && poolFee !== null && balanceStatus !== "enough") {
        setBalanceStatus("checking");
        const balances = await walletAccount.strk20Balances([paymentToken]);
        const privateBalance = privateTokenBalance(balances, paymentToken);
        const required = quote + poolFee;
        if (privateBalance < required) {
          const shortfall = required - privateBalance;
          const grossShieldAmount = shortfall + poolFee;
          const grossShieldText = formatTokenInputAmount(grossShieldAmount, paymentDecimals);
          const message = `You have ${formatTokenAmount(privateBalance, paymentDecimals)} private STRK and need ${formatTokenAmount(required, paymentDecimals)}. Shield ${grossShieldText} STRK to cover the shortfall and the shield fee.`;
          setBalanceStatus("short");
          setShieldPlan({ amount: grossShieldText, message });
          setShieldModalOpen(true);
          showToast({ message: "Your private STRK balance is short. The Shield form is ready with the required amount.", tone: "info" });
          return;
        }
        setBalanceStatus("enough");
      }

      const saleToken = num.toHex(BigInt(values.saleToken));
      const launch = num.toHex(BigInt(values.contractAddress));
      const helperContract = num.toHex(BigInt(helper));
      const paymentAmount = num.toHex(quote);
      const saleAmount = num.toHex(amountRaw);
      const actions: STRK20_ACTION[] = [
        { type: "withdraw", token: paymentToken, amount: paymentAmount, recipient: helperContract },
        { type: "transfer", token: saleToken, amount: "OPEN", recipient: num.toHex(BigInt(address)) },
        {
          type: "invoke",
          contract: helperContract,
          calldata: [
            paymentToken,
            saleToken,
            paymentAmount,
            saleAmount,
            launch,
            "${openNoteIds[0]}",
            "0x0",
          ],
        },
      ];

      const result = await submitPrivateActions(walletAccount, actions);
      recordLaunchParticipation({
        id: result.transaction_hash,
        walletAddress: address,
        chainId: chainId ?? values.chainId ?? "",
        launchAddress: values.contractAddress,
        transactionHash: result.transaction_hash,
        saleAmount: formatTokenInputAmount(amountRaw, saleDecimals),
        saleSymbol,
        paymentAmount: formatTokenInputAmount(quote, paymentDecimals),
        paymentSymbol,
        submittedAt: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent("droptron:private-action-submitted", {
        detail: { kind: "launch", transactionHash: result.transaction_hash },
      }));
      setAmount("");
      setQuote(null);
      setBalanceStatus("unchecked");
      showToast({
        message: "Private participation submitted. Your allocation will appear after the new note matures.",
        tone: "success",
        href: explorerTransaction(chainId, result.transaction_hash),
        linkLabel: "View transaction",
      });
      router.refresh();
    } catch (error) {
      console.error("[Droptron launch] private participation failed", error);
      setBalanceStatus((current) => current === "checking" ? "unchecked" : current);
      const message = productErrorMessage(
        error,
        "Your wallet could not complete private participation. No purchase was submitted.",
      );
      setQuoteError(message);
      showToast({
        message,
        tone: message.startsWith("Request cancelled") ? "info" : "error",
      });
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  return <>
  <div className="launch-participation">
    <p>Choose how many {saleSymbol} you want. Droptron checks the live price before your wallet prepares the private purchase.</p>
    <form onSubmit={submit}>
      <label>
        <span>Amount to receive</span>
        <input
          value={amount}
          onChange={(event) => {
            if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setAmount(event.target.value);
          }}
          placeholder="0.0"
          inputMode="decimal"
          disabled={Boolean(blocker) || isSubmitting}
        />
      </label>
      <div className="launch-participation__quote">
        <span>You pay</span>
        <strong>{isQuoting ? "Checking…" : quote === null ? "—" : `${formatTokenAmount(quote, paymentDecimals)} ${paymentSymbol}`}</strong>
      </div>
      {privateStrkRequired !== null && <div className="launch-participation__requirement">
        <span>Private balance needed</span>
        <strong>{formatTokenAmount(privateStrkRequired)} STRK</strong>
        <small>Includes the {formatTokenAmount(poolFee ?? BigInt(0))} STRK pool fee. Public STRK must be shielded before it can fund this purchase.</small>
      </div>}
      {blocker && <small>{blocker}</small>}
      {!blocker && quoteError && <small className="launch-participation__error" role="alert">{quoteError}</small>}
      <button type="submit" disabled={!canSubmit || isSubmitting || isQuoting}>
        {balanceStatus === "checking"
          ? "Checking private balance…"
          : isSubmitting
            ? "Complete in wallet…"
            : balanceStatus === "short"
              ? "Shield STRK to continue"
              : balanceStatus === "enough"
                ? "Participate privately"
                : "Check balance & continue"}<span>→</span>
      </button>
    </form>
  </div>
  {shieldModalOpen && shieldPlan && <PrivateActionPanel
    defaultKind="deposit"
    defaultToken={STRK_TOKEN_ADDRESS}
    tokenLabel="STRK"
    defaultAmount={shieldPlan.amount}
    notice={shieldPlan.message}
    modal
    onClose={() => setShieldModalOpen(false)}
    onSubmitted={() => {
      setBalanceStatus("unchecked");
      setShieldPlan(null);
      setShieldModalOpen(false);
      router.refresh();
    }}
  />}
  </>;
}

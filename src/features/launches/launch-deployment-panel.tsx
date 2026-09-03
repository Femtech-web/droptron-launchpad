"use client";

import { useState } from "react";
import { RpcProvider } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { parseTokenAmount } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { updateDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { publishLaunch } from "./public-launch-store";

const STORAGE_KEY = "droptron.launches.v1";
const WAD_DECIMALS = 18;

function addressEqual(left?: string | null, right?: string | null) {
  try { return Boolean(left && right && BigInt(left) === BigInt(right)); } catch { return false; }
}

function uint256(value: bigint) {
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1);
  return [value & mask, value >> BigInt(128)];
}

async function tokenDecimals(provider: RpcProvider, token: string) {
  const result = await provider.callContract({ contractAddress: token, entrypoint: "decimals" });
  const decimals = Number(BigInt(result[0] ?? "0"));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("This launch supports tokens with up to 18 decimals.");
  return decimals;
}

async function waitForAcceptance(provider: RpcProvider, transactionHash: string) {
  await provider.waitForTransaction(transactionHash, { retryInterval: 3_000 });
}

function explorerTransaction(chainId: string | null, hash: string) {
  return `${networkFromChainId(chainId) === "sepolia" ? "https://sepolia.voyager.online" : "https://voyager.online"}/tx/${hash}`;
}

function launchClassHash(chainId: string | null) {
  return networkFromChainId(chainId) === "sepolia"
    ? process.env.NEXT_PUBLIC_SEPOLIA_LAUNCH_CLASS_HASH?.trim() || null
    : process.env.NEXT_PUBLIC_MAINNET_LAUNCH_CLASS_HASH?.trim() || null;
}

export function LaunchDeploymentPanel({ draft, onUpdated }: { draft: WorkspaceDraft; onUpdated: (draft: WorkspaceDraft) => void }) {
  const { address, chainId, walletAccount } = useWallet();
  const { status: sessionStatus } = useWalletSession();
  const showToast = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const values = draft.values ?? {};
  const isOwner = !values.owner || addressEqual(values.owner, address);
  const contractAddress = values.contractAddress;
  const funded = values.funded === "true";
  const published = values.published === "true";
  const configuredClassHash = launchClassHash(chainId);
  const draftMatchesNetwork = !values.chainId || values.chainId === chainId;

  async function deploy() {
    if (!walletAccount || !address || !isOwner || !draftMatchesNetwork || !configuredClassHash) return;
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) return setMessage("Configure the RPC URL for this network first.");
    setIsWorking(true);
    setMessage("Checking token metadata and launch class…");
    try {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      await provider.getClass(configuredClassHash);
      const saleDecimals = await tokenDecimals(provider, values.saleToken);
      const paymentDecimals = await tokenDecimals(provider, values.paymentToken);
      const allocation = parseTokenAmount(values.saleAllocation, saleDecimals);
      const raiseLimit = parseTokenAmount(values.raiseLimit, paymentDecimals);
      const initialPrice = parseTokenAmount(values.initialPrice, WAD_DECIMALS);
      const slope = values.pricing === "linear" ? parseTokenAmount(values.curveSlope, WAD_DECIMALS) : BigInt(0);
      const startsAt = Math.floor(new Date(values.startsAt).getTime() / 1_000);
      const endsAt = Math.floor(new Date(values.endsAt).getTime() / 1_000);
      if (!allocation || !raiseLimit || !initialPrice || slope === null || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= Math.floor(Date.now() / 1_000)) throw new Error("The launch terms are no longer deployable. Check the amounts and end time.");
      const constructorCalldata = [
        BigInt(address), BigInt(values.saleToken), BigInt(values.paymentToken), BigInt(saleDecimals), BigInt(paymentDecimals),
        BigInt(values.pricing === "linear" ? 1 : 0), ...uint256(initialPrice), ...uint256(slope), ...uint256(allocation), ...uint256(raiseLimit), BigInt(startsAt), BigInt(endsAt),
      ];
      setMessage("Confirm launch deployment in Ready.");
      const result = await walletAccount.deploy({ classHash: configuredClassHash, constructorCalldata, unique: true });
      const nextAddress = result.contract_address[0];
      if (!nextAddress) throw new Error("Ready did not return the launch contract address.");
      setMessage("Waiting for Starknet confirmation…");
      await waitForAcceptance(provider, result.transaction_hash);
      const next = await updateDraft(STORAGE_KEY, draft.id, { values: { contractAddress: nextAddress, deploymentTx: result.transaction_hash, saleDecimals: String(saleDecimals), paymentDecimals: String(paymentDecimals) } }, sessionStatus === "synced");
      if (next) onUpdated(next.draft);
      setMessage("Launch deployed. Fund it to make participation available.");
      showToast({ message: "Launch contract deployed.", tone: "success", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
    } catch (error) {
      console.error("[Droptron launch] deployment failed", error);
      const nextMessage = productErrorMessage(error, "Launch deployment was not completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
    } finally {
      setIsWorking(false);
    }
  }

  async function fund() {
    if (!walletAccount || !contractAddress || !isOwner || funded) return;
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) return setMessage("Configure the RPC URL for this network first.");
    const allocation = parseTokenAmount(values.saleAllocation, Number(values.saleDecimals));
    if (!allocation) return setMessage("The sale allocation is invalid.");
    setIsWorking(true);
    setMessage("Confirm token approval and launch funding in Ready.");
    try {
      const [low, high] = uint256(allocation);
      const result = await walletAccount.execute([
        { contractAddress: values.saleToken, entrypoint: "approve", calldata: [contractAddress, low, high] },
        { contractAddress, entrypoint: "fund", calldata: [] },
      ]);
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      setMessage("Waiting for Starknet confirmation…");
      await waitForAcceptance(provider, result.transaction_hash);
      const next = await updateDraft(STORAGE_KEY, draft.id, { values: { funded: "true", fundingTx: result.transaction_hash } }, sessionStatus === "synced");
      if (next) onUpdated(next.draft);
      setMessage("Launch funded. Publishing it to Explore…");
      showToast({ message: "Launch funding confirmed.", tone: "success", href: explorerTransaction(chainId, result.transaction_hash), linkLabel: "View transaction" });
      if (next) {
        try {
          const publicLaunch = await publishLaunch(next.draft);
          const publishedDraft = await updateDraft(STORAGE_KEY, draft.id, { values: { published: "true", publicSlug: publicLaunch.id } }, sessionStatus === "synced");
          if (publishedDraft) onUpdated(publishedDraft.draft);
          setMessage("Launch funded and published to Explore.");
          showToast({ message: "Launch is live in Explore.", tone: "success" });
        } catch (publishError) {
          console.error("[Droptron launch] publication after funding failed", publishError);
          setMessage("Funding succeeded, but publishing did not. Use Publish launch to retry.");
          showToast({ message: productErrorMessage(publishError, "Launch funded, but publishing did not complete."), tone: "error" });
        }
      }
    } catch (error) {
      console.error("[Droptron launch] funding failed", error);
      const nextMessage = productErrorMessage(error, "Launch funding was not completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
    } finally {
      setIsWorking(false);
    }
  }

  async function publish() {
    if (!funded || published || !isOwner || !contractAddress) return;
    setIsWorking(true);
    setMessage("Verifying the funded contract on Starknet…");
    try {
      const publicLaunch = await publishLaunch(draft);
      const next = await updateDraft(STORAGE_KEY, draft.id, { values: { published: "true", publicSlug: publicLaunch.id } }, sessionStatus === "synced");
      if (next) onUpdated(next.draft);
      setMessage("Launch published to Explore.");
      showToast({ message: "Launch is live in Explore.", tone: "success" });
    } catch (error) {
      console.error("[Droptron launch] publication failed", error);
      const nextMessage = productErrorMessage(error, "Launch publishing was not completed.");
      setMessage(nextMessage);
      showToast({ message: nextMessage, tone: "error" });
    } finally {
      setIsWorking(false);
    }
  }

  const blocked = !isOwner ? "Connect the creator wallet to manage this launch." : !draftMatchesNetwork ? "Switch to the network used when this draft was created." : !configuredClassHash ? "The launch class is not configured for this network." : null;
  return <aside className="launch-detail__readiness"><p className="app-eyebrow">Creator controls</p><h2>{published ? "Launch live" : funded ? "Publish launch" : contractAddress ? "Fund allocation" : "Deploy contract"}</h2><p>{published ? "This funded launch is visible in Explore." : funded ? "Publish the verified funded contract so participants can discover it." : contractAddress ? "Approve and transfer the full sale allocation into the launch contract." : "Deploy these public sale terms from the connected creator wallet."}</p><ol><li data-complete="true"><i />Terms reviewed</li><li data-complete={Boolean(contractAddress)}><i />Contract deployed</li><li data-complete={funded}><i />Sale allocation funded</li><li data-complete={published}><i />Published to Explore</li></ol>{contractAddress && <code title={contractAddress}>{contractAddress}</code>}{blocked ? <small className="launch-control-message">{blocked}</small> : !published && <button type="button" disabled={isWorking} onClick={() => void (funded ? publish() : contractAddress ? fund() : deploy())}>{isWorking ? "Working…" : funded ? "Publish launch" : contractAddress ? "Fund launch" : "Deploy launch"}<span>→</span></button>}{message && <small className="launch-control-message" role="status">{message}</small>}</aside>;
}

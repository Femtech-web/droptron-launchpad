"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { useToast } from "@/features/feedback/toast-provider";
import { FieldHelp, FormDateTimeField, FormSelectField } from "@/features/forms/form-controls";
import { loadDrafts, saveDraft, type WorkspaceDraft } from "@/features/workspace/draft-store";
import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";
import { loadPublicLaunches } from "@/features/launches/public-launch-store";

import { DISTRIBUTION_TYPES, type DistributionKind } from "./distribution-types";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;
const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

type Recipient = { address: string; amount: string };

function positiveAmount(value: string) {
  if (!AMOUNT_PATTERN.test(value)) return false;
  return BigInt(value.replace(".", "")) > BigInt(0);
}

function sumAmounts(recipients: Recipient[]) {
  const decimals = recipients.reduce((max, recipient) => Math.max(max, recipient.amount.split(".")[1]?.length ?? 0), 0);
  const scale = BigInt(10) ** BigInt(decimals);
  const total = recipients.reduce((sum, recipient) => {
    const [whole, fraction = ""] = recipient.amount.split(".");
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0") || "0");
  }, BigInt(0));
  const whole = total / scale;
  const fraction = decimals ? (total % scale).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function parseRecipients(value: string): { recipients: Recipient[]; error: string | null } {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]?.replace(/\s/g, "").toLowerCase() === "address,amount") lines.shift();
  if (lines.length === 0) return { recipients: [], error: "Add at least one recipient." };
  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const [rawAddress, rawAmount, ...extra] = lines[index].split(",").map((item) => item.trim());
    if (!rawAddress || !rawAmount || extra.length > 0) return { recipients: [], error: `Row ${index + 1} must use address, amount.` };
    if (!ADDRESS_PATTERN.test(rawAddress)) return { recipients: [], error: `Row ${index + 1} has an invalid Starknet address.` };
    if (!positiveAmount(rawAmount)) return { recipients: [], error: `Row ${index + 1} has an invalid amount.` };
    const normalized = BigInt(rawAddress).toString(16);
    if (seen.has(normalized)) return { recipients: [], error: `Row ${index + 1} repeats a recipient.` };
    seen.add(normalized);
    recipients.push({ address: rawAddress, amount: rawAmount });
  }
  return { recipients, error: null };
}

function validKind(value: string | null): DistributionKind {
  return value === "airdrop" || value === "vesting" ? value : "disperse";
}

export function DistributionBuilder() {
  const { address, chainId } = useWallet();
  const { status: sessionStatus, syncWorkspace } = useWalletSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const [kind, setKind] = useState<DistributionKind>(() => validKind(searchParams.get("type")));
  const [source, setSource] = useState<"launch" | "custom">("launch");
  const [selectedLaunch, setSelectedLaunch] = useState("");
  const [recipientMode, setRecipientMode] = useState<"manual" | "csv">("manual");
  const [recipientInput, setRecipientInput] = useState("");
  const [csvName, setCsvName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [launches, setLaunches] = useState<WorkspaceDraft[]>([]);
  const recipients = useMemo(() => parseRecipients(recipientInput), [recipientInput]);
  const total = useMemo(() => recipients.error ? null : sumAmounts(recipients.recipients), [recipients]);
  const launch = launches.find((item) => item.id === selectedLaunch);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadDrafts("droptron.launches.v1", sessionStatus === "synced"),
      loadPublicLaunches().catch(() => []),
    ]).then(([drafts, published]) => {
      if (!active) return;
      const ownedPublished = published.filter((item) => {
        try { return Boolean(address && item.values?.owner) && BigInt(item.values!.owner) === BigInt(address!); } catch { return false; }
      });
      const seen = new Set<string>();
      setLaunches([...drafts, ...ownedPublished].filter((item) => {
        const key = item.values?.contractAddress ? BigInt(item.values.contractAddress).toString() : item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    });
    return () => { active = false; };
  }, [address, sessionStatus]);

  if (!address) return <WalletGate />;

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setFormError("Choose a CSV smaller than 2 MB.");
      event.target.value = "";
      return;
    }
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const parsed = parseRecipients(text);
    if (parsed.error) {
      setFormError(parsed.error);
      event.target.value = "";
      return;
    }
    setRecipientInput(text);
    setCsvName(file.name);
    setFormError(null);
  }

  function downloadTemplate() {
    const file = new Blob(["address,amount\n0x_REPLACE_WITH_STARKNET_ADDRESS,100\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "droptron-recipients-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const token = source === "launch" ? launch?.values?.saleToken ?? "" : String(data.get("token") ?? "").trim();
    if (source === "launch" && !launch) return setFormError("Select a launch first.");
    if (!ADDRESS_PATTERN.test(token)) return setFormError("Select or enter a valid Starknet token.");
    if (recipients.error) return setFormError(recipients.error);

    const startsAt = String(data.get("startsAt") ?? "");
    const endsAt = String(data.get("endsAt") ?? "");
    if (kind === "airdrop" && (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt) || new Date(endsAt).getTime() <= Date.now())) return setFormError("Choose a valid future claim window.");
    const firstUnlock = String(data.get("firstUnlock") ?? "");
    if (kind === "vesting" && !firstUnlock) return setFormError("Choose the first unlock date.");
    const trancheCount = Number(data.get("tranches") ?? 0);
    if (kind === "vesting" && (!Number.isInteger(trancheCount) || trancheCount < 1 || trancheCount > 24)) return setFormError("Choose between 1 and 24 tranches.");
    const initialUnlock = Number(data.get("initialUnlock") ?? 0);
    if (kind === "vesting" && trancheCount > 1 && initialUnlock >= 100) return setFormError("With multiple tranches, the first unlock must be less than 100%.");

    const name = String(data.get("name") ?? "").trim();
    const values = Object.fromEntries(Array.from(data.entries(), ([key, value]) => [key, String(value).trim()]));
    delete values.recipientsInput;
    setIsSaving(true);
    const draft = {
      id: crypto.randomUUID(),
      title: name,
      detail: `${DISTRIBUTION_TYPES.find((item) => item.kind === kind)?.label} · ${recipients.recipients.length} recipient${recipients.recipients.length === 1 ? "" : "s"}`,
      values: { ...values, kind, source, sourceLaunchId: selectedLaunch, token, recipients: JSON.stringify(recipients.recipients), total: total ?? "", owner: address ?? "", chainId: chainId ?? "" },
      createdAt: new Date().toISOString(),
    };
    const syncEnabled = sessionStatus === "synced" || await syncWorkspace();
    const result = await saveDraft("droptron.distributions.v1", draft, syncEnabled);
    showToast({
      message: result.synced
        ? `${DISTRIBUTION_TYPES.find((item) => item.kind === kind)?.label} draft synced.`
        : "Saved on this device. Sign later to sync.",
      tone: result.synced ? "success" : "info",
    });
    router.push(`/app/distributions/${draft.id}`);
  }

  return <main className="builder-workspace distribution-builder" id="main-content" tabIndex={-1}>
    <header className="builder-workspace__heading"><Link href="/app/distributions">← Distributions</Link><p className="app-eyebrow">New distribution</p><h1>Choose how tokens arrive.</h1><p>Start with the delivery model. Droptron only shows the details that flow needs.</p></header>
    <nav className="distribution-kind-picker" aria-label="Distribution type">
      {DISTRIBUTION_TYPES.map((item, index) => <button key={item.kind} type="button" aria-pressed={kind === item.kind} onClick={() => { setKind(item.kind); setFormError(null); }}><span>0{index + 1}</span><strong>{item.label}</strong><small>{item.outcome}</small></button>)}
    </nav>
    <form className="builder-form" onSubmit={submit}>
      <section className="distribution-form-section"><header><div><h2>Distribution</h2><p>Name the operation and choose where its token comes from.</p></div></header><div className="builder-form__fields">
        <label><span>Distribution name<i>*</i></span><input name="name" placeholder={kind === "disperse" ? "Contributor payments" : kind === "airdrop" ? "Community airdrop" : "Core team vesting"} required /></label>
        <FormSelectField name="source" label="Token source" value={source} onValueChange={(next) => setSource(next as "launch" | "custom")} options={[{ value: "launch", label: "Existing Droptron launch" }, { value: "custom", label: "Another Starknet token" }]} required />
        {source === "launch" ? <><FormSelectField className="builder-field--wide" name="sourceLaunch" label="Launch" value={selectedLaunch} onValueChange={setSelectedLaunch} options={launches.map((item) => ({ value: item.id, label: item.title }))} placeholder="Select a launch" required />{launch && <small className="builder-field--wide distribution-token-note">Sale token: {launch.values?.saleToken}</small>}</> : <label className="builder-field--wide"><span>Token address<i>*</i><FieldHelp label="Token address" help="The Starknet contract address of the token being distributed." /></span><input name="token" placeholder="0x…" required /></label>}
      </div></section>
      <section className="distribution-form-section"><header><div><h2>Recipients</h2><p>Add recipients manually or import a CSV.</p></div></header><div className="builder-form__fields recipient-builder">
        <div className="recipient-mode-switch builder-field--wide" role="group" aria-label="Recipient input method"><button type="button" aria-pressed={recipientMode === "manual"} onClick={() => { setRecipientMode("manual"); setCsvName(null); }}>Enter manually</button><button type="button" aria-pressed={recipientMode === "csv"} onClick={() => setRecipientMode("csv")}>Upload CSV</button></div>
        {recipientMode === "manual" ? <label className="builder-field--wide"><span>Addresses and amounts<i>*</i></span><textarea name="recipientsInput" value={recipientInput} onChange={(event) => { setRecipientInput(event.target.value); setFormError(null); }} placeholder={"0x0123…, 250\n0x0456…, 100"} rows={7} required /></label> : <div className="recipient-csv builder-field--wide"><label><input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event)} /><span><strong>{csvName ?? "Choose recipient CSV"}</strong><small>Columns: address, amount · Maximum 2 MB</small></span></label><button type="button" onClick={downloadTemplate}>Download template</button>{csvName && <textarea name="recipientsInput" value={recipientInput} readOnly rows={4} aria-label="Imported recipient data" />}</div>}
        <div className={`recipient-summary builder-field--wide${recipients.error ? "" : " recipient-summary--valid"}`} role="status"><strong>{recipients.error ? "Recipients not ready" : `${recipients.recipients.length} valid recipient${recipients.recipients.length === 1 ? "" : "s"}`}</strong><span>{recipients.error ? "Use one address and amount per row." : `${total} tokens total`}</span></div>
        <div className="recipient-batch-note builder-field--wide"><span aria-hidden="true">↗</span><div><strong>Batch confirmation</strong><p>{kind === "disperse" ? "At execution, transfers will use one wallet confirmation. Droptron will split only if network limits require it." : "At execution, recipient allocations will be committed together—not confirmed one address at a time."}</p></div></div>
      </div></section>
      {kind === "airdrop" && <section className="distribution-form-section"><header><div><h2>Claim window</h2><p>Recipients can claim only while this window is open.</p></div></header><div className="builder-form__fields"><FormDateTimeField name="startsAt" label="Claims open" required /><FormDateTimeField name="endsAt" label="Claims close" required /><label className="builder-field--wide"><span>Unclaimed tokens return to<FieldHelp label="Unclaimed tokens return to" help="This address receives any tokens left after the claim window closes." /></span><input name="refundAddress" placeholder={address ?? "0x…"} defaultValue={address ?? ""} /></label></div></section>}
      {kind === "vesting" && <section className="distribution-form-section"><header><div><h2>Unlock schedule</h2><p>Tokens become claimable in separate scheduled portions.</p></div></header><div className="builder-form__fields"><FormDateTimeField name="firstUnlock" label="First unlock" help="When the first portion becomes available to claim." required /><FormSelectField name="cadence" label="Cadence" help="How often another portion becomes available." defaultValue="monthly" options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} required /><label><span>Number of tranches<i>*</i><FieldHelp label="Number of tranches" help="How many separate portions the allocation is divided into. Droptron supports up to 24." /></span><input name="tranches" type="number" min="1" max="24" defaultValue="12" required /></label><label><span>Initial unlock %<FieldHelp label="Initial unlock percentage" help="The percentage available at the first unlock. With multiple tranches, keep this below 100%." /></span><input name="initialUnlock" type="number" min="0" max="99" defaultValue="0" /></label></div></section>}
      <footer><div><p>Save this draft to your wallet workspace. No funds move yet.</p>{formError && <p className="builder-form__error" role="alert">{formError}</p>}</div><button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Review draft"} <span>→</span></button></footer>
    </form>
  </main>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { FormDateTimeField, FormSelectField } from "@/features/forms/form-controls";
import { useToast } from "@/features/feedback/toast-provider";
import { CreatedTokenLibrary } from "@/features/launches/token-creation-panel";
import { WalletGate } from "@/features/wallet/wallet-gate";
import { knownTokenDetails, MAINNET_DROP_ADDRESS_KEY, SEPOLIA_DROP_ADDRESS_KEY } from "@/features/wallet/wallet-assets";
import { networkFromChainId } from "@/features/wallet/wallet-networks";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useWalletSession } from "@/features/wallet/wallet-session-provider";

import { saveDraft } from "./draft-store";

type BuilderField = {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  placeholder?: string;
  type?: "text" | "datetime-local";
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
};

type ConfigurationBuilderProps = {
  storageKey: string;
  section: string;
  title: string;
  description: string;
  returnHref: string;
  fields: BuilderField[];
  summaryFields: string[];
  validation?: "launch";
  children?: ReactNode;
};

type LaunchPreview = {
  pricing: string;
  initialPrice: string;
  saleAllocation: string;
  raiseLimit: string;
  saleToken: string;
  paymentToken: string;
};

const EMPTY_LAUNCH_PREVIEW: LaunchPreview = {
  pricing: "",
  initialPrice: "",
  saleAllocation: "",
  raiseLimit: "",
  saleToken: "",
  paymentToken: "",
};

function readableAmount(value: string) {
  const number = Number(value);
  if (!value || !Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 8 }).format(number);
}

function tokenSymbol(address: string, fallback: string) {
  return knownTokenDetails(address)?.symbol ?? fallback;
}

function LaunchReviewCard({ values }: { values: LaunchPreview }) {
  const saleSymbol = tokenSymbol(values.saleToken, "sale tokens");
  const paymentSymbol = tokenSymbol(values.paymentToken, "payment tokens");
  const price = readableAmount(values.initialPrice);
  const allocation = readableAmount(values.saleAllocation);
  const raiseLimit = readableAmount(values.raiseLimit);
  const hasPrice = price !== "—";
  const hasAllocation = allocation !== "—";
  const hasLimit = raiseLimit !== "—";

  return <aside className="launch-review" aria-live="polite">
    <div className="launch-review__headline"><strong>{allocation}</strong><span>{hasAllocation ? saleSymbol : "Tokens offered"}</span></div>
    <dl>
      <div><dt>Price</dt><dd>{hasPrice ? <>1 {saleSymbol} {values.pricing === "linear" ? "starts at" : "costs"} <strong>{price} {paymentSymbol}</strong>{values.pricing === "linear" ? " and increases as tokens sell." : "."}</> : "Enter a price to preview this term."}</dd></div>
      <div><dt>Supply</dt><dd>{hasAllocation ? <><strong>{allocation} {saleSymbol}</strong> are offered.</> : "Enter the number of tokens offered."}</dd></div>
      <div><dt>Maximum raise</dt><dd>{hasLimit ? <>The launch can collect at most <strong>{raiseLimit} {paymentSymbol}</strong>.</> : "Enter the most this launch can collect."}</dd></div>
    </dl>
  </aside>;
}

function validateLaunch(data: FormData) {
  const read = (name: string) => String(data.get(name) ?? "").trim();
  const addressPattern = /^0x[0-9a-fA-F]{1,64}$/;
  const amountPattern = /^\d+(?:\.\d+)?$/;
  const saleToken = read("saleToken");
  const paymentToken = read("paymentToken");
  if (read("pricing") !== "fixed" && read("pricing") !== "linear") return "Choose a pricing model.";
  if (!addressPattern.test(saleToken)) return "Enter a valid Starknet sale-token address.";
  if (!addressPattern.test(paymentToken)) return "Enter a valid Starknet payment-token address.";
  if (BigInt(saleToken) === BigInt(paymentToken)) return "Sale token and payment token must be different.";
  for (const [name, label] of [["initialPrice", "Initial price"], ["saleAllocation", "Sale allocation"], ["raiseLimit", "Raise limit"]] as const) {
    const value = read(name);
    if (!amountPattern.test(value) || Number(value) <= 0) return `${label} must be greater than zero.`;
  }
  if (read("pricing") === "linear") {
    const slope = read("curveSlope");
    if (!amountPattern.test(slope) || Number(slope) <= 0) return "Curve slope must be greater than zero for a linear bonding curve.";
  }
  const startsAt = new Date(read("startsAt")).getTime();
  const endsAt = new Date(read("endsAt")).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "Choose a valid start and end time.";
  if (endsAt <= startsAt) return "End time must be later than start time.";
  if (endsAt <= Date.now()) return "The launch cannot end in the past.";
  return null;
}

export function ConfigurationBuilder(props: ConfigurationBuilderProps) {
  const { address, chainId } = useWallet();
  const { status: sessionStatus, syncWorkspace } = useWalletSession();
  const showToast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pricing, setPricing] = useState("");
  const [tokenMode, setTokenMode] = useState<"existing" | "create">("existing");
  const [launchPreview, setLaunchPreview] = useState<LaunchPreview>(EMPTY_LAUNCH_PREVIEW);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (props.validation !== "launch") return;
    const saleToken = formRef.current?.elements.namedItem("saleToken") as HTMLInputElement | null;
    const network = networkFromChainId(chainId);
    const configuredAddress = network === "mainnet"
      ? process.env.NEXT_PUBLIC_MAINNET_DROP_TOKEN_ADDRESS?.trim()
      : process.env.NEXT_PUBLIC_SEPOLIA_DROP_TOKEN_ADDRESS?.trim();
    const savedAddress = configuredAddress || window.localStorage.getItem(
      network === "mainnet" ? MAINNET_DROP_ADDRESS_KEY : SEPOLIA_DROP_ADDRESS_KEY,
    );
    if (saleToken && savedAddress && !saleToken.value) {
      saleToken.value = savedAddress;
      setLaunchPreview((current) => ({ ...current, saleToken: savedAddress }));
    }
    const applyDeployment = (event: Event) => {
      const nextAddress = (event as CustomEvent<string>).detail;
      if (saleToken) {
        saleToken.value = nextAddress;
        setLaunchPreview((current) => ({ ...current, saleToken: nextAddress }));
      }
    };
    window.addEventListener("droptron:token-created", applyDeployment);
    return () => window.removeEventListener("droptron:token-created", applyDeployment);
  }, [chainId, props.validation]);

  if (!address) return <WalletGate />;

  function selectTokenMode(mode: "existing" | "create") {
    setTokenMode(mode);
    setFormError(null);
    const saleToken = formRef.current?.elements.namedItem("saleToken") as HTMLInputElement | null;
    if (saleToken && mode === "create") {
      saleToken.value = "";
      setLaunchPreview((current) => ({ ...current, saleToken: "" }));
    }
  }

  function updateLaunchPreview() {
    if (props.validation !== "launch" || !formRef.current) return;
    const data = new FormData(formRef.current);
    setLaunchPreview({
      pricing: String(data.get("pricing") ?? ""),
      initialPrice: String(data.get("initialPrice") ?? "").trim(),
      saleAllocation: String(data.get("saleAllocation") ?? "").trim(),
      raiseLimit: String(data.get("raiseLimit") ?? "").trim(),
      saleToken: String(data.get("saleToken") ?? "").trim(),
      paymentToken: String(data.get("paymentToken") ?? "").trim(),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const validationError = props.validation === "launch" ? validateLaunch(data) : null;
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    const title = String(data.get("name") ?? "Untitled draft").trim();
    const detail = props.summaryFields.map((field) => String(data.get(field) ?? "").trim()).filter(Boolean).join(" · ");
    const values = {
      ...Object.fromEntries(Array.from(data.entries(), ([key, value]) => [key, String(value).trim()])),
      ...(props.validation === "launch" ? { owner: address ?? "", chainId: chainId ?? "" } : {}),
    };
    setIsSaving(true);
    const draft = { id: crypto.randomUUID(), title, detail, values, createdAt: new Date().toISOString() };
    const syncEnabled = sessionStatus === "synced" || await syncWorkspace();
    const result = await saveDraft(props.storageKey, draft, syncEnabled);
    showToast({
      message: result.synced ? "Draft synced." : "Saved on this device. Sign later to sync.",
      tone: result.synced ? "success" : "info",
    });
    router.push(props.returnHref);
  }

  return <main className={`builder-workspace${props.validation === "launch" ? " builder-workspace--launch" : ""}`} id="main-content" tabIndex={-1}>
    <header className="builder-workspace__heading"><Link href={props.returnHref}>← {props.section}</Link><h1>{props.title}</h1><p>{props.description}</p></header>
    {props.validation === "launch" && <section className="launch-token-source" aria-labelledby="launch-token-source-title">
      <header><p className="app-eyebrow">Sale token</p><h2 id="launch-token-source-title">Choose your token</h2><p>Bring an existing Starknet token or create a fixed-supply token first.</p></header>
      <nav aria-label="Sale token source"><button type="button" aria-pressed={tokenMode === "existing"} onClick={() => selectTokenMode("existing")}><strong>Use existing token</strong><small>Enter its contract address</small></button><button type="button" aria-pressed={tokenMode === "create"} onClick={() => selectTokenMode("create")}><strong>Create a token</strong><small>Deploy and select it here</small></button></nav>
      <CreatedTokenLibrary selectedAddress={launchPreview.saleToken} />
      {tokenMode === "create" && props.children}
    </section>}
    {props.validation !== "launch" && props.children}
    <div className={props.validation === "launch" ? "builder-launch-layout" : undefined}><form ref={formRef} className="builder-form" onInput={updateLaunchPreview} onSubmit={submit}>
      <div className="builder-form__fields">{props.fields.map((field) => {
        const required = field.name === "curveSlope" && props.validation === "launch" ? pricing === "linear" : field.required !== false;
        const isCreatedToken = props.validation === "launch" && field.name === "saleToken" && tokenMode === "create";
        if (field.options) return <FormSelectField key={field.name} name={field.name} label={field.label} help={field.help} options={field.options} defaultValue={field.defaultValue} placeholder="Select" required={required} onValueChange={field.name === "pricing" ? (next) => { setPricing(next); setLaunchPreview((current) => ({ ...current, pricing: next })); } : undefined} />;
        if (field.type === "datetime-local") return <FormDateTimeField key={field.name} name={field.name} label={field.label} help={field.help} defaultValue={field.defaultValue} required={required} />;
        return <label key={field.name}><span>{isCreatedToken ? "Created token address" : field.label}{required && <i aria-hidden="true">*</i>}{field.help && <span className="builder-field-help" tabIndex={0} aria-label={`${field.label}: ${field.help}`} data-tooltip={field.help}>?</span>}</span><input name={field.name} type="text" placeholder={isCreatedToken ? "Create a token above" : field.placeholder} defaultValue={field.defaultValue} readOnly={isCreatedToken} required={required} /></label>;
      })}</div>
      <footer><div><p>Save this draft to your wallet workspace. No transaction is submitted.</p>{formError && <p className="builder-form__error" role="alert">{formError}</p>}</div><button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save draft"} <span>→</span></button></footer>
    </form>{props.validation === "launch" && <LaunchReviewCard values={launchPreview} />}</div>
  </main>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { WalletGate } from "@/features/wallet/wallet-gate";
import { useWallet } from "@/features/wallet/wallet-provider";

import { saveDraft } from "./draft-store";

type BuilderField = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: "text" | "datetime-local";
  options?: Array<{ label: string; value: string }>;
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
};

function validateLaunch(data: FormData) {
  const read = (name: string) => String(data.get(name) ?? "").trim();
  const addressPattern = /^0x[0-9a-fA-F]{1,64}$/;
  const amountPattern = /^\d+(?:\.\d+)?$/;
  const saleToken = read("saleToken");
  const paymentToken = read("paymentToken");
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
  const { address } = useWallet();
  const router = useRouter();
  const [pricing, setPricing] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (!address) return <WalletGate />;

  function submit(event: FormEvent<HTMLFormElement>) {
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
    const values = Object.fromEntries(Array.from(data.entries(), ([key, value]) => [key, String(value).trim()]));
    saveDraft(props.storageKey, { id: crypto.randomUUID(), title, detail, values, createdAt: new Date().toISOString() });
    router.push(props.returnHref);
  }

  return <main className="builder-workspace" id="main-content" tabIndex={-1}>
    <header className="builder-workspace__heading"><Link href={props.returnHref}>← {props.section}</Link><h1>{props.title}</h1><p>{props.description}</p></header>
    <form className="builder-form" onSubmit={submit}>
      <div className="builder-form__fields">{props.fields.map((field) => {
        const required = field.name === "curveSlope" && props.validation === "launch" ? pricing === "linear" : field.required !== false;
        return <label key={field.name}><span>{field.label}{required && <i aria-hidden="true">*</i>}</span>{field.options ? <select name={field.name} defaultValue="" required={required} onChange={field.name === "pricing" ? (event) => setPricing(event.target.value) : undefined}><option value="" disabled>Select</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input name={field.name} type={field.type ?? "text"} placeholder={field.placeholder} required={required} />}</label>;
      })}</div>
      <footer><div><p>This saves a local draft. No transaction is submitted.</p>{formError && <p className="builder-form__error" role="alert">{formError}</p>}</div><button type="submit">Save draft <span>→</span></button></footer>
    </form>
  </main>;
}

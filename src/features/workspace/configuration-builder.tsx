"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

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
};

export function ConfigurationBuilder(props: ConfigurationBuilderProps) {
  const { address } = useWallet();
  const router = useRouter();

  if (!address) return <WalletGate />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("name") ?? "Untitled draft").trim();
    const detail = props.summaryFields.map((field) => String(data.get(field) ?? "").trim()).filter(Boolean).join(" · ");
    saveDraft(props.storageKey, { id: crypto.randomUUID(), title, detail, createdAt: new Date().toISOString() });
    router.push(props.returnHref);
  }

  return <main className="builder-workspace" id="main-content" tabIndex={-1}>
    <header className="builder-workspace__heading"><Link href={props.returnHref}>← {props.section}</Link><h1>{props.title}</h1><p>{props.description}</p></header>
    <form className="builder-form" onSubmit={submit}>
      <div className="builder-form__fields">{props.fields.map((field) => {
        const required = field.required !== false;
        return <label key={field.name}><span>{field.label}{required && <i aria-hidden="true">*</i>}</span>{field.options ? <select name={field.name} defaultValue="" required={required}><option value="" disabled>Select</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input name={field.name} type={field.type ?? "text"} placeholder={field.placeholder} required={required} />}</label>;
      })}</div>
      <footer><p>This saves a local draft. No transaction is submitted.</p><button type="submit">Save draft <span>→</span></button></footer>
    </form>
  </main>;
}

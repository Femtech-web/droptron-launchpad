import { DraftWorkspace } from "@/features/workspace/draft-workspace";
import Link from "next/link";
import { DISTRIBUTION_TYPES } from "@/features/distributions/distribution-types";

export default function DistributionsPage() {
  return <DraftWorkspace storageKey="droptron.distributions.v1" section="Distributions" title="Token distributions" description="Disperse directly, open an airdrop, or schedule vesting." emptyTitle="No distributions yet" emptyDescription="Choose a delivery model above to create your first distribution." mark="distribution" actionHref="/app/distributions/new" actionLabel="New distribution">
    <section className="distribution-type-grid" aria-label="Distribution types">{DISTRIBUTION_TYPES.map((item, index) => <Link key={item.kind} href={`/app/distributions/new?type=${item.kind}`}><span>0{index + 1} · {item.eyebrow}</span><h2>{item.label}</h2><p>{item.description}</p><strong>{item.outcome} <i>→</i></strong></Link>)}</section>
  </DraftWorkspace>;
}

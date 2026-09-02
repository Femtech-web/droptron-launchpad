import { DraftWorkspace } from "@/features/workspace/draft-workspace";

export default function DistributionsPage() {
  return <DraftWorkspace storageKey="droptron.distributions.v1" section="Distributions" title="Distributions" description="Prepare team allocations and private airdrops." emptyTitle="No distributions yet" emptyDescription="Team allocations and airdrops will appear here once they are created." mark="distribution" actionHref="/app/distributions/new" actionLabel="New distribution" />;
}

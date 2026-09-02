import { EmptyWorkspace } from "@/features/workspace/empty-workspace";

export default function ClaimsPage() {
  return <EmptyWorkspace section="Claims" title="Claims" description="Redeem available airdrop and vesting allocations." emptyTitle="No claims available" emptyDescription="Available allocations will appear here when they are ready to claim." mark="claim" />;
}

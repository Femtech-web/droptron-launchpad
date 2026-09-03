import { EmptyWorkspace } from "@/features/workspace/empty-workspace";

export default function ClaimsPage() {
  return <EmptyWorkspace section="Claims" title="Your claims" description="Claim available airdrops and unlocked vesting tranches into your private balance." emptyTitle="Nothing to claim yet" emptyDescription="Airdrops and unlocked vesting tranches for this wallet will appear here. Direct distributions arrive automatically." mark="claim" />;
}

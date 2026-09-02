import { DraftWorkspace } from "@/features/workspace/draft-workspace";

export default function VestingPage() {
  return <DraftWorkspace storageKey="droptron.vesting.v1" section="Vesting" title="Vesting schedules" description="Create scheduled token releases for contributors and teams." emptyTitle="No schedules yet" emptyDescription="Vesting schedules will appear here with their next unlock date." mark="vesting" actionHref="/app/vesting/new" actionLabel="New schedule" />;
}

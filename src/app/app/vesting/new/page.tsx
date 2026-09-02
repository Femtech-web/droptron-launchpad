import { ConfigurationBuilder } from "@/features/workspace/configuration-builder";

export default function NewVestingPage() {
  return <ConfigurationBuilder storageKey="droptron.vesting.v1" section="Vesting" title="New vesting schedule" description="Define a discrete tranche schedule for a team or contributor allocation." returnHref="/app/vesting" summaryFields={["cadence", "firstUnlock"]} fields={[
    { name: "name", label: "Schedule name", placeholder: "Core contributors" },
    { name: "token", label: "Token address", placeholder: "0x…" },
    { name: "cadence", label: "Cadence", options: [{ label: "Weekly tranches", value: "weekly" }, { label: "Monthly tranches", value: "monthly" }] },
    { name: "firstUnlock", label: "First unlock", type: "datetime-local" },
  ]} />;
}

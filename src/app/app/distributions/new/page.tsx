import { ConfigurationBuilder } from "@/features/workspace/configuration-builder";

export default function NewDistributionPage() {
  return <ConfigurationBuilder storageKey="droptron.distributions.v1" section="Distributions" title="New distribution" description="Prepare a team allocation or private airdrop draft." returnHref="/app/distributions" summaryFields={["type", "token"]} fields={[
    { name: "name", label: "Distribution name", placeholder: "Team allocation" },
    { name: "type", label: "Type", options: [{ label: "Team allocation", value: "team" }, { label: "Private airdrop", value: "airdrop" }] },
    { name: "token", label: "Token address", placeholder: "0x…" },
  ]} />;
}

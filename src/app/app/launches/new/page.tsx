import { ConfigurationBuilder } from "@/features/workspace/configuration-builder";

export default function NewLaunchPage() {
  return <ConfigurationBuilder storageKey="droptron.launches.v1" section="Launches" title="New launch" description="Set the public terms for a token launch. Private participation is connected after the launch contract is reviewed." returnHref="/app" summaryFields={["pricing", "startsAt", "endsAt"]} fields={[
    { name: "name", label: "Launch name", placeholder: "Project or token name" },
    { name: "saleToken", label: "Sale token address", placeholder: "0x…" },
    { name: "paymentToken", label: "Payment token address", placeholder: "0x…" },
    { name: "pricing", label: "Pricing", options: [{ label: "Fixed price", value: "fixed" }, { label: "Linear bonding curve", value: "linear" }] },
    { name: "initialPrice", label: "Initial price", placeholder: "Amount in payment-token units" },
    { name: "curveSlope", label: "Curve slope", placeholder: "Required for a linear curve", required: false },
    { name: "saleAllocation", label: "Sale allocation", placeholder: "Amount in smallest units" },
    { name: "raiseLimit", label: "Raise limit", placeholder: "Amount in payment-token units" },
    { name: "startsAt", label: "Starts", type: "datetime-local" },
    { name: "endsAt", label: "Ends", type: "datetime-local" },
  ]} />;
}

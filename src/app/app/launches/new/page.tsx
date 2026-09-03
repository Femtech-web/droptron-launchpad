import { ConfigurationBuilder } from "@/features/workspace/configuration-builder";
import { TokenCreationPanel } from "@/features/launches/token-creation-panel";
export default function NewLaunchPage() {
  return <ConfigurationBuilder storageKey="droptron.launches.v1" section="Launches" title="New launch" description="Set the public terms for a token launch. Private participation is connected after the launch contract is reviewed." returnHref="/app" summaryFields={["pricing", "startsAt", "endsAt"]} validation="launch" fields={[
    { name: "name", label: "Launch name", placeholder: "Project or token name" },
    { name: "saleToken", label: "Sale token address", placeholder: "0x…", help: "The token participants will receive." },
    { name: "paymentToken", label: "Payment token address", placeholder: "0x…", help: "The token participants will pay with, such as USDC." },
    { name: "pricing", label: "Pricing", help: "Fixed keeps one price. Linear increases the price as tokens sell.", options: [{ label: "Fixed price", value: "fixed" }, { label: "Linear bonding curve", value: "linear" }] },
    { name: "initialPrice", label: "Initial price", placeholder: "Payment tokens per sale token", help: "How much payment token buys one sale token at the start." },
    { name: "curveSlope", label: "Curve slope", placeholder: "Required for a linear curve", required: false, help: "How quickly a linear sale price increases." },
    { name: "saleAllocation", label: "Sale allocation", placeholder: "Total sale tokens available", help: "The total number of tokens offered in this launch." },
    { name: "raiseLimit", label: "Raise limit", placeholder: "Maximum payment tokens accepted", help: "The most payment token this launch can collect." },
    { name: "startsAt", label: "Starts", type: "datetime-local", help: "When participation opens." },
    { name: "endsAt", label: "Ends", type: "datetime-local", help: "When participation closes." },
  ]}><TokenCreationPanel /></ConfigurationBuilder>;
}

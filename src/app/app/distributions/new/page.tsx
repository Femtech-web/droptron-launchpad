import { Suspense } from "react";
import { DistributionBuilder } from "@/features/distributions/distribution-builder";

export default function NewDistributionPage() {
  return <Suspense fallback={null}><DistributionBuilder /></Suspense>;
}

import { DraftWorkspace } from "@/features/workspace/draft-workspace";

export function LaunchesWorkspace() {
  return <DraftWorkspace
    storageKey="droptron.launches.v1"
    section="Launches"
    title="Token launches"
    description="Configure launch terms, pricing, and participation."
    emptyTitle="No launches yet"
    emptyDescription="Your launches will appear here with their contract and deployment status."
    mark="launch"
    actionHref="/app/launches/new"
    actionLabel="New launch"
    itemHrefBase="/app/launches"
  />;
}

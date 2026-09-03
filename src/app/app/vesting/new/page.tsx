import { redirect } from "next/navigation";

export default function NewVestingPage() {
  redirect("/app/distributions/new?type=vesting");
}

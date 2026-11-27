import { redirect } from "next/navigation";

export const instant = false;

export default function TransientRequestsPage() {
  redirect("/transients/stays");
}

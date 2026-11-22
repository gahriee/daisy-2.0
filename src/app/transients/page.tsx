import { redirect } from "next/navigation";

export const instant = false;

export default function TransientsIndexPage() {
  redirect("/transients/stays");
}

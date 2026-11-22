import { renderTransientSectionPage } from "../_lib/transient-section-page";

export const instant = false;

export default function TransientRequestsPage() {
  return renderTransientSectionPage("requests");
}

import { PlaceholderView } from "../PlaceholderView";

/* The focus id matches the stalled-agent pulse blip in the fixtures
   (link.focus "agent-corporate-list"), so its View action lands here. */

export default function AgentsPage() {
  return <PlaceholderView view="agents" focusId="agent-corporate-list" />;
}

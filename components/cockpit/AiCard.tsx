"use client";

import { Cpu, Lock, PenLine, User } from "lucide-react";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";

/* AI on the call. An informational proposal panel, not a feature: no controls,
   nothing wired. It states the plan so the team can react to it, matching the
   mockup's own "Proposed" labeling. Clinical judgement stays with doctors. */

const ROWS = [
  {
    icon: User,
    title: "Consent first",
    subtitle: "Every recorded call opens with a consent line. Script written with Razan before anything ships.",
  },
  {
    icon: Cpu,
    title: "Listens in Arabic and English",
    subtitle: "Transcribes the call and drafts the call note while Fatima talks.",
  },
  {
    icon: PenLine,
    title: "Fills the file, never silently",
    subtitle:
      "Proposes condition, budget band, destination, travel window. Fatima confirms each fill before it lands.",
  },
  {
    icon: Lock,
    title: "Stays inside our walls",
    subtitle:
      "Audio and transcripts in AWS Bahrain with a retention window set with Razan. Clinical judgement stays with doctors, always.",
  },
] as const;

export function CockpitAiCard() {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="AI on the call"
        subtitle="So a 14-minute call never turns into 10 minutes of typing."
        right={<Chip variant="info">Proposed</Chip>}
      />
      <div className="px-[18px] pb-3 pt-2">
        {ROWS.map((row) => (
          <ListRow key={row.title} icon={row.icon} title={row.title} subtitle={row.subtitle} />
        ))}
      </div>
      <CardFooter note="Open build question: phone bridge versus in-app calls decides how recording works." />
    </Card>
  );
}

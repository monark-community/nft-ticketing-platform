"use client";

import { Check, Lock, XCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PUBLISH_STAGES, type PublishStage, type StageStatus } from "@/lib/publish-event";
import { cn } from "@/lib/utils";

const STATUS: Record<StageStatus, { text: string; color: string }> = {
  ready: { text: "Ready", color: "text-primary" },
  waiting: { text: "Waiting", color: "text-muted-foreground" },
  active: { text: "In progress", color: "text-primary" },
  done: { text: "Done", color: "text-success" },
  failed: { text: "Failed", color: "text-destructive" },
};

interface PublishStepsProps {
  statuses: Record<PublishStage, StageStatus>;
  // "Add ticket types on-chain" shows "2 of 3" while it runs
  detail?: Partial<Record<PublishStage, string>>;
}

// "What happens next" (Figma): the four publish steps. The next one to run is highlighted
// and marked READY; finished steps are green.
// Motion (#372): a perforated rail runs down the steps and fills as each one finishes, and each
// tick is punched in. Freezing (step 1) snaps a padlock shut. A failed step turns red and nudges
// once, where it is; continuing picks up from it.
export function PublishSteps({ statuses, detail }: PublishStepsProps) {
  // Steps that were already finished (or failed) when the card appeared don't punch or nudge
  const [atStart] = useState(statuses);
  const justChanged = (key: PublishStage) => atStart[key] !== statuses[key];

  const list = useRef<HTMLOListElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const doneCount = PUBLISH_STAGES.findIndex(({ key }) => statuses[key] !== "done");
  const finished = doneCount === -1 ? PUBLISH_STAGES.length : doneCount;

  // The rail runs from the first icon to the last; its fill reaches the last finished step
  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol || !rail.current || !fill.current) return;
    const place = () => {
      const icons = Array.from(ol.querySelectorAll<HTMLElement>("[data-stage-icon]"));
      if (icons.length < 2) return;
      const top = ol.getBoundingClientRect().top;
      const centre = (el: HTMLElement) => el.getBoundingClientRect().top + el.offsetHeight / 2 - top;
      const start = centre(icons[0]);
      rail.current!.style.top = `${start}px`;
      rail.current!.style.height = `${centre(icons[icons.length - 1]) - start}px`;
      fill.current!.style.height = finished <= 1 ? "0px" : `${centre(icons[Math.min(finished, icons.length) - 1]) - start}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(ol);
    return () => observer.disconnect();
  }, [finished]);

  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-2">
        <CardTitle>What happens next</CardTitle>
        <p className="type-body-sm text-muted-foreground">
          Your wallet confirms each on-chain step. You can leave this page between steps; progress is saved.
        </p>
      </div>
      <ol ref={list} className="relative flex flex-col gap-1" aria-label="Publish steps">
        {/* The perforated rail behind the icons, and how far it has filled */}
        <span
          ref={rail}
          className="absolute left-[19.5px] w-px bg-[repeating-linear-gradient(180deg,var(--muted-foreground)_0_4px,transparent_4px_8px)]"
          aria-hidden="true"
        >
          <span ref={fill} className="absolute inset-x-0 top-0 h-0 bg-success transition-[height] duration-[220ms] ease-[var(--ease-arrive)]" data-publish-rail />
        </span>
        {PUBLISH_STAGES.map(({ key, label }, index) => {
          const status = statuses[key];
          const { text, color } = STATUS[status];
          const highlighted = status === "ready" || status === "active";
          return (
            <li
              key={key}
              className={cn(
                "relative flex items-center justify-between gap-3 rounded-sm px-3 py-3",
                highlighted && "bg-primary-tint",
                status === "failed" && "bg-destructive-bg",
                status === "failed" && justChanged(key) && "shake-once",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <StageIcon status={status} padlock={key === PUBLISH_STAGES[0].key} punch={justChanged(key)} />
                <span className={cn("type-body-sm", status === "waiting" ? "text-muted-foreground" : "text-foreground")}>
                  {index + 1}. {label}
                  {detail?.[key] && <span className="text-muted-foreground"> ({detail[key]})</span>}
                </span>
              </span>
              <span className={cn("shrink-0 font-mono text-[11px] leading-4 font-bold tracking-[0.15em] uppercase", color)}>{text}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// Icons sit on a card-coloured disc, so the rail runs behind them
function StageIcon({ status, padlock, punch }: { status: StageStatus; padlock: boolean; punch: boolean }) {
  const disc = "relative flex size-4 shrink-0 items-center justify-center rounded-full bg-card";
  if (status === "done") {
    return (
      <span className={cn(disc, punch && "punch")} data-stage-icon>
        {padlock ? (
          // Freezing locked the event: the padlock's shackle snaps shut
          <Lock className={cn("size-4 text-success", punch && "[&>path]:animate-[shackle-shut_200ms_var(--ease-snap)_60ms_backwards]")} aria-hidden="true" data-padlock />
        ) : (
          <Check className="size-4 text-success" aria-hidden="true" />
        )}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={disc} data-stage-icon>
        <XCircle className="size-4 text-destructive" aria-hidden="true" />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className={disc} data-stage-icon>
        <Spinner className="text-primary" />
      </span>
    );
  }
  return (
    <span
      className={cn("size-4 shrink-0 rounded-full border bg-card", status === "ready" ? "border-primary" : "border-muted-foreground")}
      data-stage-icon
      aria-hidden="true"
    />
  );
}

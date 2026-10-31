import { Check } from "lucide-react";

import { FORM_STEPS, STEP_LABELS, type FormStep } from "@/lib/create-event";
import { cn } from "@/lib/utils";

interface CreateEventStepperProps {
  current: FormStep;
  // Steps the organizer may jump back to (the ones before the current step, once the draft exists)
  onSelect?: (step: FormStep) => void;
}

// Create Event Stepper from Figma (Current=1..4): the current step is an orange dot, finished steps
// have an orange check and an orange line after them, later steps are grey.
// On phones the labels move to one line under the dots ("Step 2 of 4: Ticket types"), so it fits.
export function CreateEventStepper({ current, onSelect }: CreateEventStepperProps) {
  const currentIndex = FORM_STEPS.indexOf(current);

  return (
    <nav aria-label="Create event steps" className="flex flex-col gap-3">
      <ol className="flex items-center gap-3 md:gap-4">
        {FORM_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const isCurrent = index === currentIndex;
          const last = index === FORM_STEPS.length - 1;

          const content = (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary text-primary",
                  !isCurrent && !done && "border-border bg-muted text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "type-body-md whitespace-nowrap",
                  isCurrent ? "font-medium text-foreground" : done ? "text-secondary-foreground" : "text-muted-foreground",
                  "sr-only md:not-sr-only",
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </>
          );

          return (
            <li key={step} className={cn("flex items-center gap-3 md:gap-4", !last && "flex-1")} aria-current={isCurrent ? "step" : undefined}>
              {done && onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="flex items-center gap-3 rounded-sm outline-none hover:[&>span:last-child]:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`${STEP_LABELS[step]} (done). Go back to this step`}
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-3">
                  {content}
                  <span className="sr-only">{isCurrent ? " (current step)" : done ? " (done)" : ""}</span>
                </span>
              )}
              {!last && <span className={cn("h-px min-w-4 flex-1", done ? "bg-primary/70" : "bg-border")} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <p className="type-body-md text-foreground md:hidden" aria-hidden="true">
        Step {currentIndex + 1} of {FORM_STEPS.length}: {STEP_LABELS[current]}
      </p>
    </nav>
  );
}

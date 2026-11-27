"use client";

import { CalendarDays, Check, Ticket, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { AccountType } from "@/lib/sign-up";
import { cn } from "@/lib/utils";

const OPTIONS: { value: AccountType; title: string; description: string; icon: LucideIcon }[] = [
  { value: "attendee", title: "Attendee", description: "Buy tickets and show them at the door", icon: Ticket },
  { value: "organizer", title: "Organizer", description: "Create events and sell tickets", icon: CalendarDays },
];

interface AccountTypePickerProps {
  value: AccountType;
  onChange: (value: AccountType) => void;
  disabled?: boolean;
}

// "I want to" choice on the create account step (Figma: Sign in / Create account).
// Real radio buttons under the cards, so arrow keys and screen readers work as usual.
// Motion (#371): one orange frame slides from the old choice to the new one (180 ms), and the
// tick of a choice you make is punched in with a small ring.
export function AccountTypePicker({ value, onChange, disabled = false }: AccountTypePickerProps) {
  const list = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLSpanElement>(null);
  const [picked, setPicked] = useState<AccountType | null>(null); // only a choice made here punches
  const placed = useRef(false);

  // The frame sits over the chosen option, also when the options change size
  useLayoutEffect(() => {
    const box = list.current;
    const outline = frame.current;
    if (!box || !outline) return;
    const place = () => {
      const chosen = box.querySelector<HTMLElement>("label:has(input:checked)");
      if (!chosen) return;
      // The first time it's simply there, without sliding in from the top
      if (!placed.current) outline.style.transition = "none";
      outline.style.translate = `0 ${chosen.offsetTop}px`;
      outline.style.height = `${chosen.offsetHeight}px`;
      if (!placed.current) {
        void outline.offsetHeight;
        outline.style.transition = "";
        placed.current = true;
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [value]);

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 type-label-sm text-muted-foreground">I want to</legend>
      <div ref={list} className="relative flex flex-col gap-2.5">
        <span ref={frame} className="choice-frame" data-choice-frame aria-hidden="true" />
        {OPTIONS.map(({ value: option, title, description, icon: Icon }) => (
          <label
            key={option}
            className="group flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-[15px] transition-[border-color,background-color] duration-200 hover:border-border-accent has-checked:bg-primary-tint has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              type="radio"
              name="account-type"
              value={option}
              checked={value === option}
              onChange={() => {
                setPicked(option);
                onChange(option);
              }}
              className="sr-only"
            />
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-popover text-muted-foreground group-has-checked:bg-primary/20 group-has-checked:text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="type-body-md-strong text-secondary-foreground group-has-checked:text-foreground">{title}</span>
                <span className="type-body-sm text-muted-foreground">{description}</span>
              </span>
            </span>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full bg-popover text-primary-foreground group-has-checked:bg-primary group-has-checked:shadow-[0_0_4px_var(--border-accent)]",
                picked === option && value === option && "punch-ring",
              )}
              aria-hidden="true"
            >
              <Check className="size-3 opacity-0 group-has-checked:opacity-100" strokeWidth={3} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

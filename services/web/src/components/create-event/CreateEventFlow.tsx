"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CreateEventStepper } from "@/components/create-event/CreateEventStepper";
import { DraftEditor } from "@/components/create-event/DraftEditor";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { parseStep, type FormStep } from "@/lib/create-event";
import { fetchDraft, type DraftEvent } from "@/lib/create-event-api";
import { getDraftPointer, isEventId, setDraftPointer, setStoredSaleRules } from "@/lib/create-event-storage";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

const draftKey = (id: string | null) => ["event-draft", id] as const;
const notFound = (error: unknown) => error instanceof ApiError && error.status === 404;

// The create event page's state: which draft (?draft=<id>) and which step (?step=…) are in the
// URL, so a refresh or a shared link lands in the same place. Loads the draft and hands it to the
// form (DraftEditor), or shows why it can't (not found, another wallet's, already published).
export function CreateEventFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const wallet = address?.toLowerCase() ?? "";

  const draftParam = searchParams.get("draft");
  const eventId = isEventId(draftParam) ? draftParam : null;
  // Later steps need a saved draft
  const step: FormStep = eventId ? parseStep(searchParams.get("step")) : "details";

  const draft = useQuery({
    queryKey: draftKey(eventId),
    queryFn: () => fetchDraft(eventId as string),
    enabled: Boolean(eventId),
    retry: (count, error) => !notFound(error) && count < 2,
    refetchOnWindowFocus: false,
  });
  const event = eventId ? (draft.data ?? null) : null;

  // The cover image isn't saved in the API until freeze, so it's kept here for the draft it
  // was picked for (it carries over when the first save creates the draft)
  // The draft "Save draft" just created, so the remounted form can say "Draft saved"
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [image, setImage] = useState<{ eventId: string | null; file: File; url: string } | null>(null);
  const currentImage = image && image.eventId === eventId ? image : null;

  // The preview URL is made when the file is picked and released when it's replaced
  function changeImage(file: File | null) {
    if (image) URL.revokeObjectURL(image.url);
    setImage(file ? { eventId, file, url: URL.createObjectURL(file) } : null);
  }

  // The wallet's unfinished draft, offered when starting a new event
  const pointer = !eventId && wallet ? getDraftPointer(wallet) : null;
  const pointerDraft = useQuery({
    queryKey: draftKey(pointer),
    queryFn: () => fetchDraft(pointer as string),
    enabled: Boolean(pointer),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const resumable =
    pointerDraft.data && pointerDraft.data.status !== "PUBLISHED" && pointerDraft.data.organizer_wallet.toLowerCase() === wallet ? pointerDraft.data : null;
  // Forget a pointer to a draft that's gone or done
  useEffect(() => {
    if (!pointer || !wallet) return;
    if (notFound(pointerDraft.error) || pointerDraft.data?.status === "PUBLISHED") setDraftPointer(wallet, null);
  }, [pointer, wallet, pointerDraft.error, pointerDraft.data]);

  // Remember the draft being edited, and forget it once it's published
  const ownDraft = Boolean(event && event.organizer_wallet.toLowerCase() === wallet);
  useEffect(() => {
    if (!event || !ownDraft) return;
    if (event.status === "PUBLISHED") {
      if (getDraftPointer(wallet) === event.id) setDraftPointer(wallet, null);
      setStoredSaleRules(event.id, null);
    } else {
      setDraftPointer(wallet, event.id);
    }
  }, [event, ownDraft, wallet]);

  function urlFor(id: string | null, next: FormStep) {
    if (!id) return ROUTES.newEvent;
    return `${ROUTES.newEvent}?draft=${encodeURIComponent(id)}${next === "details" ? "" : `&step=${next}`}`;
  }

  function goTo(next: FormStep) {
    router.push(urlFor(eventId, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onCreated(created: DraftEvent, next: FormStep) {
    queryClient.setQueryData(draftKey(created.id), created);
    setDraftPointer(wallet, created.id);
    setCreatedId(next === "details" ? created.id : null);
    if (image && image.eventId === null) setImage({ ...image, eventId: created.id });
    router.replace(urlFor(created.id, next));
    if (next !== "details") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const stepper = (
    <CreateEventStepper current={step} onSelect={eventId && event?.status !== "PUBLISHED" ? goTo : undefined} />
  );

  // A ?draft= that isn't one of our ids, or doesn't exist (anymore)
  if ((draftParam && !eventId) || notFound(draft.error)) {
    return (
      <MessageCard title="Draft not found" text="This draft doesn't exist, or the link is wrong.">
        <Link href={ROUTES.newEvent} className={buttonVariants({ size: "md" })}>
          Start a new event
        </Link>
      </MessageCard>
    );
  }

  if (eventId && draft.error) {
    return (
      <Alert tone="error" title="Couldn't load your draft. Check your connection and try again." action={<Button size="sm" onClick={() => draft.refetch()}>Try again</Button>} />
    );
  }

  if (eventId && !event) return <FlowSkeleton stepper={stepper} />;

  if (event && !ownDraft) {
    return (
      <MessageCard title="This draft belongs to another wallet" text="Connect the wallet that created it to keep editing, or start a new event with this one.">
        <Link href={ROUTES.newEvent} className={buttonVariants({ size: "md" })}>
          Start a new event
        </Link>
      </MessageCard>
    );
  }

  if (event?.status === "PUBLISHED") return <PublishedCard event={event} />;

  return (
    <div className="flex flex-col gap-8">
      {stepper}

      {resumable && (
        <Alert
          tone="info"
          title={`You have an unfinished draft: ${resumable.title}`}
          action={
            <Link href={urlFor(resumable.id, "details")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Continue the draft
            </Link>
          }
        >
          Or fill in the form below to start a new event.
        </Alert>
      )}

      <DraftEditor
        key={event?.id ?? "new"}
        event={event}
        step={step}
        image={currentImage?.file ?? null}
        imagePreview={currentImage?.url ?? null}
        onImageChange={changeImage}
        onCreated={onCreated}
        onEventChange={(updated) => queryClient.setQueryData(draftKey(updated.id), updated)}
        goTo={goTo}
        justCreated={Boolean(event && createdId === event.id)}
      />
    </div>
  );
}

// After the last step (and when opening a draft that's already published)
function PublishedCard({ event }: { event: DraftEvent }) {
  return (
    <Card className="mx-auto w-full max-w-[560px] items-center py-10 text-center" role="status">
      <span className="flex size-14 items-center justify-center rounded-full border border-success/60 bg-success-bg text-success">
        <Check className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="type-heading-md text-foreground">Your event is live</h2>
        <p className="type-body-md text-secondary-foreground">
          <span className="font-semibold text-foreground">{event.title}</span> is published and its tickets are on the blockchain.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/events/${encodeURIComponent(event.id)}`} className={cn(buttonVariants({ size: "md" }))}>
          View the event page <ArrowRight aria-hidden="true" />
        </Link>
        <Link href={ROUTES.newEvent} className={cn(buttonVariants({ variant: "secondary", size: "md" }))}>
          Create another event
        </Link>
      </div>
    </Card>
  );
}

function MessageCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto w-full max-w-[520px] items-center py-10 text-center">
      <h2 className="type-heading-md text-foreground">{title}</h2>
      <p className="type-body-md text-secondary-foreground">{text}</p>
      {children}
    </Card>
  );
}

export function FlowSkeleton({ stepper }: { stepper?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      {stepper ?? <div className="h-7 animate-pulse rounded-sm bg-card" />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="h-[640px] animate-pulse rounded-lg bg-card" />
        <div className="h-32 animate-pulse rounded-lg bg-card" />
      </div>
    </div>
  );
}

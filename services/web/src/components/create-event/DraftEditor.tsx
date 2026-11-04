"use client";

import { ArrowRight, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSwitchChain } from "wagmi";

import { DetailsStep } from "@/components/create-event/DetailsStep";
import { PublishSteps } from "@/components/create-event/PublishSteps";
import { ReviewStep } from "@/components/create-event/ReviewStep";
import { SaleRulesStep } from "@/components/create-event/SaleRulesStep";
import { TicketTypesStep } from "@/components/create-event/TicketTypesStep";
import { TxHash } from "@/components/event/TxHash";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePublishEvent } from "@/hooks/usePublishEvent";
import { TICKET_NFT_CHAIN_ID } from "@/lib/contracts/ticket-nft";
import {
  defaultSaleRules,
  detailsFromEvent,
  EMPTY_DETAILS,
  FORM_STEPS,
  localInputFromMs,
  newTicketType,
  planTicketTypeSync,
  STEP_LABELS,
  ticketTypeFromApi,
  validateCoverImage,
  validateDetails,
  validateSaleRules,
  validateTicketTypes,
  type DetailsForm,
  type FormStep,
  type SaleRulesForm,
  type TicketTypeForm,
} from "@/lib/create-event";
import { describeSaveError, fetchDraft, saveDetails, syncTicketTypes, type DraftEvent } from "@/lib/create-event-api";
import { getStoredSaleRules, setStoredSaleRules } from "@/lib/create-event-storage";
import { ROUTES } from "@/lib/nav";
import { saleRulesFromChain, stageForTxLabel, stageStatuses, type PublishPlan, type PublishStage } from "@/lib/publish-event";

interface DraftEditorProps {
  event: DraftEvent | null; // null until the details are saved the first time
  step: FormStep;
  image: File | null;
  imagePreview: string | null;
  onImageChange: (file: File | null) => void;
  onCreated: (event: DraftEvent, step: FormStep) => void; // first save: the page moves to ?draft=<id>
  onEventChange: (event: DraftEvent) => void;
  goTo: (step: FormStep) => void;
  justCreated?: boolean; // remounted right after "Save draft" created the draft: say it was saved
}

const NO_ERRORS_SHOWN: Record<FormStep, boolean> = { details: false, "ticket-types": false, "sale-rules": false, review: false };

// Current time for the "in the future" checks, refreshed every 30 seconds
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// A row the organizer hasn't touched (the empty one a new event starts with)
const isBlank = (t: TicketTypeForm) => !t.id && !t.name.trim() && !t.price.trim() && !t.supply.trim() && !t.description.trim();

// The four steps of "Create event" (Figma: Create event / 1 Details … 4 Review and publish).
// The form lives here; the page remounts it (key) when the draft changes, so it starts from the
// saved draft. Details and ticket types are saved in the API, sale rules in the browser
// (create-event-storage), and the cover image stays in memory until freeze uploads it.
export function DraftEditor({ event, step, image, imagePreview, onImageChange, onCreated, onEventChange, goTo, justCreated = false }: DraftEditorProps) {
  const router = useRouter();
  const now = useNow();
  const formRef = useRef<HTMLDivElement>(null);
  const { switchChain, isPending: switching } = useSwitchChain();

  const [details, setDetails] = useState<DetailsForm>(() => (event ? detailsFromEvent(event) : EMPTY_DETAILS));
  const [types, setTypes] = useState<TicketTypeForm[]>(() =>
    event && event.ticket_types.length > 0 ? event.ticket_types.map(ticketTypeFromApi) : [newTicketType()],
  );
  const [rulesEdit, setRulesEdit] = useState<SaleRulesForm | null>(() => (event ? getStoredSaleRules(event.id) : null));
  const [errorsShown, setErrorsShown] = useState(NO_ERRORS_SHOWN);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(justCreated);

  const frozen = Boolean(event && event.status !== "DRAFT");

  // Sale rules: what the organizer set here, else what the contract has (another browser set
  // them), else the Figma defaults. Once tickets sold, only the contract's rules count.
  const publish = usePublishEvent({ event, image, onEventChange });
  const chainEvent = publish.chain?.event ?? null;
  const chainRules = chainEvent?.configured ? saleRulesFromChain(chainEvent) : null;
  const rulesLocked = Boolean(chainRules) && (chainEvent?.sold ?? 0) > 0;
  const rules = (rulesLocked ? chainRules : null) ?? rulesEdit ?? chainRules ?? defaultSaleRules(details);
  const plan = publish.planFor(rules);
  const decimals = publish.usdcDecimals;

  // Checks (shown once the organizer tries to move on or save)
  const detailErrors = frozen ? {} : validateDetails(details, now);
  const imageError = frozen || !image ? null : validateCoverImage(image);
  const typeCheck = frozen ? { rows: {}, list: null, ok: true } : validateTicketTypes(types, decimals);
  const ruleErrors = rulesLocked ? {} : validateSaleRules(rules, details, now);

  // Unsaved changes
  const detailsDirty = !frozen && JSON.stringify(details) !== JSON.stringify(event ? detailsFromEvent(event) : EMPTY_DETAILS);
  const touchedTypes = types.filter((t) => !isBlank(t));
  const typeSync = event ? planTicketTypeSync(touchedTypes, event.ticket_types) : null;
  const typesDirty = !frozen && (typeSync ? typeSync.create.length + typeSync.update.length + typeSync.remove.length > 0 : touchedTypes.length > 0);

  // Ask before leaving with unsaved changes or while a publish step runs
  const guard = detailsDirty || typesDirty || publish.running;
  useEffect(() => {
    if (!guard) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guard]);

  function showErrors(forStep: FormStep) {
    setErrorsShown((s) => ({ ...s, [forStep]: true }));
    // Move to the first field to fix once the errors render
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first?.matches("input, select, textarea")) first.focus({ preventScroll: true });
    });
  }

  function changed() {
    setSavedNote(false);
    setSaveError(null);
  }

  function updateRules(next: SaleRulesForm) {
    changed();
    setRulesEdit(next);
    if (event) setStoredSaleRules(event.id, next);
  }

  // Step 1: create the draft, or save its details. Returns false if it couldn't.
  async function saveDetailsStep(nextStep: FormStep): Promise<boolean> {
    if (frozen || (event && !detailsDirty)) return true;
    if (Object.keys(detailErrors).length > 0 || imageError) {
      showErrors("details");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveDetails(event?.id ?? null, details);
      const fresh = await fetchDraft(id);
      if (!event) {
        onCreated(fresh, nextStep); // remounts this form on the new draft
        return false; // the page moves to the next step itself
      }
      onEventChange(fresh);
      setDetails(detailsFromEvent(fresh));
      return true;
    } catch (err) {
      setSaveError(describeSaveError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Step 2: make the API's ticket types match the form
  async function saveTypesStep(): Promise<boolean> {
    if (!event || frozen) return true;
    if (!typeCheck.ok) {
      showErrors("ticket-types");
      return false;
    }
    if (!typesDirty) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await syncTicketTypes(event.id, types, event.ticket_types);
      const fresh = await fetchDraft(event.id).catch(() => null);
      if (fresh) onEventChange(fresh);
      if (result.error) {
        setTypes(result.types); // keeps the ids of rows that were created, so a retry doesn't duplicate them
        setSaveError(describeSaveError(result.error));
        return false;
      }
      if (fresh) setTypes(fresh.ticket_types.map(ticketTypeFromApi));
      return true;
    } finally {
      setSaving(false);
    }
  }

  function rulesOk(): boolean {
    if (Object.keys(ruleErrors).length === 0) return true;
    showErrors("sale-rules");
    return false;
  }

  async function next() {
    changed();
    if (step === "details") {
      if (await saveDetailsStep("ticket-types")) goTo("ticket-types");
    } else if (step === "ticket-types") {
      if (await saveTypesStep()) goTo("sale-rules");
    } else if (step === "sale-rules") {
      if (rulesOk()) {
        if (event && !rulesLocked) setStoredSaleRules(event.id, rules);
        goTo("review");
      }
    } else {
      await publishNow();
    }
  }

  async function saveDraft() {
    changed();
    let ok = true;
    if (step === "details") ok = await saveDetailsStep("details");
    else if (step === "ticket-types") ok = await saveTypesStep();
    else if (event && !rulesLocked) setStoredSaleRules(event.id, rules);
    if (ok) setSavedNote(true);
  }

  // Review: save anything still unsaved (e.g. after the browser's back and forward buttons),
  // then freeze and publish
  const issues: Array<{ step: FormStep; message: string }> = [];
  if (!frozen) {
    if (Object.keys(detailErrors).length > 0) issues.push({ step: "details", message: "Some event details are missing or invalid." });
    if (!image) issues.push({ step: "details", message: "Add a cover image. Images aren't kept in drafts, so add it again if you left the page." });
    else if (imageError) issues.push({ step: "details", message: imageError });
    if (!typeCheck.ok) issues.push({ step: "ticket-types", message: typeCheck.list ?? "Some ticket types are missing or invalid." });
  }
  if (Object.keys(ruleErrors).length > 0) issues.push({ step: "sale-rules", message: Object.values(ruleErrors)[0] as string });

  async function publishNow() {
    if (issues.length > 0) {
      showErrors("review");
      return;
    }
    if ((detailsDirty && !(await saveDetailsStep("review"))) || (typesDirty && !(await saveTypesStep()))) return;
    if (event && !rulesLocked) setStoredSaleRules(event.id, rules);
    await publish.run(rules);
  }

  function cancel() {
    if ((detailsDirty || typesDirty) && !window.confirm("Leave without saving your changes?")) return;
    router.push(ROUTES.events);
  }

  const stepIndex = FORM_STEPS.indexOf(step);
  const busy = saving || publish.running;

  return (
    <div ref={formRef} className="flex flex-col gap-6">
      {saveError && <Alert tone="error" title={saveError} />}

      {step === "details" && (
        <DetailsStep
          value={details}
          errors={errorsShown.details ? detailErrors : {}}
          image={image}
          imagePreview={imagePreview}
          imageError={imageError}
          uploadedImageUrl={event?.image_url ?? null}
          frozen={frozen}
          minStart={localInputFromMs(now)}
          onChange={(v) => {
            changed();
            setDetails(v);
          }}
          onImageChange={(file) => {
            changed();
            onImageChange(file);
          }}
        />
      )}

      {step === "ticket-types" && (
        <TicketTypesStep
          types={types}
          rowErrors={errorsShown["ticket-types"] ? typeCheck.rows : {}}
          listError={errorsShown["ticket-types"] ? typeCheck.list : null}
          frozen={frozen}
          usdcDecimals={decimals}
          onChange={(v) => {
            changed();
            setTypes(v);
          }}
        />
      )}

      {step === "sale-rules" && (
        <SaleRulesStep
          value={rules}
          errors={errorsShown["sale-rules"] ? ruleErrors : {}}
          types={types}
          usdcDecimals={decimals}
          minSalesEnd={localInputFromMs(now)}
          locked={rulesLocked}
          onChange={updateRules}
        />
      )}

      {step === "review" && (
        <ReviewStep
          details={details}
          types={types}
          rules={rules}
          image={image}
          uploadedImageUrl={event?.image_url ?? null}
          usdcDecimals={decimals}
          frozen={frozen}
          rulesLocked={rulesLocked}
          disabled={busy}
          onEdit={goTo}
          aside={
            <PublishAside
              publish={publish}
              plan={plan}
              event={event}
              issues={issues}
              frozen={frozen}
              onFix={goTo}
            />
          }
        />
      )}

      {/* Footer: Cancel or Back on the left, Save draft and the next step on the right (Figma) */}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        {stepIndex === 0 ? (
          <Button variant="ghost" size="lg" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" size="lg" onClick={() => goTo(FORM_STEPS[stepIndex - 1])} disabled={busy}>
            Back
          </Button>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
          {savedNote && (
            <p role="status" className="text-center type-body-sm text-success sm:text-right">
              Draft saved
            </p>
          )}
          {canSaveDraft(step, frozen, rulesLocked) && (
            <Button variant="secondary" size="lg" onClick={saveDraft} disabled={busy} loading={saving && step !== "review"}>
              Save draft
            </Button>
          )}
          <PrimaryButton
            step={step}
            frozen={frozen}
            saving={saving}
            publish={publish}
            blocked={step === "review" && (issues.length > 0 || !plan || Boolean(plan.blocked) || publish.chain?.hasOrganizerRole === false)}
            onNext={next}
            onSwitchNetwork={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })}
            switching={switching}
          />
        </div>
      </div>
    </div>
  );
}

function canSaveDraft(step: FormStep, frozen: boolean, rulesLocked: boolean): boolean {
  if (step === "details" || step === "ticket-types") return !frozen;
  if (step === "sale-rules") return !rulesLocked;
  return false; // review: everything is saved by the earlier steps
}

type Publish = ReturnType<typeof usePublishEvent>;

function PrimaryButton({
  step,
  frozen,
  saving,
  publish,
  blocked,
  onNext,
  onSwitchNetwork,
  switching,
}: {
  step: FormStep;
  frozen: boolean;
  saving: boolean;
  publish: Publish;
  blocked: boolean;
  onNext: () => void;
  onSwitchNetwork: () => void;
  switching: boolean;
}) {
  if (step !== "review") {
    const nextStep = FORM_STEPS[FORM_STEPS.indexOf(step) + 1];
    return (
      <Button size="lg" onClick={onNext} loading={saving}>
        Next: {STEP_LABELS[nextStep] === "Review and publish" ? "Review" : STEP_LABELS[nextStep]} <ArrowRight aria-hidden="true" />
      </Button>
    );
  }

  if (!publish.onContractChain) {
    return (
      <Button size="lg" onClick={onSwitchNetwork} loading={switching}>
        Switch network
      </Button>
    );
  }

  const phase = publish.tx.state.phase;
  let label = frozen ? "Continue publishing" : "Freeze and publish";
  if (publish.current?.stage === "freeze" && !publish.current.failed) label = "Uploading to IPFS…";
  else if (publish.current?.stage === "publish" && !publish.current.failed) label = "Publishing…";
  else if (phase === "preparing") label = "Preparing…";
  else if (phase === "awaitingWallet") label = "Confirm in your wallet…";
  else if (phase === "confirming" || phase === "stillPending") label = "Waiting for confirmation…";
  else if (saving) label = "Saving…";
  const failed = publish.current?.failed || phase === "error";

  return (
    <Button size="lg" onClick={onNext} loading={publish.running || saving} disabled={blocked}>
      {failed && !publish.running ? (
        <>
          <RotateCw aria-hidden="true" /> Continue publishing
        </>
      ) : (
        label
      )}
    </Button>
  );
}

// Right column of the review step: the publish steps, then whatever needs the organizer's attention
function PublishAside({
  publish,
  plan,
  event,
  issues,
  frozen,
  onFix,
}: {
  publish: Publish;
  plan: PublishPlan | null;
  event: DraftEvent | null;
  issues: Array<{ step: FormStep; message: string }>;
  frozen: boolean;
  onFix: (step: FormStep) => void;
}) {
  const typeCount = event?.ticket_types.length ?? 0;
  const statuses = stageStatuses(plan, typeCount, publish.current);

  // "2 of 3" while ticket types are being added: the ones already on-chain, plus this run's so far
  const detail: Partial<Record<PublishStage, string>> = {};
  const { state } = publish.tx;
  if (publish.current?.stage === "ticketTypes" && !publish.current.failed) {
    const addsRun = state.steps.filter((label) => stageForTxLabel(label) === "ticketTypes").length;
    const position = state.steps.slice(0, state.stepIndex + 1).filter((label) => stageForTxLabel(label) === "ticketTypes").length;
    detail.ticketTypes = `${typeCount - addsRun + position} of ${typeCount}`;
  }

  const blocked = plan?.blocked;
  const error = publish.apiError ?? (state.phase === "error" ? state.error : null);

  return (
    <>
      <PublishSteps statuses={statuses} detail={detail} />

      {issues.length > 0 && (
        <Alert tone="error" title="Finish these before publishing">
          <ul className="mt-1 flex flex-col gap-2">
            {issues.map((issue) => (
              <li key={`${issue.step}-${issue.message}`} className="flex flex-col items-start gap-1">
                <span>{issue.message}</span>
                <Button size="sm" variant="link" className="h-auto p-0" onClick={() => onFix(issue.step)}>
                  Go to {STEP_LABELS[issue.step]}
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {!publish.onContractChain && (
        <Alert tone="warning" title="Wrong network">
          Switch your wallet to the network the ticket contract is on to publish.
        </Alert>
      )}

      {publish.chainError && (
        <Alert tone="error" title={publish.chainError} action={<Button size="sm" onClick={() => publish.reloadChain()}>Try again</Button>} />
      )}

      {publish.chain && !publish.chain.hasOrganizerRole && (
        <Alert tone="error" title="This wallet can't publish yet">
          It doesn&apos;t have the organizer role on the ticket contract. An admin grants it when they approve your organizer request.
        </Alert>
      )}

      {blocked === "idTaken" && (
        <Alert tone="error" title="This event belongs to another wallet on-chain">
          Connect the wallet that started publishing this event.
        </Alert>
      )}
      {blocked === "typesMismatch" && (
        <Alert tone="error" title="The on-chain ticket types don't match this event">
          The contract has ticket types this event doesn&apos;t. Contact an admin before publishing.
        </Alert>
      )}
      {blocked === "rulesLocked" && (
        <Alert
          tone="warning"
          title="Sale rules are locked"
        >
          Tickets have already sold, so the on-chain sale rules can&apos;t change anymore.
        </Alert>
      )}

      {error && <Alert tone="error" title={error} />}

      {state.phase === "stillPending" && (
        <Alert
          tone="warning"
          title="This is taking longer than usual. Don't send it again yet."
          action={
            <Button variant="outline" size="sm" onClick={publish.tx.stopWaiting}>
              Stop waiting
            </Button>
          }
        >
          {state.hash && <TxHash hash={state.hash} explorerUrl={publish.tx.explorerUrl} className="justify-start" />}
        </Alert>
      )}
      {state.phase === "stoppedWaiting" && (
        <Alert tone="warning" title="Stopped waiting for the transaction">
          {state.note} Press Continue publishing once it has confirmed: finished steps are skipped.
          {state.hash && <TxHash hash={state.hash} explorerUrl={publish.tx.explorerUrl} className="mt-1 justify-start" />}
        </Alert>
      )}
      {state.phase === "confirming" && state.hash && <TxHash hash={state.hash} explorerUrl={publish.tx.explorerUrl} />}

      {!frozen && (
        <Alert tone="warning" title="Freezing locks the event details" icon={null}>
          Freezing locks the event details and ticket types and uploads them to IPFS. Sale rules can still change until the first ticket sells.
        </Alert>
      )}
    </>
  );
}

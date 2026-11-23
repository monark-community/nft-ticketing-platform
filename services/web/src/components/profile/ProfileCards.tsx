"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Copy, KeyRound, Power, Save, Send, Store, Wallet } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getAddress } from "viem";

import { CopyLiftOff, DrawnCheck, Stamp } from "@/components/motion";
import { useReshape } from "@/components/motion/useReshape";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { apiClient } from "@/lib/api";
import type { UserProfile } from "@/lib/auth-provider";
import { shortAddress } from "@/lib/format";
import {
  approvalStampSeen,
  fetchOrganizerRequest,
  rememberApprovalStamp,
  sendOrganizerRequest,
  type OrganizerRequestResult,
} from "@/lib/organizer-request";
import {
  changedFields,
  mapProfileSaveError,
  profileChanged,
  profileFormFrom,
  roleLabel,
  toProfilePayload,
  validateProfile,
  type ProfileErrors,
  type ProfileForm,
} from "@/lib/profile";
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "@/lib/sign-up";
import { cn } from "@/lib/utils";

// Card title with an icon, as in the Figma profile cards
function CardHeading({ icon, title, description, className }: { icon?: ReactNode; title: string; description?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h2 className="flex items-center gap-2 type-heading-sm text-foreground [&_svg]:size-4 [&_svg]:text-secondary-foreground">
        {icon}
        {title}
      </h2>
      {description && <p className="type-body-md text-secondary-foreground">{description}</p>}
    </div>
  );
}

// After saving, an orange line sweeps under a field that was changed, then fades (#370)
function SavedLine({ sweep, field }: { sweep: Sweep | null; field: keyof ProfileForm }) {
  if (!sweep?.fields.includes(field)) return null;
  return (
    <span
      key={sweep.run}
      className="pointer-events-none absolute inset-x-px bottom-0 h-0.5 origin-left animate-[save-sweep_650ms_ease-out_forwards] rounded-b-sm bg-primary"
      data-saved-line
      aria-hidden="true"
    />
  );
}

interface Sweep {
  fields: (keyof ProfileForm)[];
  run: number; // restarts the line on every save
}

// "Account details" (Figma "Profile / Default"): edit name, nickname and email with PUT /api/users/me.
// Motion (#370): Save's glow fades in as soon as something changed (the button's own transition),
// an orange line sweeps under each field that was saved, "Saved" is stamped on, and field errors
// fade in (Field).
export function AccountDetailsCard({ user, onSaved }: { user: UserProfile; onSaved: () => Promise<UserProfile | null> }) {
  const [form, setForm] = useState<ProfileForm>(() => profileFormFrom(user));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);

  const changed = profileChanged(form, user);

  function set(key: keyof ProfileForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSaved(false);
    setSaveError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setSaveError(null);
    const fields = changedFields(form, user);
    try {
      await apiClient("/api/users/me", { method: "PUT", data: toProfilePayload(form) });
      // Refresh the signed-in user, so the navbar and this form show what the API stored
      const fresh = await onSaved();
      if (fresh) setForm(profileFormFrom(fresh));
      setSaved(true);
      setSweep((last) => ({ fields, run: (last?.run ?? 0) + 1 }));
    } catch (err) {
      const { field, message } = mapProfileSaveError(err instanceof Error ? err.message : "");
      if (field) setErrors({ [field]: message });
      else setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-6 p-6 md:p-10">
      <CardHeading title="Account details" description="Update your name and email." />
      <form onSubmit={save} noValidate className="flex flex-col gap-6 border-t border-border pt-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            {(props) => (
              <div className="relative">
                <Input {...props} autoComplete="given-name" maxLength={MAX_NAME_LENGTH} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                <SavedLine sweep={sweep} field="firstName" />
              </div>
            )}
          </Field>
          <Field label="Last name" error={errors.lastName}>
            {(props) => (
              <div className="relative">
                <Input {...props} autoComplete="family-name" maxLength={MAX_NAME_LENGTH} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                <SavedLine sweep={sweep} field="lastName" />
              </div>
            )}
          </Field>
        </div>

        <Field label="Nickname (optional)" error={errors.nickname}>
          {(props) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 type-body-md text-muted-foreground" aria-hidden="true">
                @
              </span>
              <Input {...props} autoComplete="nickname" maxLength={MAX_NAME_LENGTH + 1} className="pl-9" value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
              <SavedLine sweep={sweep} field="nickname" />
            </div>
          )}
        </Field>

        <Field label="Email" helper="Used for receipts and event updates." error={errors.email}>
          {(props) => (
            <div className="relative">
              <Input {...props} type="email" autoComplete="email" maxLength={MAX_EMAIL_LENGTH} value={form.email} onChange={(e) => set("email", e.target.value)} />
              <SavedLine sweep={sweep} field="email" />
            </div>
          )}
        </Field>

        {saveError && <Alert tone="error" title={saveError} />}

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          <Button type="submit" loading={saving} disabled={!changed}>
            {!saving && <Save aria-hidden="true" />}
            Save changes
          </Button>
          {saved && !changed && (
            <p role="status" className="flex animate-[stamp-on_320ms_var(--ease-snap)_backwards] items-center gap-2 type-body-md text-foreground">
              <CircleCheck className="size-4 text-primary" aria-hidden="true" />
              Saved
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

// "Wallet": address with copy, the account's role, and disconnect. Copying lifts a faint copy of the
// address off the card and the icon becomes a drawn tick; hovering the address turns the key (#370).
export function WalletCard({ user, onDisconnect }: { user: UserProfile; onDisconnect: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copies, setCopies] = useState(0);
  // The API stores addresses in lowercase; show and copy the checksummed form, like the navbar
  const address = checksummed(user.wallet_address);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setCopies((n) => n + 1);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the address is still shown
    }
  }

  return (
    <Card className="gap-5">
      <CardHeading icon={<Wallet aria-hidden="true" />} title="Wallet" />
      <div className="group/address flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          {/* Turns like a key in a lock */}
          <KeyRound
            className="size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-[160ms] ease-[var(--ease-snap)] group-hover/address:-rotate-40 group-hover/address:text-primary"
            aria-hidden="true"
          />
          {/* The short address always fits, so it isn't cut off: the copy that lifts off stays visible */}
          <span className="whitespace-nowrap" title={address}>
            <CopyLiftOff copies={copies} className="type-mono-value text-foreground">
              {shortAddress(address)}
            </CopyLiftOff>
          </span>
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-xs p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={copied ? "Address copied" : "Copy wallet address"}
        >
          {copied ? <DrawnCheck className="text-success" /> : <Copy className="size-4" aria-hidden="true" />}
        </button>
      </div>
      <dl className="flex items-center justify-between gap-4 border-y border-border py-3">
        <dt className="type-body-md text-secondary-foreground">Active role</dt>
        <dd className="type-mono-value font-bold text-foreground">{roleLabel(user.role)}</dd>
      </dl>
      <Button variant="outline" className="w-full" onClick={onDisconnect}>
        <Power aria-hidden="true" />
        Disconnect wallet
      </Button>
    </Card>
  );
}

function checksummed(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

const LEAVE_MS = 100; // the old content fades out before the card changes
const PLANE_MS = 260; // the paper plane's flight out of the button (plane-fly, below)

// "Become an organizer", and "Organizer request sent" while an admin reviews it (Figma "Profile /
// Organizer request pending"). The latest request is read from the API, so it survives a reload.
// Motion (#370): the paper plane flies out of the button while the request is sent; once it's out,
// the card's content fades (100 ms) and the card reshapes into its next state (300 ms). The
// "Pending review" dot breathes, and an approved request gets an APPROVED stamp.
export function OrganizerRequestCard({ wallet }: { wallet: string }) {
  const latest = useQuery({ queryKey: ["organizer-request", wallet], queryFn: () => fetchOrganizerRequest() });
  const [result, setResult] = useState<OrganizerRequestResult | null>(null);
  const [sending, setSending] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const planeOut = useRef(0); // when the plane has left the button

  async function ask() {
    planeOut.current = Date.now() + PLANE_MS;
    setSending(true);
    setResult(await sendOrganizerRequest());
    setSending(false);
  }

  const status = latest.data?.status;
  // An approval read from the API wins over a request just sent from this page
  const next = status === "approved" ? "approved" : result === "sent" || status === "pending" ? "sent" : "ask";
  // The state on screen: a new one waits while the old content fades out. A request sent from here
  // also waits for the plane to leave the button: the API can answer before it has taken off.
  const reduced = usePrefersReducedMotion();
  const [shape, setShape] = useState(next);
  if (next !== shape && reduced) setShape(next);
  const leaving = next !== shape && !reduced;
  const [fadingTo, setFadingTo] = useState<string | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const wait = Math.max(0, planeOut.current - Date.now());
    const fade = setTimeout(() => setFadingTo(next), wait);
    const swap = setTimeout(() => setShape(next), wait + LEAVE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(swap);
    };
  }, [leaving, next]);
  useReshape(card, shape);
  const fading = leaving && fadingTo === next && "[&>*]:animate-[dim-out_100ms_ease-in_forwards]";
  const stampLands = useApprovalStamp(status === "approved" ? (latest.data?.id ?? null) : null);

  if (shape === "sent") {
    return (
      <Card ref={card} className={cn("gap-5", fading)} role="status">
        <CardHeading icon={<Store aria-hidden="true" />} title="Organizer request sent" />
        <p className="type-body-md text-secondary-foreground">An admin is reviewing your request. Your role will update here once it&apos;s approved.</p>
        <Button variant="outline" className="w-full rounded-full" disabled>
          {/* Breathes slowly while it waits */}
          <span className="size-2 animate-breathe rounded-full bg-primary" aria-hidden="true" />
          Pending review
        </Button>
      </Card>
    );
  }

  // Approved, but this session still has the old role
  if (shape === "approved") {
    return (
      <ApprovedCard ref={card} className={fading} stampLands={stampLands}>
        Disconnect and sign in again to start creating events.
      </ApprovedCard>
    );
  }

  return (
    <Card ref={card} className={cn("gap-5", fading)}>
      <CardHeading icon={<Store aria-hidden="true" />} title="Become an organizer" />
      <p className="type-body-md text-secondary-foreground">Want to sell tickets for your own events? Request organizer access and an admin will review it.</p>
      {status === "rejected" && (
        <Alert tone="warning" title="Your last request wasn't approved">
          {latest.data?.rejectionReason ? `Reason: ${latest.data.rejectionReason} ` : ""}You can ask again.
        </Alert>
      )}
      {result === "failed" && <Alert tone="error" title="Your request didn't go through. Try again." />}
      <Button variant="outline" className="w-full" onClick={ask} loading={latest.isPending} disabled={sending} aria-busy={sending || undefined}>
        {/* While the request is sent, the paper plane flies out of the button (and stays gone once it went through) */}
        {!latest.isPending && (
          <Send className={cn((sending || result === "sent") && "animate-[plane-fly_260ms_cubic-bezier(0.5,0,0.8,0.4)_forwards]")} aria-hidden="true" />
        )}
        Request access
      </Button>
    </Card>
  );
}

// "Organizer request approved", with an APPROVED stamp that lands once the card is there
function ApprovedCard({ ref, className, stampLands, children }: { ref?: React.Ref<HTMLDivElement>; className?: string | false; stampLands: boolean; children: ReactNode }) {
  return (
    <Card ref={ref} className={cn("relative gap-5", className)} role="status">
      {/* Room on the right for the stamp */}
      <CardHeading icon={<Store aria-hidden="true" />} title="Organizer request approved" className="pr-28" />
      <p className="type-body-md text-secondary-foreground">{children}</p>
      <Stamp tone="green" className={cn("absolute top-5 right-5", stampLands ? "[animation-delay:200ms]" : "[animation:none]")}>
        APPROVED
      </Stamp>
    </Card>
  );
}

// Whether the APPROVED stamp of this approval lands now: only the first time this browser shows it
// (#370); after that the stamp is simply there. Decided when the approval is first seen, and
// remembered at once.
function useApprovalStamp(requestId: string | null): boolean {
  const [decided, setDecided] = useState<{ id: string; lands: boolean } | null>(null);
  if (requestId !== null && decided?.id !== requestId) setDecided({ id: requestId, lands: !approvalStampSeen(requestId) });
  useEffect(() => {
    if (decided?.lands) rememberApprovalStamp(decided.id);
  }, [decided]);
  return decided !== null && decided.id === requestId && decided.lands;
}

// An organizer's profile, the first time after their request was approved: "Organizer request
// approved", and the stamp lands (#370). Signing in again as an organizer hides the request card,
// so without this the stamp was never seen. Later visits don't show it.
export function OrganizerApprovedCard({ wallet }: { wallet: string }) {
  const latest = useQuery({ queryKey: ["organizer-request", wallet], queryFn: () => fetchOrganizerRequest() });
  const stampLands = useApprovalStamp(latest.data?.status === "approved" ? latest.data.id : null);
  if (!stampLands) return null;
  return (
    <ApprovedCard className="fade-in" stampLands>
      You can create events now.
    </ApprovedCard>
  );
}

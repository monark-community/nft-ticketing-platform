"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, CircleCheck, Copy, KeyRound, Power, Save, Send, Store, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { getAddress } from "viem";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import type { UserProfile } from "@/lib/auth-provider";
import { shortAddress } from "@/lib/format";
import { fetchOrganizerRequest, sendOrganizerRequest, type OrganizerRequestResult } from "@/lib/organizer-request";
import {
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

// Card title with an icon, as in the Figma profile cards
function CardHeading({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 type-heading-sm text-foreground [&_svg]:size-4 [&_svg]:text-secondary-foreground">
        {icon}
        {title}
      </h2>
      {description && <p className="type-body-md text-secondary-foreground">{description}</p>}
    </div>
  );
}

// "Account details" (Figma "Profile / Default"): edit name, nickname and email with PUT /api/users/me
export function AccountDetailsCard({ user, onSaved }: { user: UserProfile; onSaved: () => Promise<UserProfile | null> }) {
  const [form, setForm] = useState<ProfileForm>(() => profileFormFrom(user));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    try {
      await apiClient("/api/users/me", { method: "PUT", data: toProfilePayload(form) });
      // Refresh the signed-in user, so the navbar and this form show what the API stored
      const fresh = await onSaved();
      if (fresh) setForm(profileFormFrom(fresh));
      setSaved(true);
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
              <Input {...props} autoComplete="given-name" maxLength={MAX_NAME_LENGTH} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName}>
            {(props) => (
              <Input {...props} autoComplete="family-name" maxLength={MAX_NAME_LENGTH} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
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
            </div>
          )}
        </Field>

        <Field label="Email" helper="Used for receipts and event updates." error={errors.email}>
          {(props) => (
            <Input {...props} type="email" autoComplete="email" maxLength={MAX_EMAIL_LENGTH} value={form.email} onChange={(e) => set("email", e.target.value)} />
          )}
        </Field>

        {saveError && <Alert tone="error" title={saveError} />}

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
          <Button type="submit" loading={saving} disabled={!changed}>
            {!saving && <Save aria-hidden="true" />}
            Save changes
          </Button>
          {saved && !changed && (
            <p role="status" className="flex items-center gap-2 type-body-md text-foreground">
              <CircleCheck className="size-4 text-primary" aria-hidden="true" />
              Saved
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

// "Wallet": address with copy, the account's role, and disconnect
export function WalletCard({ user, onDisconnect }: { user: UserProfile; onDisconnect: () => void }) {
  const [copied, setCopied] = useState(false);
  // The API stores addresses in lowercase; show and copy the checksummed form, like the navbar
  const address = checksummed(user.wallet_address);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the address is still shown
    }
  }

  return (
    <Card className="gap-5">
      <CardHeading icon={<Wallet aria-hidden="true" />} title="Wallet" />
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate type-mono-value text-foreground" title={address}>
            {shortAddress(address)}
          </span>
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-xs p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={copied ? "Address copied" : "Copy wallet address"}
        >
          {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
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

// "Become an organizer", and "Organizer request sent" while an admin reviews it (Figma "Profile /
// Organizer request pending"). The latest request is read from the API, so it survives a reload.
export function OrganizerRequestCard({ wallet }: { wallet: string }) {
  const latest = useQuery({ queryKey: ["organizer-request", wallet], queryFn: () => fetchOrganizerRequest() });
  const [result, setResult] = useState<OrganizerRequestResult | null>(null);
  const [sending, setSending] = useState(false);

  async function ask() {
    setSending(true);
    setResult(await sendOrganizerRequest());
    setSending(false);
  }

  const status = latest.data?.status;

  if (result === "sent" || status === "pending") {
    return (
      <Card className="gap-5" role="status">
        <CardHeading icon={<Store aria-hidden="true" />} title="Organizer request sent" />
        <p className="type-body-md text-secondary-foreground">An admin is reviewing your request. Your role will update here once it&apos;s approved.</p>
        <Button variant="outline" className="w-full rounded-full" disabled>
          Pending review
        </Button>
      </Card>
    );
  }

  // Approved, but this session still has the old role
  if (status === "approved") {
    return (
      <Card className="gap-5" role="status">
        <CardHeading icon={<Store aria-hidden="true" />} title="Organizer request approved" />
        <p className="type-body-md text-secondary-foreground">Disconnect and sign in again to start creating events.</p>
      </Card>
    );
  }

  return (
    <Card className="gap-5">
      <CardHeading icon={<Store aria-hidden="true" />} title="Become an organizer" />
      <p className="type-body-md text-secondary-foreground">Want to sell tickets for your own events? Request organizer access and an admin will review it.</p>
      {status === "rejected" && (
        <Alert tone="warning" title="Your last request wasn't approved">
          {latest.data?.rejectionReason ? `Reason: ${latest.data.rejectionReason} ` : ""}You can ask again.
        </Alert>
      )}
      {result === "failed" && <Alert tone="error" title="Your request didn't go through. Try again." />}
      <Button variant="outline" className="w-full" onClick={ask} loading={sending || latest.isPending}>
        {!sending && !latest.isPending && <Send aria-hidden="true" />}
        Request access
      </Button>
    </Card>
  );
}

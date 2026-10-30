"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { AccountTypePicker } from "@/components/auth/AccountTypePicker";
import { AuthCard } from "@/components/auth/AuthCard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { shortAddress } from "@/lib/format";
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH, validateSignUp, type SignUpErrors, type SignUpForm } from "@/lib/sign-up";

interface CreateAccountFormProps {
  address: string;
  // Saves the profile; resolves to field errors and/or a general error when it didn't work
  onSubmit: (form: SignUpForm) => Promise<{ fieldErrors?: SignUpErrors; error?: string } | void>;
}

// Step 3 (Figma: Sign in / Create account). Shown the first time a wallet signs in, because every
// account needs an email (Monark, database design Q&A Q1). The API's requireEmail blocks its
// protected routes until it's set. Buying tickets is on-chain and doesn't go through the API.
export function CreateAccountForm({ address, onSubmit }: CreateAccountFormProps) {
  const [form, setForm] = useState<SignUpForm>({ firstName: "", lastName: "", email: "", accountType: "attendee" });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof SignUpForm>(field: K, value: SignUpForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Fixing a field clears its error
    if (field in errors) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validateSignUp(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      // Put the cursor in the first field to fix
      const first = (["firstName", "lastName", "email"] as const).find((field) => found[field]);
      if (first) event.currentTarget.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSubmit(form);
      if (result?.fieldErrors) setErrors(result.fieldErrors);
      if (result?.error) setFormError(result.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard aria-labelledby="create-account-title">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 rounded-sm bg-background/80 px-2.5 py-1">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span className="font-mono text-[11px] leading-4 font-bold tracking-[0.05em] text-primary">WALLET AUTHENTICATED</span>
        </span>
        <span className="font-mono text-[13px] leading-[18px] font-medium tracking-[0.04em] text-secondary-foreground">{shortAddress(address)}</span>
      </div>

      <h1 id="create-account-title" className="pt-4 type-heading-md tracking-[-0.025em] text-foreground">
        Create your account
      </h1>
      <p className="type-body-md text-secondary-foreground">Your wallet isn&apos;t registered yet. Tell us a bit about you.</p>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 pt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <Field label="First name" error={errors.firstName}>
            {(props) => (
              <Input
                {...props}
                name="firstName"
                autoComplete="given-name"
                maxLength={MAX_NAME_LENGTH}
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                disabled={submitting}
              />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName}>
            {(props) => (
              <Input
                {...props}
                name="lastName"
                autoComplete="family-name"
                maxLength={MAX_NAME_LENGTH}
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                disabled={submitting}
              />
            )}
          </Field>
        </div>

        <Field label="Email" error={errors.email} helper="Used for your account and event updates. Never shown on-chain.">
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={MAX_EMAIL_LENGTH}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              disabled={submitting}
            />
          )}
        </Field>

        <div className="pt-1 pb-2">
          <AccountTypePicker value={form.accountType} onChange={(value) => update("accountType", value)} disabled={submitting} />
          {form.accountType === "organizer" && (
            <p className="pt-2 type-body-sm text-muted-foreground">
              You&apos;ll get an attendee account right away. An admin reviews organizer requests before you can create events.
            </p>
          )}
        </div>

        {formError && <Alert tone="error" title={formError} />}

        <Button type="submit" size="lg" className="w-full normal-case tracking-[0.04em]" loading={submitting}>
          {submitting ? (
            "Creating account…"
          ) : (
            <>
              Create account <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

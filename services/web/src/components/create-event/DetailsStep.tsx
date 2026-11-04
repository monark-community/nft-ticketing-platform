"use client";

import { CoverImageField } from "@/components/create-event/CoverImageField";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DESCRIPTION_MAX, EVENT_CATEGORIES, TITLE_MAX, VENUE_MAX, type DetailsForm, type FieldErrors } from "@/lib/create-event";

interface DetailsStepProps {
  value: DetailsForm;
  errors: FieldErrors<keyof DetailsForm>;
  image: File | null;
  imagePreview: string | null;
  imageError: string | null;
  uploadedImageUrl: string | null;
  frozen: boolean;
  minStart: string; // datetime-local value for "now", so the picker starts in the future
  onChange: (value: DetailsForm) => void;
  onImageChange: (file: File | null) => void;
}

// Figma "Create event / 1 Details": the event card on the left, the freeze note on the right
export function DetailsStep({ value, errors, image, imagePreview, imageError, uploadedImageUrl, frozen, minStart, onChange, onImageChange }: DetailsStepProps) {
  const set = <K extends keyof DetailsForm>(key: K, v: DetailsForm[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="gap-5">
        <CardTitle>Event details</CardTitle>

        <Field label="Event name" helper="Shown on the event page and on every ticket" error={errors.title}>
          {(props) => (
            <Input {...props} value={value.title} maxLength={TITLE_MAX + 20} disabled={frozen} onChange={(e) => set("title", e.target.value)} />
          )}
        </Field>

        <Field
          label="Description"
          helper={`Plain text, up to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters${value.description.length > DESCRIPTION_MAX * 0.9 ? ` (${value.description.length.toLocaleString("en-US")} used)` : ""}`}
          error={errors.description}
        >
          {(props) => <Textarea {...props} rows={4} value={value.description} disabled={frozen} onChange={(e) => set("description", e.target.value)} />}
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label="Category" error={errors.category}>
            {(props) => (
              <Select {...props} value={value.category} disabled={frozen} onChange={(e) => set("category", e.target.value)}>
                <option value="" disabled>
                  Choose a category
                </option>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Venue" helper="Address or venue name" error={errors.location}>
            {(props) => (
              <Input {...props} value={value.location} maxLength={VENUE_MAX + 20} disabled={frozen} onChange={(e) => set("location", e.target.value)} />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label="Starts" helper="Doors open time" error={errors.start}>
            {(props) => (
              <Input {...props} type="datetime-local" min={minStart} className="[color-scheme:dark]" value={value.start} disabled={frozen} onChange={(e) => set("start", e.target.value)} />
            )}
          </Field>
          <Field label="Ends" helper="Optional" error={errors.end}>
            {(props) => (
              <Input {...props} type="datetime-local" min={value.start || minStart} className="[color-scheme:dark]" value={value.end} disabled={frozen} onChange={(e) => set("end", e.target.value)} />
            )}
          </Field>
        </div>

        <CoverImageField file={image} previewUrl={imagePreview} uploadedUrl={uploadedImageUrl} error={imageError} disabled={frozen} onChange={onImageChange} />
      </Card>

      <div className="flex flex-col gap-6 self-start">
        {frozen ? (
          <Alert tone="info" title="These details are frozen">
            They were uploaded to IPFS when you froze the event, so they can&apos;t change anymore.
          </Alert>
        ) : (
          <Alert tone="info" title="Details lock when you freeze" icon={null}>
            Drafts are only visible to you. Freezing in the last step locks the event details and ticket types. Sale rules stay editable until the first ticket sells.
          </Alert>
        )}
      </div>
    </div>
  );
}

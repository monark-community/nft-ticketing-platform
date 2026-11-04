"use client";

import { ImageUp } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IMAGE_TYPES } from "@/lib/create-event";
import { eventImageUrl } from "@/lib/event-details";
import { cn } from "@/lib/utils";

interface CoverImageFieldProps {
  file: File | null;
  previewUrl: string | null; // object URL of `file`, made by the page when the file is picked
  uploadedUrl: string | null; // the image pinned when the event froze (ipfs://…)
  error?: string | null;
  disabled?: boolean; // frozen: the image is on IPFS and can't change
  onChange: (file: File | null) => void;
}

// "1.2 MB", "820 KB"
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Cover image dropzone (Figma: "Drop an image or click to upload"). The file stays in the browser
// until the event is frozen, then the API pins it to IPFS. The parent checks its type and size.
export function CoverImageField({ file, previewUrl, uploadedUrl, error, disabled = false, onChange }: CoverImageFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const shown = (file && previewUrl) || (uploadedUrl ? eventImageUrl(uploadedUrl) : null);
  const hintId = `${id}-hint`;

  function pick(files: FileList | null) {
    const chosen = files?.[0];
    if (chosen) onChange(chosen);
    // Clear the input so choosing the same file again still fires onChange
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Cover image</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        onChange={(e) => pick(e.target.files)}
      />

      {shown ? (
        <div className={cn("flex flex-col gap-4 rounded-sm border bg-background p-4 sm:flex-row sm:items-center", error ? "border-destructive" : "border-input")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="Cover image preview" className="aspect-video w-full rounded-xs object-cover sm:w-48" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate type-body-md-strong text-foreground">{file ? file.name : "Uploaded to IPFS"}</p>
            <p className="type-body-sm text-muted-foreground">
              {file ? formatFileSize(file.size) : "Pinned when the event was frozen. It can't change anymore."}
            </p>
            {!disabled && (
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                  Replace
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) pick(e.dataTransfer.files);
          }}
          aria-describedby={hintId}
          className={cn(
            "flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            dragging ? "border-primary bg-primary-tint" : error ? "border-destructive" : "border-input hover:border-primary/60",
          )}
        >
          <ImageUp className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="type-title-md text-foreground">Drop an image or click to upload</span>
          <span className="type-body-sm text-muted-foreground">PNG, JPG or WebP, up to 10 MB. Uploaded to IPFS when you freeze the event.</span>
        </button>
      )}

      <p id={hintId} className={cn("type-body-sm", error ? "text-destructive" : "sr-only")} role={error ? "alert" : undefined}>
        {error ?? "PNG, JPG or WebP, up to 10 MB."}
      </p>
    </div>
  );
}

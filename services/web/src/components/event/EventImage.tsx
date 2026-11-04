"use client";

import { useState } from "react";

import { eventImageUrl } from "@/lib/event-details";
import { cn } from "@/lib/utils";

// Event cover image, or a branded placeholder when the organizer hasn't added one or it fails to load.
// A plain <img>: organizers can use any host, which next/image would need listed in next.config.
export function EventImage({ src, className }: { src: string | null; className?: string }) {
  const url = eventImageUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <div className={cn("absolute inset-0 bg-card dot-grid", className)} aria-hidden="true">
        <div className="absolute inset-0 bg-radial-[at_70%_20%] from-primary/20 to-transparent to-70%" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setFailedUrl(url)}
      className={cn("absolute inset-0 size-full object-cover", className)}
    />
  );
}

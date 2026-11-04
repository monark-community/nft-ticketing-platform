"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CreateEventFlow, FlowSkeleton } from "@/components/create-event/CreateEventFlow";
import { OrganizerGate } from "@/components/create-event/OrganizerGate";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ROUTES } from "@/lib/nav";

// Create event (#187, #188, #193), from the Figma "Organizer Dashboard" page:
// Create event / 1 Details, 2 Ticket types, 3 Sale rules, 4 Review and publish.
export default function CreateEventPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="page-glow flex-1 pb-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 md:px-10 md:py-12">
          <header className="flex flex-col gap-3">
            {/* "My events" becomes a link once that page exists (it needs #250) */}
            <p className="type-body-sm text-muted-foreground">
              My events <span aria-hidden="true">/</span> <span className="text-secondary-foreground">New event</span>
            </p>
            <h1 className="type-heading-lg text-foreground">Create event</h1>
          </header>

          {/* useSearchParams needs a Suspense boundary in the App Router */}
          <Suspense fallback={<FlowSkeleton />}>
            <GatedFlow />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function GatedFlow() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  return (
    // Signing in comes back to the same draft and step
    <OrganizerGate nextPath={query ? `${ROUTES.newEvent}?${query}` : ROUTES.newEvent}>
      <CreateEventFlow />
    </OrganizerGate>
  );
}

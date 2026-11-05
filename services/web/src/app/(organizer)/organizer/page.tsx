"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { OrganizerGate } from "@/components/create-event/OrganizerGate";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { OrganizerDashboard } from "@/components/organizer/OrganizerDashboard";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

// The organizer dashboard (#187), from the Figma "Organizer Dashboard" page: every event the
// signed-in organizer owns, whatever its status, with a way to continue drafts, finish publishing
// or open the public event page.
export default function OrganizerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pt-8 pb-16 md:px-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="type-body-sm text-muted-foreground">Organizer</p>
              <h1 className="type-heading-lg text-foreground md:type-display-xl">My events</h1>
              <p className="type-body-lg text-secondary-foreground">Create events, follow sales and manage your tickets.</p>
            </div>
            <Link href={ROUTES.newEvent} className={cn(buttonVariants({ size: "md" }), "w-full sm:w-auto")}>
              <Plus aria-hidden="true" />
              Create event
            </Link>
          </header>

          <OrganizerGate nextPath={ROUTES.organizer} feature="the organizer dashboard">
            <OrganizerDashboard />
          </OrganizerGate>
        </div>
      </main>

      <Footer />
    </div>
  );
}

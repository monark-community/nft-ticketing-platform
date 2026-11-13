"use client";

import { OrganizerGate } from "@/components/create-event/OrganizerGate";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { OrganizerDashboard } from "@/components/organizer/OrganizerDashboard";
import { ROUTES } from "@/lib/nav";

// The organizer dashboard (#187), from the Figma "Organizer Dashboard" page: every event the
// signed-in organizer owns, whatever its status, with a way to continue drafts, finish publishing
// or open the public event page. The dashboard renders its header inside the gate, so attendees
// and admins only see the account they need.
export default function OrganizerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pt-8 pb-16 md:px-8">
          <OrganizerGate nextPath={ROUTES.organizer} feature="the organizer dashboard">
            <OrganizerDashboard />
          </OrganizerGate>
        </div>
      </main>

      <Footer />
    </div>
  );
}

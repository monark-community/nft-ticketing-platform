"use client";

import { useParams } from "next/navigation";

import { OrganizerGate } from "@/components/create-event/OrganizerGate";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { OrganizerEventManager } from "@/components/organizer/manage/OrganizerEventManager";

// Management page for one published event (#189-#194). "Manage" on the organizer dashboard opens
// this page; the public event page is linked from its header.
export default function OrganizerEventPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const nextPath = `/organizer/events/${encodeURIComponent(id)}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pt-8 pb-16 md:px-8">
          <OrganizerGate nextPath={nextPath} feature="this event's management page">
            <OrganizerEventManager eventId={id} />
          </OrganizerGate>
        </div>
      </main>

      <Footer />
    </div>
  );
}

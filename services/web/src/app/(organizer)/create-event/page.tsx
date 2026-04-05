"use client";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface TicketTier {
  id: number;
  name: string;
  price: number;
  quantity: number;
  supply: number;
}

interface FormData {
  eventName: string;
  date: string;
  time: string;
  location: string;
  description: string;
  eventType: string;
  image: File | null;
}

interface FormErrors {
  eventName?: string;
  date?: string;
  location?: string;
  description?: string;
  eventType?: string;
}

const EVENT_TYPES = [
"Music Concerts & Festivals",
"Professional Sporting Events",
"Conferences & Fairs",
"E-sports Tournaments",
"Theater & Performing Arts",
"Theme Parks & Attractions",
"Art Galleries & Exclusive Exhibits",
"Nightclubs & Private Parties",
"Charity Galas & Fundraising Events",
"Product Launches & Pop-up Shops"
];

export default function CreateEventPage() {
  const [form, setForm] = useState<FormData>({
    eventName: "",
    date: "",
    time: "",
    location: "",
    description: "",
    eventType: "",
    image: null,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [tiers, setTiers] = useState<TicketTier[]>([
    { id: 1, name: "General Admission", price: 15, quantity: 100, supply: 850 },
    { id: 2, name: "VIP Tickets", price: 25, quantity: 100, supply: 250 },
    { id: 3, name: "Early Bird", price: 12, quantity: 100, supply: 350 },
  ]);

  // --- Validation ---
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.eventName.trim()) e.eventName = "Event name is required.";
    if (!form.date) e.date = "Date is required.";
    if (!form.location.trim()) e.location = "Location is required.";
    if (!form.description.trim()) e.description = "Description is required.";
    if (!form.eventType) e.eventType = "Please select a type of event.";
    return e;
  }

  // --- Image upload ---
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm((prev) => ({ ...prev, image: file }));
    setImagePreview(URL.createObjectURL(file));
  }

  // --- Tier changes ---
  function updateTier(id: number, field: keyof TicketTier, value: string) {
    setTiers((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, [field]: field === "name" ? value : Number(value) } : t
      )
    );
  }

  function addTier() {
    const newId = tiers.length + 1;
    setTiers((prev) => [
      ...prev,
      { id: newId, name: `Tier ${newId}`, price: 0, quantity: 100, supply: 100 },
    ]);
  }

  function removeTier(id: number) {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  }

  // --- Submit ---
  function handleSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    window.location.href = "/mint";
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* NAV */}
    <Navbar />

      {/* PAGE HEADER */}
      <div className="bg-[#3a7bd5] px-8 pb-5">
        <h1 className="text-white text-2xl font-bold">Create Event</h1>
        <p className="text-white/70 text-sm mt-1">Set up your NFT ticketed event</p>
      </div>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col items-center py-8 px-4 bg-[#f0f4fb]">
        <div className="w-full max-w-2xl">
          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-sm">

            {/* IMAGE + FIELDS */}
            <div className="grid grid-cols-2 gap-8 mb-6">

              {/* IMAGE UPLOAD + EVENT TYPE */}
              <div className="flex flex-col gap-4">
                {/* Image upload box */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors overflow-hidden"
                  style={{ minHeight: "180px" }}
                  onClick={() => document.getElementById("imageInput")?.click()}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Event preview" className="w-full h-full object-cover" style={{ maxHeight: "180px" }} />
                  ) : (
                    <>
                      <div className="text-gray-400 text-3xl mb-2">Upload an Image</div>
                    </>
                  )}
                  <input
                    id="imageInput"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
                <Button
                  onClick={() => document.getElementById("imageInput")?.click()}
                  className="bg-[#3a7bd5] hover:bg-[#2d63b0] text-white text-sm"
                >
                  Upload Image
                </Button>

                {/* Type of Event */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                    Type of Event
                  </Label>
                  <div className="relative">
                    <select
                      value={form.eventType}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleChange("eventType", e.target.value)
                      }
                      className={`w-full border rounded-md px-3 py-2 text-sm text-gray-700 bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[#3a7bd5] ${
                        errors.eventType ? "border-red-400" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select the Type of event</option>
                      {EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <span className="absolute right-2 top-2.5 text-gray-400 pointer-events-none">∨</span>
                  </div>
                  {errors.eventType && (
                    <p className="text-red-500 text-xs mt-1">{errors.eventType}</p>
                  )}
                </div>
              </div>

              {/*EVENT FIELDS */}
              <div className="flex flex-col gap-4">
                {/* Event Name */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                    Event Name
                  </Label>
                  <Input
                    placeholder="Enter event name"
                    value={form.eventName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleChange("eventName", e.target.value)
                    }
                    className={errors.eventName ? "border-red-400" : ""}
                  />
                  {errors.eventName && (
                    <p className="text-red-500 text-xs mt-1">{errors.eventName}</p>
                  )}
                </div>

                {/* Date & Time */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                    Date & Time
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange("date", e.target.value)
                      }
                      className={errors.date ? "border-red-400" : ""}
                    />
                    <Input
                      type="time"
                      value={form.time}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange("time", e.target.value)
                      }
                    />
                  </div>
                  {errors.date && (
                    <p className="text-red-500 text-xs mt-1">{errors.date}</p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                    Location
                  </Label>
                  <Input
                    placeholder="Enter event location"
                    value={form.location}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleChange("location", e.target.value)
                    }
                    className={errors.location ? "border-red-400" : ""}
                  />
                  {errors.location && (
                    <p className="text-red-500 text-xs mt-1">{errors.location}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1 block">
                    Description
                  </Label>
                  <textarea
                    placeholder="Write a short description about the event..."
                    value={form.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      handleChange("description", e.target.value)
                    }
                    rows={4}
                    className={`w-full border rounded-md px-3 py-2 text-sm text-gray-700 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#3a7bd5] ${
                      errors.description ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  {errors.description && (
                    <p className="text-red-500 text-xs mt-1">{errors.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* TICKET TIERS */}
            <div className="mb-8">
              <h2 className="text-base font-bold text-gray-800 mb-4">Ticket Tiers</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider col-span-1"></div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Price</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Quantity</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Supply</div>
                </div>

                {/* Tier rows */}
                {tiers.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-4 items-center px-4 py-3 border-b border-gray-100 last:border-b-0 gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateTier(tier.id, "name", e.target.value)
                        }
                        className="text-sm font-medium text-gray-700 border-none bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1 w-full"
                      />
                      <button
                        onClick={() => removeTier(tier.id)}
                        className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                        title="Remove tier"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-[#2775ca] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                      <input
                        type="number"
                        value={tier.price}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateTier(tier.id, "price", e.target.value)
                        }
                        className="w-16 text-sm text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3a7bd5]"
                      />
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        value={tier.quantity}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateTier(tier.id, "quantity", e.target.value)
                        }
                        className="w-16 text-sm text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3a7bd5]"
                      />
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        value={tier.supply}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateTier(tier.id, "supply", e.target.value)
                        }
                        className="w-16 text-sm text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3a7bd5]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Tier button */}
              <button
                onClick={addTier}
                className="mt-3 flex items-center gap-1 text-sm font-semibold text-[#3a7bd5] hover:text-[#2d63b0] transition-colors"
              >
                <span className="text-lg leading-none">+</span> Add Ticket Tier
              </button>
            </div>

            {/* SUBMIT */}
            <div className="flex justify-center">
              <Button
                onClick={handleSubmit}
                className="bg-[#3a7bd5] hover:bg-[#2d63b0] text-white font-bold px-10 py-3 text-base rounded-lg flex items-center gap-2"
              >
                Ticket Minting →
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
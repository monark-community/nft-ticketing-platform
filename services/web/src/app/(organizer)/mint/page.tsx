"use client";

import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAccount } from "wagmi";

interface TicketTier {
  id: number;
  name: string;
  price: number;
  quantity: number;
  supply: number;
  selected: boolean;
}

export default function TicketMintingPage() {
  const [activeTab, setActiveTab] = useState<"mint" | "settings">("mint");
  const [ticketsToMint, setTicketsToMint] = useState(100);
  const [ticketPrice, setTicketPrice] = useState(15);

  const [tiers, setTiers] = useState<TicketTier[]>([
    { id: 1, name: "General Admission", price: 15, quantity: 100, supply: 850, selected: true },
    { id: 2, name: "VIP Tickets", price: 25, quantity: 100, supply: 250, selected: false },
    { id: 3, name: "Early Bird", price: 12, quantity: 100, supply: 350, selected: false },
  ]);

  function toggleTier(id: number) {
    setTiers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  }

  const { isConnected } = useAccount();

  function handleMint() {
    if (!isConnected) {
    alert("Please connect your wallet before minting.");
    return;
  }
  const selected = tiers.filter((t) => t.selected);
  if (selected.length === 0) {
    alert("Please select at least one ticket tier to mint.");
    return;
  }
  console.log("✅ Minting tickets:", { ticketsToMint, ticketPrice, tiers: selected });
  alert(`Minting ${ticketsToMint} NFT tickets at ${ticketPrice} USDC each.\nCheck the console for details.`);
}

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* NAV */}
      <nav className="bg-[#3a7bd5] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center text-white text-sm font-bold">
            🎟
          </div>
          <span className="text-white font-bold text-lg tracking-wide">SMARTPASS</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#" className="text-white text-sm font-medium hover:underline">Event Listing</a>
          <a href="#" className="text-white text-sm font-medium hover:underline">My Events</a>
          <a href="#" className="text-white text-sm font-semibold border-b-2 border-white pb-0.5">Create Event</a>
          <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
            <span className="text-white text-sm font-mono">0×3F…D12</span>
            <div className="w-6 h-6 rounded-full bg-yellow-400" />
          </div>
        </div>
      </nav>

      {/* PAGE HEADER */}
      <div className="bg-[#3a7bd5] px-8 pb-5">
        <h1 className="text-white text-2xl font-bold">Ticket Minting</h1>
        <p className="text-white/70 text-sm mt-1">Create and mint your NFT tickets</p>
      </div>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl">
          <div className="border border-gray-200 rounded-lg p-8 bg-white shadow-sm">

            {/* EVENT OVERVIEW */}
            <div className="mb-8">
              <h2 className="text-base font-bold text-gray-800 mb-4">Event Overview</h2>
              <div className="flex gap-4 items-stretch">

                {/* EVENT CARD */}
                <div className="rounded-lg overflow-hidden border border-gray-200 w-64 flex-shrink-0">
                  {/* Event image placeholder */}
                  <div className="relative h-28 bg-gray-800 flex items-end">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="relative z-10 p-3">
                      <p className="text-white font-bold text-sm uppercase tracking-wide">"Image"</p>
                    </div>
                  </div>
                  <div className="bg-white px-3 py-2">
                    {/* <div className="flex items-center gap-1 mb-1">
                      <div className="w-4 h-4 rounded-full bg-[#2775ca] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">15 USDC</span>
                    </div> */}
                    <p className="text-xs text-gray-500 mb-2">1450 Tickets remaining</p>
                    <button className="text-xs text-[#3a7bd5] font-semibold flex items-center gap-1 hover:underline">
                      View Event Details <span>›</span>
                    </button>
                  </div>
                </div>

                {/* MINT TICKETS PANEL */}
                <div className="flex-1 border border-gray-200 rounded-lg p-4">
                  {/* TABS */}
                  <p className="text-sm font-bold text-gray-700 mb-3">Mint Tickets</p>
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-4 w-fit">
                    <button
                      onClick={() => setActiveTab("mint")}
                      className={`px-4 py-1.5 text-sm font-semibold transition-all ${
                        activeTab === "mint"
                          ? "bg-[#3a7bd5] text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Mint Tickets
                    </button>
                    <button
                      onClick={() => setActiveTab("settings")}
                      className={`px-4 py-1.5 text-sm font-semibold transition-all ${
                        activeTab === "settings"
                          ? "bg-[#3a7bd5] text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Mint Settings
                    </button>
                  </div>

                  {activeTab === "mint" ? (
                    <div className="flex flex-col gap-3">
                      {/* Number of tickets */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">
                          Number of Tickets to Mint
                        </label>
                        <Input
                          type="number"
                          value={ticketsToMint}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setTicketsToMint(Number(e.target.value))
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      {/* Ticket price */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">
                          Ticket Price (USDC)
                        </label>
                        <div className="flex items-center border border-gray-200 rounded-lg px-3 h-9 gap-2 bg-gray-50">
                          <div className="w-4 h-4 rounded-full bg-[#2775ca] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[8px] font-bold">$</span>
                          </div>
                          <input
                            type="number"
                            value={ticketPrice}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setTicketPrice(Number(e.target.value))
                            }
                            className="flex-1 bg-transparent text-sm font-semibold text-gray-700 outline-none"
                          />
                          <span className="text-xs text-gray-500 font-medium">USDC</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      Mint settings coming soon...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TICKETS TO MINT */}
            <div className="mb-8">
              <h2 className="text-base font-bold text-gray-800 mb-4">Tickets to Mint</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="col-span-1" />
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Price</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Quantity</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Supply</div>
                </div>

                {/* Tier rows */}
                {tiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="grid grid-cols-4 items-center px-4 py-3 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tier.selected}
                        onChange={() => toggleTier(tier.id)}
                        className="w-4 h-4 accent-[#3a7bd5] cursor-pointer"
                      />
                      <span className="text-sm font-medium text-gray-700">{tier.name}</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-[#2775ca] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{tier.price}</span>
                    </div>
                    <div className="text-center text-sm text-gray-600">{tier.quantity}</div>
                    <div className="text-center text-sm text-gray-600">{tier.supply}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* MINT BUTTON */}
            <div className="flex flex-col items-center gap-3">
  <ConnectWalletButton />
  <Button
    onClick={handleMint}
    className="bg-[#3a7bd5] hover:bg-[#2d63b0] text-white font-bold px-12 py-3 text-base rounded-lg"
  >
    Mint NFT Tickets
  </Button>
  <p className="text-xs text-gray-400">
    *Minting fee applies. Tickets are immutable once minted*
  </p>
</div>

          </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import { Navbar } from "@/components/Navbar";
import { TicketQRCode } from "@/components/TicketQRCode";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useOwnedTickets } from "@/hooks/useOwnedTickets";
import { useAccount } from "wagmi";

export default function MyTicketsPage() {
  const { isConnected: walletConnected } = useAccount();
  const hasMounted = useHasMounted();
  // Treat the wallet as disconnected until mount, so the first client render matches the server (#220)
  const isConnected = hasMounted && walletConnected;
  const { tickets, loading, error, reload } = useOwnedTickets();
  return (
    <div className="min-h-screen bg-[#f0f4fb] flex flex-col">
      <Navbar />

      <div className="bg-[#3a7bd5] px-8 pb-5">
        <h1 className="text-white text-2xl font-bold">My Tickets</h1>
        <p className="text-white/70 text-sm mt-1">Your NFT tickets and entry QR codes</p>
      </div>

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-4xl">
          {!isConnected ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center shadow-sm">
              <p className="text-gray-600 mb-4">Connect your wallet to see your tickets.</p>
              <div className="flex justify-center">
                <ConnectWalletButton />
              </div>
            </div>
          ) : loading ? (
            <p className="text-center text-gray-500">Loading your tickets…</p>
          ) : error ? (
            <div className="bg-white border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-600 text-sm mb-3">{error}</p>
              <button onClick={reload} className="text-sm font-semibold text-[#3a7bd5] hover:underline">
                Try again
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center shadow-sm">
              <p className="text-gray-600">You don&apos;t own any tickets yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {tickets.map((ticket) => (
                <div
                  key={ticket.tokenId.toString()}
                  className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Event #{ticket.eventId.toString()}
                      </p>
                      <p className="text-lg font-bold text-gray-900">
                        Ticket #{ticket.tokenId.toString()}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        ticket.isUsed ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {ticket.isUsed ? "Used" : "Valid"}
                    </span>
                  </div>

                  {ticket.isUsed ? (
                    <p className="text-sm text-gray-500 text-center py-6">
                      This ticket has already been checked in.
                    </p>
                  ) : (
                    <TicketQRCode tokenId={ticket.tokenId} eventId={ticket.eventId} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

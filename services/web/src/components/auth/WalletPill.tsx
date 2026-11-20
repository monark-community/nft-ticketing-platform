"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import { CopyLiftOff } from "@/components/motion/CopyLiftOff";
import { DrawnCheck } from "@/components/motion/DrawnCheck";
import { shortAddress } from "@/lib/format";

// Connected wallet with a green dot and a copy button (Figma: Sign in / Confirm signature)
export function WalletPill({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const [copies, setCopies] = useState(0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopies((count) => count + 1);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address is still visible
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-background py-1.5 pr-2.5 pl-3 shadow-[0_2px_4px_rgb(0_0_0/40%)]">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-success opacity-75 animate-pulse-dot" />
        <span className="relative size-2 rounded-full bg-success" />
      </span>
      {/* After copying, a faint copy of the address lifts off (#362) */}
      <CopyLiftOff copies={copies} className="font-mono text-[13px] leading-[18px] font-medium tracking-[0.05em] text-foreground">
        {shortAddress(address)}
      </CopyLiftOff>
      <button
        type="button"
        onClick={copy}
        className="rounded-xs p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
      >
        {copied ? <DrawnCheck className="size-3.5 text-success" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
    </span>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

// "Tx 0x7b21…e04d" with a copy button, under pending and finished purchases (Figma status frames).
// Links to the block explorer when the network has one (Sepolia does, the local node doesn't).
export function TxHash({ hash, explorerUrl, className }: { hash: string; explorerUrl?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context): nothing to do, the hash is still visible
    }
  }

  return (
    <p className={cn("flex items-center justify-center gap-1.5 type-mono-address text-secondary-foreground", className)}>
      <span>Tx</span>
      {explorerUrl ? (
        <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
          {short}
        </a>
      ) : (
        <span>{short}</span>
      )}
      <button
        type="button"
        onClick={copy}
        className="rounded-xs p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={copied ? "Transaction hash copied" : "Copy transaction hash"}
      >
        {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
    </p>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import { DrawnCheck } from "@/components/motion/DrawnCheck";
import { useFoldAway } from "@/components/motion/useFoldAway";
import { Spinner } from "@/components/ui/spinner";
import { useHasMounted } from "@/hooks/useHasMounted";
import { nextBannerState, SWITCHED_MS, type BannerState } from "@/lib/network-banner";
import { cn } from "@/lib/utils";

const SUPPORTED_CHAIN_IDS: readonly number[] = [sepolia.id, 31337];

// Wrong network banner, under the navbar (#364). It slides down and pushes the page while hazard
// stripes sweep across it once, like a barrier coming down. After switching it turns green with
// "Switched to Sepolia", stays for a second, then folds away.
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const hasMounted = useHasMounted();
  const wrong = hasMounted && isConnected && !!chainId && !SUPPORTED_CHAIN_IDS.includes(chainId);

  const [state, setState] = useState<BannerState>("hidden");
  const next = nextBannerState(state, wrong, isConnected);
  if (next !== state) setState(next); // follows the wallet during render, so the banner never lags a frame

  useEffect(() => {
    if (state !== "switched") return;
    const timer = setTimeout(() => setState("hidden"), SWITCHED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (next === "hidden") return null;
  return <Banner switched={next === "switched"} switching={isPending} onSwitch={() => switchChain({ chainId: sepolia.id })} />;
}

function Banner({ switched, switching, onSwitch }: { switched: boolean; switching: boolean; onSwitch: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFoldAway(ref, 200);

  return (
    <div ref={ref} role="status" className="unfold-in [animation-duration:200ms]">
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "flex w-full items-center justify-between gap-4 border-b px-6 py-3 transition-colors duration-base",
            switched ? "border-success/30 bg-success-bg" : "hazard-sweep border-border-accent bg-primary-tint"
          )}
        >
          {switched ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <DrawnCheck />
              Switched to Sepolia
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-primary-soft">Wrong network detected. Please switch to Sepolia testnet.</p>
              <button
                type="button"
                onClick={onSwitch}
                disabled={switching}
                aria-label={switching ? "Switching to Sepolia" : undefined}
                className="inline-flex min-w-[124px] shrink-0 items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-80"
              >
                {switching ? <Spinner className="size-3.5" /> : "Switch to Sepolia"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

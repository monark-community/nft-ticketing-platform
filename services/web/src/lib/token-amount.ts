// Formats on-chain amounts for display (#284). Amounts stay bigint (the token's smallest unit)
// everywhere else; only the text shown to the user is rounded.

import { formatUnits } from "viem";

// USDC uses 6 decimals (MockUSDC locally, real USDC on Sepolia). The page reads decimals()
// from the token anyway, and only falls back to this while that read is loading.
export const USDC_DECIMALS = 6;

// 15000000n (6 decimals) -> "15.00", 1450000000n -> "1,450.00"
export function formatTokenAmount(value: bigint, decimals: number, fractionDigits = 2): string {
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

// Network fees are tiny, so they get 4 decimals, and anything smaller shows as "<0.0001"
export function formatEth(wei: bigint): string {
  const eth = Number(formatUnits(wei, 18));
  if (eth > 0 && eth < 0.0001) return "<0.0001";
  return eth.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

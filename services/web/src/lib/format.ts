// Display helpers shared by every screen (#282: addresses are shown as 0x1234…abcd).

export function shortAddress(address: string | null | undefined): string {
  if (!address) return "";
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

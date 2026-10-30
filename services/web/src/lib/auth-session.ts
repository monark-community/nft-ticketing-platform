// The API session is a cookie, so it can still belong to the previous wallet after an account
// switch in MetaMask. A profile only counts as signed in for the wallet that is connected now.
export function isSessionForWallet(
  profile: { wallet_address: string } | null | undefined,
  address: string | undefined,
): boolean {
  if (!profile || !address) return false;
  return profile.wallet_address.toLowerCase() === address.toLowerCase();
}

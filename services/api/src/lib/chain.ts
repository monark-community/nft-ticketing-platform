import { ethers } from 'ethers';

// Read-only chain access. The API never signs transactions: admins grant and
// revoke roles from their own wallets, and these helpers only verify the result.
const ACCESS_CONTROL_ABI = ['function hasRole(bytes32 role, address account) view returns (bool)'];

export const ORGANIZER_ROLE = ethers.id('ORGANIZER_ROLE');

// Reads AccessControl.hasRole() through RPC_URL. Throws when the chain is not
// configured or cannot be reached; callers turn that into a 503 instead of
// trusting the database alone.
export async function hasRoleOnChain(role: string, wallet: string): Promise<boolean> {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    throw new Error('RPC_URL and CONTRACT_ADDRESS are required to check on-chain roles');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    const contract = new ethers.Contract(contractAddress, ACCESS_CONTROL_ABI, provider);
    return await contract.hasRole(role, wallet);
  } finally {
    provider.destroy();
  }
}

export function hasOrganizerRoleOnChain(wallet: string): Promise<boolean> {
  return hasRoleOnChain(ORGANIZER_ROLE, wallet);
}

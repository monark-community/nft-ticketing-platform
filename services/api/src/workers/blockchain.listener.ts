import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';

// NOTE: This ABI is derived from the events described in the API Design Doc (Section 6).
// It must be replaced with the actual compiled contract ABI once the smart contract is finalized.
const CONTRACT_ABI = [
  // ERC-721 standard transfer event
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',

  // Emitted when a new ticket NFT is minted
  'event TicketMinted(uint256 indexed tokenId, address indexed owner, uint256 indexed eventId)',

  // Emitted when a ticket is checked in at the event
  'event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner)',

  // Emitted when a whitelist entry is synced on-chain
  'event WhitelistUpdated(uint256 indexed eventId, address indexed wallet)',

  // Emitted when a scanner role is synced on-chain
  'event ScannerUpdated(uint256 indexed eventId, address indexed wallet)',
];

export async function startBlockchainListener(): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    console.warn('Blockchain listener not started: RPC_URL or CONTRACT_ADDRESS is missing from environment.');
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

  console.log(`Blockchain listener connected to contract ${contractAddress}`);

  // ERC-721 Transfer — update ticket ownership when a ticket is transferred
  contract.on('Transfer', async (from: string, to: string, tokenId: bigint) => {
    // Ignore mint events (from zero address) — handled by TicketMinted
    if (from === ethers.ZeroAddress) return;

    try {
      await prisma.ticket.updateMany({
        where: { token_id: tokenId },
        data: { owner_wallet: to.toLowerCase() },
      });
      console.log(`Transfer: token ${tokenId} ownership updated to ${to}`);
    } catch (err) {
      console.error(`Transfer handler error for token ${tokenId}:`, err);
    }
  });

  // TicketMinted — insert a new ticket row when a ticket is minted on-chain
  contract.on('TicketMinted', async (tokenId: bigint, owner: string, eventId: bigint) => {
    try {
      const event = await prisma.event.findFirst({
        where: { contract_event_id: eventId },
        include: { ticket_types: true },
      });

      if (!event) {
        console.warn(`TicketMinted: no event found for contract_event_id ${eventId}`);
        return;
      }

      const defaultTicketType = event.ticket_types[0];
      if (!defaultTicketType) {
        console.warn(`TicketMinted: no ticket type found for event ${event.id}`);
        return;
      }

      await prisma.ticket.upsert({
        where: { token_id: tokenId },
        update: { owner_wallet: owner.toLowerCase() },
        create: {
          token_id: tokenId,
          event_id: event.id,
          ticket_type_id: defaultTicketType.id,
          owner_wallet: owner.toLowerCase(),
        },
      });

      console.log(`TicketMinted: token ${tokenId} minted for event ${event.id} to ${owner}`);
    } catch (err) {
      console.error(`TicketMinted handler error for token ${tokenId}:`, err);
    }
  });

  // TicketCheckedIn — mark ticket as USED and log the check-in
  contract.on('TicketCheckedIn', async (tokenId: bigint, scanner: string) => {
    try {
      const now = new Date();

      await prisma.ticket.updateMany({
        where: { token_id: tokenId },
        data: { status: 'USED', used_at: now },
      });

      await prisma.checkinLog.create({
        data: {
          token_id: tokenId,
          scanner_wallet: scanner.toLowerCase(),
        },
      });

      console.log(`TicketCheckedIn: token ${tokenId} checked in by ${scanner}`);
    } catch (err) {
      console.error(`TicketCheckedIn handler error for token ${tokenId}:`, err);
    }
  });

  // WhitelistUpdated — mark the whitelist entry as synced to chain
  contract.on('WhitelistUpdated', async (eventId: bigint, wallet: string) => {
    try {
      const event = await prisma.event.findFirst({
        where: { contract_event_id: eventId },
      });

      if (!event) return;

      await prisma.whitelist.updateMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
        data: { synced_to_chain: true },
      });

      console.log(`WhitelistUpdated: wallet ${wallet} synced for event ${event.id}`);
    } catch (err) {
      console.error(`WhitelistUpdated handler error:`, err);
    }
  });

  // ScannerUpdated — mark the scanner entry as synced to chain
  contract.on('ScannerUpdated', async (eventId: bigint, wallet: string) => {
    try {
      const event = await prisma.event.findFirst({
        where: { contract_event_id: eventId },
      });

      if (!event) return;

      await prisma.scanner.updateMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
        data: { synced_to_chain: true },
      });

      console.log(`ScannerUpdated: wallet ${wallet} synced for event ${event.id}`);
    } catch (err) {
      console.error(`ScannerUpdated handler error:`, err);
    }
  });

  provider.on('error', (err) => {
    console.error('Blockchain provider error:', err);
  });
}

import { ethers } from 'ethers';

// TicketNFT as the API sees it: the events the blockchain listener syncs and the read-only calls
// used to copy an event's on-chain setup. The API never sends transactions.
// Keep these in line with packages/contracts/contracts/TicketNFT.sol.
export const TICKET_NFT_ABI = [
  // ERC-721
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',

  // Tickets
  'event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed to, string tokenURI)',
  'event TicketPurchased(uint256 indexed tokenId, uint256 indexed eventId, uint256 typeId, address indexed buyer, uint256 price)',
  'event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner)',

  // Event setup and sales
  'event EventConfigured(uint256 indexed eventId, address indexed organizer, uint256 endTime, uint256 royaltyBps, uint256 resaleCapBps, uint256 perWalletLimit)',
  'event TicketTypeConfigured(uint256 indexed eventId, uint256 indexed typeId, uint256 price, uint256 maxSupply, string metadataURI)',
  'event SaleStatusUpdated(uint256 indexed eventId, bool active)',
  'event PresaleStatusUpdated(uint256 indexed eventId, bool active)',
  'event RevenueWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount)',

  // Guest list and door staff
  'event WhitelistUpdated(uint256 indexed eventId, address indexed wallet, bool status)',
  'event ScannerUpdated(uint256 indexed eventId, address indexed wallet, bool status)',

  // Resale
  'event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event ListingCancelled(uint256 indexed tokenId, address indexed seller)',
  'event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price)',

  // Reads
  'function eventOrganizer(uint256 eventId) view returns (address)',
  'function eventConfigs(uint256 eventId) view returns (uint256 endTime, uint256 resaleCapBps, uint256 ticketTypeCount, uint256 sold, bool configured, bool active, uint256 perWalletLimit)',
  'function royaltyPercentage(uint256 eventId) view returns (uint256)',
  'function presaleActive(uint256 eventId) view returns (bool)',
  'function ticketTypes(uint256 eventId, uint256 typeId) view returns (uint256 price, uint256 maxSupply, uint256 sold, uint256 issued, string metadataURI)',
];

// USDC has 6 decimals (MockUSDC matches). Prices on the contract are in USDC's smallest unit;
// the database stores them in USDC, like the organizer typed them.
export const USDC_DECIMALS = 6;

export function toUsdc(amount: bigint): string {
  return ethers.formatUnits(amount, USDC_DECIMALS);
}

// The contract's unix timestamps as dates
export function fromUnixSeconds(seconds: bigint): Date {
  return new Date(Number(seconds) * 1000);
}

// A ticket type's metadata URI is ipfs://<the CID the API pinned when the event was frozen>
export function ipfsHashFromUri(uri: string): string | null {
  return uri.startsWith('ipfs://') ? uri.slice('ipfs://'.length) || null : null;
}

export function isChainConfigured(): boolean {
  return Boolean(process.env.RPC_URL && process.env.CONTRACT_ADDRESS);
}

export function readOnlyContract(provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(process.env.CONTRACT_ADDRESS!, TICKET_NFT_ABI, provider);
}

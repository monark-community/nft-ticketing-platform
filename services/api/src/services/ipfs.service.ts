import { PinataSDK } from 'pinata';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let pinata: PinataSDK | null = null;

export function getPinataClient(): PinataSDK {
  if (pinata) return pinata;
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error('PINATA_JWT is not configured');
  }
  pinata = new PinataSDK({
    pinataJwt: jwt,
    pinataGateway: process.env.PINATA_GATEWAY ?? 'gateway.pinata.cloud',
  });
  return pinata;
}

/** Reset the cached client (used by tests). */
export function resetPinataClient(): void {
  pinata = null;
}

export async function pinImageToIPFS(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}. Allowed: PNG, JPG, WebP`);
  }
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds maximum allowed size of 10 MB');
  }

  const client = getPinataClient();
  const file = new File([fileBuffer], fileName, { type: mimeType });
  const result = await client.upload.file(file);
  return result.cid;
}

export async function pinMetadataToIPFS(metadata: Record<string, unknown>): Promise<string> {
  const client = getPinataClient();
  const result = await client.upload.json(metadata);
  return result.cid;
}

export interface EventMetadataInput {
  title: string;
  description?: string | null;
  location?: string | null;
  start_date: Date | string;
  end_date?: Date | string | null;
}

export function buildEventMetadata(event: EventMetadataInput, imageCid: string): Record<string, unknown> {
  return {
    name: event.title,
    description: event.description ?? '',
    image: `ipfs://${imageCid}`,
    attributes: {
      location: event.location ?? null,
      start_date: event.start_date instanceof Date ? event.start_date.toISOString() : event.start_date,
      end_date:
        event.end_date instanceof Date
          ? event.end_date.toISOString()
          : (event.end_date ?? null),
    },
  };
}

export interface TicketTypeMetadataInput {
  id: string;
  name: string;
  description?: string | null;
  price: unknown;
  supply: number;
}

export function buildTicketMetadata(
  ticketType: TicketTypeMetadataInput,
  event: EventMetadataInput,
  imageCid: string
): Record<string, unknown> {
  return {
    name: `${event.title} — ${ticketType.name}`,
    description: ticketType.description ?? '',
    image: `ipfs://${imageCid}`,
    attributes: [
      { trait_type: 'Event', value: event.title },
      { trait_type: 'Tier', value: ticketType.name },
      { trait_type: 'Price', value: String(ticketType.price) },
      { trait_type: 'Supply', value: ticketType.supply },
    ],
  };
}

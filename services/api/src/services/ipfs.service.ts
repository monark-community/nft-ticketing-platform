import { PinataSDK } from 'pinata';
import { Readable } from 'stream';

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT as string,
  pinataGateway: 'gateway.pinata.cloud',
});

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

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

  const file = new File([fileBuffer], fileName, { type: mimeType });
  const result = await pinata.upload.public.file(file);
  return result.cid;
}

export async function pinMetadataToIPFS(metadata: Record<string, unknown>): Promise<string> {
  const result = await pinata.upload.public.json(metadata);
  return result.cid;
}

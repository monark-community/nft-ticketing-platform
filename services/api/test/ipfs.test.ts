import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  pinImageToIPFS,
  pinMetadataToIPFS,
  buildEventMetadata,
  buildTicketMetadata,
  resetPinataClient,
} from '../src/services/ipfs.service';
import { resetDb, createUser, createEvent, createTicketType } from './helpers/db';
import { authCookie } from './helpers/auth';

// Fake Pinata SDK: records calls and returns predictable CIDs, never touches the network
const pinata = vi.hoisted(() => ({
  config: vi.fn(),
  uploadFile: vi.fn(),
  uploadJson: vi.fn(),
}));

vi.mock('pinata', () => ({
  PinataSDK: class {
    upload = { file: pinata.uploadFile, json: pinata.uploadJson };
    constructor(config: unknown) {
      pinata.config(config);
    }
  },
}));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.clearAllMocks();
  resetPinataClient();
  pinata.uploadFile.mockResolvedValue({ cid: 'bafy-image' });
  pinata.uploadJson.mockImplementation(async (metadata: { name: string }) => ({ cid: `bafy-${metadata.name}` }));
});

afterEach(() => vi.unstubAllEnvs());

describe('pinImageToIPFS', () => {
  it('uploads the image and returns its CID', async () => {
    const cid = await pinImageToIPFS(png, 'poster.png', 'image/png');

    expect(cid).toBe('bafy-image');
    const file = pinata.uploadFile.mock.calls[0][0] as File;
    expect(file.name).toBe('poster.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(png.length);
  });

  it('sets up Pinata with the JWT and the default gateway', async () => {
    await pinImageToIPFS(png, 'poster.png', 'image/png');
    expect(pinata.config).toHaveBeenCalledWith({
      pinataJwt: 'test-pinata-jwt',
      pinataGateway: 'gateway.pinata.cloud',
    });
  });

  it('rejects unsupported file types without uploading', async () => {
    await expect(pinImageToIPFS(png, 'poster.gif', 'image/gif')).rejects.toThrow(/Unsupported file type/);
    expect(pinata.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects files over 10 MB without uploading', async () => {
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(pinImageToIPFS(huge, 'huge.png', 'image/png')).rejects.toThrow(/10 MB/);
    expect(pinata.uploadFile).not.toHaveBeenCalled();
  });

  it('fails clearly when PINATA_JWT is missing', async () => {
    vi.stubEnv('PINATA_JWT', '');
    await expect(pinImageToIPFS(png, 'poster.png', 'image/png')).rejects.toThrow('PINATA_JWT is not configured');
  });
});

describe('metadata', () => {
  const event = {
    title: 'Launch Party',
    description: 'A night out',
    location: 'Montreal',
    start_date: new Date('2030-01-01T20:00:00Z'),
    end_date: null,
  };

  it('pins JSON metadata and returns its CID', async () => {
    const cid = await pinMetadataToIPFS({ name: 'thing' });
    expect(cid).toBe('bafy-thing');
    expect(pinata.uploadJson).toHaveBeenCalledWith({ name: 'thing' });
  });

  it('builds event metadata that points at the image', () => {
    expect(buildEventMetadata(event, 'bafy-image')).toEqual({
      name: 'Launch Party',
      description: 'A night out',
      image: 'ipfs://bafy-image',
      attributes: { location: 'Montreal', start_date: '2030-01-01T20:00:00.000Z', end_date: null },
    });
  });

  it('builds ticket metadata with the tier, price and supply', () => {
    const metadata = buildTicketMetadata(
      { id: 'tt-1', name: 'VIP', description: null, price: '100', supply: 50 },
      event,
      'bafy-image'
    );
    expect(metadata).toMatchObject({ name: 'Launch Party — VIP', image: 'ipfs://bafy-image' });
    expect(metadata.attributes).toEqual([
      { trait_type: 'Event', value: 'Launch Party' },
      { trait_type: 'Tier', value: 'VIP' },
      { trait_type: 'Price', value: '100' },
      { trait_type: 'Supply', value: 50 },
    ]);
  });
});

describe('POST /api/events/:id/freeze', () => {
  let cookie: string;
  let eventId: string;

  beforeEach(async () => {
    await resetDb();
    const organizer = await createUser({ role: 'ORGANIZER' });
    cookie = authCookie(organizer.wallet_address, 'ORGANIZER');
    const event = await createEvent(organizer.wallet_address, { title: 'Launch Party' });
    eventId = event.id;
    await createTicketType(event.id, { name: 'General' });
    await createTicketType(event.id, { name: 'VIP' });
  });

  const freeze = () =>
    request(app)
      .post(`/api/events/${eventId}/freeze`)
      .set('Cookie', cookie)
      .attach('image', png, { filename: 'poster.png', contentType: 'image/png' });

  it('pins the image, event metadata and one metadata file per ticket type', async () => {
    const res = await freeze();

    expect(res.status).toBe(200);
    expect(pinata.uploadFile).toHaveBeenCalledTimes(1);
    expect(pinata.uploadJson).toHaveBeenCalledTimes(3);
    expect(res.body.ipfs_hash).toBe('bafy-Launch Party');
    expect(res.body.ipfs_uri).toBe('ipfs://bafy-Launch Party');

    const event = await prisma.event.findUnique({ where: { id: eventId }, include: { ticket_types: true } });
    expect(event!.status).toBe('FROZEN');
    expect(event!.ipfs_hash).toBe('bafy-Launch Party');
    expect(event!.ticket_types.map((t) => t.ipfs_hash).sort()).toEqual([
      'bafy-Launch Party — General',
      'bafy-Launch Party — VIP',
    ]);
  });

  it('returns 502 and leaves the event as DRAFT when Pinata fails', async () => {
    pinata.uploadJson.mockRejectedValue(new Error('Pinata is down'));

    const res = await freeze();
    expect(res.status).toBe(502);

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe('DRAFT');
    expect(event!.ipfs_hash).toBeNull();
  });

  it('returns 500 and leaves the event as DRAFT when PINATA_JWT is missing', async () => {
    vi.stubEnv('PINATA_JWT', '');

    const res = await freeze();
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('PINATA_JWT is not configured');

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe('DRAFT');
  });
});

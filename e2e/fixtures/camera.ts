// A fake camera for the scanner: Chromium plays a video made by the test, showing QR codes.
// Chromium only reads its fake camera file at launch, so the scanner gets its own browser
// (see the scanner fixture in test.ts).

import fs from 'node:fs';
import { ethers } from 'ethers';
import QRCode from 'qrcode';

import type { Account } from './accounts.js';
import { addresses } from './chain.js';

// Small and slow on purpose: the file holds every frame uncompressed (about 0.25 MB each)
const WIDTH = 480;
const HEIGHT = 360;
const FPS = 5;

/** What the camera shows: a QR code with this text, or nothing (null), for `seconds` */
export interface CameraScene {
  qr: string | null;
  seconds?: number; // default 2
}

// One frame in Y4M (4:2:0): a QR code drawn in the middle, or an empty grey picture
function frame(text: string | null): Buffer {
  const y = Buffer.alloc(WIDTH * HEIGHT, text ? 235 : 120);
  if (text) {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const quiet = 4;
    const cells = modules.size + quiet * 2;
    const scale = Math.floor(Math.min(WIDTH, HEIGHT) * 0.85 / cells);
    const left = Math.floor((WIDTH - cells * scale) / 2);
    const top = Math.floor((HEIGHT - cells * scale) / 2);
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.get(row, col)) continue;
        const x0 = left + (col + quiet) * scale;
        const y0 = top + (row + quiet) * scale;
        for (let dy = 0; dy < scale; dy++) y.fill(16, (y0 + dy) * WIDTH + x0, (y0 + dy) * WIDTH + x0 + scale);
      }
    }
  }
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128);
  return Buffer.concat([Buffer.from('FRAME\n'), y, chroma]);
}

/** Writes a Y4M video of the scenes, played in a loop by Chromium's fake camera */
export function writeCameraVideo(file: string, scenes: CameraScene[]) {
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420jpeg\n`)];
  for (const scene of scenes) {
    const one = frame(scene.qr);
    for (let i = 0; i < Math.max(1, Math.round((scene.seconds ?? 2) * FPS)); i++) parts.push(one);
  }
  fs.writeFileSync(file, Buffer.concat(parts));
}

/** Chromium flags that use the video as the camera and allow it without a prompt */
export const fakeCameraArgs = (videoFile: string) => [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${videoFile}`,
];

/**
 * The entry QR code a ticket's owner shows at the door, signed the same way as My Tickets does
 * (services/web/src/lib/ticket-qr.ts). Pass an older `timestamp` for an expired code.
 */
export async function entryQr(owner: Account, tokenId: bigint | number, eventId: bigint | number, timestamp = Math.floor(Date.now() / 1000)) {
  const data = {
    tokenId: tokenId.toString(),
    eventId: eventId.toString(),
    contractAddress: addresses().TicketNFT,
    chainId: addresses().chainId,
    timestamp,
  };
  const message =
    `NFTOKENPASS check-in | contract: ${data.contractAddress}` +
    ` | chain: ${data.chainId}` +
    ` | token: ${data.tokenId}` +
    ` | event: ${data.eventId}` +
    ` | time: ${data.timestamp}`;
  const signature = await new ethers.Wallet(owner.privateKey).signMessage(message);
  return JSON.stringify({ ...data, signature });
}

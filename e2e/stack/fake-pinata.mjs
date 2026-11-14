// A stand-in for Pinata, so freezing an event works without a real Pinata key.
// The API uploads to it through PINATA_UPLOAD_URL (the same SDK calls as in production), and the web
// app shows the images from it through NEXT_PUBLIC_IPFS_GATEWAY.
//   POST /files      the SDK's upload (a multipart form with the file), answers like Pinata
//   GET  /ipfs/:cid  serves what was uploaded

import { createHash } from 'node:crypto';
import http from 'node:http';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

// Looks like a CIDv1 and is the same for the same bytes, which is all the app needs
const cidFor = (bytes) => `bafkrei${base32(createHash('sha256').update(bytes).digest()).slice(0, 52)}`;

// The file part of a multipart/form-data body
function filePart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!match) return { bytes: body, type: 'application/octet-stream', name: 'file' };
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length + 2, next - 2); // skip CRLF after the boundary and before the next
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      if (/name="file"/i.test(head)) {
        return {
          bytes: part.subarray(split + 4),
          type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream',
          name: /filename="([^"]*)"/i.exec(head)?.[1] ?? 'file',
        };
      }
    }
    start = next;
  }
  return null;
}

export function startFakePinata(port) {
  const files = new Map(); // cid -> { bytes, type }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/files') {
        const file = filePart(Buffer.concat(chunks), req.headers['content-type']);
        if (!file) {
          res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'No file in the upload' }));
          return;
        }
        const cid = cidFor(file.bytes);
        files.set(cid, { bytes: file.bytes, type: file.type });
        const data = {
          id: cid,
          name: file.name,
          cid,
          size: file.bytes.length,
          number_of_files: 1,
          mime_type: file.type,
          group_id: null,
          keyvalues: {},
          created_at: new Date().toISOString(),
          network: 'public',
        };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data }));
        return;
      }
      const ipfs = /^\/ipfs\/([^/]+)$/.exec(url.pathname);
      if ((req.method === 'GET' || req.method === 'HEAD') && ipfs) {
        const file = files.get(ipfs[1]);
        if (!file) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'content-type': file.type, 'content-length': file.bytes.length, 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : file.bytes);
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, files }));
  });
}

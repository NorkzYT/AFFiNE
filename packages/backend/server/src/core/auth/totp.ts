import { randomBytes, createHmac } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(length = 32): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const c of cleaned) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) {
      throw new Error('Invalid base32 character');
    }
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, time = Date.now(), step = 30): string {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = code % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotp(
  secret: string,
  token: string,
  window = 1,
  step = 30
): boolean {
  token = token.replace(/\s+/g, '');
  const now = Date.now();
  for (let error = -window; error <= window; error++) {
    const time = now + error * step * 1000;
    if (totp(secret, time, step) === token) return true;
  }
  return false;
}

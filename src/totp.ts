import crypto from "node:crypto";

export function generateTotp(secret: string, timestampMs = Date.now()): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);

  counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/[\s=]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error("GOOGLE_TOTP_SECRET must be a base32 authenticator secret.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

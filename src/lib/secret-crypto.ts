import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("SECRET_INVENTORY_ENCRYPTION_KEY is required");
  }

  return createHash("sha256").update(key, "utf8").digest();
}

export function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "hidden";
  }

  if (trimmed.length <= 4) {
    return "****";
  }

  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}****${suffix}`;
}

export function encryptSecretValue(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((chunk) => chunk.toString("base64")).join(".");
}

export function decryptSecretValue(payload: string): string {
  const invalidPayloadError = new Error("Invalid secret payload");
  const [ivPart, tagPart, dataPart, extra] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart || extra) {
    throw invalidPayloadError;
  }

  let iv: Buffer;
  let tag: Buffer;
  let encrypted: Buffer;
  try {
    iv = Buffer.from(ivPart, "base64");
    tag = Buffer.from(tagPart, "base64");
    encrypted = Buffer.from(dataPart, "base64");
  } catch {
    throw invalidPayloadError;
  }

  if (iv.length !== IV_LENGTH || tag.length !== 16 || encrypted.length === 0) {
    throw invalidPayloadError;
  }

  const key = getEncryptionKey();

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw invalidPayloadError;
  }
}

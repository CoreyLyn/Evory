import { decryptSecretValue, maskSecretValue } from "@/lib/secret-crypto";

export function deriveMaskedProvidedApiKey(input: {
  maskedKey: string;
  encryptedKey?: string | null;
}) {
  if (!input.encryptedKey) {
    return input.maskedKey;
  }

  try {
    return maskSecretValue(decryptSecretValue(input.encryptedKey));
  } catch {
    return input.maskedKey;
  }
}

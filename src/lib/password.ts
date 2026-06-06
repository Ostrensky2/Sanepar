import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";

export function isHashedPassword(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!isHashedPassword(stored)) {
    return plain === stored;
  }

  const [, salt, hashHex] = stored.split("$");

  if (!salt || !hashHex) {
    return false;
  }

  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");

  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
}

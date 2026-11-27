import { createHash } from "node:crypto";

/**
 * JSON canônico "yvae-canonical-json/1": chaves em ordem, sem espaços, números
 * finitos e texto Unicode bem formado. Os dois lados da conexão calculam o
 * mesmo resumo a partir dele.
 */
export function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new Error("invalid_unicode");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error("invalid_number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${canonical(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("invalid_json");
}

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export const digest = (value: unknown) => sha256(canonical(value));

import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const METHODOLOGY_PDF_SHA256="f8341a71ef3dc43911c35306e032488e0f06e4efaeea0ab1750985d1ea671824";
const SIZE=797812;

export function verifyMethodologyPdf(bytes:Uint8Array) {
  if(bytes.byteLength!==SIZE||Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-"||createHash("sha256").update(bytes).digest("hex")!==METHODOLOGY_PDF_SHA256)throw new Error("PDF privado indisponível ou divergente.");
}

// Literal private asset, outside web/public and build output. Future deployment must
// provision this exact private asset; absence fails closed (no Dropbox/public fallback).
export async function readPrivateMethodologyPdf() {
  const file=path.resolve(process.cwd(),"../private-results",`Metodologia.pdf.${METHODOLOGY_PDF_SHA256.toUpperCase()}`);
  const bytes=await readFile(file);
  verifyMethodologyPdf(bytes);
  return bytes;
}

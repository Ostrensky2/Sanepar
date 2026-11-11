/**
 * Conversa do aparelho com a nuvem para a planilha do Biolog (rota
 * /api/field-diary/biolog-export). As regras da planilha ficam em lib/biolog-export.
 */

import type { FieldParameter, FieldReading } from "@/lib/field-parameters";
import { readParameters, readReadings } from "@/lib/field-parameters-client";
import type { FieldSample } from "@/lib/field-samples";
import { readSamples } from "@/lib/field-samples-client";

const REQUEST_TIMEOUT_MS = 45000;

export type BiologExportData =
  | {
      ok: true;
      /** false = o banco ainda não recebeu a atualização das amostras do ponto. */
      available: boolean;
      samples: FieldSample[];
      readings: FieldReading[];
      parameters: FieldParameter[];
    }
  | { ok: false; error: string };

export type MarkExportedResult =
  /** `saved: false` = o banco ainda não tem a marca; a planilha vale do mesmo jeito. */
  | { ok: true; saved: boolean; marked: number }
  | { ok: false; reason: "permission" | "session" | "failure" };

/** Amostras e medições de todos os registros das campanhas dadas (pelo nome que está nos registros). */
export async function fetchBiologExportData(campaignNames: string[]): Promise<BiologExportData> {
  const names = [...new Set(campaignNames.map((name) => name.trim()).filter(Boolean))];

  if (!names.length) {
    return { ok: true, available: true, samples: [], readings: [], parameters: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const query = names.map((name) => `campaign=${encodeURIComponent(name)}`).join("&");
    const response = await fetch(`/api/field-diary/biolog-export?${query}`, { cache: "no-store", signal: controller.signal });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? "Sua sessão expirou. Entre de novo no sistema e gere a planilha outra vez."
            : (typeof payload.error === "string" && payload.error.trim()) ||
              `Não foi possível ler as amostras da campanha (erro ${response.status}).`,
      };
    }

    return {
      ok: true,
      available: payload.available === true,
      samples: readSamples(payload.samples),
      readings: readReadings(payload.readings),
      parameters: readParameters(payload.parameters),
    };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor para ler as amostras da campanha." };
  } finally {
    clearTimeout(timer);
  }
}

/** Marca as amostras que saíram na planilha: o código delas deixa de mudar. */
export async function markSamplesExported(sampleIds: string[]): Promise<MarkExportedResult> {
  if (!sampleIds.length) {
    return { ok: true, saved: true, marked: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/field-diary/biolog-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleIds }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: response.status === 403 ? "permission" : response.status === 401 ? "session" : "failure" };
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    return { ok: true, saved: payload.available === true, marked: Number(payload.marked) || 0 };
  } catch {
    return { ok: false, reason: "failure" };
  } finally {
    clearTimeout(timer);
  }
}

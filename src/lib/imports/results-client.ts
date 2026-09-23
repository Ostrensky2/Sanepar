export const RESULTS_IMPORT_TIMEOUT_MS = 60_000;

export function formatResultsImportError(status: number, serverError: string) {
  if (status === 409 || status === 422) {
    return `A planilha não foi importada. ${serverError} Preencha o campo indicado ou use o arquivo correto.`;
  }

  return serverError;
}

export async function readResultsApiPayload<T>(
  response: Response,
  fallbackError: string,
): Promise<T | { error: string }> {
  const body = await response.text();

  if (!body.trim()) {
    return { error: fallbackError };
  }

  try {
    const payload: unknown = JSON.parse(body);
    return payload && typeof payload === "object"
      ? payload as T | { error: string }
      : { error: fallbackError };
  } catch {
    // A Vercel recusa corpos acima de 4,5 MB antes de chegar ao app, com texto puro.
    if (response.status === 413) {
      return { error: "A planilha é grande demais para o envio direto ao servidor (limite de 4,5 MB). Recarregue a página e tente novamente." };
    }
    return {
      error: response.ok
        ? "O servidor devolveu uma resposta inválida após processar a planilha. Tente novamente."
        : fallbackError,
    };
  }
}

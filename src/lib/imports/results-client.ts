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
    return {
      error: response.ok
        ? "O servidor devolveu uma resposta inválida após processar a planilha. Tente novamente."
        : fallbackError,
    };
  }
}

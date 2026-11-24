import { redirect } from "next/navigation";
import type { ResultsQuery } from "@/components/capture-results-entry";

/** Endereço antigo. Os resultados do índice de captação ficam só em Resultados; links salvos continuam funcionando. */
export default async function CaptureIndexPage({ searchParams }: { searchParams: Promise<ResultsQuery> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  const search = query.toString();
  redirect(`/campanhas/resultados${search ? `?${search}` : ""}`);
}

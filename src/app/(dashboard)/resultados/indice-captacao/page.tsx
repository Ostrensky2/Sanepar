import { CaptureResultsEntry, type ResultsQuery } from "@/components/capture-results-entry";

export default async function CaptureIndexPage({searchParams}: {searchParams:Promise<ResultsQuery>}) {
  return <CaptureResultsEntry query={await searchParams} path="/resultados/indice-captacao"/>;
}

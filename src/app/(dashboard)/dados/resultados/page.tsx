import { SpreadsheetRepository } from "@/components/spreadsheet-repository";
import { PageHeader } from "@/components/page-header";

export default function DadosResultadosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Entrada de dados"
        title="Planilhas de resultados"
        description="Importe e acompanhe as publicações laboratoriais usadas pelos resultados de cada campanha."
      />
      <SpreadsheetRepository view="resultados" />
    </div>
  );
}

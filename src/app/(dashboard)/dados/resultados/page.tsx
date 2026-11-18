import { SpreadsheetRepository } from "@/components/spreadsheet-repository";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosResultadosPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central de dados" title="Planilhas de resultados" description="Prepare matrizes por campanha e consulte o acervo interno." tabs={<SectionTabs />} />
      <SpreadsheetRepository />
    </div>
  );
}

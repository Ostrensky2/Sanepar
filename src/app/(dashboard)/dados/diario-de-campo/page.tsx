import { FieldDiaryPageContent } from "@/components/field-diary-page-content";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosDiarioDeCampoPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central de dados" title="Diário de campo" description="Registros de cada dia de coleta. Importe a planilha de campo ou crie registros um a um." tabs={<SectionTabs />} />
      <FieldDiaryPageContent />
    </div>
  );
}

import { ImportConflictsPageContent } from "@/components/import-conflicts-page-content";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosPendenciasPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central de dados" title="Pendências de importação" description="Conflitos entre a planilha e o app. Nada é sobrescrito sem a sua decisão." tabs={<SectionTabs />} />
      <ImportConflictsPageContent />
    </div>
  );
}

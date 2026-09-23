import { DataHub } from "@/components/data-hub";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosIndexPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de dados"
        description="O que já foi lançado e o que falta em cada campanha."
        tabs={<SectionTabs />}
      />
      <DataHub />
    </div>
  );
}

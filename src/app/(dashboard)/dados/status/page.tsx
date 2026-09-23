import { CampaignStatusEntryPanel } from "@/components/campaign-status-entry-panel";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosStatusPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central de dados" title="Fase e etapas da campanha" description="Atualize a fase, as datas e as etapas. As alterações são salvas automaticamente." tabs={<SectionTabs />} />
      <CampaignStatusEntryPanel />
    </div>
  );
}

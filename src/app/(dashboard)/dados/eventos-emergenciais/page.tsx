import { EmergencyEventsPanel } from "@/components/emergency-events-panel";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosEventosEmergenciaisPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Central de dados"
        title="Eventos emergenciais"
        description="Idas a campo fora da rotina das campanhas: o problema informado, o que foi feito no local e a descrição do fato."
        tabs={<SectionTabs />}
      />
      <EmergencyEventsPanel />
    </div>
  );
}

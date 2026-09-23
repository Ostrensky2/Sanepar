import { PointActionsRegisterPage } from "@/components/point-actions-register-page";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function DadosAcoesPontuaisPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Atividades complementares" title="Registrar atividade complementar" description="Registre uma nova atividade pedida pela Sanepar, com pontos, fotos e documento." tabs={<SectionTabs />} />
      <PointActionsRegisterPage />
    </div>
  );
}

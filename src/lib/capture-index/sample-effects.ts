import type { CaptureIndexView } from "./index";
import { componentLabels, DEVELOPING_LABEL, developingEffects, effects, matchCard } from "./effect-catalog";

export function sampleEffects(row: CaptureIndexView) {
  return effects.map(effect => {
    const marker = effect.component && componentLabels[effect.component];
    const library = row.components.find(item => item.name === marker);
    const contributions = row.domains.flatMap(domain => domain.contributions
      .filter(item => item.positive && matchCard(item.ficha, domain.key, item.componentCode) === effect.id)
      .map(item => ({item, determining: item.componentCode === domain.componentCode})));
    const alerts = row.alerts.filter(item => item.lowSupport &&
      matchCard(item.ficha, item.domainCode, item.componentCode) === effect.id);
    const usable = library?.status === "disponível";
    const status = developingEffects.has(effect.id) ? DEVELOPING_LABEL
      : !marker ? "Não avaliado pelo método"
      : !usable ? `Biblioteca ${library?.status ?? "não informada"}`
      : contributions.length ? "Contribuição documentada"
      : "Nenhuma contribuição documentada para este tipo nesta amostra";
    return {effect, marker, usable, status, contributions, alerts};
  });
}

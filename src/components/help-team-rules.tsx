import { ClipboardCheck } from "lucide-react";
import type { TeamRule } from "@/lib/help-content";

/**
 * Regras que valem para toda a equipe, em destaque. Na Ajuda ficam no alto, antes
 * dos módulos; no painel "?" aparecem as que valem para a tela aberta.
 */
export function HelpTeamRules({
  rules,
  compact = false,
}: {
  rules: TeamRule[];
  /** Painel "?": uma regra embaixo da outra, com os passos recolhidos. */
  compact?: boolean;
}) {
  if (!rules.length) {
    return null;
  }

  // Na Ajuda o bloco é uma seção da página (h2); no painel "?", uma seção do painel (h3).
  const Title = compact ? "h3" : "h2";
  const RuleTitle = compact ? "h4" : "h3";

  return (
    <section
      aria-labelledby={compact ? "help-team-rules-drawer-title" : "help-team-rules-title"}
      className="rounded-2xl border-2 border-[rgba(197,122,0,0.45)] bg-[rgba(197,122,0,0.06)] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="type-eyebrow text-amber-800">Vale para todos</p>
          <Title
            id={compact ? "help-team-rules-drawer-title" : "help-team-rules-title"}
            className={
              compact
                ? "text-base font-black text-[var(--brand-navy-strong)]"
                : "heading-font type-section-title text-[var(--brand-navy-strong)]"
            }
          >
            Regras para toda a equipe
          </Title>
        </div>
      </div>

      <div className={compact ? "mt-3 grid gap-3" : "mt-4 grid gap-3 lg:grid-cols-3"}>
        {rules.map((rule) => (
          <article key={rule.title} className="rounded-xl border border-[rgba(197,122,0,0.24)] bg-white p-4">
            <RuleTitle className="text-sm font-black leading-6 text-[var(--brand-navy-strong)]">{rule.title}</RuleTitle>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{rule.summary}</p>
            {compact ? (
              <details className="mt-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-[var(--brand-navy-strong)]">
                  Como fazer
                </summary>
                <RuleSteps steps={rule.steps} />
              </details>
            ) : (
              <RuleSteps steps={rule.steps} />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function RuleSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-sm leading-6 text-[var(--ink)]">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

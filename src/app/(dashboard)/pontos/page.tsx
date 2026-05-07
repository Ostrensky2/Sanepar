import {
  AlertTriangle,
  ChartColumn,
  Filter,
  History,
  MapPinned,
  Search,
} from "lucide-react";

export default function PontosPage() {
  const points = [
    {
      code: "PR-IQU-01",
      name: "Rio Iguaçu - Captação",
      subtitle: "Urbano / Lótico",
      municipality: "Curitiba",
      className: "Classe I",
      statusLabel: "Ativo",
      statusTone: "success",
    },
    {
      code: "PR-TIB-04",
      name: "Rio Tibagi - Foz",
      subtitle: "Rural / Lótico",
      municipality: "Ponta Grossa",
      className: "Classe II",
      statusLabel: "Ativo",
      statusTone: "success",
    },
    {
      code: "PR-PIV-12",
      name: "Represa Piraquara I",
      subtitle: "Reservatório / Lêntico",
      municipality: "Piraquara",
      className: "Classe III",
      statusLabel: "Suspenso",
      statusTone: "danger",
    },
    {
      code: "PR-IQU-02",
      name: "Rio Iguaçu - Jusante",
      subtitle: "Urbano / Lótico",
      municipality: "Araucária",
      className: "Classe II",
      statusLabel: "Ativo",
      statusTone: "success",
    },
    {
      code: "PR-LND-08",
      name: "Ribeirão Cafezal",
      subtitle: "Captação / Lótico",
      municipality: "Londrina",
      className: "Classe I",
      statusLabel: "Ativo",
      statusTone: "success",
    },
  ];

  const selectedPoint = {
    code: points[0].code,
    name: points[0].name,
    badge: "Ponto SIA",
    state: "Operacional",
    purpose: "Abastecimento Público",
    priority: "Crítica (Nível 1)",
    quote:
      "Ponto estratégico de monitoramento contínuo para detecção de metais pesados devido à proximidade com zonas industriais e anel rodoviário.",
    history: [
      { label: "C-04 (Jun/24)", state: "Concluído", tone: "success" },
      { label: "C-05 (Set/24)", state: "Em aberto", tone: "warning" },
    ],
    lat: "-25.4284",
    long: "-49.2733",
  };

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="glass-panel rounded-[24px] border-l-4 border-[var(--brand-blue)] p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Total de pontos
            </p>
            <p className="text-2xl font-black text-[var(--brand-navy-strong)]">124</p>
          </article>

          <article className="glass-panel rounded-[24px] border-l-4 border-[var(--brand-green)] p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Pontos ativos
            </p>
            <p className="text-2xl font-black text-[var(--brand-navy-strong)]">118</p>
          </article>

          <article className="glass-panel rounded-[24px] border-l-4 border-[var(--brand-danger)] p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Alertas SIA
            </p>
            <p className="text-2xl font-black text-[var(--brand-danger)]">03</p>
          </article>

          <article className="glass-panel rounded-[24px] border-l-4 border-[var(--brand-teal)] p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Campanha atual
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-[var(--brand-navy-strong)]">C-05</p>
              <span className="text-[10px] font-medium text-slate-400">85% concluído</span>
            </div>
          </article>
        </section>

        <section className="glass-panel flex flex-wrap items-end gap-4 rounded-[24px] p-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-500">
              Busca por nome ou código
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Ex: PR-IQU-01..."
                className="w-full rounded-xl border border-transparent bg-[var(--surface-soft)] py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              />
            </div>
          </div>

          <div className="w-32">
            <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-500">
              SIA
            </label>
            <select className="w-full rounded-xl border border-transparent bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-[var(--brand-blue)]/20">
              <option>Todos</option>
              <option>PR-IQU</option>
              <option>PR-TIB</option>
            </select>
          </div>

          <div className="w-32">
            <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-500">
              Município
            </label>
            <select className="w-full rounded-xl border border-transparent bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-[var(--brand-blue)]/20">
              <option>Todos</option>
              <option>Curitiba</option>
              <option>Londrina</option>
            </select>
          </div>

          <div className="w-28">
            <label className="mb-1.5 ml-1 block text-[10px] font-bold uppercase text-slate-500">
              Classe
            </label>
            <select className="w-full rounded-xl border border-transparent bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-[var(--brand-blue)]/20">
              <option>Todas</option>
              <option>Classe I</option>
              <option>Classe II</option>
            </select>
          </div>

          <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-2 text-xs font-bold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-soft)]">
            <Filter className="h-4 w-4" />
            Filtros
          </button>
        </section>

        <section className="glass-panel flex min-h-[40rem] flex-1 flex-col overflow-hidden rounded-[28px]">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  <th className="px-4 py-3">Cód. SIA</th>
                  <th className="px-4 py-3">Ponto</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {points.map((point, index) => (
                  <tr
                    key={point.code}
                    className={
                      index === 0
                        ? "cursor-pointer border-l-4 border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]/65"
                        : "cursor-pointer border-l-4 border-transparent transition-colors hover:bg-slate-50"
                    }
                  >
                    <td
                      className={
                        index === 0
                          ? "px-4 py-2.5 font-mono text-xs font-bold text-[var(--brand-navy-strong)]"
                          : "px-4 py-2.5 font-mono text-xs text-slate-600"
                      }
                    >
                      {point.code}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-bold text-slate-800">{point.name}</div>
                      <div className="text-[9px] uppercase text-slate-500">{point.subtitle}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{point.municipality}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          point.className === "Classe I"
                            ? "rounded-full bg-[var(--brand-blue-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--brand-navy)]"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600"
                        }
                      >
                        {point.className.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div
                        className={
                          point.statusTone === "danger"
                            ? "flex items-center gap-1.5 text-[9px] font-bold uppercase text-[var(--brand-danger)]"
                            : "flex items-center gap-1.5 text-[9px] font-bold uppercase text-[var(--brand-green)]"
                        }
                      >
                        <span
                          className={
                            point.statusTone === "danger"
                              ? "h-1.5 w-1.5 rounded-full bg-[var(--brand-danger)]"
                              : "h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]"
                          }
                        />
                        {point.statusLabel}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button className="rounded px-2 py-1 text-[10px] font-bold uppercase text-[var(--brand-navy)] transition-colors hover:bg-[var(--brand-blue-soft)]">
                        Ver Ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
            <span>Exibindo 5 de 124 pontos</span>
            <div className="flex gap-1">
              <button className="rounded p-1 transition-colors hover:bg-slate-200">Anterior</button>
              <button className="rounded bg-[var(--brand-navy)] px-2 py-1 text-white">1</button>
              <button className="rounded px-2 py-1 transition-colors hover:bg-slate-200">2</button>
              <button className="rounded p-1 transition-colors hover:bg-slate-200">Próximo</button>
            </div>
          </div>
        </section>
      </div>

      <aside className="glass-panel w-full overflow-hidden rounded-[28px] border xl:w-[360px]">
        <div className="hero-gradient relative h-56">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,66,98,0.82))]" />
          <div className="absolute inset-x-0 bottom-4 px-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-[var(--brand-blue)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                {selectedPoint.badge}
              </span>
              <span className="rounded bg-[var(--brand-green)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
                {selectedPoint.state}
              </span>
            </div>
            <h3 className="heading-font text-xl font-black leading-tight text-white">
              {selectedPoint.code}
            </h3>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-50/90">
              {selectedPoint.name}
            </p>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ChartColumn className="h-4 w-4 text-[var(--brand-blue)]" />
              <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Contexto operacional
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="mb-1 text-[8px] font-bold uppercase text-slate-400">Finalidade</p>
                <p className="text-[11px] font-bold text-[var(--brand-navy-strong)]">{selectedPoint.purpose}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="mb-1 text-[8px] font-bold uppercase text-slate-400">Prioridade SIA</p>
                <p className="text-[11px] font-bold text-[var(--brand-navy-strong)]">{selectedPoint.priority}</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border-l-2 border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]/65 p-3">
              <p className="text-[10px] italic leading-relaxed text-[var(--brand-navy-strong)]">
                &quot;{selectedPoint.quote}&quot;
              </p>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--brand-blue)]" />
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Histórico recente
                </h4>
              </div>
              <span className="text-[9px] font-bold text-slate-400">9 campanhas</span>
            </div>
            <div className="space-y-2">
              {selectedPoint.history.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2 text-[10px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        item.tone === "warning"
                          ? "h-1.5 w-1.5 rounded-full bg-amber-400"
                          : "h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]"
                      }
                    />
                    <span className="font-bold text-slate-700">{item.label}</span>
                  </div>
                  <span
                    className={
                      item.tone === "warning"
                        ? "font-bold text-[var(--brand-navy)]"
                        : "text-slate-500"
                    }
                  >
                    {item.state}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-slate-900 opacity-80">
              <div className="map-surface absolute inset-0" />
              <MapPinned className="relative h-7 w-7 text-[var(--brand-blue)] drop-shadow-md" />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>Lat: {selectedPoint.lat}</span>
              <span>Long: {selectedPoint.long}</span>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--brand-navy-strong),var(--brand-teal))] py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-lg transition-all hover:brightness-105">
            <AlertTriangle className="h-4 w-4" />
            Histórico completo
          </button>
        </div>
      </aside>
    </div>
  );
}

import type { CaptureIndexRow } from "./index";

import { developingEffects, effects, matchCard, type Component } from "./effect-catalog";

export function summarizeEffects(rows: readonly CaptureIndexRow[], campaign: number) {
  const seen = new Set<string>();
  const eligible: Record<Component, number> = {"16S":0, ALGAS:0, COI:0};
  const counts = new Map<string,{winning:number; other:number; low:number}>();
  const residual = new Map<string,{contributions:number;points:number}>();
  let listed = 0, unmapped = 0, positiveContributions = 0;
  for (const row of rows) {
    if(row.campaign !== campaign) continue;
    if(seen.has(row.sia)) throw new Error("Observação duplicada no índice da campanha");
    seen.add(row.sia);
    for(const k of ["16S","ALGAS","COI"] as const) if(row.components[k].status==="disponível") eligible[k]++;
    if(row.components.COI.status==="disponível" && row.descriptors.exotics.length) listed++;
    const wins = new Set<string>(), others = new Set<string>(), lows = new Set<string>();
    const residualDomains=new Set<string>();
    for(const [domain,score] of Object.entries(row.scores)) for(const c of score?.contributions ?? []) {
      if(!(c.q>0)) continue;
      positiveContributions++;
      const id=matchCard(c.ficha,domain,c.component);
      if(!id){
        unmapped++; residualDomains.add(domain);
        const item=residual.get(domain)??{contributions:0,points:0};
        item.contributions++;residual.set(domain,item);continue;
      }
      (c.component===score?.component?wins:others).add(id);
    }
    for(const domain of residualDomains) residual.get(domain)!.points++;
    for(const a of row.alerts){
      const id=matchCard(a.ficha,a.dominio,a.componente);
      if(a.motivo==="baixo suporte" && id) lows.add(id);
    }
    for(const id of new Set([...wins,...others,...lows])) {
      const c=counts.get(id)??{winning:0,other:0,low:0};
      if(wins.has(id))c.winning++;
      else if(others.has(id))c.other++;
      // Alerts remain independent: they never become a scored contribution.
      if(lows.has(id))c.low++;
      counts.set(id,c);
    }
  }
  return {campaign, observations:seen.size,eligible,exoticsListed:listed,unmappedContributions:unmapped,positiveContributions,
    residualDomains:["Ambiental","Operacional","Saúde humana"].map(domain=>({domain,...(residual.get(domain)??{points:0,contributions:0})})),
    effects:effects.map(({id,title,component,note})=>({id,title,component,note,
      developing:developingEffects.has(id),
      denominator:component?eligible[component]:null,
      counts:component && eligible[component]>0 ? counts.get(id)??{winning:0,other:0,low:0} : null}))};
}
export type EffectSummary = ReturnType<typeof summarizeEffects>;

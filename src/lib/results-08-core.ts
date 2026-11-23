/** Numerical policy only. No data source, identities or default version. */
export type Domain08 = "ambiental" | "operacional" | "saude";
type Kind = "generica" | "sensorial" | "sanitaria-distinta";
type Key = null | 0 | 1 | 2 | 3;
export type Contribution08 = readonly [key: Key, mass: number, kind: Kind, supported: boolean];
export type Category08 = {domain: Domain08; winner: number | null;
  /** Trusted upstream adapter: number of usable components BEFORE winner selection. */
  enumeratedUsableCount?: number;
  components: readonly {
  component: number; complete: boolean; items: readonly Contribution08[];
  positiveDenominator?: boolean; assessedFraction?: number;
}[]};
type Input = {version: "0.8"; origin:"adjudicated-component-masses/v1"; categories: readonly Category08[]};
function unit(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
}
/** A null domain prevents recomposition. Empty admitted reinforcement is zero. */
export function evaluateResultsIndex(required: Input["version"], input: Input): number | null {
  if (required !== "0.8" || input.version !== "0.8")
    throw new Error("Index version mismatch");
  if (input.origin !== "adjudicated-component-masses/v1" || "historicalScore" in input)
    throw new Error("Current version requires adjudicated component masses");
  const raw = input.categories;
  if (!Array.isArray(raw) || raw.length < 3) return null;
  if (raw.length !== 3 || !["ambiental","operacional","saude"].every(d => raw.some(c => c.domain === d)))
    throw new Error("Three distinct domains required");
  const cs: {domain:Domain08;score:number;items:readonly Contribution08[]}[]=[];
  for (const c of input.categories) {
    if ("score" in c) throw new Error("Declared category scores are not inputs");
    if (!Array.isArray(c.components)) return null;
    if (c.winner === null) {
      // Zero of the documented signal, not biological absence. No artificial winner.
      const gs=c.components;
      if (!gs.length || gs.length!==c.enumeratedUsableCount ||
          new Set(gs.map(x=>x.component)).size!==gs.length ||
          !gs.every(x=>Number.isSafeInteger(x.component) && x.component>=0 &&
            x.positiveDenominator===true && x.complete===true && unit(x.assessedFraction) &&
            Array.isArray(x.items) && x.items.length===0) ||
          !gs.some(x=>(x.assessedFraction??0)>0)) return null;
      cs.push({domain:c.domain,score:0,items:[]});
      continue;
    }
    if (!Number.isSafeInteger(c.winner) || c.winner < 0 || c.components.some(g=>!Number.isSafeInteger(g.component)||g.component<0) ||
        new Set(c.components.map(g=>g.component)).size !== c.components.length) throw new Error("Invalid component selection");
    const g=c.components.find(x=>x.component===c.winner);
    if (!g || g.complete!==true || !Array.isArray(g.items)) return null;
    let mass=0;
    for (const [k,q,t,e] of g.items) {
      if (![null,0,1,2,3].includes(k) || !unit(q) || !["generica","sensorial","sanitaria-distinta"].includes(t) || typeof e !== "boolean")
        throw new RangeError("Invalid adjudication");
      mass+=q;
    }
    if (mass>1+1e-14) throw new RangeError("Invalid winning mass");
    if (mass===0) {
      // A selected label cannot certify a zero or override a positive sibling.
      if (c.enumeratedUsableCount!==c.components.length ||
          !c.components.every(x=>x.complete===true && x.positiveDenominator===true &&
            unit(x.assessedFraction) && Array.isArray(x.items) &&
            x.items.every((v:Contribution08)=>Array.isArray(v) && v.length===4 && v[1]===0 &&
              [null,0,1,2,3].includes(v[0]) && ["generica","sensorial","sanitaria-distinta"].includes(v[2]) &&
              typeof v[3]==="boolean")) ||
          !c.components.some(x=>(x.assessedFraction??0)>0)) return null;
    }
    cs.push({domain:c.domain,score:Math.log1p(100*Math.min(1,mass))/Math.log1p(100),items:g.items});
  }
  let best = Math.max(...cs.map(c => c.score!));
  for (const anchor of cs) {
    const p = anchor.score!;
    if (p === 0) continue;
    const sensory = anchor.items.some(([,q,t]) => q > 0 && t === "sensorial");
    const health = anchor.items.some(([,q,t,e]) => q > 0 && t === "sanitaria-distinta" && e);
    if (anchor.domain === "saude" && sensory && !health) continue;
    const used = new Set(anchor.items.filter(([,q]) => q > 0).map(([k]) => k));
    const chosen = new Map<Key,{domain: Domain08; q: number}>();
    for (const c of cs) {
      if (c === anchor) continue;
      for (const [k,q,t,e] of c.items) {
        // Applicability is required for every reinforcement, including generic ones.
        // Historical category mass and the primary candidate are not discounted.
        if (!e) continue;
        if (k === null || k === 2 || used.has(k) || (k === 3 && used.has(2))) continue;
        if (t === "sensorial" && (c.domain !== "operacional" || !e || sensory || (anchor.domain === "saude" && !health))) continue;
        if (c.domain === "saude" && (t !== "sanitaria-distinta" || !e)) continue;
        const prev = chosen.get(k);
        if (prev && prev.domain !== c.domain) throw new Error("Incompatible adjudication across domains");
        chosen.set(k,{domain:c.domain,q:Math.max(q,prev?.q ?? 0)});
      }
    }
    let reinforcement = 0;
    for (const c of cs) {
      if (c === anchor) continue;
      const mass = [...chosen.values()].reduce((sum,v) => sum + (v.domain === c.domain ? v.q : 0),0);
      const r = Math.log1p(100 * mass) / Math.log1p(100);
      if (r > 1 + 1e-14) throw new RangeError("Incompatible mass");
      reinforcement += r;
    }
    best = Math.max(best,p + (1-p)*reinforcement/2);
  }
  return best;
}

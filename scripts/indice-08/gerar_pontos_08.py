"""Gera as notas 0.8 por campanha + SIA a partir da adjudicação congelada (COMP-08-23).

Mesmo adaptador de `audit/ADOCAO-08/fonte_ts_sinal.py`, porém determinístico e com a
chave (campanha, SIA) preservada. Cada observação é calculada pelo núcleo TypeScript do
aplicativo (`src/lib/results-08-core.ts`). Cada campanha é calculada separadamente.

Saída: `src/lib/capture-index/pontos-0.8.json`. O script confere que os agregados
reconstruídos a partir das notas individuais coincidem com a fonte agregada oficial
(`src/lib/results-08-aggregate.json`) campo a campo; se não coincidirem, nada é gravado.

Uso: python -B scripts/indice-08/gerar_pontos_08.py
"""
import hashlib, json, subprocess, sys
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
repo = Path(__file__).resolve().parents[2]
audit = repo.parents[1] / "audit"
sys.path.insert(0, str(audit / "COMP-08-23"))
import adjudicado as a  # noqa: E402

core = repo / "src/lib/results-08-core.ts"
official = json.loads((repo / "src/lib/results-08-aggregate.json").read_text(encoding="utf8"))
out = repo / "src/lib/capture-index/pontos-0.8.json"
DS = ("Ambiental", "Operacional", "Saúde humana")

batch = []
original = a.contextual


def observe(scores, items, domains):
    baseline = original(scores, items, domains)
    frame = sys._getframe(1)
    if frame.f_code is not a.main.__code__:
        return baseline
    row = frame.f_locals["r"]
    cats = []
    for j in range(3):
        s = row["scores"][DS[j]]
        if s["component"] is not None:
            seq = sorted(items[j], key=lambda v: (v[1], -1 if v[0] is None else v[0], v[2], v[3]))
            c = dict(winner=0, components=[dict(component=0, complete=True, items=seq)])
        else:
            u = {k: v for k, v in row["components"].items() if v["status"] == "disponível" and v["validReads"] > 0}
            ev = s["evaluatedByComponent"]
            assert u and set(u) == set(ev) and not s["contributions"]
            groups = []
            for k in sorted(u):
                n = u[k]["observedReads"] if k == "ALGAS" else u[k]["validReads"]
                assert n > 0 and 0 <= ev[k] <= 1
                groups.append(dict(component=len(groups), complete=True, positiveDenominator=True, assessedFraction=ev[k], items=[]))
            c = dict(winner=None, enumeratedUsableCount=len(u), components=groups)
        cats.append(dict(domain=domains[j], **c))
    batch.append(dict(campaign=int(row["campaign"]), sia=str(row["sia"]), categories=cats))
    return baseline


with patch.object(a, "contextual", observe), patch.object(a, "emit"):
    a.main()
assert len(batch) == 225 and len({(b["campaign"], b["sia"]) for b in batch}) == 225

js = r"""
import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
const {evaluateResultsIndex}=await import(pathToFileURL(process.argv[1]).href);
const run=categories=>evaluateResultsIndex('0.8',{version:'0.8',origin:'adjudicated-component-masses/v1',categories});
const out=[];
for(const r of JSON.parse(readFileSync(0,'utf8'))){
  const cs=r.categories, row={campaign:r.campaign,sia:r.sia,geral:run(cs)};
  // Categoria isolada: as outras duas entram como zero documentado, sem reforço.
  for(const c of cs) row[c.domain]=run(cs.map(o=>o===c?c:{domain:o.domain,winner:null,enumeratedUsableCount:1,components:[{component:0,complete:true,positiveDenominator:true,assessedFraction:1,items:[]}]}));
  out.push(row);
}
console.log(JSON.stringify(out));
"""
r = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", js, str(core)], input=json.dumps(batch), text=True, capture_output=True)
if r.returncode:
    raise SystemExit("Falha no núcleo 0.8: " + r.stderr)
rows = json.loads(r.stdout)

# Paridade com a fonte agregada oficial (mesmas regras de bins e soma compensada da fonte).
agg_js = r"""
import {readFileSync} from 'node:fs';
const rows=JSON.parse(readFileSync(0,'utf8'));
const names={geral08:'geral',ambiental:'ambiental',operacional:'operacional',saude:'saude'};
const out={};
for(const g of ['C1','C2','C3','total']){out[g]={};
 for(const [n,f] of Object.entries(names)){
  const all=rows.filter(r=>g==='total'||'C'+r.campaign===g).map(r=>r[f]);
  const v=all.filter(x=>x!==null).sort((a,b)=>a-b);const cols=Array(40).fill(0),bands=Array(5).fill(0);let sum=0,err=0;
  for(const x of v){let i=0;while(i<39&&x>=(i+1)/40)i++;cols[i]++;bands[[.05,.15,.35,.70].filter(t=>x>=t).length]++;const y=x-err,t=sum+y;err=(t-sum)-y;sum=t;}
  out[g][n]={observados:all.length,numericos:v.length,nulos:all.length-v.length,minimo:v[0]??null,media:v.length?sum/v.length:null,maximo:v.at(-1)??null,colunas:cols,faixas:bands};
 }}
console.log(JSON.stringify(out));
"""
r2 = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", agg_js], input=json.dumps(rows), text=True, capture_output=True)
if r2.returncode:
    raise SystemExit(r2.stderr)
rebuilt = json.loads(r2.stdout)
if rebuilt != official["grupos"]:
    for g in rebuilt:
        for n in rebuilt[g]:
            if rebuilt[g][n] != official["grupos"][g][n]:
                print("DIVERGE", g, n, rebuilt[g][n], official["grupos"][g][n])
    raise SystemExit("Notas individuais não reconstroem a fonte agregada oficial; nada gravado.")

rows.sort(key=lambda x: (x["campaign"], int(x["sia"]) if x["sia"].isdigit() else 10**9, x["sia"]))
doc = dict(
    schema="yvae-capture-index-08/1", version="0.8", policy="sinal-documentado/1",
    provenance="adjudicated-component-masses/v1",
    aggregateSha256=hashlib.sha256(json.dumps(official["grupos"], sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
    coreSha256=hashlib.sha256(core.read_bytes()).hexdigest(),
    rows=[dict(campaign=x["campaign"], sia=x["sia"], geral=x["geral"], ambiental=x["ambiental"], operacional=x["operacional"], saude=x["saude"]) for x in rows],
)
out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
nulls = [(x["campaign"], x["sia"], [k for k in ("geral", "ambiental", "operacional", "saude") if x[k] is None]) for x in rows if None in (x["geral"], x["ambiental"], x["operacional"], x["saude"])]
print("OK", len(rows), "observações; paridade agregada exata; sem estimativa:", nulls)

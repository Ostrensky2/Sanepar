"""Alinha o índice 0.8 às matrizes por SIA do Marcio (entrega de 13/11/2026).

Duas regras, ambas decididas pelo administrador em 24/11/2026:

1. COI só no recorte de água doce do Marcio. Um táxon COI cujo gênero (ou família) não é
   coluna das matrizes "COI_*_generos.xlsx"/"COI_*_familias.xlsx" deixa de pontuar e de
   gerar alerta. Os reads continuam no total da biblioteca, como no relatório do Marcio
   ("o total COI inclui todos os reads retidos, inclusive os fora do recorte").
   A retirada dos 25 grupos marinhos do denominador (decisão de 20/11) não muda.
2. Espécie só para exóticas. Os resultados são tratados por gênero, família ou grupo;
   o nome de espécie só é mantido para as exóticas com identificação sustentada da aba
   "Exóticas" do Marcio (colunas sem sufixo). Qualquer outra espécie é exibida no gênero,
   somando reads e participação na mesma ficha. A nota não muda com essa troca de rótulo.

Entradas: a pasta com as 16 matrizes do Marcio e a adjudicação congelada de COMP-08-23
(mesmo adaptador de `gerar_pontos_08.py`). Saídas, todas no repositório:
`src/lib/capture-index/pontos-0.8.json`, `src/lib/results-08-aggregate.json` (grupos, com as
duas identidades SHA-256 atualizadas em `results-08-contract.ts` e `results-08-aggregate.ts`) e
`src/lib/capture-index/indice-captacao.json` (contribuições e alertas).

Rodar uma vez sobre a saída congelada: o script parte da adjudicação de COMP-08-23, não do
próprio resultado, então repetir a execução dá os mesmos arquivos.

Uso: python -B scripts/indice-08/recorte_marcio.py <pasta das matrizes do Marcio>
"""
import hashlib, json, subprocess, sys
from collections import OrderedDict
from hashlib import sha256
from math import fsum, log1p
from pathlib import Path
from unittest.mock import patch

import openpyxl

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding="utf-8")
repo = Path(__file__).resolve().parents[2]
# O repositório pode estar em G:/Aplicativos/Sanepar/web ou numa cópia em G:/Aplicativos/Sanepar/<pasta>/<nome>.
audit = next(p / "audit" for p in repo.parents if (p / "audit" / "COMP-08-23").is_dir())
sys.path.insert(0, str(audit / "COMP-08-23"))
import adjudicado as a  # noqa: E402

matrizes = Path(sys.argv[1])
core = repo / "src/lib/results-08-core.ts"
f_agg = repo / "src/lib/results-08-aggregate.json"
f_pts = repo / "src/lib/capture-index/pontos-0.8.json"
f_idx = repo / "src/lib/capture-index/indice-captacao.json"
DS = ("Ambiental", "Operacional", "Saúde humana")
DOMS = ("ambiental", "operacional", "saude")


def cabecalho(nome, aba=0):
    ws = openpyxl.load_workbook(matrizes / "COI_por_SIA" / nome, read_only=True).worksheets[aba]
    return [str(c).strip() for c in next(ws.iter_rows(values_only=True))][1:]


# As colunas são as mesmas nos quatro conjuntos de cada nível (LEIA_ME); confere mesmo assim.
conjuntos = ("C1", "C2", "C3_MiSeq", "C3_NextSeq")
GEN = {tuple(cabecalho(f"COI_{c}_generos.xlsx")) for c in conjuntos}
FAM = {tuple(cabecalho(f"COI_{c}_familias.xlsx")) for c in conjuntos}
EXO = {tuple(cabecalho(f"COI_{c}_generos.xlsx", 1)) for c in conjuntos}
assert len(GEN) == len(FAM) == len(EXO) == 1, "Colunas divergentes entre conjuntos do Marcio."
GEN, FAM, EXO = set(next(iter(GEN))), set(next(iter(FAM))), next(iter(EXO))
EXOTICAS = {c for c in EXO if "(" not in c and c != "Total de reads COI"}
assert len(EXOTICAS) == 6, EXOTICAS


def no_recorte(componente, taxon):
    if componente != "COI":
        return True
    t = taxon.strip()
    return t in GEN or t in FAM or t.split()[0] in GEN


def vale(c, fichas):
    """Contribuição que continua valendo: dentro do recorte e, se a ficha é de espécie, só para exótica sustentada."""
    if not no_recorte(c["component"], c["taxon"]):
        return False
    return not (fichas.get(c["ficha"], {}).get("level") == "species" and c["taxon"].strip() not in EXOTICAS)


def rotulo(taxon, rank):
    """Espécie só para exóticas sustentadas; as demais vão para o gênero."""
    t = taxon.strip()
    if rank == "species" and t not in EXOTICAS:
        return t.split()[0], "genus"
    return t, rank


curve = lambda q: log1p(100 * q) / log1p(100)

# 1) Notas 0.8 com o recorte, pelo mesmo adaptador de gerar_pontos_08.py.
batch, mudancas = [], []
original = a.contextual


def observe(scores, items, domains):
    baseline = original(scores, items, domains)
    frame = sys._getframe(1)
    if frame.f_code is not a.main.__code__:
        return baseline
    loc = frame.f_locals
    row, semantic, z = loc["r"], loc["semantic"], loc["z"]
    cats = []
    for j in range(3):
        s = row["scores"][DS[j]]
        cs = [c for c in s["contributions"] if vale(c, z["fichas"])]
        massa = {}
        for c in cs:
            massa[c["component"]] = fsum([massa.get(c["component"], 0.0), c["q"]])
        vencedor = max(massa, key=lambda k: (massa[k], k == s["component"])) if massa and max(massa.values()) > 0 else None
        if vencedor is not None:
            seq = []
            for c in cs:
                if c["component"] != vencedor:
                    continue
                h = sha256(c["ficha"].encode("utf-8")).hexdigest(); k = a.T.index(h) if h in a.T else None
                effect, marker = semantic.get(h, (None, None)); card = z["fichas"].get(c["ficha"], {})
                typ = "sensorial" if effect == "odour" else "sanitaria-distinta" if effect == "cyanotoxins" else "generica"
                ev = bool(marker == vencedor and card.get("domain") == DS[j] and card.get("source") and card.get("rationale") and not card.get("contested", True))
                seq.append((k, c["q"], typ, ev))
            if s["component"] is not None and len(cs) == len(s["contributions"]) and vencedor == s["component"]:
                assert sorted(seq, key=repr) == sorted(items[j], key=repr), (row["campaign"], row["sia"], DS[j])
            seq = sorted(seq, key=lambda v: (v[1], -1 if v[0] is None else v[0], v[2], v[3]))
            c = dict(winner=0, components=[dict(component=0, complete=True, items=seq)])
        else:
            u = {k: v for k, v in row["components"].items() if v["status"] == "disponível" and v["validReads"] > 0}
            ev = s["evaluatedByComponent"]
            assert u and set(u) == set(ev)
            groups = [dict(component=i, complete=True, positiveDenominator=True, assessedFraction=ev[k], items=[]) for i, k in enumerate(sorted(u))]
            c = dict(winner=None, enumeratedUsableCount=len(u), components=groups)
        if len(cs) != len(s["contributions"]):
            mudancas.append((row["campaign"], row["sia"], DS[j], [x["taxon"] for x in s["contributions"] if x not in cs]))
        cats.append(dict(domain=domains[j], **c))
    batch.append(dict(campaign=int(row["campaign"]), sia=str(row["sia"]), categories=cats))
    return baseline


with patch.object(a, "contextual", observe), patch.object(a, "emit"):
    a.main()
assert len(batch) == 225 and len({(b["campaign"], b["sia"]) for b in batch}) == 225

js = (repo / "scripts/indice-08/gerar_pontos_08.py").read_text(encoding="utf8").split('js = r"""', 1)[1].split('"""', 1)[0]
agg_js = (repo / "scripts/indice-08/gerar_pontos_08.py").read_text(encoding="utf8").split('agg_js = r"""', 1)[1].split('"""', 1)[0]
r = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", js, str(core)], input=json.dumps(batch), text=True, capture_output=True, encoding="utf8")
if r.returncode:
    raise SystemExit("Falha no núcleo 0.8: " + r.stderr)
rows = json.loads(r.stdout)
r2 = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", agg_js], input=json.dumps(rows), text=True, capture_output=True, encoding="utf8")
if r2.returncode:
    raise SystemExit(r2.stderr)
grupos = json.loads(r2.stdout)

antes = {(x["campaign"], x["sia"]): x for x in json.loads(f_pts.read_text(encoding="utf8"))["rows"]}
rows.sort(key=lambda x: (x["campaign"], int(x["sia"]) if x["sia"].isdigit() else 10**9, x["sia"]))
alteradas = []
for x in rows:
    y = antes[(x["campaign"], x["sia"])]
    dif = {k: (y[k], x[k]) for k in ("geral",) + DOMS if y[k] != x[k]}
    if dif:
        alteradas.append((x["campaign"], x["sia"], dif))

agg = json.loads(f_agg.read_text(encoding="utf8"), object_pairs_hook=OrderedDict)
agg["grupos"] = grupos
f_agg.write_text(json.dumps(agg, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="")
# As duas identidades da fonte agregada acompanham o arquivo: bytes do JSON e projeção canônica lida pelo aplicativo.
import re
novo_bytes = hashlib.sha256(f_agg.read_bytes()).hexdigest()
novo_proj = subprocess.run(["node", "-e", "const fs=require('fs'),c=require('crypto');process.stdout.write(c.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],'utf8')))).digest('hex'))", str(f_agg)], text=True, capture_output=True, check=True).stdout.strip()
for arquivo, padrao, valor in ((repo / "src/lib/results-08-contract.ts", r'(RESULTS_08_SOURCE_SHA256 = ")[0-9a-f]{64}(")', novo_bytes),
                               (repo / "src/lib/results-08-aggregate.ts", r'(digest\("hex"\) !== ")[0-9a-f]{64}(")', novo_proj)):
    texto = arquivo.read_text(encoding="utf8")
    trocado, n = re.subn(padrao, lambda m: m.group(1) + valor + m.group(2), texto)
    assert n == 1, arquivo
    arquivo.write_text(trocado, encoding="utf8", newline="")
doc = dict(
    schema="yvae-capture-index-08/1", version="0.8", policy="sinal-documentado/1",
    provenance="adjudicated-component-masses/v1",
    aggregateSha256=hashlib.sha256(json.dumps(grupos, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
    coreSha256=hashlib.sha256(core.read_bytes()).hexdigest(),
    rows=[dict(campaign=x["campaign"], sia=x["sia"], geral=x["geral"], ambiental=x["ambiental"], operacional=x["operacional"], saude=x["saude"]) for x in rows],
)
f_pts.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf8", newline="")

# 2) Leituras exibidas: recorte do COI e espécie só para exóticas.
idx = json.loads(f_idx.read_text(encoding="utf8"))
removidos, renomeados, antes_cat = [], set(), {}
for row in idx["rows"]:
    for dom, s in row["scores"].items():
        if not s:
            continue
        juntos = OrderedDict()
        antes_cat[(row["campaign"], row["sia"], dom)] = list(s["contributions"])
        for c in s["contributions"]:
            if not vale(c, idx["fichas"]):
                removidos.append((row["campaign"], row["sia"], dom, c["taxon"])); continue
            taxon, rank = rotulo(c["taxon"], c["rank"])
            if taxon != c["taxon"]:
                renomeados.add((c["taxon"], taxon))
            chave = (c["component"], c["ficha"], taxon)
            if chave in juntos:
                v = juntos[chave]; v["reads"] += c["reads"]; v["q"] = fsum([v["q"], c["q"]])
            else:
                juntos[chave] = dict(c, taxon=taxon, rank=rank)
        s["contributions"] = sorted(juntos.values(), key=lambda c: -c["q"])
        if any(not vale(c, idx["fichas"]) for c in antes_cat[(row["campaign"], row["sia"], dom)]):
            # A leitura de origem acompanha a retirada: marcador vencedor e nota da categoria sem o táxon fora do recorte.
            massa = {}
            for c in s["contributions"]:
                massa[c["component"]] = fsum([massa.get(c["component"], 0.0), c["q"]])
            vencedor = max(massa, key=lambda k: (massa[k], k == s["component"])) if massa and max(massa.values()) > 0 else None
            s["component"] = vencedor
            s["score"] = curve(min(1.0, massa[vencedor])) if vencedor else 0.0
            s["floor"] = min(s["floor"], s["score"])
    alertas = OrderedDict()
    for al in row["alerts"]:
        if not no_recorte(al.get("componente"), al["taxon"]):
            removidos.append((row["campaign"], row["sia"], "alerta", al["taxon"])); continue
        taxon = al["taxon"].strip()
        if al.get("componente") == "COI" and len(taxon.split()) > 1 and taxon not in EXOTICAS and taxon.split()[1][:1].islower():
            renomeados.add((taxon, taxon.split()[0])); taxon = taxon.split()[0]
        chave = (al.get("componente"), al.get("ficha"), al.get("dominio"), al.get("motivo"), taxon)
        if chave in alertas:
            v = alertas[chave]; v["reads"] += al["reads"]
            if "participacao" in v and "participacao" in al:
                v["participacao"] = fsum([v["participacao"], al["participacao"]])
        else:
            alertas[chave] = dict(al, taxon=taxon)
    row["alerts"] = list(alertas.values())
# Fichas sem nenhuma leitura depois do recorte saem da lista de fichas usadas.
usadas = {c["ficha"] for row in idx["rows"] for s in row["scores"].values() if s for c in s["contributions"]} | {al["ficha"] for row in idx["rows"] for al in row["alerts"] if al.get("ficha")}
fichas_retiradas = sorted(set(idx["fichas"]) - usadas)
idx["fichas"] = {k: v for k, v in idx["fichas"].items() if k in usadas}
assert not any(v["level"] == "species" and v["taxon"] not in EXOTICAS for v in idx["fichas"].values())
idx["parameters"]["coiFreshwaterScope"] = {
    "fonte": "Matrizes por SIA do Marcio, entrega de 13/11/2026 (COI_*_generos.xlsx e COI_*_familias.xlsx)",
    "generos": len(GEN), "familias": len(FAM), "exoticasEmEspecie": sorted(EXOTICAS),
    "regra": "táxon COI fora do recorte de água doce não pontua nem gera alerta; os reads continuam no total; ficha e rótulo de espécie só para exóticas sustentadas"}
f_idx.write_text(json.dumps(idx, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf8", newline="")

print("Fonte agregada: bytes", novo_bytes, "| projeção", novo_proj)
print("Categorias recalculadas:", mudancas)
print("Notas alteradas:", alteradas)
print("Leituras retiradas:", removidos)
print("Espécies exibidas no gênero:", sorted(renomeados))
print("Fichas retiradas da lista de usadas:", fichas_retiradas)

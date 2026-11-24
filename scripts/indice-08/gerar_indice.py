"""Gera o índice de captação (método 3.0) com o cadastro completo de fichas.

Decisão do administrador em 24/11/2026: o catálogo de fichas é a base de tudo; entra tudo o que já
temos, com valores provisórios, e o refino vem depois. Este script substitui `recorte_marcio.py`.

Cadastro (o que o motor lê):
1. fichas aprovadas até 20/11 (`fichas-0.7.csv`), sem mudança de peso;
2. as cinco correções da revisão bibliográfica independente de 23/11;
3. fichas indeterminadas (gênero com espécie de efeito documentado): passam a pontuar com
   aplicabilidade provisória 0,1 (minoria), salvo resultado nulo registrado;
4. fichas propostas pela revisão de 23/11 com efeito demonstrado ou plausível por parente:
   gravidade proposta pelo revisor e aplicabilidade provisória pela regra abaixo. Ficha aprovada
   para o mesmo organismo e categoria tem precedência e não é substituída.

Aplicabilidade provisória das fichas da revisão:
  efeito demonstrado no nível detectado (gênero, família ou grupo): evidência forte 1; moderada 0,5; fraca 0,1
  efeito demonstrado só em espécie ou cepa do gênero: evidência forte 0,5; demais 0,1
  efeito plausível por parente ou potencial: 0,1

Continuam valendo: só análises do Marcio; campanhas independentes; COI no recorte de água doce das
matrizes por SIA; espécie só para exóticas sustentadas (outras espécies são exibidas no gênero).

Saídas no repositório: `indice-captacao.json` (leituras e TODAS as fichas, com origem e evidência),
`pontos-0.8.json`, `results-08-aggregate.json` e as identidades SHA-256 em `results-08-contract.ts`,
`results-08-aggregate.ts` e `exotics-reconciliation.ts`.

Uso: python -B scripts/indice-08/gerar_indice.py <pasta das matrizes do Marcio> [relatorio.json]
"""
import csv, hashlib, io, json, re, subprocess, sys
from collections import Counter, OrderedDict
from dataclasses import replace
from hashlib import sha256
from math import fsum, log1p
from pathlib import Path

import openpyxl

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding="utf-8")
repo = Path(__file__).resolve().parents[2]
audit = next(p / "audit" for p in repo.parents if (p / "audit" / "COMP-08-23").is_dir())
MOTOR = audit / "matrizes-sia-central-2026-11-18/turno-noturno-2026-11-18/indice_v07"
REVISAO = audit / "REVISAO-INDEPENDENTE-BIBLIO-20261123/ENTREGAS/d-fichas-propostas.csv"
sys.path.insert(0, str(MOTOR)); sys.path.insert(0, str(audit / "COMP-08-23"))
import fichas as F  # noqa: E402
import rodar as R  # noqa: E402
from motor import Ficha  # noqa: E402
import adjudicado as ADJ  # noqa: E402  (só os quatro tokens de reforço; main() não é executado)

matrizes = Path(sys.argv[1])
core = repo / "src/lib/results-08-core.ts"
f_agg = repo / "src/lib/results-08-aggregate.json"
f_pts = repo / "src/lib/capture-index/pontos-0.8.json"
f_idx = repo / "src/lib/capture-index/indice-captacao.json"
DS = ("Ambiental", "Operacional", "Saúde humana")
DOMS = ("ambiental", "operacional", "saude")
LETRA = {"A": "Ambiental", "O": "Operacional", "S": "Saúde humana"}
TEMAS = {"T01": "Floração e alteração do ambiente", "T02": "Espécie invasora", "T03": "Biofilme e incrustação", "T04": "Obstrução de filtros e telas",
         "T05": "Larvas em sistemas", "T06": "Gosto", "T07": "Odor", "T08": "Cianotoxinas", "T09": "Toxicidade para animais", "T10": "Patógeno ou oportunista",
         "T11": "Indicador de contaminação fecal", "T12": "Nitrificação", "T13": "Ferro, manganês e corrosão", "T14": "Subprodutos e tratamento", "T15": "Outros efeitos operacionais"}
curve = lambda q: log1p(100 * q) / log1p(100)


# ---------- recorte de água doce e exóticas (matrizes por SIA do Marcio) ----------
def cabecalho(nome, aba=0):
    ws = openpyxl.load_workbook(matrizes / "COI_por_SIA" / nome, read_only=True).worksheets[aba]
    return [str(c).strip() for c in next(ws.iter_rows(values_only=True))][1:]


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


def rotulo(taxon, rank):
    t = taxon.strip()
    if rank == "species" and t not in EXOTICAS:
        return t.split()[0], "genus"
    return t, rank


# ---------- cadastro ----------
base = F.ler()
assert len(base) == 469
meta = {}      # id -> {"origin", "evidence"}
cadastro = []
CORRECOES = {
    "CUR-Raphidiopsis-S": dict(aplicabilidade=0.5, fonte="https://pubmed.ncbi.nlm.nih.gov/38244903",
        justificativa="Correção da revisão de 23/11: na América do Sul, R. raciborskii está associada sobretudo a saxitoxinas (PMID 38244903, 24407962; cepa brasileira produtora, doi:10.1371/journal.pone.0009235). A fração de genótipos de cilindrospermopsina medida na China (0,3% a 39,7%, PMID 34899674) não estima o risco de saxitoxina no Paraná. Cepas produtoras e não produtoras coexistem: aplicabilidade provisória 0,5, a refinar."),
    "CUR-Raphidiopsis-A": dict(fonte="https://pubmed.ncbi.nlm.nih.gov/32323358",
        justificativa="Correção da revisão de 23/11: a fonte anterior não media toxicidade para animais. Tilápia exposta a cepa produtora de saxitoxina teve crescimento reduzido (PMID 32323358); Daphnia gessneri teve aptidão e alimentação reduzidas (PMID 37624198). Efeito ligado a cepas produtoras: minoria."),
    "CUR-Arcobacter-S": dict(justificativa="Correção da revisão de 23/11: associado a surtos de veiculação hídrica e a indicadores de poluição fecal; água e alimentos são rotas suspeitas; causalidade ainda não estabelecida (PMID 21233511). Só 3 de 12 espécies isoladas de infecções; maioria dos casos autolimitada: minoria."),
    "CUR-Chironomidae-O": dict(fonte="https://doi.org/10.1016/j.scitotenv.2023.165241; https://doi.org/10.1371/journal.pone.0315390; https://doi.org/10.3390/ijerph19021005"),
}
# Decisão já tomada pelo administrador (inclusive "sem efeito" e medição contestada) tem precedência sobre a revisão e sobre a herança de espécie.
aprovadas = {(f.taxon, d) for f in base if f.id.startswith(("CUR-", "CAT-", "CON-")) and (f.nivel != "species" or f.taxon in EXOTICAS) for d in (DS if f.dominio == "*" else (f.dominio,))}
for f in base:
    if f.id in CORRECOES:
        f = replace(f, **CORRECOES[f.id]); meta[f.id] = {"origin": "aprovada, corrigida pela revisão de 23/11", "evidence": "provisória" if "aplicabilidade" in CORRECOES[f.id] else "aprovada"}
    elif f.id.startswith("IND-") and f.aplicabilidade is None and f.gravidade and not f.justificativa.startswith("Indeterminada: catálogo"):
        # Fonte lida que não demonstra o dano (ex.: exóticas só com ocorrência): continua registrada, sem nota.
        meta[f.id] = {"origin": "registrada, sem nota", "evidence": "fonte lida não demonstra o dano"}
    elif f.id.startswith("IND-") and f.aplicabilidade is None and (f.taxon, f.dominio) in aprovadas:
        meta[f.id] = {"origin": "registrada, sem nota", "evidence": "decisão já aprovada para este organismo tem precedência"}
    elif f.id.startswith("IND-") and f.aplicabilidade is None and f.gravidade:
        if f.taxon == "Biomphalaria":
            f = replace(f, justificativa=f.justificativa + " Correção da revisão de 23/11: para B. peregrina, a espécie detectada, a infecção experimental por S. mansoni foi nula (0 de 300 caramujos; PMID 4732745). Não pontua.")
            meta[f.id] = {"origin": "registrada, sem nota", "evidence": "resultado nulo na espécie detectada"}
        else:
            f = replace(f, aplicabilidade=0.1, justificativa=f.justificativa + " Provisória (24/11): o efeito está documentado em espécie do gênero; a presença do gênero pontua como minoria (0,1), a refinar.")
            meta[f.id] = {"origin": "herdada de espécie do gênero", "evidence": "provisória"}
    elif f.id.startswith("REV-"):
        meta[f.id] = {"origin": "registrada, sem nota", "evidence": "busca sem evidência; não avaliada"}
    elif f.id.startswith("CON-") or f.contestada:
        meta[f.id] = {"origin": "registrada, sem nota", "evidence": "medição contestada"}
    elif f.aplicabilidade is None:
        meta[f.id] = {"origin": "registrada, sem nota", "evidence": "indeterminada"}
    else:
        meta[f.id] = {"origin": "aprovada", "evidence": "aprovada"}
    cadastro.append(f)
# Espécie só para exóticas sustentadas: as fichas de espécie do catálogo antigo não entram no cadastro.
cadastro = [f for f in cadastro if f.nivel != "species" or f.taxon in EXOTICAS]


texto = REVISAO.read_text(encoding="utf-8-sig"); cab = texto.split("\n")[0]
propostas = list(csv.DictReader(io.StringIO(texto), delimiter=";" if cab.count(";") > cab.count(",") else ","))
assert len(propostas) == 202
registradas = []        # propostas que não pontuam: ficam no catálogo, fora do motor
GRUPO = re.compile(r"(phyceae|ales|_X)$")
NO_NIVEL = re.compile(r"gênero|família|classe|grupo|ordem|filo")


def aplicabilidade_provisoria(r, nivel):
    if r["categoria"] == "PAR" or nivel == "clade":
        return 0.1
    forca = r["forca_evidencia"]
    if NO_NIVEL.search(r["nivel_estudado"]):
        return {"forte": 1.0, "moderada": 0.5}.get(forca, 0.1)
    return 0.5 if forca == "forte" else 0.1


def fonte_url(texto):
    primeira = (texto or "").split(";")[0].strip()
    if primeira.startswith("PMID:"): return "https://pubmed.ncbi.nlm.nih.gov/" + primeira[5:].strip()
    if primeira.startswith("DOI:"): return "https://doi.org/" + primeira[4:].strip()
    if primeira.startswith("URL:"): return primeira[4:].strip()
    return primeira


for r in propostas:
    nome = r["nome_detectado"].strip()
    if nome in EXOTICAS: taxon, nivel = nome, "species"
    elif GRUPO.search(nome): taxon, nivel = nome, "clade"
    elif re.search(r"(aceae|idae)$", nome): taxon, nivel = nome, "family"
    else: taxon, nivel = nome.split()[0], "genus"
    tema = r["tema"].split("/")[0]
    just = f"{r['efeito'].strip()}. {r['resultado'].strip()} Limitações: {r['limitacoes'].strip()} Estudado em: {r['nome_estudado'].strip()} ({r['nivel_estudado']}). Fontes: {r['fontes'].strip() or 'não informadas'}. Revisão de 23/11, leitura de resumo; valores provisórios, a refinar."
    for letra in [x for x in r["dominio"].split("/") if x in LETRA]:
        dom = LETRA[letra]; ident = f"REV23-{r['registro']}-{letra}"
        pontua = r["categoria"] in ("DEM", "PAR") and r["gravidade_proposta"] in ("1", "2", "3") and (nivel != "clade" or NO_NIVEL.search(r["nivel_estudado"])) \
            and (taxon, dom) not in aprovadas and not (taxon == "Biomphalaria")
        entrada = dict(id=ident, taxon=taxon, nivel=nivel, dominio=dom, codigo=tema, fonte=fonte_url(r["fontes"]), justificativa=just)
        if pontua:
            cadastro.append(Ficha(ident, taxon, nivel, dom, int(r["gravidade_proposta"]), aplicabilidade_provisoria(r, nivel), "*", tema, entrada["fonte"], just))
            meta[ident] = {"origin": "revisão de 23/11", "evidence": f"provisória, evidência {r['forca_evidencia']}" + ("" if r["categoria"] == "DEM" else ", por parente")}
        else:
            motivo = "decisão já aprovada para este organismo tem precedência" if (taxon, dom) in aprovadas and r["categoria"] in ("DEM", "PAR") else r["categoria_txt"]
            registradas.append(dict(entrada, gravidade=int(r["gravidade_proposta"]) if r["gravidade_proposta"] in ("1", "2", "3") else None))
            meta[ident] = {"origin": "registrada, sem nota", "evidence": motivo}
assert len({f.id for f in cadastro}) == len(cadastro)
import os
CONFERIR_BASE = os.environ.get("CONFERIR_BASE") == "1"      # prova do encadeamento: com o cadastro de 20/11, tem de dar as notas publicadas
if CONFERIR_BASE:
    cadastro = list(base); registradas = []

# ---------- motor ----------
import motor as M  # noqa: E402
APROVADA = ("CUR-", "CAT-", "CON-")


def escolher(fichas, dominio):
    """Como no motor (uma ficha por táxon e categoria, a de maior peso), com uma regra a mais: ficha aprovada pelo
    administrador tem precedência sobre as provisórias, mesmo quando uma provisória de família ou grupo pesaria mais."""
    cand = [f for f in fichas if f.dominio in (dominio, "*")]
    decididas = [f for f in cand if f.decidida]
    nota = max(decididas, key=lambda f: (f.id.startswith(APROVADA), f.peso, f.id), default=None)
    teto = max((f for f in cand if not f.contestada), key=lambda f: (f.peso_teto, f.id), default=None)
    return nota, teto


M.escolher = escolher
F.ler = lambda caminho=None: list(cadastro)
saida, cad = R.calcular_tudo()
doc = R.materializar(saida, cad)
todas = {f.id: f for f in cadastro}

# ---------- leituras exibidas: recorte do COI e espécie só para exóticas ----------
def vale(c):
    return no_recorte(c["component"], c["taxon"]) and not (todas[c["ficha"]].nivel == "species" and c["taxon"].strip() not in EXOTICAS)


for row in doc["rows"]:
    for dom, s in row["scores"].items():
        if not s:
            continue
        antes = s["contributions"]; juntos = OrderedDict()
        for c in antes:
            if not vale(c):
                continue
            taxon, rank = rotulo(c["taxon"], c["rank"])
            chave = (c["component"], c["ficha"], taxon)
            if chave in juntos:
                v = juntos[chave]; v["reads"] += c["reads"]; v["q"] = fsum([v["q"], c["q"]])
            else:
                juntos[chave] = dict(c, taxon=taxon, rank=rank)
        s["contributions"] = sorted(juntos.values(), key=lambda c: (-c["q"], c["taxon"]))
        if any(not vale(c) for c in antes):
            massa = {}
            for c in s["contributions"]:
                massa[c["component"]] = fsum([massa.get(c["component"], 0.0), c["q"]])
            vencedor = max(massa, key=lambda k: (massa[k], k == s["component"])) if massa and max(massa.values()) > 0 else None
            s["component"] = vencedor; s["score"] = curve(min(1.0, massa[vencedor])) if vencedor else 0.0; s["floor"] = min(s["floor"], s["score"])
    alertas = OrderedDict()
    for al in row["alerts"]:
        if al["motivo"] == "alerta de parentesco" or not no_recorte(al.get("componente"), al["taxon"]):
            continue
        # Baixo suporte só vira alerta para ficha aprovada: nas provisórias, poucos reads não merecem atenção.
        if al["motivo"] == "baixo suporte" and meta[al["ficha"]]["origin"] != "aprovada" and not meta[al["ficha"]]["origin"].startswith("aprovada"):
            continue
        taxon = al["taxon"].strip()
        if al.get("componente") == "COI" and len(taxon.split()) > 1 and taxon not in EXOTICAS and taxon.split()[1][:1].islower():
            taxon = taxon.split()[0]
        chave = (al.get("componente"), al.get("ficha"), al.get("dominio"), al.get("motivo"), taxon)
        if chave in alertas:
            alertas[chave]["reads"] += al["reads"]
        else:
            alertas[chave] = dict(al, taxon=taxon)
    row["alerts"] = list(alertas.values())

# ---------- notas do método 3.0 (núcleo results-08-core.ts) ----------
catalogo = (repo / "src/lib/capture-index/effect-catalog.ts").read_text(encoding="utf8")
semantic = {}
for effect, component, cards in re.findall(r'\{ id: "([^"]+)", title: "[^"]+", component: ("[^"]+"|null), note: "[^"]*", cards: (\[[^\]]*\]) \}', catalogo):
    for card in json.loads(cards):
        semantic[card] = (effect, json.loads(component))
TOKEN = {h: i for i, h in enumerate(ADJ.T)}
batch = []
for row in doc["rows"]:
    cats = []
    for j, dom in enumerate(DS):
        s = row["scores"][dom]
        if s is None:
            cats = None; break
        massa = {}
        for c in s["contributions"]:
            massa[c["component"]] = fsum([massa.get(c["component"], 0.0), c["q"]])
        vencedor = s["component"] if s["component"] and massa.get(s["component"], 0) > 0 else None
        if vencedor:
            assert abs(curve(min(1.0, massa[vencedor])) - s["score"]) < 1e-12, (row["campaign"], row["sia"], dom)
            seq = []
            for c in s["contributions"]:
                if c["component"] != vencedor:
                    continue
                k = TOKEN.get(sha256(c["ficha"].encode("utf-8")).hexdigest())
                effect, marker = semantic.get(c["ficha"], (None, None)); f = todas[c["ficha"]]
                typ = "sensorial" if effect == "odour" else "sanitaria-distinta" if effect == "cyanotoxins" else "generica"
                ev = bool(marker == vencedor and f.dominio == dom and f.fonte and f.justificativa and not f.contestada)
                seq.append((k, c["q"], typ, ev))
            seq.sort(key=lambda v: (v[1], -1 if v[0] is None else v[0], v[2], v[3]))
            cat = dict(winner=0, components=[dict(component=0, complete=True, items=seq)])
        else:
            u = {k: v for k, v in row["components"].items() if v["status"] == "disponível" and v["validReads"] > 0}
            ev = s["evaluatedByComponent"]
            assert u and set(u) == set(ev)
            cat = dict(winner=None, enumeratedUsableCount=len(u), components=[dict(component=i, complete=True, positiveDenominator=True, assessedFraction=min(1.0, ev[k]), items=[]) for i, k in enumerate(sorted(u))])
        cats.append(dict(domain=DOMS[j], **cat))
    if cats is not None:
        batch.append(dict(campaign=int(row["campaign"]), sia=str(row["sia"]), categories=cats))
sem_medicao = [(r["campaign"], r["sia"]) for r in doc["rows"] if any(r["scores"][d] is None for d in DS)]

fonte_js = (repo / "scripts/indice-08/gerar_pontos_08.py").read_text(encoding="utf8")
js = fonte_js.split('js = r"""', 1)[1].split('"""', 1)[0]; agg_js = fonte_js.split('agg_js = r"""', 1)[1].split('"""', 1)[0]
r1 = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", js, str(core)], input=json.dumps(batch), text=True, capture_output=True, encoding="utf8")
if r1.returncode:
    raise SystemExit("Falha no núcleo: " + r1.stderr)
rows = json.loads(r1.stdout)
anterior = {(x["campaign"], x["sia"]): x for x in json.loads(f_pts.read_text(encoding="utf8"))["rows"]}
for k in sem_medicao:
    rows.append(dict(campaign=int(k[0]), sia=str(k[1]), geral=None, ambiental=None, operacional=None, saude=None))
assert {(x["campaign"], x["sia"]) for x in rows} == set(anterior), "O conjunto de observações mudou."
rows.sort(key=lambda x: (x["campaign"], int(x["sia"]) if x["sia"].isdigit() else 10**9, x["sia"]))
r2 = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", agg_js], input=json.dumps(rows), text=True, capture_output=True, encoding="utf8")
if r2.returncode:
    raise SystemExit(r2.stderr)
grupos = json.loads(r2.stdout)

if CONFERIR_BASE:
    dif = [(x["campaign"], x["sia"], k, anterior[(x["campaign"], x["sia"])][k], x[k]) for x in rows for k in ("geral",) + DOMS if anterior[(x["campaign"], x["sia"])][k] != x[k]]
    print("Conferência com o cadastro de 20/11:", len(rows), "observações;", len(dif), "diferenças", dif[:5]); raise SystemExit(1 if dif else 0)
# ---------- relatório antes/depois ----------
FAIXAS = (0.05, 0.15, 0.35, 0.70); NOMES = ("Sinal muito baixo", "Sinal fraco", "Atenção", "Prioridade", "Prioridade máxima")
faixa = lambda v: None if v is None else sum(v >= t for t in FAIXAS)
rel = {"campanhas": {}, "pontos": []}
for camp in (1, 2, 3):
    novos = [x for x in rows if x["campaign"] == camp]; velhos = [anterior[(camp, x["sia"])] for x in novos]
    def resumo(lista):
        v = sorted(x["geral"] for x in lista if x["geral"] is not None)
        ordem = sorted((x for x in lista if x["geral"] is not None), key=lambda x: (-x["geral"], int(x["sia"])))
        return {"media": fsum(v) / len(v), "mediana": v[(len(v) + 1) // 2 - 1], "faixas": [sum(faixa(x) == i for x in v) for i in range(5)],
                "dominios": {d: fsum(x[d] for x in lista if x[d] is not None) / max(1, sum(x[d] is not None for x in lista)) for d in DOMS},
                "top10": [x["sia"] for x in ordem[:10]], "posicao": {x["sia"]: i + 1 for i, x in enumerate(ordem)}}
    a, d = resumo(velhos), resumo(novos)
    rel["campanhas"][f"C{camp}"] = {"antes": {k: v for k, v in a.items() if k != "posicao"}, "depois": {k: v for k, v in d.items() if k != "posicao"},
        "mudaramDeFaixa": sum(faixa(n["geral"]) != faixa(o["geral"]) for n, o in zip(novos, velhos)), "subiram": sum((faixa(n["geral"]) or 0) > (faixa(o["geral"]) or 0) for n, o in zip(novos, velhos)),
        "desceram": sum((faixa(n["geral"]) or 0) < (faixa(o["geral"]) or 0) for n, o in zip(novos, velhos)),
        "referencia": {s: {"antes": [a["posicao"].get(s), anterior[(camp, s)]["geral"]], "depois": [d["posicao"].get(s), next(x["geral"] for x in novos if x["sia"] == s)]} for s in ("78", "780", "559", "760", "188") if (camp, s) in anterior}}
    for n, o in zip(novos, velhos):
        rel["pontos"].append({"campanha": camp, "sia": n["sia"], "antes": o, "depois": n})
usadas = {c["ficha"] for row in doc["rows"] for s in row["scores"].values() if s for c in s["contributions"]} | {al["ficha"] for row in doc["rows"] for al in row["alerts"] if al.get("ficha")}
rel["fichas"] = {"cadastro": len(cadastro) + len(registradas), "pontuam": sum(1 for f in cadastro if f.decidida and f.peso > 0), "usadasNasCampanhas": len(usadas),
                 "porOrigem": dict(Counter(meta[i]["origin"] for i in list(todas) + [x["id"] for x in registradas]))}
contrib = Counter()
for row in doc["rows"]:
    for dom, s in row["scores"].items():
        for c in (s or {}).get("contributions", []):
            if c["component"] == s["component"]: contrib[(row["campaign"], dom, c["taxon"])] += c["q"]
rel["maioresContribuicoes"] = {f"C{camp} {dom}": [(t, round(q, 4)) for (cc, dd, t), q in contrib.most_common() if cc == camp and dd == dom][:8] for camp in (1, 2, 3) for dom in DS}

# ---------- gravação ----------
agg = json.loads(f_agg.read_text(encoding="utf8"), object_pairs_hook=OrderedDict); agg["grupos"] = grupos
f_agg.write_text(json.dumps(agg, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="")
novo_bytes = hashlib.sha256(f_agg.read_bytes()).hexdigest()
novo_proj = subprocess.run(["node", "-e", "const fs=require('fs'),c=require('crypto');process.stdout.write(c.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],'utf8')))).digest('hex'))", str(f_agg)], text=True, capture_output=True, check=True).stdout.strip()
f_pts.write_text(json.dumps(dict(schema="yvae-capture-index-08/1", version="0.8", policy="sinal-documentado/1", provenance="adjudicated-component-masses/v1",
    aggregateSha256=hashlib.sha256(json.dumps(grupos, sort_keys=True, separators=(",", ":")).encode()).hexdigest(), coreSha256=hashlib.sha256(core.read_bytes()).hexdigest(),
    rows=[dict(campaign=x["campaign"], sia=x["sia"], geral=x["geral"], ambiental=x["ambiental"], operacional=x["operacional"], saude=x["saude"]) for x in rows]), ensure_ascii=False, indent=1) + "\n", encoding="utf8", newline="")

def ficha_json(i, taxon, nivel, dominio, codigo, gravidade, aplicabilidade, contestada, fonte, justificativa):
    return {"taxon": taxon, "level": nivel, "domain": dominio, "code": codigo, "severity": gravidade, "applicability": aplicabilidade, "contested": contestada, "source": fonte, "rationale": justificativa,
            "origin": meta[i]["origin"], "evidence": meta[i]["evidence"], "used": i in usadas, **({"theme": TEMAS[codigo]} if codigo in TEMAS else {})}

doc["fichas"] = {f.id: ficha_json(f.id, f.taxon, f.nivel, f.dominio, f.codigo, f.gravidade, f.aplicabilidade, f.contestada, f.fonte, f.justificativa) for f in cadastro if f.dominio in DS}
doc["fichas"].update({x["id"]: ficha_json(x["id"], x["taxon"], x["nivel"], x["dominio"], x["codigo"], x["gravidade"], None, False, x["fonte"], x["justificativa"]) for x in registradas})
doc["fichas"] = dict(sorted(doc["fichas"].items()))
doc["fichasTotal"] = len(doc["fichas"])
doc["parameters"]["coiFreshwaterScope"] = {"fonte": "Matrizes por SIA do Marcio, entrega de 13/11/2026", "generos": len(GEN), "familias": len(FAM), "exoticasEmEspecie": sorted(EXOTICAS),
    "regra": "táxon COI fora do recorte de água doce não pontua nem gera alerta; os reads continuam no total; ficha e rótulo de espécie só para exóticas sustentadas"}
doc["parameters"]["provisionalCards"] = {"data": "2026-11-24", "regra": "fichas da revisão de 23/11 e fichas herdadas de espécie entram com valores provisórios, a refinar"}
publicado = json.loads(f_idx.read_text(encoding="utf8"))
doc["blindSpots"] = publicado["blindSpots"]      # textos editoriais mantidos como estão no aplicativo
PROV = " Desde 24/11/2026 pontuam também fichas provisórias, a refinar: as da revisão bibliográfica de 23/11 e as herdadas de espécie do gênero."
doc["maturity"] = {
    "Ambiental": {"nivel": "evidência parcial", "texto": "Fichas aprovadas: Corbicula, black bass e Raphidiopsis." + PROV + " A base da categoria vem de gêneros comuns em água doce com alguma espécie de efeito descrito (ex.: Flavobacterium, Acinetobacter), com peso de minoria."},
    "Operacional": {"nivel": "evidência parcial", "texto": "Fichas aprovadas: gosto e odor (Dolichospermum e Pseudanabaena), larvas de quironomídeos, incrustação (mexilhão-dourado e Cordylophora) e diatomáceas acima da base da rede (leitura exploratória do cloroplasto no 16S)." + PROV + " Entraram, entre outras, nitrificação, ferro e manganês e odor de algas. Mosquito-fantasma em desenvolvimento, fora da nota. Não foi confrontado com datas de ocorrências reais."},
    "Saúde humana": {"nivel": "com base de comparação", "texto": "Microcystis segue como a ficha que mais pesa nos pontos de nota alta; o peso dela é convenção aprovada em 20/11. A assinatura de esgoto (anaeróbios de intestino acima da base da rede) continua aprovada." + PROV + " A comparação com os grupos de risco do laboratório foi feita antes dessas fichas e precisa ser refeita."},
}
doc["status"] = "cadastro completo de fichas em 24/11/2026; fichas da revisão de 23/11 e herdadas de espécie com valores provisórios"
doc["rowsSha256"] = hashlib.sha256(json.dumps(doc["rows"], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
f_idx.write_text(json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf8", newline="")
for arquivo, padrao, valor in ((repo / "src/lib/results-08-contract.ts", r'(RESULTS_08_SOURCE_SHA256 = ")[0-9a-f]{64}(")', novo_bytes),
                               (repo / "src/lib/results-08-aggregate.ts", r'(digest\("hex"\) !== ")[0-9a-f]{64}(")', novo_proj),
                               (repo / "src/lib/capture-index/exotics-reconciliation.ts", r'(reconciliationIndexHash = ")[0-9a-f]{64}(")', doc["rowsSha256"])):
    t = arquivo.read_text(encoding="utf8"); t2, n = re.subn(padrao, lambda m: m.group(1) + valor + m.group(2), t)
    assert n == 1, arquivo
    arquivo.write_text(t2, encoding="utf8", newline="")
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(rel, ensure_ascii=False, indent=1), encoding="utf8")
print("Fichas:", rel["fichas"])
for camp, v in rel["campanhas"].items():
    print(camp, "média", round(v["antes"]["media"], 3), "->", round(v["depois"]["media"], 3), "| faixas", v["antes"]["faixas"], "->", v["depois"]["faixas"], "| mudaram", v["mudaramDeFaixa"], "(subiram", v["subiram"], "desceram", v["desceram"], ")")
    print("   top10 antes", v["antes"]["top10"]); print("   top10 depois", v["depois"]["top10"]); print("   referência", {s: (x["antes"][0], round(x["antes"][1] or 0, 2), x["depois"][0], round(x["depois"][1] or 0, 2)) for s, x in v["referencia"].items()})
print("Identidades:", novo_bytes[:12], novo_proj[:12], doc["rowsSha256"][:12])

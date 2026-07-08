# Regras do projeto — Mapas de percurso e Governança de importação

Documento de referência com as regras definidas pelo usuário. Fonte da verdade
das decisões de negócio; o código deve segui-lo. Última atualização: 2026-07-08.

---

## A. Governança de importação de planilhas

1. **Sem duplicidade.** A planilha observa o que já existe no app: dado igual não
   duplica (mantém o do app); dado novo é acrescentado; nunca duplica.
2. **O banco do app é a fonte final da verdade.** A planilha é porta de entrada,
   não a "base viva" para sempre.
3. **Cada campanha é independente.** Pontos de campanhas diferentes não precisam
   coincidir nem se sobrepor; cada campanha tem coordenadas, dias e trajetos
   próprios.
4. **Campanha 1 já está consolidada — não se mexe nela.** Uma importação da C2 não
   pode alterar a C1.
5. **Campanha em implantação: a planilha da própria campanha é a verdade.** Ao
   importar, ela substitui os dados preliminares daquela campanha e vira a base
   oficial dela.
6. **Depois da consolidação manual no app, o app ganha da planilha.** Uma nova
   importação não pode sobrescrever silenciosamente dado revisado/consolidado —
   deve gerar conflito/pendência.
7. **Matriz de quem prevalece:**
   | Situação | Prevalece | Ação |
   |---|---|---|
   | Novo (sem equivalente) | Planilha | Insere |
   | Existente ainda preliminar/importado | Planilha | Atualiza (mantém histórico) |
   | Editado manualmente no app | App | Conflito; não sobrescreve sem decisão |
   | Consolidado/revisado no app | App | Não sobrepõe; gera pendência |
   | Linha ausente na nova planilha | App | Não apaga; marca "ausente na importação" |
   | Exclusão | Ninguém automático | Só por ação explícita do usuário/admin |
8. **Conflitos nunca são resolvidos silenciosamente.**
9. **Preservar histórico** das alterações (valor anterior, novo, origem, usuário,
   data/hora).
10. **Preservar a ordem das linhas da planilha como sequência de coleta** (afeta o
    traçado do percurso).
11. **Relatório de importação** em grupos: novos, atualizados, inalterados,
    conflitantes, ausentes.
12. **Status de governança** por campanha e/ou registro:
    `importado/preliminar` → `em revisão` → `consolidado` / `corrigido manualmente`.
    Idealmente com tela de prévia antes de gravar.

**Frase-resumo:** *Planilha vence enquanto a campanha está aberta/preliminar; o
aplicativo vence depois que o dado foi revisado/consolidado; conflitos nunca são
resolvidos silenciosamente.*

---

## B. Mapa de campanha (mapa de percurso)

13. **É mapa de percurso, não de resultados** → **todos os pontos pretos** (nada de
    amarelo).
14. **Mesmo dia = uma linha grossa, cheia e colorida**, seguindo o trajeto
    rodoviário entre os pontos daquele dia.
15. **Entre dias = linha pontilhada** (último ponto de um dia → primeiro do dia
    seguinte).
16. **O mapa NUNCA adivinha o trajeto:** só desenha sobre a geometria rodoviária
    real (OSRM); **sem fallback de reta** (só o deslocamento previsto→efetivo
    continua reto). Se a via não resolve, o trecho fica sem linha.
17. **Tracejado só entre DATAS ADJACENTES.** Se a coleta do dia seguinte não foi na
    data imediatamente posterior (houve intervalo), não se liga — a nova data
    recomeça como novo ponto de partida.
18. **Ordem dentro do dia = sequência de coleta** (ordem das linhas da planilha),
    não ordem alfabética do SIA.
19. **Tooltip (hover) mostra:** campanha, dia da campanha, data da coleta,
    sequência de coleta, código SIA, número do SIA (se houver), local/reservatório,
    município e rio (se houver).

---

## C. Regras técnicas do mapa (refinamento 2026-07-08)

20. **Chave de rota = `campaignId + data real da coleta`**, não o "dia da campanha"
    (que é só rótulo/ordem auxiliar).
21. **Sequência persistida por ponto** (`collection_order`/`import_row_index`): a
    ordem das linhas da planilha vira dado no banco. **Não depender de `created_at`.**
22. **Roteamento por trecho** (par consecutivo), não por dia inteiro: uma perna que
    falha não derruba o dia.
23. **Sem fallback de reta** para rota diária; trecho sem rota OSRM aparece no
    **diagnóstico** ("sem rota"), não como linha.
24. **Entre dias só se as datas forem consecutivas** (diferença exata de 1 dia).
25. **Limpar camadas antigas antes de redesenhar** (canvas é redesenhado inteiro a
    cada frame; só as requisições da campanha atual são mapeadas).
26. **Proibido usar localStorage/cache como fonte da lista de pontos.** O mapa de
    campanha usa só o Diário do banco (`no-store`). Cache serve só para geometria
    OSRM.
27. **Toda polyline do app tem tipo explícito** (`daily`/`transition`/`displacement`);
    tipo não reconhecido não renderiza. **Nenhuma polyline do app é preta contínua**
    (linhas escuras só de bacias/limites administrativos, nunca da camada de percurso).
28. **Diagnóstico de rota**: total de pontos, datas com rota, trechos diários
    esperados/com rota/sem rota, ligações entre dias desenhadas e ignoradas por
    intervalo (console em dev + atributos `data-*` no container).
29. **Correções filtram rigidamente por campanha** (C2), nunca atualização global.
    A C1 é intocável.

---

## Estado de implementação (2026-07-08)

**Feito e verificado (local — typecheck, lint, build, testes):**
- Governança: 1–8, 10; colunas `governance_status`/`collection_order`/
  `missing_in_import`; C1 `consolidado` (travada), C2 `importado`; import devolve
  `report`; edição manual → `corrigido`.
- Mapa: 13–29. Agrupamento por data real; ordem por `collection_order`; per-leg;
  sem reta; transição só entre datas adjacentes; tipagem de polyline + guard;
  diagnóstico (console + `data-*`); tooltip completo; sem `original` fabricado
  (fim das linhas de deslocamento indevidas); OSRM estável (`openstreetmap.de`).
- UI Fase 2 (completa): **prévia interativa** antes de gravar (dry-run, `mode=preview`)
  com relatório + **conflitos lado a lado** (app × planilha) e opção **forçar**
  (sobrescreve consolidado só com confirmação); botão "Consolidar campanha"; badges
  de status/ausente na lista e na visualização.
- **Histórico por-campo persistido** (regra 9): tabela `field_diary_change_log`
  (valor anterior/novo, origem planilha/app, usuário, data); gravado no import e na
  edição manual; exibido na visualização do registro.
- Testes (29): `campaign-hydro-map.routes` (sem segmento preto contínuo + data +
  adjacência); `conflict-detection` (governança preliminar/protegido, force, diff).
- Diagnóstico real C2: 77 pontos, 27 datas, 50 trechos diários, 23 tracejados,
  3 intervalos ignorados.

**Pendente:** aplicar as migrations na **nuvem** + **deploy** (só com aprovação;
código+migrations/re-sync hoje são apenas locais).

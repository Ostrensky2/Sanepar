# Paridade do dashboard de campanhas — metodologia 0.3

Escopo: somente Monitoramento/Campanhas. A referência histórica orienta organização e exploração, nunca valores, classes ou etiquetas científicas. Home e núcleo de cálculo permanecem preservados. Documento sem dados privados; evidências visuais ficam fora do repositório.

## Matriz de fechamento local

| Original | Destino | Fonte necessária | Adaptação 0.3 | Evidência / estado final local |
|---|---|---|---|---|
| Panorama executivo | Panorama | Campanha core + agregações autenticadas | Municípios/mananciais distintos; táxons/linhas explicitamente distintos; média/mediana somente completos e denominador | Implementado; contrato sintético de exclusões e limites; captura nova C1 desktop |
| Esforço molecular | Panorama e cada conjunto | Componentes + registros da mesma origem | Reads separados, sem equivalência biológica entre marcadores | Implementado; consultas reais C1/C2 e cobertura por conjunto; sem interpretação de abundância |
| Classes de risco | Histograma Panorama | Índices completos | Faixas numéricas fixas 0–1, sem categorias qualitativas | Implementado; teste de bordas e último intervalo fechado; sem classes agregadas |
| Top pontos e ranking | Prioridades | Rank e índices canônicos | Empates incluídos no corte; parciais sem posição; índices por domínio e situação | Implementado; contratos de empate/ausência; revisão E8 aplicada: parciais excluem indisponíveis e rótulo Posição na campanha |
| Mapa e municípios | Prioridades | Campanha+SIA, coordenadas e fotos vinculadas | Paleta e zoom mantidos; coordenada suspeita não plotada, sem remover de totais | Implementado; mapa C2 real, seleção e abertura explícita da ficha; duplo clique mantém zoom; contrato da anomalia específica |
| Alertas | Alertas | Join literal organismo→catálogo→evidência | Associação bibliográfica ≠ confirmação local; incluir parciais | Implementado; registro real C2 abriu ficha comum; lacunas de recomendação permanecem explícitas |
| Reads e frequência | Três abas moleculares | DTO E5 agregado por conjunto | Frequência por SIA distinto positivo; universo explícito | Implementado; C1 busca/Top N mantiveram denominador; C2 COI e bactérias carregados; capturas desktop/mobile |
| Heatmaps | Três abas moleculares | DTO E5 ponto×táxon, N íntegro | Proporção por campanha+SIA+conjunto; zero/ausente/não utilizável distintos | Implementado; paginação real dos dois eixos e abertura de ficha; correção de contenção sr-only; viewport390/root384 no fechamento |
| Toxinas e gosto/odor | Cianobactérias | Contrato E8/catálogo atual | Nunca inferir por gênero/score/palavra improvisada | Restrição E8 integrada: texto bibliográfico contextual; gosto/odor sem relação curada permanece lacuna, não inferência |
| Agrupamentos/interesse COI | Eucariotos COI | Taxonomia e evidências atuais | Grupo taxonômico ≠ função ecológica; não copiar invasores antigos | Restrição E8 integrada: agrupamentos funcionais/invasores não sustentados ficam explicitamente indisponíveis |
| Ficha técnica | Ficha única | Core + campo/foto exatos + registros/contribuições | Contexto não entra na fórmula; contribuição Q não aditiva ao índice geral | Confirmada carga real C2 de contribuições e registros, origem explícita e Esc; captura privada ficha-carregada-390. Foto retornou500: fallback correto, imagem não validada |
| Método/disclaimers | Método | Versões, metadados e avisos do parser | Disponível provisório ≠ aprovado; reads ≠ abundância/viabilidade/toxina | Preservado em código/contrato e revisão E8; sem nova reinspeção visual específica da aba Método no fechamento |
| Histórico | Área adicional, sem substituir sete abas | Campanhas da mesma origem e versões | Média completos com inclusões/exclusões, parciais como limites, lacunas sem ligação | Implementado; histórico real com intervalos parciais C1/C2 e tabela carregada; captura390. Comparabilidade de protocolo não estabelecida |
| Exportação | Ação Resultados | Endpoint privado E5 | Mesma origem consultada; sem asset público novo | Integrado; E5 comprovou download integral autenticado200/hash e publicação sem binário409; contrato UI protege aviso prévio de escopo, não recorte |

## Procedimento reproduzível

1. Preparar e curar as sete abas do modelo, metadados e catálogo; revisar fontes e permissões.
2. Expandir tabelas, intervalos, buscas, resumos e fórmulas para a nova campanha; acrescentar linhas não basta.
3. Recalcular em ferramenta compatível e validar independentemente hash, versões, denominadores, caches e identidades campanha+SIA.
4. Abrir prévia explicitamente. Confirmar população, conjuntos, completos/parciais, mapas, heatmaps e evidências; registrar limitações.
5. Selecionar campanhas e publicar somente com autorização específica. Esta ordem não publica.
6. Exportar/reimportar a origem consultada por rota autenticada; conferir identidade e paridade sem exposição pública.
7. Conferir desktop/mobile, filtro vazio, indisponibilidade, versão alterada e troca de campanha sem resíduos.
8. Registrar versões/hash e evidências em armazenamento privado. Nunca anexar XLSX/dados privados a Git, public ou bundle.

## Evidência

Os testes e capturas anteriores são históricos e não validam este delta. Não foi usado scratch como evidência local.

## Implementação local desta execução

- `campaign-overview`: estatísticas descritivas com denominador, cobertura por conjunto, histograma fixo, empates incluídos, mapa exclusivo da campanha. A anomalia documentada de coordenada é específica do SIA/campanhas identificados; não é regra universal latitude=longitude.
- `campaign-molecular`: agregações autenticadas E5; gráficos reads/frequência com valores fora das barras, Top N e listas roláveis, busca contextual; heatmap paginado nos dois eixos, proporção e numerador/denominador acessíveis. Sem recomputar N no cliente.
- `campaign-point-ficha`: acesso comum por mapa (ação explícita preservando duplo clique), ranking, heatmap e registro/alerta. Contexto/foto por campanha+SIA, componentes e cobertura, maiores reads e q por domínio/conjunto.
- `campaign-history`: área adicional às sete abas, gráfico fixo 0–1 sem conectar lacunas, média/mediana e população em tabela; ponto parcial como intervalo sem centro. Protocolo não informado mantém comparabilidade não estabelecida.
- Proveniência compacta e detalhável; origem/hash/versões verificados antes de apresentar agregações. Payload publicado sem registros moleculares completos continua com indisponibilidade explícita; a prévia corrigida é carregada somente por ação do usuário.
- Exportação: ação Resultados descreve antecipadamente que o binário da prévia é a fonte integral, com todas as campanhas. Publicação sem binário verificável resulta em bloqueio honesto, sem fallback para arquivo antigo. Links de Entrada usam o endpoint protegido. Não há nova exposição de dados privados no cliente estático/Git.
- Lacunas E8 preservadas: gosto/odor sem mapeamento curado; grupos COI/funcionais/invasores sem relação versionada; confirmação sem recomendação+referência+responsável. Toxina/composto aparece como texto bibliográfico contextual, não flag ou produção confirmada. Associações por domínio mantêm efeito, contexto e limitações; nenhuma tag nasce de gênero/score/regex.

## Validação e limitações

Testes focais de UI, estatísticas, empates, paginação, links protegidos e contenção acessível da tabela Q passaram no fechamento (3 arquivos/19 testes). ESLint dos 12 arquivos do delta, `npm run typecheck` e `git diff --check` passaram; diff-check emitiu apenas avisos de normalização CRLF. Após saneamento do cache por E7, foi executado um único `npm run build`: exit0, Next16.3.1, TypeScript aprovado e59/59páginas geradas. As sete abas da referência histórica e as novas superfícies representativas C1/C2 foram capturadas em desktop/mobile em pasta privada externa ao repositório; não se declara equivalência científica de classes antigas.

Fechamento browser: ficha C2 efetivamente carregada, sem estados de loading remanescentes; Esc fechou o dialog. Foto apresentou HTTP500 com indisponibilidade explícita. Não se declara console limpo nem carregamento da imagem. Analytics teve latência observada por E5 de21,322s fria/7,798s quente; não há aceite irrestrito de performance. Gosto/odor, funções COI, recomendações curadas e comparabilidade de protocolo mantêm lacunas de fonte explícitas. Publicação sem binário verificável permanece409.

Privacidade: remoção de ativos públicos e extração server-only foram executadas por E5 com recibo externo. E7 preservou o cache dev antigo fora da árvore servida e regenerou o runtime: controle positivo em7 chunks antigos; zero ocorrências dos76 objetos privados completos, em formas normal/escaped, nos35 chunks novos efetivamente servidos HTTP200. Após o build único, E7 também verificou32 chunks client finais (2.746.717bytes): zero ocorrências desses76 objetos completos nas duas formas. A referência privada teve hash validado antes da comparação. Esses resultados delimitados não são auditoria universal/histórica nem prova de ausência de todo fragmento derivado. Nenhuma publicação, alteração de cálculo, Home ou stash foi realizada neste fechamento; hashes das quatro superfícies protegidas permanecem iguais ao baseline.

A reinspeção identificou compressão da tabela Q em390px. Correção estritamente visual: largura mínima42rem, espaçamento entre colunas, células sem quebra/truncamento e região horizontal nomeada/focável. Captura privada `novo-c2-ficha-tabela-corrigida-390.png`, após regeneração do cache, confirma Score/q separados e “Não calculado” integral ao rolar internamente.

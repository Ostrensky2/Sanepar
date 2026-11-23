# Quadro de evidências por efeito

**Leitura da amostra selecionada.** O modelo `point-library-evidence.ts` consome apenas o extrato de campanha + SIA que o painel já recebeu. Preserva a ficha e a fonte publicadas e distingue uma contribuição no componente determinante do domínio de outra contribuição observada. “Determinante” não significa causa do dano. Ausência de contribuição listada, escore zero e falta de medição são estados diferentes. Biblioteca ausente não apresenta zero observado; inconclusiva conserva a contagem observada sem denominador utilizável. Quando utilizável, mostra o denominador publicado, inclusive para ALGAS, em que ele pode ser maior que o subtotal observado. Não há consulta nova ao catálogo, endpoint de amostra, atribuição adicional de mecanismo específico por instalação ou conclusão sobre dano. O quadro agregado continua sendo a fonte para a frequência por tipo de efeito.

O quadro em `/campanhas/resultados` resume a campanha selecionada. Não é um novo índice, não ordena captações e não atribui uma falha física ou um dano observado a uma captação. A ficha individual preexistente continua disponível. A API de resumo exige `data.view`, aceita apenas o número da campanha e não entrega SIA, local, táxon, fichas individuais ou reads por ponto.

**Unidade.** Em um mesmo efeito e campanha, uma observação conta uma vez mesmo com várias fichas ou alertas. A contribuição deve estar registrada com Q positivo. O componente determinante é o que definiu a nota **do domínio**; não significa causa única da nota geral. “Só em outro componente” exclui quem já contribuiu no determinante. Baixo suporte é contado separadamente e pode coexistir com uma contribuição de outra ficha na mesma observação. Uma observação pode ter efeitos diferentes; as linhas não devem ser somadas.

**Denominador.** Cada efeito usa os pontos com componente utilizável: COI, 16S ou ALGAS (leitura do cloroplasto no próprio 16S). Não se somam ALGAS e 16S. Sem componente utilizável não se calcula frequência. Sem marcador que avalie o mecanismo, não existe denominador: isso é diferente de nenhuma ficha listada entre os avaliáveis. Uma campanha sem publicação não tem observações, não “zero casos”.

**Catálogo e limites.** Só há correspondência por identificador de ficha, nunca por gênero, nome parecido ou código genérico do domínio. As categorias operacionais e a assinatura fecal seguem o contrato do índice (`INDICE_CAPTACAO_0.8_POR_PONTO.md`). As quatro fichas curadas de saúde S3 discriminadas no modelo têm fontes bibliográficas próprias: DOI 10.3390/toxins14110778, 10.3390/toxins16110457, 10.3390/toxins12060368 e 10.3389/fmicb.2021.793544. A ficha ambiental CUR-Raphidiopsis-A documenta potencial de toxicidade para animais e cita esta última fonte. O mesmo artigo não é evidência independente em duplicata. Ambos os grupos exigem contribuição de 16S no domínio correspondente; não medem toxina, exposição ou dano.

| Campanha | Contribuições positivas | Mecanismo discriminado | Sem mecanismo discriminado neste quadro |
|---|---:|---:|---:|
| C1 | 381 | 122 | 259 |
| C2 | 472 | 276 | 196 |
| C3 | 444 | 171 | 273 |
| Total | 1.297 | 569 | 728 |

As 728 contribuições restantes continuam apresentadas por domínio e já participam da nota; não são achados negativos. A tabela conta contribuições, não pontos ou estudos. A frequência por efeito na interface conta pontos distintos entre bibliotecas utilizáveis; não é probabilidade de detectar o efeito.

**Exóticas.** Procedência, candidatas e reatribuições são tratadas no quadro independente de reconciliação, sem inferir invasão estabelecida. A verificação dos descritores publicados encontra 39/58, 51/72 e 26/48 pontos com exótica listada entre os que têm COI utilizável: 116/178; não usar os 225 pontos como denominador. As duas seções não recalculam a nota.

**Preservação.** `indice-captacao.json` permaneceu idêntico ao blob Git `9a1a4f974b94d10c67e23cf37ede33e9f0455939` do SHA `3076b3c`. A fórmula, os pesos e as exportações não foram alterados. O teste lê as 225 observações e verifica a preservação de 900 campos numéricos (três domínios e geral por observação) antes e depois da agregação. Isso não equivale a nova validação ambiental ou a nova comparação com XLSX. Os números 6/10 e 5/10 são usados apenas em fixture sintética.

# Resultados só pelas matrizes por SIA do Marcio (24/11/2026)

Decisão do administrador: o aplicativo não lê a planilha antiga do laboratório
(banco de setembro de 2026, em espécie). Os resultados são tratados por grupo,
gênero e família; espécie só para exóticas com identificação sustentada.

## Fonte

Entrega do Marcio de 13/11/2026: 16 matrizes por SIA (16S e COI; C1, C2, C3 MiSeq e
C3 NextSeq; gêneros e famílias), com as abas "Grupos de risco" (16S) e "Exóticas" (COI).
Só análises do Marcio. Campanhas independentes; nada é somado entre campanhas.
Na C3 usa-se o NextSeq quando a biblioteca tem reads e não é inconclusiva; senão, o
MiSeq, por SIA e marcador. As corridas nunca são somadas.

## O que cada tela lê

| Tela | Fonte |
| --- | --- |
| Resultados › Organismos | planilha unificada vigente da campanha, no acervo privado (Central de dados › Planilhas de resultados) |
| Ciência e método › Impactos potenciais | fichas usadas pelo índice (`indice-captacao.json`) |
| Notas 0.8 (todas as telas e exportações) | `pontos-0.8.json` e `results-08-aggregate.json` |
| Central de dados e Campanhas (pontos com resultado) | índice 0.8 (`/api/results/capture-index`) |

As matrizes completas por SIA não entram no repositório, que é público. A tela de
Organismos lê as abas `16S generos`, `16S familias`, `Associações 16S`, `COI generos`,
`COI familias` e `Exóticas COI` da planilha unificada (`src/lib/results-organisms`), no
servidor, e guarda o resultado em memória; a cada minuto confere se a planilha vigente
mudou. Cada SIA usa a mesma biblioteca que deu a nota do índice. Uma campanha nova
aparece quando a planilha unificada dela é gerada e guardada na Central de dados.

As notas e fichas são regeradas por `scripts/indice-08/recorte_marcio.py`, que recebe a
pasta das 16 matrizes como argumento.

## Regras do índice

1. COI no recorte de água doce do Marcio: táxon COI cujo gênero ou família não é coluna
   das matrizes não pontua nem gera alerta. Os reads continuam no total da biblioteca.
   A retirada dos 25 grupos marinhos do denominador (20/11) não muda.
2. Ficha e rótulo de espécie só para as seis exóticas sustentadas da aba "Exóticas"
   (Aquarana catesbeiana, Cordylophora caspia, Craspedacusta sowerbii, Kellicottia
   bostoniensis, Limnoperna fortunei, Micropterus salmoides). Outra espécie é exibida
   no gênero, na mesma ficha; a nota não muda com a troca de rótulo.

Efeito nas notas: sai a cigarrinha-do-milho (Dalbulus maidis), inseto terrestre que
pontuava "dano ambiental" por ficha do catálogo antigo. Mudam só a nota ambiental de
C2 · SIA 125 (0,019 para 0,005) e de C3 · SIA 78 (0,004 para 0). Nota geral e faixa não
mudam em nenhum ponto. Saem também três alertas sem nota (Dalbulus em C2 · 377 e
Polyarthra em C3 · 135 e 760).

## Fluxo antigo desativado

`/api/imports/results` responde "sem publicação" às consultas e 410 a publicar, preparar
e excluir. As rotas de prévia, envio, modelo, documento de metodologia e consulta do
catálogo antigo foram apagadas, com a tela "Fluxo legado" e os leitores da planilha.
O que foi publicado por esse fluxo fica no banco sem ser lido; apagar é um passo de
dados, fora do código.

## Verificação

`npx vitest run src/lib/results-organisms src/app/api/results/organisms src/app/api/imports/results src/lib/capture-index`

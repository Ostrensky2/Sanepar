# Yva'e Monitoramento

Aplicacao web institucional para ATGC e Sanepar, desenhada para publicar andamento, resultados, documentos e indicadores de forma enxuta. A estrategia do MVP e simples:

- Excel local como fonte principal de curadoria
- Dropbox como origem dos arquivos grandes
- Supabase para metadados, historico e recortes operacionais
- Vercel para disponibilizacao do dashboard

## Estado atual

Esta primeira base ja entrega:

- shell do dashboard com identidade institucional
- visao geral, pontos, campanhas, documentos, dados e governanca
- preview real de planilha Excel ou CSV via `/api/imports/preview`
- endpoint de saude em `/api/health`
- modo local quando o Supabase ainda nao estiver configurado

## Rodando localmente

1. Instale dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env.local` e preencha quando quiser ligar a nuvem:

```bash
copy .env.example .env.local
```

3. Rode o app:

```bash
npm run dev
```

4. Validacoes uteis:

```bash
npm run lint
npm run typecheck
npm run build
```

## Variaveis de ambiente

- `NEXT_PUBLIC_SUPABASE_URL`: URL publica do projeto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave anonima publica do Supabase
- `NEXT_PUBLIC_DROPBOX_BASE_URL`: URL base compartilhada para abrir os arquivos publicados

## Diretriz de arquitetura

- Nao duplicar binarios pesados na camada web.
- Persistir somente o necessario para consulta, historico e rastreabilidade.
- Restringir insercoes na nuvem a perfis curadores.
- Favorecer leitura institucional da Sanepar e operacao controlada pela ATGC.

## Proximas entregas

- modelagem inicial do Supabase para pontos, campanhas, documentos e historico de importacao
- fluxo autenticado para curadoria ATGC
- publicacao de links Dropbox e metadados homologados
- importacao assistida com mapeamento de colunas e persistencia seletiva

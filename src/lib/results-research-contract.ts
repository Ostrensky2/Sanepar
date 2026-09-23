/** Client-safe contract. Values are source facts, never inferred scientific classifications. */
export const RESULTS_RESEARCH_SECTIONS = ["impacts", "occurrences", "references", "calculations", "method"] as const;
export type ResultsResearchSection = typeof RESULTS_RESEARCH_SECTIONS[number];
export type ResearchValue = string | number | boolean | null | string[];
export type ResearchProvenance = {
  sourceHash: string; revisionId: string; publicationId: string | null; sheet: string; row: number;
  headers: Record<string, string>; sourceValues: Record<string, string | number | boolean | null>;
};
export type ResearchRow = {
  id: string; values: Record<string, ResearchValue>; organismIds: string[]; associationIds: string[];
  referenceLinks: Array<{ id: string; href: string; label: string; correspondence: "explicit_identifier" | "check_required" }>;
  provenance: ResearchProvenance;
  links: Array<{ label: string; section: ResultsResearchSection; filters: Record<string, string[]> }>;
  associationSources?: Array<{ associationId:string; organismId:string; provenance:ResearchProvenance }>;
};
export type ResultsResearchResponse = {
  contractVersion: "yvae-research/1"; section: ResultsResearchSection;
  source: { sha256: string; publicationId: string; fileName: string; published: true } |
    { kind:"preparation";sha256:null;publicationId:null;fileName:string;published:false;revisionHash:string;packageKey:string };
  revision: { id: string; catalogVersion: string; calculationVersion: string | null; campaignCodes: string[] };
  columns: Array<{ key: string; label: string }>;
  fieldLabels: Record<string, string>;
  detailGroups: Array<{ label: string; keys: string[] }>;
  facets: Array<{ key: string; label: string; options: Array<{ value: string; label: string; count: number }> }>;
  rows: ResearchRow[];
  counts: { population: number; /** Impactos: linhas cujo organismo foi detectado na campanha escolhida. */ detected?: number; filtered: number; organisms: number; associations: number; referenceLinks: number; unresolvedReferenceBlocks: number };
  pagination: { offset: number; limit: number; returned: number };
  appliedFilters: Record<string, string[]>;
  scope: "current-campaigns-same-source" | "pinned-bibliography-revision";
  limitations: string[];
  method?: {
    version: string; parameters: { severityExponent: number; alpha: number; requiredSetCount: number; domainCount: number };
    stages: Array<{ id: string; title: string; formula: string; variables: string; explanation: string }>;
    example: null | { campaign: string; sia: string; set: string; domain: string; totalReads: number; scoredReads: number; coverage: number | null; signal: number | null; index: number | null };
    /** Pontos da campanha para o seletor (ordem: ranking dos completos, depois parciais). */
    points?: ResearchMethodPointOption[];
    /** Cálculo refeito, passo a passo, para um ponto: todos os conjuntos e domínios. */
    trace?: ResearchMethodTrace | null;
  };
};
export const RESEARCH_METHOD_DOMAINS = ["Ambiental", "Operacional", "Saúde humana"] as const;
export type ResearchMethodDomain = typeof RESEARCH_METHOD_DOMAINS[number];
export type ResearchMethodPointOption = { sia: string; label: string; overall: number | null; rank: number | null };
export type ResearchMethodTrace = {
  campaign: string; sia: string; waterBody: string | null; municipality: string | null; rank: number | null;
  sets: Array<{
    set: string; totalReads: number; organismCount: number; included: boolean | null; analyticalStatus: string | null;
    /** Organismos com mais reads no conjunto (no máximo 8), com a nota da literatura por domínio (null = sem nota). */
    organisms: Array<{ label: string; reads: number; proportion: number; scores: Record<ResearchMethodDomain, number | null> }>;
    domains: Record<ResearchMethodDomain, { scoredReads: number; coverage: number | null; signal: number | null; calculated: number | null; used: number | null }>;
  }>;
  /** Combinação publicada (componentes utilizados): domínio e índice geral; faixa quando falta conjunto. */
  domains: Record<ResearchMethodDomain, { value: number | null; lower: number; upper: number }>;
  overall: { value: number | null; lower: number; upper: number };
  usedSetCount: number;
};

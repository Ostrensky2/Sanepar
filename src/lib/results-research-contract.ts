/** Client-safe contract. Values are source facts, never inferred scientific classifications. */
export const RESULTS_RESEARCH_SECTIONS = ["impacts", "occurrences", "references"] as const;
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
};

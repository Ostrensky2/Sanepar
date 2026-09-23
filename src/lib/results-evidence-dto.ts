import type { SourcePreviewRow } from "./results-source-preview-contract";
export type EvidenceDto = {
  organismId: string | null; domain: string | null; effectCode: string | null;
  documentedEffect: string | null; consequence: string | null; target: string | null;
  studyContext: string | null; evidenceType: string | null; taxonomicResolution: string | null;
  applicationLimits: string | null; toxinOrCompoundSourceText: string | null;
  references: string | null; doi: string | null; catalogVersion: string | null;
  associationKey: string | null; organismLabel: string | null; score: string | null;
  scoreJustification: string | null; humanToxicity: string | null; animalToxicity: string | null;
  accessedContent: string | null; associationStatus: string | null; previousScore: string | null; reviewDate: string | null;
  themeCode: null; groupCode: null; classificationStatus: "information_unavailable";
  source: { sheet: "Evidencias_risco"; row: number; headers: Record<string,string> };
};
export const EVIDENCE_FIELDS = {
  associationKey:"Chave organismo-domínio",organismLabel:"Organismo do banco",score:"Score bibliográfico",
  scoreJustification:"Justificativa do score",humanToxicity:"Toxicidade em humanos",animalToxicity:"Toxicidade em animais",
  accessedContent:"Conteúdo acessado",associationStatus:"Situação da associação",previousScore:"Score na versão anterior",reviewDate:"Data da revisão",
  organismId:"ID organismo",domain:"Domínio",effectCode:"Código do efeito",
  documentedEffect:"Efeito ou mecanismo documentado",consequence:"Consequência potencial",
  target:"Alvo documentado",studyContext:"Contexto do estudo",evidenceType:"Tipo de evidência",
  taxonomicResolution:"Resolução da associação taxonômica",applicationLimits:"Condições e limites de aplicação",
  toxinOrCompoundSourceText:"Toxina ou composto",references:"Referências bibliográficas completas",doi:"DOI ou URL",catalogVersion:"Versão do catálogo",
} as const;
export type CatalogDto = {
  organismId:string|null; organismLabel:string|null; analyticalGroup:string|null; identifiedLevel:string|null;
  catalogVersion:string|null; groupCode:null;
  source:{sheet:"Riscos_bibliografia";row:number;headers:Record<string,string>};
};
export function catalogDto(row:SourcePreviewRow):CatalogDto {
  const headers={organismId:"ID organismo",organismLabel:"Organismo do banco",analyticalGroup:"Grupo analítico",identifiedLevel:"Nível identificado",catalogVersion:"Versão do catálogo"};
  const mapped=Object.fromEntries(Object.entries(headers).map(([key,header])=>[key,row[header]===undefined||row[header]===null?null:String(row[header])])) as Omit<CatalogDto,"source"|"groupCode">;
  return {...mapped,groupCode:null,source:{sheet:"Riscos_bibliografia",row:Number(row._sourceRow),headers}};
}
export function evidenceDto(row:SourcePreviewRow):EvidenceDto {
  const mapped=Object.fromEntries(Object.entries(EVIDENCE_FIELDS).map(([key,header])=>[key,row[header]===null||row[header]===undefined?null:String(row[header])])) as Record<keyof typeof EVIDENCE_FIELDS,string|null>;
  return {...mapped,
    themeCode:null,groupCode:null,classificationStatus:"information_unavailable",
    source:{sheet:"Evidencias_risco",row:Number(row._sourceRow),headers:{...EVIDENCE_FIELDS}},
  };
}

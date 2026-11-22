import type { CaptureIndexView } from "./index";

type Source = Pick<CaptureIndexView,"campaign"|"sia"|"components">;
type State = "usable"|"zero-observed"|"inconclusive"|"absent"|"unassessed";
const interpretations: Record<State,string> = {
  usable: "Biblioteca utilizável. O denominador é o número de reads válidos deste componente.",
  "zero-observed": "Zero reads observados no registro disponível. Proporção indefinida, não ausência de organismo.",
  inconclusive: "Biblioteca inconclusiva: a contagem observada não é denominador de avaliação.",
  absent: "Biblioteca ausente. Não houve medição; o zero de preenchimento não é uma leitura.",
  unassessed: "Situação ou denominador insuficiente para avaliar este componente.",
};

// Strings inteiras em pt-BR, conforme o DTO oficial. Não aceitar vazio/NaN como zero.
const count = (s:string) => /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(s)
  ? Number(s.replace(/\./g,"")) : NaN;

/** Lê só a observação selecionada; não busca linhas, não calcula índice nem consulta catálogo. */
export function pointLibraryEvidence({campaign,sia,components}:Source) {
  return {campaign,sia,libraries:components.map(c=>{
    const raw=count(c.observedReads),valid=count(c.validReads);
    let state:State="unassessed";
    if(c.status==="ausente")state="absent";
    else if(c.status==="inconclusivo")state="inconclusive";
    else if(c.status==="disponível" && Number.isSafeInteger(raw) && Number.isSafeInteger(valid)){
      if(raw===0 && valid===0)state="zero-observed";
      // ALGAS pode usar o denominador da biblioteca 16S, maior que o subtotal observado.
      else if(valid>0)state="usable";
    }
    return {name:c.name,run:c.run,status:c.status,observedReads:state==="absent"?"—":c.observedReads,
      validDenominator:state==="usable"?c.validReads:null,state,interpretation:interpretations[state]};
  })};
}

type DomainView=CaptureIndexView["domains"][number];

/** Proveniência da ficha que já consta no extrato publicado. Não completa uma fonte ausente. */
export function publishedEvidenceReference(c:Pick<DomainView["contributions"][number],"ficha"|"source">){
  return {id:c.ficha.trim()||null,source:c.source.trim()||null,
    interpretation:"Associação documentada na ficha; efeito não medido nesta amostra."};
}

/** Anota somente as contribuições que o DTO oficial já expõe no domínio selecionado. */
export function domainEvidenceRoles(domain:DomainView){
  const hasScore=domain.score!=="sem medição";
  const status=!hasScore?"Sem medição do domínio":
    domain.contributions.length?"Com fichas listadas":
    domain.score==="0,00"?"Zero calculado, sem contribuição pontuada listada":
    "Sem ficha listada no extrato";
  return {status,contributions:domain.contributions.map(c=>({...c,reference:publishedEvidenceReference(c),
    role:!hasScore||!domain.component?"Papel não informado":
      domain.component===c.component?"No componente determinante do domínio":"Em outro componente observado"}))};
}

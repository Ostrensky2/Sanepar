// Curated effect entries of the capture index. Never infer an effect from a taxon name,
// a narrative substring or a domain code: one domain can contain unrelated mechanisms.
export const effects = [
  { id: "cyanotoxins", title: "Potencial de cianotoxinas", component: "16S", note: "Saúde humana. As fichas descrevem potencial na literatura. O sinal de 16S não mede toxina, concentração, exposição ou intoxicação.", cards: ["CUR-Cuspidothrix-S", "CUR-Dolichospermum-S", "CUR-Microcystis-S", "CUR-Raphidiopsis-S"] },
  { id: "animal-toxicity", title: "Potencial de toxicidade para animais", component: "16S", note: "Ambiental. A ficha associa esse efeito à fração de genótipos potencialmente produtores. Não houve medição de toxina nem comprovação de dano à fauna. Fonte da ficha: doi:10.3389/fmicb.2021.793544.", cards: ["CUR-Raphidiopsis-A"] },
  { id: "diatom", title: "Obstrução associada a diatomáceas", component: "ALGAS", note: "Leitura exploratória de cloroplastos no 16S; não confirma obstrução.", cards: ["CUR-Diatomaceas-Bacillariophyceae-O", "CUR-Diatomaceas-Coscinodiscophyceae-O"] },
  { id: "fouling", title: "Incrustação biológica", component: "COI", note: "Diferente de obstrução por diatomáceas e da ocorrência de larvas.", cards: ["CUR-Limnoperna-O", "CUR-Cordylophora-O"] },
  { id: "larvae", title: "Larvas de quironomídeos", component: "COI", note: "A ficha não representa o mosquito-fantasma.", cards: ["CUR-Chironomidae-O"] },
  { id: "odour", title: "Gosto e odor", component: "16S", note: "Potencial descrito para geosmina ou 2-MIB; não é medição desses compostos.", cards: ["CUR-Dolichospermum-O", "CUR-Pseudanabaena-O"] },
  { id: "fecal", title: "Assinatura fecal", component: "16S", note: "Assinatura molecular de triagem; não diagnostica esgoto, infecção ou contaminação da água tratada.", cards: ["CUR-Esgoto-Prevotellaceae-S"] },
  { id: "ghost", title: "Mosquito-fantasma", component: null, note: "Os marcadores do piloto não avaliam esse mecanismo; ausência de ficha não demonstra ausência de larvas.", cards: [] },
  { id: "corrosion", title: "Ferro, manganês e corrosão", component: null, note: "Evidência de distribuição não transferida à captação. Sem avaliação na régua curada.", cards: [] },
] as const;
export type Component = "16S" | "ALGAS" | "COI";
const cardMap = new Map<string,string>(effects.flatMap(e => e.cards.map(c => [c,e.id] as [string,string])));
export function matchCard(card:string,domain:string,component:string){
  const id=cardMap.get(card);
  if(id==="cyanotoxins" && (domain!=="Saúde humana" || component!=="16S"))return undefined;
  if(id==="animal-toxicity" && (domain!=="Ambiental" || component!=="16S"))return undefined;
  return id;
}

export const componentLabels: Record<Component, string> = { "16S": "16S (bactérias)", ALGAS: "16S (cloroplasto de algas)", COI: "COI" };

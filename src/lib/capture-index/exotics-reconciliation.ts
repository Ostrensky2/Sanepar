// Reconciliação congelada de 22/11/2026, não é entrada do cálculo do índice.
// Unidade: ocorrência de táxon em ponto-campanha, COI utilizável, corrida escolhida.
// Apenas agregados: nenhum SIA, coordenada, itinerário ou nome de ponto.
export const reconciliationIndexHash = "d0546cf4fddca15786761eda1785186f780c959987ad7a7465912f28fb00f4e3";
export const sourceHashes: Readonly<Partial<Record<number, string>>> = {
  1: "0ded30b98668cd5b83ebf62f4c6ec68f7a2d0729c40b711e69da360b89cc58f5",
  2: "5baf5dfd2134e461665a2dcfac8809ebd3411968d3a0a5c1b446182f4819880b",
  3: "8b4501b842c477f8552a243e8bd8f2541ef04027c0b3f8ff1fddb3add1e84da7",
};

export const categories = {
  "nominal-listed": "Identificação nominal do laboratório, listada",
  "candidate-listed": "Candidata listada, espécie não resolvida",
  "candidate-omitted": "Candidata não listada no detalhe do índice",
  "regional-omitted": "Status regional pendente, não listado no detalhe do índice",
  "reassigned-added": "Reatribuição sem positivo nominal, adicionada à lista",
  "reassigned-mixed": "Reatribuição com positivo nominal já listado",
} as const;
export type Category = keyof typeof categories;
// Fonte física: aba Exóticas COI, excluído o total de reads. Confronto com
// descriptors.exotics e coiReassignedReads; reads mistos abaixo são só os reatribuídos.
export const reconciliationRows: ReadonlyArray<readonly [number, string, Category, number, number]> = [
  [1, "Não informada na fonte", "candidate-omitted", 13, 578],
  [1, "Não informada na fonte", "candidate-listed", 28, 5958],
  [1, "Não informada na fonte", "nominal-listed", 22, 569],
  [1, "Não informada na fonte", "regional-omitted", 2, 20],
  [2, "Não informada na fonte", "candidate-omitted", 13, 1054],
  [2, "Não informada na fonte", "candidate-listed", 36, 14170],
  [2, "Não informada na fonte", "nominal-listed", 27, 2931],
  [2, "Não informada na fonte", "reassigned-added", 15, 659],
  [2, "Não informada na fonte", "reassigned-mixed", 3, 257],
  [2, "Não informada na fonte", "regional-omitted", 3, 140],
  [3, "NextSeq", "candidate-omitted", 20, 1320],
  [3, "NextSeq", "candidate-listed", 10, 1331],
  [3, "NextSeq", "nominal-listed", 17, 442],
  [3, "NextSeq", "reassigned-added", 5, 110],
  [3, "NextSeq", "regional-omitted", 3, 41],
];

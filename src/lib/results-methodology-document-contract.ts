/** Client-safe external description; registration is not a scientific publication. */
export const METHODOLOGY_DOCUMENT_REGISTRATION = {
  enabled:false,
  persistencePending:true,
  reason:"Cadastro indisponível: persistência da descrição metodológica pendente de habilitação.",
} as const;
export type MethodologyDocumentTarget = {
  publicationId:string; sourceHash:string; calculationVersion:string; catalogVersion:string;
};
export type MethodologyDocument = { url:string; name:string; type:"pdf"|"word"|null };
export type MethodologyDocumentResponse = {
  status:"registered"|"missing"; target:MethodologyDocumentTarget;
  revisionHash:string|null; document:MethodologyDocument|null;
};
export type MethodologyDocumentFailure = {
  status:"persistence_pending"|"unavailable"|"invalid";
  persistencePending:boolean; error:string; code:string;
};

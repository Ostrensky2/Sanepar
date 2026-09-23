export const PREPARATION_ROLES = ["full_workbook","molecular","catalog","evidence","criteria","indices","components","method"] as const;
export type PreparationRole = typeof PREPARATION_ROLES[number];
export type PreparationScope = { type:"global-bibliography" } | { type:"campaigns"; campaignCodes:string[] };
export type PreparationManifest = {
  contractVersion:"yvae-preparation/1"; kind:"campaign_fragment"|"bibliography";
  scope:PreparationScope; parserVersion:"yvae-results/2.0"; schemaVersion:"yvae-preparation/1";
  files:Array<{sha256:string;fileName:string;mediaType:string;role:PreparationRole}>;
  dependencies:Array<{role:PreparationRole;revisionHash:string}>;
  state:"received"|"pending"|"conflict"|"ready"; diagnostics:string[];
};
export type PreparationInput = {
  kind:PreparationManifest["kind"]; scope:PreparationScope; roles:PreparationRole[];
  dependencies:PreparationManifest["dependencies"];
};
export type PreparationPreview = {
  source:{kind:"preparation";published:false}; manifest:PreparationManifest;
  missingRoles:PreparationRole[]; recognizedSheets:string[];
  // Persisted state is never inferred from an in-memory preview.
  persisted:false;
};

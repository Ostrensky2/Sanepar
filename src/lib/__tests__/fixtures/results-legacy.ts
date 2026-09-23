import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { RESULTS_SCHEMA_VERSION, type ResultsPublication } from "@/lib/imports/results-contract";

/** Synthetic only: never used by runtime or the cloud-restoration rehearsal. */
export function legacyPublication(campaignNumber=1): ResultsPublication {
  const canonical=resolveCanonicalCampaign(campaignNumber)!;
  return {
    campaignId:canonical.id,campaignNumber,campaignTitle:canonical.name,
    importedAt:"2026-08-21T12:00:00.000Z",schemaVersion:RESULTS_SCHEMA_VERSION,
    fileName:"synthetic-legacy.xlsx",methodology:{origin:"synthetic",version:"1"},molecularRows:[],rankingRows:[],
    viewModel:{
      meta:{campanha:campaignNumber,amostras:1,municipios:1,mananciais:1,especies:0,linhas:0,reads_total:0,reads_ciano:0,reads_bact:0,reads_coi:0,coi_amostras:0,coi_taxa:0,classes:{},score_min:null,score_max:null,score_med:null},
      points:[{pos:1,amostra:1,ponto:"Synthetic",municipio:"Synthetic",manancial:"Synthetic",lat:-25,lon:-49,sia:"1",score:null,classe:null,confianca:"",turbidez:"",clima:"",organismos:"",drivers:"",r_amb:"",r_op:"",r_san:"",just:"",rec:"",ciano_reads:0,ciano_pct:0,bact_reads:0,bact_pct:0,coi_inv_reads:0,tox_reads:0,odor_reads:0,inv_reads:0}],
      ptaxa:{},municipios:[],top_ciano:[],top_bact:[],top_coi:[],freq_ciano:[],freq_bact:[],freq_coi:[],tox:[],odor:[],invasores:[],heat_ciano:{taxa:[],rows:[]},heat_bact:{taxa:[],rows:[]},heat_coi:{taxa:[],rows:[]},coi_all:[],coi_groups:[],alerts:[],
    },
  };
}

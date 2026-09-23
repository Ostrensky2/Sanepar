/**
 * Etapas próprias da planilha-síntese de campo (aba "Campanhas") usadas pelo
 * importador único do Diário de campo: campanha única, fotos por link → Storage
 * e registro da planilha na nuvem (campaign_imports, lido como fallback legado).
 */
import type { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { buildImportedPhotoPath, fetchAndStorePhotosAsPng, splitPhotoLinks } from "@/lib/imports/photo-fetch";
import { classifyPhotoAssociation } from "@/lib/imports/media-policy";
import type { createOptionalSupabaseClient } from "@/lib/supabase";

export type CampaignSheetImport = Awaited<ReturnType<typeof parseCampaignWorkbook>>;
type Supabase = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

// Pontos sem campanha herdariam uma "campanha fantasma" na agregação por
// chave; preenche com a primeira campanha não vazia encontrada na planilha.
export function normalizeCampaignKeys(points: CampaignSheetImport["points"]) {
  const fallbackCampaign = points.find((point) => point.campaign?.trim())?.campaign?.trim();
  if (!fallbackCampaign) return;
  for (const point of points) {
    if (!point.campaign?.trim()) point.campaign = fallbackCampaign;
  }
}

/** Uma planilha de campo traz uma campanha por vez; devolve a mensagem de erro quando traz mais. */
export function campaignSheetScopeError(points: CampaignSheetImport["points"]) {
  const campaigns = [...new Set(points.map((point) => point.campaign.trim()).filter(Boolean))];
  return campaigns.length > 1
    ? `A planilha de campo contém dados de mais de uma campanha (${campaigns.join(", ")}). Envie uma campanha por vez.`
    : null;
}

/** Baixa as fotos indicadas por link (Drive, Dropbox ou URL), grava como PNG no Storage e associa ao ponto. */
export async function attachStoredPhotos(campaignImport: CampaignSheetImport, supabase: Supabase) {
  const summary = { baixadas: 0, avisos: 0 };
  for (const point of campaignImport.points) {
    const uniqueLinks = [...new Set([
      ...splitPhotoLinks(point.photoUrl),
      ...splitPhotoLinks(point.driveUrl),
      ...splitPhotoLinks(point.dropboxUrl),
    ])];
    const acceptedLinks: string[] = [];

    for (const sourceUrl of uniqueLinks) {
      const association = classifyPhotoAssociation(point.code, sourceUrl);
      if (association.status === "match") {
        acceptedLinks.push(sourceUrl);
        continue;
      }
      point.photoWarnings = [...(point.photoWarnings ?? []), association.status === "mismatch"
        ? "Foto ignorada: o SIA do arquivo diverge do SIA do ponto."
        : "Foto ignorada: não foi possível confirmar um único SIA pelo nome do arquivo."];
      summary.avisos += 1;
    }

    if (!acceptedLinks.length) continue;

    const result = await fetchAndStorePhotosAsPng(acceptedLinks, {
      supabase,
      storagePathBuilder: (sourceUrl, index) =>
        buildImportedPhotoPath({ campaign: point.campaign, code: point.code, pointId: point.id, sourceUrl, index }),
    });

    if (result.photos.length) {
      point.photos = result.photos.map((photo, index) => ({
        id: photo.id,
        url: photo.url,
        caption: `Foto ${index + 1} - ${point.code}`,
        bucket: photo.bucket,
        path: photo.path,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        uploadedAt: photo.uploadedAt,
      }));
      point.photoUrl = result.photos[0].url;
      point.driveUrl = "";
      point.dropboxUrl = "";
      summary.baixadas += result.photos.length;
    }

    if (result.warnings.length) {
      point.photoWarnings = [...(point.photoWarnings ?? []), ...result.warnings.map((warning) => warning.message)];
      summary.avisos += result.warnings.length;
    }
  }
  return summary;
}

/** Guarda a planilha-síntese lida (pontos e contagens) para consulta e fallback legado. */
export async function persistCampaignImport(campaignImport: CampaignSheetImport, supabase: Supabase) {
  const campaignKey =
    campaignImport.points[0]?.campaign?.trim().toLowerCase() ||
    campaignImport.fileName.trim().toLowerCase();

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: campaignImport.fileName,
    row_count: campaignImport.rowCount,
    point_count: campaignImport.points.length,
    original_point_count: campaignImport.originalPointCount,
    effective_point_count: campaignImport.effectivePointCount,
    missing_fields: campaignImport.missingFields,
    points: campaignImport.points,
    campaign_key: campaignKey,
  });
  return !error;
}

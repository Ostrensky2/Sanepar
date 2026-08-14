import { describe, expect, it } from "vitest";
import {
  classifyPhotoAssociation,
  parseInternalStorageUrl,
  sanitizeCampaignMedia,
} from "@/lib/imports/media-policy";

const internalPhoto =
  "/api/documents/file?bucket=photos&path=imports%2Fcampaigns%2F1%2Fsia-0780.png";

describe("campaign media policy", () => {
  it.each([
    ["Supabase", internalPhoto, internalPhoto],
    ["Drive", "https://drive.google.com/file/d/redacted", ""],
    ["Dropbox", "https://dropbox.com/s/redacted", ""],
    ["ausente", "", ""],
  ])("trata formato %s em modo fail-closed", (_label, input, expected) => {
    expect(sanitizeCampaignMedia({ photoUrl: input }).photoUrl).toBe(expected);
  });

  it("remove duplicatas e fontes externas auxiliares", () => {
    const sanitized = sanitizeCampaignMedia({
      photoUrl: "https://drive.google.com/file/d/redacted",
      driveUrl: "https://drive.google.com/file/d/redacted",
      dropboxUrl: "https://dropbox.com/s/redacted",
      photos: [
        { id: "1", url: internalPhoto },
        { id: "2", url: internalPhoto },
        { id: "3", url: "https://dropbox.com/s/redacted" },
      ],
    });

    expect(sanitized).toMatchObject({
      photoUrl: internalPhoto,
      driveUrl: "",
      dropboxUrl: "",
    });
    expect(sanitized.photos).toHaveLength(1);
  });

  it("rejeita bucket, caminho e origem divergentes", () => {
    expect(parseInternalStorageUrl(internalPhoto, "photos")).toEqual({
      bucket: "photos",
      path: "imports/campaigns/1/sia-0780.png",
    });
    expect(
      parseInternalStorageUrl(
        "/api/documents/file?bucket=documents&path=sia-0780.png",
        "photos",
      ),
    ).toBeNull();
    expect(
      parseInternalStorageUrl(
        "/api/documents/file?bucket=photos&path=..%2Fsecret",
        "photos",
      ),
    ).toBeNull();
    expect(parseInternalStorageUrl("https://drive.google.com/file/d/redacted")).toBeNull();
  });

  it.each([
    ["SIA-0780", "https://legacy.invalid/Ponto-SIA-0780.jpg", "match"],
    ["SIA-0305/1037*", "https://legacy.invalid/Ponto-SIA-1037.jpg", "match"],
    ["SIA-0780", "https://legacy.invalid/Ponto-SIA-0342.jpg", "mismatch"],
    ["SIA-0780", "https://legacy.invalid/foto-sem-codigo.jpg", "ambiguous"],
  ])("classifica associação %s sem usar a origem como verdade", (point, source, status) => {
    expect(classifyPhotoAssociation(point, source).status).toBe(status);
  });
});

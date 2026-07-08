import { describe, expect, it } from "vitest";
import { splitPhotoLinks, toDownloadUrl } from "@/lib/imports/photo-fetch";

describe("photo-fetch", () => {
  it("normaliza link de arquivo do Google Drive para download direto", () => {
    expect(toDownloadUrl("https://drive.google.com/file/d/abc123/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=abc123",
    );
  });

  it("rejeita link de pasta do Google Drive", () => {
    expect(() => toDownloadUrl("https://drive.google.com/drive/folders/abc123")).toThrow(
      "Link de pasta do Google Drive não suportado",
    );
  });

  it("força dl=1 em Dropbox e separa múltiplos links", () => {
    expect(toDownloadUrl("https://www.dropbox.com/s/abc/foto.jpg?dl=0")).toContain("dl=1");
    expect(splitPhotoLinks("https://a.test/1.jpg; texto; https://a.test/2.jpg")).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
    ]);
  });
});

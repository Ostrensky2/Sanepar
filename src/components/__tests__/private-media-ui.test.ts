import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPhotoPreview } from "@/lib/photo-preview";

const currentMediaUi = [
  "src/components/campaign-map-section.tsx",
  "src/components/home-risk-map-section.tsx",
  "src/components/point-actions-page-content.tsx",
  "src/components/document-repository.tsx",
  "src/app/(dashboard)/ajuda/page.tsx",
].map((path) => readFileSync(path, "utf8"));

describe("private media UI", () => {
  it("does not expose legacy Drive or Dropbox fallbacks", () => {
    expect(currentMediaUi.join("\n")).not.toMatch(/drive|dropbox/i);
    expect(currentMediaUi.join("\n")).not.toContain("Abrir link");
  });

  it("preserves internal image URLs", () => {
    const internalUrl = "/api/media/private-photo";

    expect(getPhotoPreview(internalUrl)).toMatchObject({
      kind: "image",
      src: internalUrl,
      candidates: [internalUrl],
    });
  });

  it("keeps missing-photo fallbacks accessible", () => {
    expect(currentMediaUi[0]).toContain('aria-label={preview && !imageFailed ? "Expandir fotos do ponto" : "Foto indisponível"}');
    expect(currentMediaUi[0]).toContain("Foto indisponível");
    expect(currentMediaUi[1]).toContain("Foto representativa indisponível");
  });
});

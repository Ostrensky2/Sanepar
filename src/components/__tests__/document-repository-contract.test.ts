import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("document repository persistence contract", () => {
  it("hidrata por GET sem auto-PUT ou migração destrutiva", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/document-repository.tsx"),
      "utf8",
    );

    expect(source).toContain('fetch("/api/documents", { cache: "no-store" })');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain("saveDocumentsToCloud");
    expect(source).not.toContain("APP_DOCUMENTS_CLOUD_MIGRATION_KEY");
    expect(source).not.toContain("mergeStoredDocuments");
    expect(source).toContain("if (!hasHydratedDocumentsRef.current)");
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "DELETE"');
  });
});

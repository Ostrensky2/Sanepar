import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalRecordItems } from "@/components/command-palette";
import { readSidebarBadges } from "@/components/sidebar-nav";
import { FIELD_DIARY_STORAGE_KEY } from "@/lib/field-diary";

const legacyDiary = JSON.stringify([
  {
    id: "legacy-entry",
    locationName: "Registro legado",
    sia: "123",
    municipality: "Curitiba",
    campaignName: "Campanha antiga",
  },
]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser-only diary persistence in navigation", () => {
  it("ignores legacy diary records outside localhost", () => {
    const getItem = installWindow("app.sanepar.example");

    expect(readSidebarBadges()["/dados/diario-de-campo"]).toBe(0);
    expect(readLocalRecordItems()).not.toContainEqual(
      expect.objectContaining({ href: "/dados/diario-de-campo" }),
    );
    expect(getItem).not.toHaveBeenCalledWith(FIELD_DIARY_STORAGE_KEY);
  });

  it("keeps diary records available on localhost", () => {
    installWindow("localhost");

    expect(readSidebarBadges()["/dados/diario-de-campo"]).toBe(1);
    expect(readLocalRecordItems()).toContainEqual(
      expect.objectContaining({ href: "/dados/diario-de-campo", label: "Registro legado" }),
    );
  });
});

function installWindow(hostname: string) {
  const getItem = vi.fn((key: string) => (key === FIELD_DIARY_STORAGE_KEY ? legacyDiary : null));

  vi.stubGlobal("window", {
    location: { hostname },
    localStorage: { getItem },
  });

  return getItem;
}

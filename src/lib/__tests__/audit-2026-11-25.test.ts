import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeUserCategory, parseUserCategory } from "@/lib/access-control";

// Achados da auditoria de 25/11/2026.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auditoria 25/11: categoria do perfil no servidor", () => {
  it("categoria vazia ou desconhecida não vira Admin", () => {
    expect(parseUserCategory("")).toBeNull();
    expect(parseUserCategory(null)).toBeNull();
    expect(parseUserCategory("admin ")).toBeNull();
    expect(parseUserCategory("Diretoria")).toBeNull();
    // A tela continua com o comportamento antigo (abre como Admin até saber quem entrou).
    expect(normalizeUserCategory("Diretoria")).toBe("Admin");
  });

  it("aceita as categorias e os nomes antigos", () => {
    expect(parseUserCategory("Admin")).toBe("Admin");
    expect(parseUserCategory("Adm Master")).toBe("Admin");
    expect(parseUserCategory("Sanepar")).toBe("Sanepar");
    expect(parseUserCategory("Coordenador")).toBe("Sanepar");
    expect(parseUserCategory("Curador")).toBe("UFPR");
    expect(parseUserCategory("Laboratório")).toBe("ATGC");
    expect(parseUserCategory("Tecpar")).toBe("Tecpar");
  });

  it("login, sessão e cadastro de usuários usam a leitura estrita", () => {
    expect(read("src/lib/api-auth.ts")).not.toContain("normalizeUserCategory(");
    expect(read("src/app/api/auth-users/login/route.ts")).not.toContain("normalizeUserCategory(");
    const users = read("src/app/api/auth-users/route.ts");
    expect(users).toContain("parseUserCategory(typeof v.role");
    expect(users).toContain("const role = parseUserCategory(v.role); if (!role) return null;");
  });
});

describe("auditoria 25/11: Atividades complementares não apagam o que outra pessoa registrou", () => {
  it("a gravação só acrescenta e atualiza", () => {
    const route = read("src/app/api/point-actions/route.ts");
    expect(route).not.toMatch(/\.from\("point_actions"\)\s*\.delete\(\)/);
    expect(read("src/components/point-action-entry-panel.tsx")).toContain("writePointActions(nextActions, [actionPayload])");
  });
});

describe("auditoria 25/11: data de hoje no fuso de Curitiba", () => {
  it("às 22h de Curitiba (01h UTC do dia seguinte) ainda é o mesmo dia", async () => {
    const { brazilIsoDate } = await import("@/lib/brazil-time");
    expect(brazilIsoDate(new Date("2026-11-26T01:30:00Z"))).toBe("2026-11-25");
    expect(brazilIsoDate(new Date("2026-11-25T03:00:00Z"))).toBe("2026-11-25");
    expect(brazilIsoDate(new Date("2026-11-25T02:59:00Z"))).toBe("2026-11-24");
  });

  it("registro novo, Configurações › Atividade e documentos usam o dia de Curitiba", () => {
    expect(read("src/lib/field-diary.ts")).toContain("return brazilIsoDate();");
    expect(read("src/components/member-activity-panel.tsx")).toContain("useState(() => brazilIsoDate())");
    expect(read("src/lib/document-upload.ts")).toContain("timeZone: BRAZIL_TIME_ZONE");
  });
});

import { describe, expect, it } from "vitest";
import { hashPassword, isHashedPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("gera hash scrypt com salt e confere a senha correta", async () => {
    const hash = await hashPassword("minha-senha-secreta");

    expect(isHashedPassword(hash)).toBe(true);
    expect(hash).not.toContain("minha-senha-secreta");
    await expect(verifyPassword("minha-senha-secreta", hash)).resolves.toBe(true);
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("senha-correta-123");

    await expect(verifyPassword("senha-errada-123", hash)).resolves.toBe(false);
  });

  it("gera salts diferentes para a mesma senha", async () => {
    const a = await hashPassword("repetida");
    const b = await hashPassword("repetida");

    expect(a).not.toBe(b);
  });

  it("aceita comparação direta para senhas legadas em texto plano", async () => {
    await expect(verifyPassword("ATGC26", "ATGC26")).resolves.toBe(true);
    await expect(verifyPassword("outra", "ATGC26")).resolves.toBe(false);
  });

  it("rejeita hash malformado", async () => {
    await expect(verifyPassword("qualquer", "scrypt$so-um-pedaco")).resolves.toBe(false);
  });
});

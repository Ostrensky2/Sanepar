/**
 * Última "Equipe" usada neste aparelho, para o próximo registro de campo já vir
 * preenchido. Fica só no navegador; é um texto de conveniência, não identifica
 * quem está logado.
 */

const STORAGE_KEY = "yvae:ultima-equipe";
const MAX_LENGTH = 120;

export function readLastFieldTeam() {
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? "").trim().slice(0, MAX_LENGTH);
  } catch {
    return "";
  }
}

export function rememberLastFieldTeam(team: unknown) {
  const value = typeof team === "string" ? team.trim().slice(0, MAX_LENGTH) : "";

  if (!value) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Navegador sem armazenamento (modo privado, cota): o registro segue normal.
  }
}

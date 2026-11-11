/**
 * O que o aparelho guarda sobre os parâmetros de campo, só no navegador:
 *
 * - o último equipamento usado em cada parâmetro (ex.: "Sonda multiparâmetro"),
 *   para a próxima medição já vir preenchida;
 * - a última cópia do catálogo, para os parâmetros criados pela equipe aparecerem
 *   mesmo quando o formulário abre sem sinal.
 */

import {
  MAX_FIELD_PARAMETERS,
  READING_EQUIPMENT_MAX_LENGTH,
  readFieldParameter,
  type FieldParameter,
  type LastEquipmentByParameter,
} from "@/lib/field-parameters";
import { FIELD_PARAMETER_ID_PATTERN } from "@/lib/field-standard";

const EQUIPMENT_KEY = "yvae:ultimo-equipamento";
const CATALOG_KEY = "yvae:catalogo-parametros";

export function readLastEquipment(): LastEquipmentByParameter {
  const stored = readJson(EQUIPMENT_KEY);

  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }

  const result: LastEquipmentByParameter = {};

  for (const [parameterId, value] of Object.entries(stored)) {
    const text = typeof value === "string" ? value.trim().slice(0, READING_EQUIPMENT_MAX_LENGTH) : "";

    if (FIELD_PARAMETER_ID_PATTERN.test(parameterId) && text) {
      result[parameterId] = text;
    }
  }

  return result;
}

/** Guarda o equipamento das medições que acabaram de ser gravadas. */
export function rememberLastEquipment(readings: Array<{ parameterId: string; equipment: string }>) {
  const next = readLastEquipment();
  let changed = false;

  for (const reading of readings) {
    const text = reading.equipment.trim().slice(0, READING_EQUIPMENT_MAX_LENGTH);

    if (text && next[reading.parameterId] !== text) {
      next[reading.parameterId] = text;
      changed = true;
    }
  }

  if (changed) {
    writeJson(EQUIPMENT_KEY, next);
  }
}

/** Catálogo guardado na última vez em que a nuvem respondeu. Vazio = nunca respondeu. */
export function readCachedCatalog(): FieldParameter[] {
  const stored = readJson(CATALOG_KEY);

  if (!Array.isArray(stored)) {
    return [];
  }

  const parameters: FieldParameter[] = [];

  for (const item of stored.slice(0, MAX_FIELD_PARAMETERS)) {
    const parameter = readFieldParameter(item);

    if (parameter) {
      parameters.push(parameter);
    }
  }

  return parameters;
}

export function cacheCatalog(parameters: FieldParameter[]) {
  writeJson(CATALOG_KEY, parameters);
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegador sem armazenamento (modo privado, cota): o registro segue normal.
  }
}

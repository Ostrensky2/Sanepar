"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionDefaultsHandle } from "@/components/field-diary/use-collection-defaults";
import { MAX_SAMPLE_DEPTH_M, numberToInput, parseSampleNumber } from "@/lib/field-samples";
import {
  addReadingDraft,
  baseParameterCatalog,
  buildDefaultReadingDrafts,
  findParameter,
  isFilledReading,
  readingDraftsToInputs,
  readingsToDrafts,
  sortCatalog,
  sortReadings,
  timeOfDay,
  validateReadingDrafts,
  type FieldParameter,
  type FieldParameterInput,
  type FieldReading,
  type ReadingDraft,
} from "@/lib/field-parameters";
import {
  createFieldParameter,
  fetchEntryReadings,
  type EntryReadingsRead,
  type ReadingsChange,
  type ReadingsSaveResult,
} from "@/lib/field-parameters-client";
import { cacheCatalog, readCachedCatalog, readLastEquipment } from "@/lib/field-parameters-device";

/** "loading": consultando a nuvem; "unavailable": o banco ainda não aceita parâmetros. */
export type ReadingsPanelStatus = "loading" | "ready" | "unavailable" | "failed";

// O banco aceita parâmetros? Depois da primeira resposta, o aparelho não precisa de
// sinal para saber (null = ainda não perguntou).
let knownAvailability: boolean | null = null;

/**
 * Parâmetros medidos no registro aberto no formulário: carrega o catálogo e as
 * medições gravadas, guarda o que a pessoa digita e monta o que vai para a nuvem na
 * hora de salvar. Linha sem valor não é gravada.
 */
export function useEntryReadings({
  initialEntryId,
  collectionDefaults,
}: {
  initialEntryId: string;
  /** Padrões de coleta da campanha do registro (ver useCollectionDefaults). */
  collectionDefaults: CollectionDefaultsHandle;
}) {
  const { defaults, defaultsRef } = collectionDefaults;
  const [status, setStatus] = useState<ReadingsPanelStatus>("loading");
  const [catalog, setCatalog] = useState<FieldParameter[]>(baseParameterCatalog);
  const [readings, setReadings] = useState<ReadingDraft[]>([]);
  const [removed, setRemoved] = useState<ReadingDraft[]>([]);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<FieldReading[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // Cópias sempre atuais, para os toques que acontecem antes da próxima renderização.
  const statusRef = useRef<ReadingsPanelStatus>("loading");
  const catalogRef = useRef<FieldParameter[]>(catalog);
  const readingsRef = useRef<ReadingDraft[]>([]);
  const removedRef = useRef<ReadingDraft[]>([]);
  const conflictRef = useRef<FieldReading[] | null>(null);
  const dirtyRef = useRef(false);
  const loadTokenRef = useRef(0);

  const put = useCallback((next: ReadingDraft[], options: { dirty?: boolean } = {}) => {
    readingsRef.current = next;
    setReadings(next);
    if (options.dirty ?? true) {
      dirtyRef.current = true;
    }
  }, []);

  const putRemoved = useCallback((next: ReadingDraft[]) => {
    removedRef.current = next;
    setRemoved(next);
  }, []);

  const putCatalog = useCallback((next: FieldParameter[]) => {
    const sorted = sortCatalog(next);
    catalogRef.current = sorted;
    setCatalog(sorted);
  }, []);

  const putStatus = useCallback((next: ReadingsPanelStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const putConflict = useCallback((next: FieldReading[] | null) => {
    conflictRef.current = next;
    setConflict(next);
  }, []);

  /** Resposta da nuvem com o catálogo e as medições gravadas. */
  const applyLoaded = useCallback(
    (entryId: string, result: EntryReadingsRead) => {
      if (!result.ok) {
        if (entryId) {
          // Registro que já existe precisa das medições gravadas, para não duplicar.
          putStatus("failed");
          return;
        }

        // Registro novo sem resposta: o bloco segue aberto com o catálogo que o
        // aparelho guardou, e o salvamento avisa se o banco não aceitar.
        const cached = readCachedCatalog();
        putCatalog(cached.length ? cached : baseParameterCatalog());
        putStatus(knownAvailability === false ? "unavailable" : "ready");
        return;
      }

      knownAvailability = result.available;

      if (!result.available) {
        putStatus("unavailable");
        return;
      }

      const loadedCatalog = result.parameters.length ? result.parameters : baseParameterCatalog();

      putCatalog(loadedCatalog);
      put(sortReadings(readingsToDrafts(result.readings), loadedCatalog), { dirty: false });
      putRemoved([]);
      putConflict(null);
      setMessage("");
      setExpandedIds([]);
      dirtyRef.current = false;
      putStatus("ready");
    },
    [put, putCatalog, putConflict, putRemoved, putStatus],
  );

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const tokenRef = loadTokenRef;

    void fetchEntryReadings(initialEntryId).then((result) => {
      if (token === tokenRef.current) {
        applyLoaded(initialEntryId, result);
      }
    });

    return () => {
      // Formulário fechado: a resposta que ainda chegar é descartada.
      tokenRef.current += 1;
    };
  }, [initialEntryId, applyLoaded]);

  function factoryOptions() {
    return {
      // Medições novas nascem na profundidade padrão das amostras de água da campanha.
      defaultDepthM: numberToInput(defaultsRef.current.sampleTypes.water.depthM ?? 0),
      lastEquipment: readLastEquipment(),
      newId: () => crypto.randomUUID(),
    };
  }

  /** Acrescenta uma medição do parâmetro. Devolve o id da linha nova, ou "". */
  function add(parameterId: string) {
    const parameter = findParameter(catalogRef.current, parameterId);

    if (!parameter || statusRef.current !== "ready") {
      return "";
    }

    const next = addReadingDraft(readingsRef.current, parameter, factoryOptions());
    const added = next[next.length - 1];

    if (next === readingsRef.current || !added) {
      return "";
    }

    put(sortReadings(next, catalogRef.current));
    setMessage("");
    return added.id;
  }

  /**
   * Muda uma medição. `stampTime`: ao digitar o valor de uma medição nova sem hora,
   * o app anota a hora do relógio (só faz sentido no dia da coleta).
   */
  function change(id: string, patch: Partial<ReadingDraft>, options: { stampTime?: boolean } = {}) {
    put(
      readingsRef.current.map((reading) => {
        if (reading.id !== id) {
          return reading;
        }

        const next = { ...reading, ...patch };

        if (options.stampTime && !reading.saved && !next.measuredTime && !isFilledReading(reading) && isFilledReading(next)) {
          next.measuredTime = timeOfDay(new Date());
        }

        return next;
      }),
    );
    setMessage("");
  }

  function remove(id: string) {
    const target = readingsRef.current.find((reading) => reading.id === id);

    if (!target) {
      return;
    }

    if (target.saved) {
      putRemoved([...removedRef.current, target]);
    }

    put(readingsRef.current.filter((reading) => reading.id !== id));
    setExpandedIds((current) => current.filter((item) => item !== id));
    setMessage("");
  }

  /** Devolve ao registro as medições gravadas que tinham sido tiradas. */
  function undoRemove() {
    put(sortReadings([...readingsRef.current, ...removedRef.current], catalogRef.current));
    putRemoved([]);
  }

  function toggle(id: string) {
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  /** Abre uma linha para cada parâmetro que a campanha mede em todo ponto. Devolve quantas entraram. */
  function fillFromCampaignDefaults() {
    if (statusRef.current !== "ready" || readingsRef.current.length) {
      return 0;
    }

    const proposed = buildDefaultReadingDrafts(
      defaultsRef.current.fieldParameterIds,
      catalogRef.current,
      factoryOptions(),
    );

    if (!proposed.length) {
      return 0;
    }

    // Linhas em branco não são mudança: só passam a ser quando a pessoa digita.
    put(proposed, { dirty: dirtyRef.current });
    setMessage("");
    return proposed.length;
  }

  /** No "Iniciar coleta": propõe os parâmetros da campanha se o registro ainda não tem medição. */
  function proposeForCollectionStart() {
    return removedRef.current.length ? 0 : fillFromCampaignDefaults();
  }

  /** Botão "+ Parâmetro": cria no catálogo e já abre a linha da medição. */
  async function createParameter(input: FieldParameterInput): Promise<{ ok: true; readingId: string } | { ok: false; error: string }> {
    const result = await createFieldParameter(input);

    if (!result.ok) {
      // O nome já existe e está ativo: usa o que já está no catálogo.
      if (result.existing?.active) {
        includeInCatalog(result.existing);
        return { ok: true, readingId: add(result.existing.id) };
      }

      return { ok: false, error: result.error };
    }

    includeInCatalog(result.parameter);
    return { ok: true, readingId: add(result.parameter.id) };
  }

  function includeInCatalog(parameter: FieldParameter) {
    const next = [...catalogRef.current.filter((item) => item.id !== parameter.id), parameter];

    putCatalog(next);
    cacheCatalog(sortCatalog(next));
  }

  /** Consulta de novo a nuvem (depois de uma falha, ou para ficar com o que está gravado). */
  function reload(entryId: string) {
    const token = ++loadTokenRef.current;

    putStatus("loading");
    void fetchEntryReadings(entryId).then((result) => {
      if (token === loadTokenRef.current) {
        applyLoaded(entryId, result);
      }
    });
  }

  /**
   * Outro aparelho já gravou a mesma medição: as minhas passam a valer por cima das
   * gravadas (no próximo "Salvar registro"). As gravadas que eu não tenho não mudam.
   */
  function overwriteSaved() {
    const keyOf = (parameterId: string, depthM: number | null) => `${parameterId}@${depthM === null ? "" : depthM}`;
    const savedIdByKey = new Map(
      (conflictRef.current ?? []).map((reading) => [keyOf(reading.parameterId, reading.depthM), reading.id]),
    );

    put(
      readingsRef.current.map((reading) => {
        const parameter = findParameter(catalogRef.current, reading.parameterId);
        const depth = parameter?.usesDepth === false ? null : parseSampleNumber(reading.depthM, MAX_SAMPLE_DEPTH_M).value;
        const savedId = isFilledReading(reading) ? savedIdByKey.get(keyOf(reading.parameterId, depth)) : undefined;

        return savedId ? { ...reading, id: savedId, saved: true } : reading;
      }),
    );
    putConflict(null);
    setMessage("");
  }

  /**
   * Na hora de salvar: confere as medições e monta o que vai para a nuvem.
   * `change` ausente = não há o que gravar nas medições.
   */
  function prepareSave(): { ok: false } | { ok: true; change?: ReadingsChange } {
    if (statusRef.current !== "ready") {
      return { ok: true };
    }

    const errors = validateReadingDrafts(readingsRef.current, catalogRef.current);

    if (errors.length) {
      setMessage(errors[0]);
      return { ok: false };
    }

    const inputs = readingDraftsToInputs(readingsRef.current, catalogRef.current);
    // Medição gravada que ficou sem valor sai do registro, como as removidas.
    const removedIds = [
      ...removedRef.current.map((reading) => reading.id),
      ...readingsRef.current.filter((reading) => reading.saved && !isFilledReading(reading)).map((reading) => reading.id),
    ];
    const needsSave = removedIds.length > 0 || (dirtyRef.current && inputs.length > 0);

    return needsSave ? { ok: true, change: { readings: inputs, removedIds } } : { ok: true };
  }

  /** Resposta da nuvem depois de salvar. Devolve true quando há aviso para mostrar nos parâmetros. */
  function applySaveResult(result: ReadingsSaveResult | null | undefined) {
    if (!result) {
      return false;
    }

    if (result.ok) {
      put(sortReadings(readingsToDrafts(result.readings), catalogRef.current), { dirty: false });
      putRemoved([]);
      putConflict(null);
      setMessage("");
      dirtyRef.current = false;
      return false;
    }

    putConflict(result.conflict && result.readings ? result.readings : null);
    setMessage(result.error);
    return true;
  }

  return {
    status,
    catalog,
    readings,
    removedCount: removed.length,
    message,
    hasConflict: conflict !== null,
    expandedIds,
    /** Quantos parâmetros a campanha mede em todo ponto (e que estão ativos no catálogo). */
    defaultParameterCount: catalog.filter(
      (parameter) => parameter.active && defaults.fieldParameterIds.includes(parameter.id),
    ).length,
    add,
    change,
    remove,
    undoRemove,
    toggle,
    fillFromCampaignDefaults,
    proposeForCollectionStart,
    createParameter,
    overwriteSaved,
    reload,
    prepareSave,
    applySaveResult,
  };
}

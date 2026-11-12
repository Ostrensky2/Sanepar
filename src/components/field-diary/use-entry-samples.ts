"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SamplesPanelStatus } from "@/components/field-diary/samples-panel";
import type { CollectionDefaultsHandle } from "@/components/field-diary/use-collection-defaults";
import {
  addSampleDraft,
  applySuggestedSequences,
  buildDefaultSampleDrafts,
  describeDefaultSamples,
  describeSampleCounts,
  legacyFieldsFromCodes,
  legacyFieldsFromSamples,
  legacyFieldsPatch,
  nextDraftSequence,
  sampleDraftsToInputs,
  sampleInputsToDrafts,
  samplesToDrafts,
  sortSamples,
  validateSampleDrafts,
  type LegacySampleFields,
  type SampleCodeConflict,
  type SampleCodeContext,
  type SampleDraft,
  type SampleInput,
} from "@/lib/field-samples";
import {
  fetchEntrySamples,
  type EntrySamplesRead,
  type SamplesChange,
  type SamplesSaveResult,
} from "@/lib/field-samples-client";
import type { SampleTypeId } from "@/lib/field-standard";
import { readLastSamplePackaging } from "@/lib/last-sample-packaging";

/** O que o código das amostras usa do registro que está no formulário. */
type EntryForSamples = {
  entryDate: string;
  sia?: string | null;
  samplesReplicasEdna?: string | null;
  zooplanktonId?: string | null;
};

// O banco aceita amostras? Depois da primeira resposta, o aparelho não precisa de
// sinal para saber (null = ainda não perguntou).
let knownAvailability: boolean | null = null;

const EMPTY_LEGACY: LegacySampleFields = { samplesReplicasEdna: "", zooplanktonId: "" };

/**
 * Amostras do registro aberto no formulário: carrega as gravadas, guarda o que a
 * pessoa muda e monta o que vai para a nuvem na hora de salvar. Não mexe no
 * registro: quem aplica no registro o que as amostras pedem é o formulário.
 */
export function useEntrySamples({
  initialEntryId,
  collectionDefaults,
  pendingSamples,
}: {
  initialEntryId: string;
  /** Padrões de coleta da campanha do registro (ver useCollectionDefaults). */
  collectionDefaults: CollectionDefaultsHandle;
  /**
   * Amostras guardadas no aparelho que ainda não subiram. Quando vêm, o formulário
   * abre com elas e não consulta a nuvem (que ainda não as tem).
   */
  pendingSamples?: SampleInput[];
}) {
  const { defaults, defaultsRef } = collectionDefaults;
  const [pendingAtOpen] = useState(() => (pendingSamples ? sampleInputsToDrafts(pendingSamples) : null));
  const [status, setStatus] = useState<SamplesPanelStatus>(pendingAtOpen ? "ready" : "loading");
  const [samples, setSamples] = useState<SampleDraft[]>(pendingAtOpen ?? []);
  const [removed, setRemoved] = useState<SampleDraft[]>([]);
  const [conflicts, setConflicts] = useState<SampleCodeConflict[]>([]);
  const [message, setMessage] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // Cópias sempre atuais, para os toques que acontecem antes da próxima renderização.
  const statusRef = useRef<SamplesPanelStatus>(pendingAtOpen ? "ready" : "loading");
  const samplesRef = useRef<SampleDraft[]>(pendingAtOpen ?? []);
  const removedRef = useRef<SampleDraft[]>([]);
  const conflictsRef = useRef<SampleCodeConflict[]>([]);
  // O que o app escreveu por último nos dois campos de texto antigos do registro.
  const legacyAutoRef = useRef<LegacySampleFields>(pendingSamples ? legacyFieldsFromCodes(pendingSamples) : EMPTY_LEGACY);
  const dirtyRef = useRef(Boolean(pendingAtOpen?.length));
  const loadTokenRef = useRef(0);

  const put = useCallback((next: SampleDraft[], options: { dirty?: boolean } = {}) => {
    samplesRef.current = next;
    setSamples(next);
    if (options.dirty ?? true) {
      dirtyRef.current = true;
    }
  }, []);

  const putRemoved = useCallback((next: SampleDraft[]) => {
    removedRef.current = next;
    setRemoved(next);
  }, []);

  const putConflicts = useCallback((next: SampleCodeConflict[]) => {
    conflictsRef.current = next;
    setConflicts(next);
  }, []);

  const putStatus = useCallback((next: SamplesPanelStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Resposta da nuvem com as amostras gravadas: troca as do formulário por elas. */
  const applyLoaded = useCallback(
    (entryId: string, result: EntrySamplesRead) => {
      if (!result.ok) {
        // Registro novo não tem o que carregar: sem resposta, o bloco segue aberto e
        // o salvamento avisa se o banco não aceitar. Registro que já existe precisa
        // das amostras gravadas, para não repetir código.
        putStatus(entryId ? "failed" : knownAvailability === false ? "unavailable" : "ready");
        return;
      }

      knownAvailability = result.available;

      if (!result.available) {
        putStatus("unavailable");
        return;
      }

      put(samplesToDrafts(result.samples), { dirty: false });
      putRemoved([]);
      putConflicts([]);
      setMessage("");
      setExpandedIds([]);
      dirtyRef.current = false;
      legacyAutoRef.current = legacyFieldsFromCodes(result.samples);
      putStatus("ready");
    },
    [put, putConflicts, putRemoved, putStatus],
  );

  useEffect(() => {
    if (pendingAtOpen) {
      return;
    }

    const token = ++loadTokenRef.current;
    const tokenRef = loadTokenRef;

    void fetchEntrySamples(initialEntryId).then((result) => {
      if (token === tokenRef.current) {
        applyLoaded(initialEntryId, result);
      }
    });

    return () => {
      // Formulário fechado: a resposta que ainda chegar é descartada.
      tokenRef.current += 1;
    };
  }, [initialEntryId, applyLoaded, pendingAtOpen]);

  function factoryOptions() {
    return {
      defaults: defaultsRef.current,
      lastPackaging: readLastSamplePackaging(),
      newId: () => crypto.randomUUID(),
    };
  }

  function contextOf(entry: EntryForSamples): SampleCodeContext {
    return { projectCode: defaultsRef.current.projectCode, date: entry.entryDate, point: entry.sia ?? "" };
  }

  function add(sampleType: SampleTypeId) {
    const next = addSampleDraft(samplesRef.current, sampleType, factoryOptions());
    const added = next[next.length - 1];

    if (next === samplesRef.current || !added) {
      return;
    }

    put(sortSamples(next));
    setExpandedIds((current) => [...current, added.id]);
    setMessage("");
  }

  function change(id: string, patch: Partial<SampleDraft>) {
    put(samplesRef.current.map((sample) => (sample.id === id ? { ...sample, ...patch } : sample)));
    setMessage("");
  }

  function remove(id: string) {
    const target = samplesRef.current.find((sample) => sample.id === id);

    if (!target) {
      return;
    }

    if (target.savedCode) {
      putRemoved([...removedRef.current, target]);
    }

    put(samplesRef.current.filter((sample) => sample.id !== id));
    putConflicts(conflictsRef.current.filter((conflict) => conflict.sampleId !== id));
    setMessage("");
  }

  /** Devolve ao registro as amostras gravadas que tinham sido tiradas. */
  function undoRemove() {
    let next = [...samplesRef.current];

    for (const restored of removedRef.current) {
      // Uma amostra nova pode ter ficado com o número da que volta: ela vai para o próximo livre.
      next = next.map((sample) =>
        sample.sampleType === restored.sampleType && sample.sequence === restored.sequence
          ? { ...sample, sequence: nextDraftSequence([...next, ...removedRef.current], sample.sampleType) }
          : sample,
      );
      next.push(restored);
    }

    put(sortSamples(next));
    putRemoved([]);
  }

  function toggle(id: string) {
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  /** As amostras que a campanha propõe por ponto. Devolve o que entrou ("3 de Água…") ou "". */
  function fillFromCampaignDefaults() {
    if (statusRef.current !== "ready" || samplesRef.current.length) {
      return "";
    }

    const proposed = buildDefaultSampleDrafts(factoryOptions());

    if (!proposed.length) {
      return "";
    }

    put(proposed);
    setMessage("");
    return describeSampleCounts(proposed);
  }

  /** No "Iniciar coleta": propõe as amostras da campanha se o registro ainda não tem nenhuma. */
  function proposeForCollectionStart() {
    return removedRef.current.length ? "" : fillFromCampaignDefaults();
  }

  function acceptSuggestedNumbers() {
    put(sortSamples(applySuggestedSequences(samplesRef.current, conflictsRef.current)));
    putConflicts([]);
    setMessage("");
  }

  /** Consulta de novo a nuvem (depois de uma falha, ou para ficar com o que está gravado). */
  function reload(entryId: string) {
    const token = ++loadTokenRef.current;

    putStatus("loading");
    void fetchEntrySamples(entryId).then((result) => {
      if (token === loadTokenRef.current) {
        applyLoaded(entryId, result);
      }
    });
  }

  /**
   * O que mudar nos dois campos de texto antigos do registro para acompanhar as
   * amostras de agora (ver legacyFieldsPatch). Chamar depois de cada mudança nas
   * amostras, na data ou no ponto.
   */
  function legacyPatch(entry: EntryForSamples): Partial<LegacySampleFields> {
    if (statusRef.current !== "ready") {
      return {};
    }

    const nextAuto = legacyFieldsFromSamples(samplesRef.current, contextOf(entry));
    const patch = legacyFieldsPatch(entry, legacyAutoRef.current, nextAuto);

    legacyAutoRef.current = nextAuto;
    return patch;
  }

  /**
   * Na hora de salvar: confere as amostras e monta o que vai para a nuvem.
   * `change` ausente = não há o que gravar nas amostras.
   */
  function prepareSave(entry: EntryForSamples): { ok: false } | { ok: true; change?: SamplesChange } {
    if (statusRef.current !== "ready") {
      return { ok: true };
    }

    const context = contextOf(entry);
    const errors = validateSampleDrafts(samplesRef.current, context);

    if (errors.length) {
      setMessage(errors[0]);
      return { ok: false };
    }

    const inputs = sampleDraftsToInputs(samplesRef.current, context);
    // Há o que gravar quando saiu amostra gravada, quando alguma é nova ou mudou de
    // código, ou quando a pessoa mexeu numa amostra que continua no registro.
    // Aberto com amostras guardadas no aparelho: o que estiver aqui substitui o guardado
    // (mesmo vazio, quando a pessoa tirou todas).
    const needsSave =
      Boolean(pendingAtOpen) ||
      removedRef.current.length > 0 ||
      samplesRef.current.some((sample, index) => sample.savedCode !== inputs[index].code) ||
      (dirtyRef.current && samplesRef.current.length > 0);

    if (!needsSave) {
      return { ok: true };
    }

    return {
      ok: true,
      change: {
        projectCode: context.projectCode,
        samples: inputs,
        removedIds: removedRef.current.map((sample) => sample.id),
      },
    };
  }

  /** Resposta da nuvem depois de salvar. Devolve true quando há aviso para mostrar nas amostras. */
  function applySaveResult(result: SamplesSaveResult | null | undefined) {
    if (!result) {
      return false;
    }

    if (result.ok) {
      put(samplesToDrafts(result.samples), { dirty: false });
      putRemoved([]);
      putConflicts([]);
      setMessage("");
      dirtyRef.current = false;
      legacyAutoRef.current = legacyFieldsFromCodes(result.samples);
      return false;
    }

    putConflicts(result.conflicts);
    setMessage(result.conflicts.length ? "" : result.error);
    return true;
  }

  return {
    status,
    samples,
    removedCount: removed.length,
    conflicts,
    message,
    expandedIds,
    projectCode: defaults.projectCode,
    defaultsDescription: describeDefaultSamples(defaults),
    add,
    change,
    remove,
    undoRemove,
    toggle,
    fillFromCampaignDefaults,
    proposeForCollectionStart,
    acceptSuggestedNumbers,
    reload,
    legacyPatch,
    prepareSave,
    applySaveResult,
  };
}

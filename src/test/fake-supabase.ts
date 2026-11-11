/**
 * Banco em memória para testar rotas que usam o cliente do Supabase. Só o que as
 * rotas usam: select, insert, upsert, update, delete e os filtros eq, in, like.
 *
 * Uso num teste:
 *
 *   vi.mock("@/lib/supabase", async () => {
 *     const { fakeSupabase } = await import("@/test/fake-supabase");
 *     return { createOptionalSupabaseClient: () => fakeSupabase.client() };
 *   });
 */

export type FakeRow = Record<string, unknown>;
export type FakeDbError = { code: string; message: string };
type FakeResult = { data: FakeRow[] | null; error: FakeDbError | null };
type Operation = "select" | "insert" | "upsert" | "update" | "delete";

/** Recusa do banco para uma gravação (índice único, chave estrangeira…), ou null. */
type Constraint = (incoming: FakeRow, saved: FakeRow[]) => FakeDbError | null;

const state = {
  tables: new Map<string, FakeRow[]>(),
  missing: new Set<string>(),
  failures: new Map<string, FakeDbError>(),
  constraints: new Map<string, Constraint[]>(),
  log: [] as Array<{ table: string; operation: Operation }>,
};

const MISSING_TABLE: FakeDbError = { code: "PGRST205", message: "Could not find the table in the schema cache" };

export const fakeSupabase = {
  reset() {
    state.tables.clear();
    state.missing.clear();
    state.failures.clear();
    state.constraints.clear();
    state.log.length = 0;
  },
  /** Linhas da tabela (a própria lista: o teste pode ler e mexer). */
  rows(table: string): FakeRow[] {
    if (!state.tables.has(table)) {
      state.tables.set(table, []);
    }
    return state.tables.get(table) as FakeRow[];
  },
  seed(table: string, rows: FakeRow[]) {
    state.tables.set(table, rows.map((row) => ({ ...row })));
  },
  /** A tabela ainda não existe no banco (migration não aplicada). */
  setMissing(table: string, missing = true) {
    if (missing) state.missing.add(table);
    else state.missing.delete(table);
  },
  /** Faz a próxima operação desse tipo na tabela falhar com o erro dado. */
  failOn(table: string, operation: Operation, error: FakeDbError | null) {
    const key = `${table}:${operation}`;
    if (error) state.failures.set(key, error);
    else state.failures.delete(key);
  },
  /** Regra do banco conferida em cada linha gravada (insert, upsert e update). */
  addConstraint(table: string, constraint: Constraint) {
    state.constraints.set(table, [...(state.constraints.get(table) ?? []), constraint]);
  },
  /** Operações feitas, na ordem (para conferir que nada foi apagado, por exemplo). */
  operations(table?: string) {
    return state.log.filter((item) => !table || item.table === table).map((item) => `${item.table}:${item.operation}`);
  },
  client() {
    return { from: (table: string) => buildQuery(table) };
  },
};

function buildQuery(table: string) {
  const filters: Array<(row: FakeRow) => boolean> = [];
  let operation: Operation = "select";
  let payload: FakeRow[] = [];
  let patch: FakeRow = {};
  let limit: number | null = null;
  let range: [number, number] | null = null;
  let conflictColumn = "id";
  let done: FakeResult | null = null;

  const run = (): FakeResult => {
    if (done) return done;

    state.log.push({ table, operation });
    done = execute();
    return done;
  };

  const execute = (): FakeResult => {
    if (state.missing.has(table)) {
      return { data: null, error: MISSING_TABLE };
    }

    const failure = state.failures.get(`${table}:${operation}`);
    if (failure) {
      return { data: null, error: failure };
    }

    const rows = fakeSupabase.rows(table);
    const matches = (row: FakeRow) => filters.every((filter) => filter(row));

    if (operation === "select") {
      let selected = rows.filter(matches);
      if (range) selected = selected.slice(range[0], range[1] + 1);
      if (limit !== null) selected = selected.slice(0, limit);
      return { data: selected.map((row) => ({ ...row })), error: null };
    }

    if (operation === "delete") {
      const kept = rows.filter((row) => !matches(row));
      rows.splice(0, rows.length, ...kept);
      return { data: null, error: null };
    }

    if (operation === "update") {
      const targets = rows.filter(matches);

      for (const target of targets) {
        const next = { ...target, ...patch };
        const refused = violated(table, next, rows.filter((row) => row !== target));
        if (refused) return { data: null, error: refused };
      }

      for (const target of targets) Object.assign(target, patch);
      return { data: targets.map((row) => ({ ...row })), error: null };
    }

    // insert e upsert: ou entra tudo, ou nada.
    const next = rows.map((row) => ({ ...row }));

    for (const incoming of payload) {
      const index = next.findIndex((row) => row[conflictColumn] === incoming[conflictColumn]);

      if (index >= 0 && operation === "insert") {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }

      const merged = index >= 0 ? { ...next[index], ...incoming } : { ...incoming };
      const refused = violated(table, merged, next.filter((_, position) => position !== index));
      if (refused) return { data: null, error: refused };

      if (index >= 0) next[index] = merged;
      else next.push(merged);
    }

    rows.splice(0, rows.length, ...next);
    return { data: payload.map((row) => ({ ...row })), error: null };
  };

  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    like: (column: string, pattern: string) => {
      filters.push((row) => String(row[column]).startsWith(pattern.replace(/%$/, "")));
      return query;
    },
    order: () => query,
    limit: (count: number) => {
      limit = count;
      return query;
    },
    range: (from: number, to: number) => {
      range = [from, to];
      return query;
    },
    delete: () => {
      operation = "delete";
      return query;
    },
    insert: (rows: FakeRow | FakeRow[]) => {
      operation = "insert";
      payload = Array.isArray(rows) ? rows : [rows];
      return query;
    },
    upsert: (rows: FakeRow | FakeRow[], options?: { onConflict?: string }) => {
      operation = "upsert";
      payload = Array.isArray(rows) ? rows : [rows];
      conflictColumn = options?.onConflict ?? "id";
      return query;
    },
    update: (values: FakeRow) => {
      operation = "update";
      patch = values;
      return query;
    },
    returns: async () => run(),
    maybeSingle: async () => {
      const result = run();
      return { data: result.data?.[0] ?? null, error: result.error };
    },
    single: async () => {
      const result = run();
      const first = result.data?.[0] ?? null;
      return first || result.error
        ? { data: first, error: result.error }
        : { data: null, error: { code: "PGRST116", message: "no rows" } };
    },
    then: (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve().then(run).then(resolve, reject),
  };

  return query;
}

function violated(table: string, incoming: FakeRow, others: FakeRow[]) {
  for (const constraint of state.constraints.get(table) ?? []) {
    const error = constraint(incoming, others);
    if (error) return error;
  }

  return null;
}

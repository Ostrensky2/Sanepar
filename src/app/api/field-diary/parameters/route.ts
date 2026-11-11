import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  MAX_FIELD_PARAMETERS,
  baseParameterCatalog,
  buildParameterId,
  findParameter,
  findParameterByLabel,
  normalizeParameterInput,
  type FieldParameter,
} from "@/lib/field-parameters";
import {
  PARAMETERS_TABLE,
  isMissingTable,
  parameterInputToRow,
  parametersFromRows,
  readParameterCatalog,
  type ParameterRow,
} from "@/lib/field-parameters-server";
import { FIELD_PARAMETER_ID_PATTERN } from "@/lib/field-standard";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE_MESSAGE = "O banco ainda não recebeu a atualização dos parâmetros de campo.";
const BASE_LOCKED_MESSAGE =
  "Os parâmetros do padrão de coleta não podem ser alterados. Dá para desativar o que a equipe não usa.";

/**
 * Catálogo de parâmetros medidos em campo.
 *
 * GET    lista o catálogo, com os desativados (as medições antigas precisam do
 *        nome). `available: false` quando o banco ainda não tem a tabela
 *        (migration 20261111140000 não aplicada); nesse caso vêm os oito do padrão.
 * POST   cria um parâmetro (botão "+ Parâmetro"). Nome repetido devolve 409 com o
 *        parâmetro que já existe.
 * PATCH  altera um parâmetro criado pela equipe, ou ativa e desativa qualquer um.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ available: false, parameters: baseParameterCatalog() }, { headers: NO_STORE });
  }

  const catalog = await readParameterCatalog(supabase);

  if (!catalog.ok) {
    return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
  }

  return NextResponse.json({ available: catalog.available, parameters: catalog.parameters }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  return guarded(request, async (supabase, body, changedBy) => {
    const checked = normalizeParameterInput(body);

    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const catalog = await readParameterCatalog(supabase);

    if (!catalog.ok) {
      return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
    }

    if (!catalog.available) {
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 });
    }

    const existing = findParameterByLabel(catalog.parameters, checked.parameter.label);

    if (existing) {
      return NextResponse.json({ error: sameNameMessage(existing), parameter: existing }, { status: 409 });
    }

    if (catalog.parameters.length >= MAX_FIELD_PARAMETERS) {
      return NextResponse.json(
        { error: `O catálogo aceita até ${MAX_FIELD_PARAMETERS} parâmetros. Desative os que não são usados.` },
        { status: 400 },
      );
    }

    const id = buildParameterId(
      checked.parameter.label,
      catalog.parameters.map((parameter) => parameter.id),
    );
    const inserted = await supabase
      .from(PARAMETERS_TABLE)
      .insert({
        id,
        ...parameterInputToRow(checked.parameter),
        is_base: false,
        active: true,
        sort_order: 1000,
        created_by: changedBy,
      })
      .select("*")
      .returns<ParameterRow[]>();

    if (inserted.error) {
      console.error("[field-diary/parameters] criação recusada pelo banco", {
        code: inserted.error.code,
        message: inserted.error.message,
      });

      return inserted.error.code === "23505"
        ? NextResponse.json(
            { error: "Outra pessoa acabou de criar um parâmetro com esse nome. Feche e abra a lista de novo." },
            { status: 409 },
          )
        : NextResponse.json({ error: "Não foi possível criar o parâmetro." }, { status: 500 });
    }

    const [parameter] = parametersFromRows(inserted.data ?? []);

    return NextResponse.json(
      { parameter: parameter ?? { ...checked.parameter, id, biologColumn: null, isBase: false, active: true, sortOrder: 1000 } },
      { status: 201, headers: NO_STORE },
    );
  });
}

export async function PATCH(request: Request) {
  return guarded(request, async (supabase, body) => {
    const id = typeof body.id === "string" ? body.id : "";

    if (!FIELD_PARAMETER_ID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Parâmetro inválido." }, { status: 400 });
    }

    const catalog = await readParameterCatalog(supabase);

    if (!catalog.ok) {
      return NextResponse.json({ error: "Não foi possível consultar o catálogo de parâmetros." }, { status: 500 });
    }

    if (!catalog.available) {
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 });
    }

    const current = findParameter(catalog.parameters, id);

    if (!current) {
      return NextResponse.json({ error: "Este parâmetro não está no catálogo." }, { status: 404 });
    }

    const changes: Record<string, unknown> = {};
    const editsDefinition = ["label", "unit", "min", "max", "appliesTo", "usesDepth"].some((key) => key in body);

    if (editsDefinition) {
      if (current.isBase) {
        return NextResponse.json({ error: BASE_LOCKED_MESSAGE }, { status: 400 });
      }

      const checked = normalizeParameterInput({
        label: body.label ?? current.label,
        unit: body.unit ?? current.unit,
        min: "min" in body ? body.min : current.min,
        max: "max" in body ? body.max : current.max,
        appliesTo: body.appliesTo ?? current.appliesTo,
        usesDepth: body.usesDepth ?? current.usesDepth,
      });

      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }

      const sameName = findParameterByLabel(
        catalog.parameters.filter((parameter) => parameter.id !== id),
        checked.parameter.label,
      );

      if (sameName) {
        return NextResponse.json({ error: sameNameMessage(sameName), parameter: sameName }, { status: 409 });
      }

      Object.assign(changes, parameterInputToRow(checked.parameter));
    }

    if (typeof body.active === "boolean") {
      changes.active = body.active;
    }

    if (!Object.keys(changes).length) {
      return NextResponse.json({ error: "Nada para alterar no parâmetro." }, { status: 400 });
    }

    const updated = await supabase
      .from(PARAMETERS_TABLE)
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .returns<ParameterRow[]>();

    if (updated.error) {
      console.error("[field-diary/parameters] alteração recusada pelo banco", {
        id,
        code: updated.error.code,
        message: updated.error.message,
      });

      return updated.error.code === "23505"
        ? NextResponse.json({ error: "Já existe um parâmetro com esse nome." }, { status: 409 })
        : NextResponse.json({ error: "Não foi possível alterar o parâmetro." }, { status: 500 });
    }

    const [parameter] = parametersFromRows(updated.data ?? []);

    if (!parameter) {
      return NextResponse.json({ error: "Este parâmetro não está no catálogo." }, { status: 404 });
    }

    return NextResponse.json({ parameter }, { headers: NO_STORE });
  });
}

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;

/** O que POST e PATCH têm em comum: permissão de gravar, banco configurado e corpo JSON. */
async function guarded(
  request: Request,
  handle: (supabase: SupabaseClient, body: Record<string, unknown>, changedBy: string | null) => Promise<NextResponse>,
) {
  try {
    const auth = await requireApiSession(request, "data.import");
    if (!auth.ok) return auth.response;

    const supabase = createOptionalSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase não configurado para o catálogo de parâmetros." }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Os dados do parâmetro são inválidos." }, { status: 400 });
    }

    return await handle(
      supabase,
      body as Record<string, unknown>,
      auth.session?.name || auth.session?.email || null,
    );
  } catch (error) {
    if (error && typeof error === "object" && isMissingTable(error as { code?: string })) {
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE, available: false }, { status: 503 });
    }

    console.error("[field-diary/parameters] falha inesperada", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível gravar o parâmetro por uma falha no servidor." },
      { status: 500 },
    );
  }
}

function sameNameMessage(existing: FieldParameter) {
  return existing.active
    ? `Já existe um parâmetro chamado “${existing.label}”. Use o que já está no catálogo.`
    : `Já existe um parâmetro chamado “${existing.label}”, mas ele está desativado. Reative em “Padrões de coleta”.`;
}

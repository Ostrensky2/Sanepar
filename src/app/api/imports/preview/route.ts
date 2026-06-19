import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { MAX_IMPORT_FILE_BYTES, previewWorkbook } from "@/lib/imports/excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Um arquivo válido deve ser enviado para que o preview seja gerado." },
        { status: 400 },
      );
    }

    if (!file.name) {
      return NextResponse.json(
        { error: "O arquivo enviado precisa ter um nome identificável." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "O arquivo enviado está vazio." },
        { status: 400 },
      );
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json(
        {
          error:
            "Arquivos de até 12 MB são aceitos no preview inicial. Um recorte menor deve ser usado para validação.",
        },
        { status: 413 },
      );
    }

    const preview = await previewWorkbook(await file.arrayBuffer(), file.name);

    return NextResponse.json(preview);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível processar a planilha enviada.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

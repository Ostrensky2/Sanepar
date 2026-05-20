import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type {
  PointActionEvent,
  PointActionPhoto,
  PointActionSamplePoint,
} from "@/lib/point-actions";

export const runtime = "nodejs";

const COL = {
  eventName: 1,
  objectives: 2,
  waterBody: 3,
  dates: 4,
  municipality: 5,
  latitude: 6,
  longitude: 7,
  results: 8,
  photo1Url: 9,
  photo1Caption: 10,
  photo2Url: 11,
  photo2Caption: 12,
  photo3Url: 13,
  photo3Caption: 14,
} as const;

function cellText(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

function parseCoord(raw: string, kind: "lat" | "lon"): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (kind === "lat" && (n < -90 || n > 90)) return null;
  if (kind === "lon" && (n < -180 || n > 180)) return null;
  return n;
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();

  try {
    await wb.xlsx.load(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o arquivo. Verifique se é um .xlsx válido." },
      { status: 400 },
    );
  }

  const ws = wb.getWorksheet("Pontos") ?? wb.worksheets[0];
  if (!ws) {
    return NextResponse.json({ error: "A planilha não contém a aba 'Pontos'." }, { status: 400 });
  }

  const errors: string[] = [];
  type ParsedPoint = {
    eventName: string;
    objectives: string;
    point: PointActionSamplePoint;
  };
  const parsed: ParsedPoint[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const eventName = cellText(row, COL.eventName);
    const objectives = cellText(row, COL.objectives);
    const waterBody = cellText(row, COL.waterBody);
    const dates = cellText(row, COL.dates);
    const municipality = cellText(row, COL.municipality);
    const latRaw = cellText(row, COL.latitude);
    const lonRaw = cellText(row, COL.longitude);
    const results = cellText(row, COL.results);

    if (!eventName && !waterBody && !municipality && !results && !latRaw && !lonRaw) return;

    const rowErrors: string[] = [];
    if (!eventName) rowErrors.push("Evento");
    if (!objectives) rowErrors.push("Objetivos");
    if (!waterBody) rowErrors.push("Manancial");
    if (!dates) rowErrors.push("Datas");
    if (!municipality) rowErrors.push("Município");
    if (!results) rowErrors.push("Resultados");

    const effectiveLat = parseCoord(latRaw, "lat");
    const effectiveLon = parseCoord(lonRaw, "lon");
    if (effectiveLat === null) rowErrors.push("Latitude");
    if (effectiveLon === null) rowErrors.push("Longitude");

    if (rowErrors.length) {
      errors.push(`Linha ${rowNumber}: campo(s) ausente(s) ou inválido(s) — ${rowErrors.join(", ")}.`);
      return;
    }

    const photos: PointActionPhoto[] = [];
    for (const [urlCol, captionCol] of [
      [COL.photo1Url, COL.photo1Caption],
      [COL.photo2Url, COL.photo2Caption],
      [COL.photo3Url, COL.photo3Caption],
    ] as const) {
      const url = cellText(row, urlCol);
      if (!url) continue;
      photos.push({
        id: crypto.randomUUID(),
        url,
        caption: cellText(row, captionCol),
      });
    }

    parsed.push({
      eventName,
      objectives,
      point: {
        id: crypto.randomUUID(),
        waterBody,
        dates,
        municipality,
        effectiveLat: effectiveLat as number,
        effectiveLon: effectiveLon as number,
        results,
        photos,
      },
    });
  });

  if (!parsed.length && !errors.length) {
    return NextResponse.json(
      { error: "A planilha não contém pontos para importar." },
      { status: 400 },
    );
  }

  const byEvent = new Map<string, PointActionEvent>();
  const createdAt = todayLabel();

  for (const p of parsed) {
    const key = `${p.eventName}::${p.objectives}`;
    let event = byEvent.get(key);
    if (!event) {
      event = {
        id: `acao-pontual-${crypto.randomUUID()}`,
        eventName: p.eventName,
        objectives: p.objectives,
        document: null,
        createdAt,
        points: [],
      };
      byEvent.set(key, event);
    }
    event.points.push(p.point);
  }

  const events = Array.from(byEvent.values());

  return NextResponse.json({
    events,
    errors,
    eventCount: events.length,
    pointCount: events.reduce((t, e) => t + e.points.length, 0),
  });
}

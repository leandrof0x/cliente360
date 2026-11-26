import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/session";
import { ORG_COOKIE } from "@/lib/constants";
import { resolveRange } from "@/lib/date-range";
import { exportFileName, toCsv } from "@/lib/export";
import { EXPORT_KINDS, loadDataset, loadReport, reportDatasets, type Dataset, type ExportKind } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Exporta datos de la empresa activa a CSV o Excel. Solo propietarios y
 * administradores, y solo si el plan incluye exportaciones. RLS sigue aplicando.
 */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return fail(401, "Iniciá sesión para exportar.");
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? "";
  const formato = sp.get("formato") === "xlsx" ? "xlsx" : "csv";
  if (tipo !== "reporte" && !EXPORT_KINDS.some((k) => k.id === tipo)) return fail(400, "Tipo de exportación inválido.");

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const selected = req.cookies.get(ORG_COOKIE)?.value;
  const m = (memberships ?? []).find((x) => x.organization_id === selected) ?? memberships?.[0];
  if (!m) return fail(403, "No pertenecés a ninguna empresa.");
  if (m.role !== "owner" && m.role !== "admin") return fail(403, "Solo propietarios y administradores pueden exportar.");
  const { data: canExport } = await supabase.rpc("org_has_feature", { org: m.organization_id, feature: "exports" });
  if (!canExport) return fail(403, "Tu plan no incluye exportaciones. Están disponibles en los planes Profesional y Negocio.");

  const range = resolveRange({ rango: sp.get("rango") ?? undefined, desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined });

  let sheets: Dataset[];
  try {
    if (tipo === "reporte") {
      const { data, error } = await loadReport(supabase, m.organization_id, range.from, range.to);
      if (!data) return fail(403, error ?? "No se pudo generar el reporte.");
      sheets = reportDatasets(data);
    } else {
      sheets = [await loadDataset(supabase, m.organization_id, tipo as ExportKind, range.from, range.to)];
    }
  } catch (e) {
    console.error("[exportar]", e);
    return fail(500, "No se pudo generar la exportación.");
  }

  const usesRange = tipo === "reporte" || EXPORT_KINDS.find((k) => k.id === tipo)?.usesRange;
  const name = exportFileName(tipo, usesRange ? range.desde : undefined, usesRange ? range.hasta : undefined, formato);
  const headers = {
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store",
  };

  if (formato === "csv") {
    const body = sheets
      .map((d, i) => (sheets.length > 1 ? `${i ? "\r\n" : ""}${d.sheet}\r\n` : "") + toCsv(d.columns, d.rows).replace(/^﻿/, ""))
      .join("");
    return new NextResponse(`﻿${body}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CLIENTE360";
  wb.created = new Date();
  for (const d of sheets) {
    const ws = wb.addWorksheet(d.sheet.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = d.columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));
    for (const row of d.rows) {
      ws.addRow(d.columns.map((c) => {
        const v = c.value(row);
        // En Excel las celdas de texto nunca se evalúan como fórmula
        if (typeof v === "number") return v;
        if (typeof v === "boolean") return v ? "Sí" : "No";
        return v === null || v === undefined ? "" : String(v);
      }));
    }
    d.columns.forEach((c, i) => {
      if (c.kind === "money" || c.kind === "number") ws.getColumn(i + 1).numFmt = "#,##0";
    });
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2447F5" } };
    if (d.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: d.columns.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}

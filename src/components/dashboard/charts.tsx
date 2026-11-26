"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/constants";
import { formatGs, formatGsCompact, formatNumber } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

const BRAND = "#2447f5";
const GRID = "#eef1f6";
const AXIS = "#94a3b8";
const axisProps = { stroke: AXIS, fontSize: 12, tickLine: false, axisLine: false } as const;

function bucketLabel(bucket: string, kind: DashboardData["range"]["bucket"]) {
  const d = new Date(`${bucket}T12:00:00Z`);
  if (kind === "month") return d.toLocaleDateString("es-PY", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function TooltipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-slate-600">
          <span>{k}</span>
          <span className="tabular font-medium text-slate-900">{v}</span>
        </p>
      ))}
    </div>
  );
}

export function CustomersChart({ data }: { data: DashboardData }) {
  const rows = data.series.map((p) => ({ ...p, label: bucketLabel(p.bucket, data.range.bucket) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="custFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} allowDecimals={false} width={48} />
          <Tooltip
            cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[
                    ["Clientes totales", formatNumber(payload[0].payload.total_customers)],
                    ["Nuevos en el período", formatNumber(payload[0].payload.new_customers)],
                  ]}
                />
              ) : null
            }
          />
          <Area type="monotone" dataKey="total_customers" stroke={BRAND} strokeWidth={2} fill="url(#custFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesChart({ data }: { data: DashboardData }) {
  const rows = data.series.map((p) => ({ ...p, label: bucketLabel(p.bucket, data.range.bucket) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v) => formatGsCompact(Number(v))} width={56} />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[
                    ["Ventas", formatGs(payload[0].payload.won_value)],
                    ["Cantidad", formatNumber(payload[0].payload.won_count)],
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="won_value" fill="#039855" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ data }: { data: DashboardData }) {
  const top = data.funnel[0]?.count ?? 0;
  const rows = data.funnel.map((f) => ({
    ...f,
    label: LEAD_STATUS_LABEL[f.status],
    pct: top ? Math.round((f.count / top) * 100) : 0,
  }));
  return (
    <ul className="space-y-3" aria-label="Conversión del pipeline">
      {rows.map((r) => (
        <li key={r.status}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-slate-700">{r.label}</span>
            <span className="tabular text-slate-900">
              <span className="font-semibold">{formatNumber(r.count)}</span>
              <span className="ml-1.5 text-xs text-slate-500">{r.pct}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.max(r.pct, r.count ? 2 : 0)}%`, background: r.status === "ganado" ? "#039855" : BRAND }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DistributionChart({ data }: { data: DashboardData }) {
  const order = new Map(LEAD_STATUSES.map((s, i) => [s.id, i]));
  const rows = [...data.distribution]
    .sort((a, b) => (order.get(a.status) ?? 0) - (order.get(b.status) ?? 0))
    .map((d) => ({ ...d, label: LEAD_STATUS_LABEL[d.status], color: LEAD_STATUSES.find((s) => s.id === d.status)?.color }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" {...axisProps} width={150} stroke="#475569" />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[
                    ["Oportunidades", formatNumber(payload[0].payload.count)],
                    ["Valor estimado", formatGs(payload[0].payload.value)],
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {rows.map((r) => (
              <Cell key={r.status} fill={r.color} />
            ))}
            <LabelList dataKey="count" position="right" fontSize={12} fill="#0f172a" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

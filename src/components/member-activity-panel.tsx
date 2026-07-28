"use client";

import { useEffect, useMemo, useState } from "react";
import { FileClock, LogIn, MousePointerClick, Search, TrendingUp, UsersRound } from "lucide-react";
import { readStoredDocumentsFromStorage } from "@/lib/app-documents";
import { fetchCentralActivityLogs, readActivityLog, type ActivityLogEntry } from "@/lib/activity-log";
import { loadAuthUsers, type AppUser } from "@/lib/auth-users";

type Period = "day" | "month" | "year";

export function MemberActivityPanel() {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [documents, setDocuments] = useState(() => readStoredDocumentsFromStorage().slice(0, 10));
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      // Exibe logs locais imediatamente
      setActivities(readActivityLog());
      setUsers(loadAuthUsers());
      setDocuments(readStoredDocumentsFromStorage().slice(0, 10));

      // Busca logs centralizados da nuvem
      const centralLogs = await fetchCentralActivityLogs();
      if (!cancelled && centralLogs.length > 0) {
        setActivities(centralLogs);
      }
    }

    void sync();
    window.addEventListener("yvae:activity-log-updated", sync);
    window.addEventListener("yvae:auth-users-updated", sync);
    window.addEventListener("storage", sync);

    return () => {
      cancelled = true;
      window.removeEventListener("yvae:activity-log-updated", sync);
      window.removeEventListener("yvae:auth-users-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const scopedActivities = useMemo(
    () => activities.filter((activity) => isInsidePeriod(activity.timestamp, date, period)),
    [activities, date, period],
  );
  const fileActivities = useMemo(
    () => scopedActivities.filter((activity) => activity.kind === "document.change"),
    [scopedActivities],
  );
  const ranking = useMemo(() => buildRanking(users, scopedActivities, filter), [filter, scopedActivities, users]);
  const selectedMember = ranking[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line-ghost)] bg-white/90">
      <header className="grid gap-3 border-b border-[var(--line-ghost)] p-4 xl:grid-cols-[1fr_180px_180px_minmax(260px,0.75fr)] xl:items-start">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-green-soft)] text-[var(--brand-teal)]">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              Atividade dos membros
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
              Ingressos, navegação e arquivos.
            </p>
            <p className="mt-2 text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Recorte atual: {formatDateLabel(date, period)}
            </p>
          </div>
        </div>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
          className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)]"
        >
          <option value="day">Por dia</option>
          <option value="month">Por mês</option>
          <option value="year">Por ano</option>
        </select>
        <input
          value={date}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)]"
        />
        <label className="flex h-10 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-3">
          <Search className="h-4 w-4 text-[var(--ink-soft)]" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar membro por nome, email ou categoria..."
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
        </label>
      </header>

      <div className="grid gap-3 p-4 md:grid-cols-4">
        <ActivityMetric label="Ingressos no app" value={countKind(scopedActivities, "login")} icon={LogIn} />
        <ActivityMetric label="Páginas visitadas" value={countKind(scopedActivities, "page.view")} icon={MousePointerClick} />
        <ActivityMetric label="Arquivos alterados" value={fileActivities.length} icon={FileClock} />
        <ActivityMetric label="Membros ativos" value={ranking.filter((member) => member.total > 0).length} icon={UsersRound} />
      </div>

      <div className="grid gap-4 p-4 pt-0 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="overflow-hidden rounded-xl border border-[var(--line-ghost)] bg-white/70">
          <h4 className="border-b border-[var(--line-ghost)] px-4 py-3 text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Ranking de atividade
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-label font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-4 py-3">Membro</th>
                  <th className="px-4 py-3">Ingressos</th>
                  <th className="px-4 py-3">Visitadas</th>
                  <th className="px-4 py-3">Arquivos</th>
                  <th className="px-4 py-3">Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-ghost)]">
                {ranking.map((member) => (
                  <tr key={member.user.id}>
                    <td className="px-4 py-3">
                      <p className="font-black text-[var(--brand-navy-strong)]">{member.user.name}</p>
                      <p className="text-xs text-[var(--ink-soft)]">{member.user.email}</p>
                      <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase tracking-[0.14em] text-slate-600">
                        {member.user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-black">{member.logins}</td>
                    <td className="px-4 py-3 font-black">{member.views}</td>
                    <td className="px-4 py-3 font-black">{member.files}</td>
                    <td className="px-4 py-3 text-[var(--ink-soft)]">{member.last ? formatDateTime(member.last) : "---"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line-ghost)] bg-white/70 p-4">
          <h4 className="text-base font-black text-[var(--brand-navy-strong)]">
            {selectedMember?.user.name ?? "Sem atividade registrada"}
          </h4>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{selectedMember?.user.email ?? "Aguardando eventos"}</p>
          <div className="mt-4 grid gap-3">
            <ActivityList title="Páginas mais visitadas" activities={scopedActivities.filter((activity) => activity.kind === "page.view")} />
            <ActivityList title="Atividade com arquivos" activities={fileActivities} />
            <div className="rounded-xl border border-[var(--line-ghost)] bg-white p-4">
              <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                Últimos arquivos no app
              </p>
              <div className="mt-3 grid gap-2">
                {documents.map((document) => (
                  <p key={document.id} className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)]">
                    {document.title} · {document.updatedAt ? formatDateTime(document.updatedAt) : document.date}
                  </p>
                ))}
                {!documents.length ? <p className="text-sm text-[var(--ink-soft)]">Nenhum arquivo registrado.</p> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function ActivityMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof TrendingUp }) {
  return (
    <article className="rounded-xl border border-[var(--line-ghost)] bg-white/76 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">{label}</p>
          <p className="mt-2 text-2xl font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <div className="rounded-xl bg-[var(--brand-teal-soft)] p-2.5 text-[var(--brand-teal)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </article>
  );
}

function ActivityList({ title, activities }: { title: string; activities: ActivityLogEntry[] }) {
  const grouped = Object.values(
    activities.reduce<Record<string, { target: string; count: number; last: string }>>((acc, activity) => {
      const current = acc[activity.target] ?? { target: activity.target, count: 0, last: activity.timestamp };
      acc[activity.target] = {
        target: activity.target,
        count: current.count + 1,
        last: current.last > activity.timestamp ? current.last : activity.timestamp,
      };
      return acc;
    }, {}),
  )
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-label font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">{title}</p>
      <div className="mt-3 grid gap-2">
        {grouped.map((item) => (
          <div key={item.target} className="rounded-lg bg-[var(--surface-soft)] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs text-[var(--brand-navy-strong)]">{item.target}</p>
              <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-black">{item.count}x</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Último registro: {formatDateTime(item.last)}</p>
          </div>
        ))}
        {!grouped.length ? <p className="text-sm text-[var(--ink-soft)]">Sem eventos no recorte.</p> : null}
      </div>
    </div>
  );
}

function buildRanking(users: AppUser[], activities: ActivityLogEntry[], filter: string) {
  const normalizedFilter = filter.trim().toLowerCase();

  return users
    .filter((user) =>
      `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(normalizedFilter),
    )
    .map((user) => {
      const userActivities = activities.filter((activity) => activity.userId === user.id);
      return {
        user,
        logins: countKind(userActivities, "login"),
        views: countKind(userActivities, "page.view"),
        files: countKind(userActivities, "document.change"),
        total: userActivities.length,
        last: userActivities[0]?.timestamp,
      };
    })
    .sort((left, right) => right.total - left.total || left.user.name.localeCompare(right.user.name));
}

function countKind(activities: ActivityLogEntry[], kind: ActivityLogEntry["kind"]) {
  return activities.filter((activity) => activity.kind === kind).length;
}

function isInsidePeriod(timestamp: string, date: string, period: Period) {
  const activityDate = new Date(timestamp);
  const targetDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(activityDate.getTime()) || Number.isNaN(targetDate.getTime())) {
    return false;
  }

  if (period === "year") {
    return activityDate.getFullYear() === targetDate.getFullYear();
  }

  if (period === "month") {
    return activityDate.getFullYear() === targetDate.getFullYear() &&
      activityDate.getMonth() === targetDate.getMonth();
  }

  return activityDate.toDateString() === targetDate.toDateString();
}

function formatDateLabel(date: string, period: Period) {
  const parsed = new Date(`${date}T00:00:00`);

  if (period === "year") {
    return String(parsed.getFullYear());
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: period === "day" ? "2-digit" : undefined,
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value || "---";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}


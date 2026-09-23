import { ArrowRight } from "lucide-react";
import { APP_LAST_UPDATED_LABEL, APP_VERSION } from "@/lib/app-version";
import { MAJOR_RELEASES, majorOf } from "@/lib/release-notes";
import { cn } from "@/lib/utils";

/** Ajuda › Versões: o que cada versão principal trouxe, da mais recente para a mais antiga. */
export function ReleaseNotes() {
  const currentMajor = majorOf(APP_VERSION);
  const newestMajor = MAJOR_RELEASES[0]?.major ?? null;

  return (
    <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5" aria-labelledby="release-notes-title">
      <header className="border-b border-[var(--line-ghost)] pb-4">
        <p className="text-caption font-black text-[var(--brand-teal)]">Histórico do Yva’e</p>
        <h2 id="release-notes-title" className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">Versões</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
          Você está na versão <strong className="text-[var(--brand-navy-strong)]">{APP_VERSION}</strong>, atualizada em {APP_LAST_UPDATED_LABEL}.
          Cada versão principal (1, 2, 3…) resume o que mudou; as atualizações de cada publicação entram dentro dela.
        </p>
      </header>

      <div className="mt-5 space-y-6">
        {MAJOR_RELEASES.map((release) => {
          const isCurrent = release.major === currentMajor;
          const isUpcoming = currentMajor !== null && release.major > currentMajor;
          return (
            <section key={release.major} aria-labelledby={`release-${release.major}`} className={cn("rounded-2xl border p-4 sm:p-5", isCurrent || (isUpcoming && release.major === newestMajor) ? "border-[var(--brand-teal)]" : "border-[var(--line-ghost)]")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`release-${release.major}`} className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
                  {release.name} <span className="text-base font-bold text-[var(--ink-soft)]">· {release.range}</span>
                </h3>
                <span className={cn("rounded-full px-3 py-1 text-xs font-black", isCurrent ? "bg-[var(--brand-teal-soft)] text-[var(--brand-navy-strong)]" : isUpcoming ? "bg-[var(--status-warning-soft)] text-[var(--brand-navy-strong)]" : "bg-[var(--surface-soft)] text-[var(--ink-soft)]")}>
                  {isCurrent ? "Em uso" : isUpcoming ? "Em preparação" : "Anterior"} · {release.period}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink)]">{release.summary}</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {release.areas.map((area) => (
                  <div key={area.title}>
                    <h4 className="text-sm font-black text-[var(--brand-navy-strong)]">{area.title}</h4>
                    <ul className="mt-2 grid gap-1.5">
                      {area.items.map((item) => (
                        <li key={item} className="grid grid-cols-[14px_1fr] gap-2 text-sm leading-6 text-[var(--ink-soft)]">
                          <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-[var(--brand-teal)]" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {release.moved?.length ? (
                <div className="mt-5">
                  <h4 className="text-sm font-black text-[var(--brand-navy-strong)]">Onde ficou o que existia antes</h4>
                  <dl className="mt-2 grid gap-2">
                    {release.moved.map((item) => (
                      <div key={item.before} className="grid gap-1 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm sm:grid-cols-[minmax(0,16rem)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <dt className="font-bold text-[var(--brand-navy-strong)]">{item.before}</dt>
                        <ArrowRight className="hidden h-4 w-4 text-[var(--brand-teal)] sm:block" aria-hidden="true" />
                        <dd className="text-[var(--ink-soft)]"><span className="sr-only">agora: </span>{item.now}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {release.notes?.length ? (
                <ul className="mt-4 grid gap-2">
                  {release.notes.map((note) => (
                    <li key={note} className="rounded-xl border border-[var(--line-ghost)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-soft)]">{note}</li>
                  ))}
                </ul>
              ) : null}

              {release.updates?.length ? (
                <div className="mt-5">
                  <h4 className="text-sm font-black text-[var(--brand-navy-strong)]">Atualizações</h4>
                  <ol className="mt-2 grid gap-2">
                    {release.updates.map((update) => (
                      <li key={update.version} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm">
                        <p className="font-bold text-[var(--brand-navy-strong)]">{update.version} <span className="font-semibold text-[var(--ink-soft)]">· {update.date}</span></p>
                        <ul className="mt-1 list-disc pl-5 text-[var(--ink-soft)]">{update.items.map((item) => <li key={item}>{item}</li>)}</ul>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}

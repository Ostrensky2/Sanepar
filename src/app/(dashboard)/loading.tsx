const shimmer = "animate-pulse rounded-[28px] bg-[var(--surface-soft)]";

export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando o conteúdo…</span>

      <section className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="glass-panel rounded-[28px] p-4">
            <div className="mb-3 h-3 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            <div className="h-9 w-20 animate-pulse rounded-xl bg-[var(--surface-soft)]" />
            <div className="mt-3 h-3 w-40 animate-pulse rounded-full bg-[var(--surface-soft)]" />
          </div>
        ))}
      </section>

      <div className={`${shimmer} h-20`} />

      <section className="glass-panel space-y-4 rounded-[32px] p-6">
        <div className="h-5 w-56 animate-pulse rounded-full bg-[var(--surface-muted)]" />
        <div className="h-3 w-80 max-w-full animate-pulse rounded-full bg-[var(--surface-soft)]" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`${shimmer} h-72`} />
          <div className={`${shimmer} h-72`} />
        </div>
      </section>
    </div>
  );
}

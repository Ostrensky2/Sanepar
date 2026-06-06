"use client";

import { DashboardSkeleton } from "@/components/operational-feedback";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-2 py-2 lg:px-3">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3">
          <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-8 w-full max-w-xl animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-12 w-full max-w-sm animate-pulse rounded-xl bg-slate-100" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-16 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </section>

      <DashboardSkeleton rows={5} />
    </div>
  );
}

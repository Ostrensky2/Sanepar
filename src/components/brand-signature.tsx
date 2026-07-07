import { cn } from "@/lib/utils";

type YvaeMastheadProps = {
  compact?: boolean;
  className?: string;
};

type InstitutionalPartnersProps = {
  compact?: boolean;
  className?: string;
};

export function YvaeMasthead({
  compact = false,
  className,
}: YvaeMastheadProps) {
  return (
    <div
      className={cn(
        "brand-logo-shell overflow-hidden radius-panel border p-4",
        compact ? "max-w-[11rem]" : "w-full",
        className,
      )}
    >
      <div
        className={cn(
          "relative mx-auto",
          compact ? "h-20 w-24" : "h-44 w-full",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/yvae-logo-completa.png"
          alt="Yva'e Monitoramento"
          className="h-full w-full object-contain"
        />
      </div>

      {!compact ? (
        <div className="mt-4">
          <p className="text-center text-caption font-bold uppercase tracking-[0.28em] text-[var(--brand-teal)]">
            Sistema de monitoramento
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function InstitutionalPartners({
  compact = false,
  className,
}: InstitutionalPartnersProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!compact ? (
        <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
          Parceria institucional
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="brand-logo-shell radius-card border px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/sanepar-logo.jpg"
            alt="Sanepar"
            className={cn("h-auto object-contain", compact ? "w-[92px]" : "w-[122px]")}
          />
        </div>

        <div className="brand-logo-shell flex items-center radius-card border bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/atgc-logo.png"
            alt="ATGC"
            className={cn("h-auto object-contain", compact ? "w-[42px]" : "w-[56px]")}
          />
        </div>
      </div>
    </div>
  );
}


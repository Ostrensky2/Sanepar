import Image from "next/image";
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
        "brand-logo-shell overflow-hidden rounded-[28px] border p-4",
        compact ? "max-w-[11rem]" : "w-full",
        className,
      )}
    >
      <div className={cn("relative mx-auto", compact ? "h-16 w-24" : "h-28 w-full")}>
        <Image
          src="/brand/yvae-logo.png"
          alt="Yva'e Monitoramento"
          fill
          priority
          sizes={compact ? "96px" : "180px"}
          className="object-contain"
        />
      </div>

      {!compact ? (
        <div className="mt-4">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--brand-teal)]">
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
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
          Parceria institucional
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="brand-logo-shell rounded-[20px] border px-3 py-2">
          <Image
            src="/brand/sanepar-logo.jpg"
            alt="Sanepar"
            width={compact ? 92 : 122}
            height={compact ? 20 : 28}
            className="h-auto w-auto object-contain"
          />
        </div>

        <div className="brand-logo-shell flex items-center rounded-[20px] border bg-white px-3 py-2">
          <Image
            src="/brand/atgc-logo.png"
            alt="ATGC"
            width={compact ? 42 : 56}
            height={compact ? 42 : 56}
            className="h-auto w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
}

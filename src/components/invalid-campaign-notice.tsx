import Link from "next/link";

export function InvalidCampaignNotice({ href, label }: { href: string; label: string }) {
  return <section className="app-card space-y-2 p-5">
    <h1 className="type-section-title">Campanha indisponível neste endereço</h1>
    <p role="status">Confira a campanha no link ou escolha uma campanha na consulta.</p>
    <Link className="inline-flex min-h-11 items-center font-semibold underline" href={href}>{label}</Link>
  </section>;
}

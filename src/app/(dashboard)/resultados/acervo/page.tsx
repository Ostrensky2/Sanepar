import { redirect } from "next/navigation";

/** Endereço antigo do Acervo científico: as fichas de conhecimento agora abrem na ficha de cada organismo, em Impactos potenciais. */
export default function ScientificLibraryPage() {
  redirect("/resultados/impactos");
}

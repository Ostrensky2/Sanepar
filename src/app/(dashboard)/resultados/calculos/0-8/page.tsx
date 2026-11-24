import { redirect } from "next/navigation";

/** Endereço antigo: o método 0.8 passou a se chamar 3.0 (só o nome mudou). Links salvos continuam funcionando. */
export default function OldMethodPage() {
  redirect("/resultados/calculos/3-0");
}

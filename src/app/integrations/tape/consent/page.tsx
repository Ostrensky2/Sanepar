"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";

type Info = {
  requestId: string;
  csrf: string;
  destination: string;
  userName: string;
  expiresAt: string;
  summary: Record<string, number>;
};
type Grant = { grantId: string; createdAt: string; expiresAt: string; active: boolean; csrf: string };

const GROUPS: [string, string][] = [
  ["point", "Locais e pontos"],
  ["campaign", "Campanhas"],
  ["plannedPoint", "Itens de planejamento"],
  ["entry", "Registros de campo"],
  ["sample", "Amostras"],
  ["parameter", "Parâmetros de campo"],
  ["reading", "Medições"],
  ["action", "Ações pontuais"],
  ["photo", "Fotos"],
  ["document", "Documentos"],
];

const api = "/api/integrations/tape";
const time = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function TapeConsentPage() {
  return (
    <AuthGate>
      <Consent />
    </AuthGate>
  );
}

function Consent() {
  const [info, setInfo] = useState<Info | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function loadGrants() {
    const response = await fetch(`${api}/grants`, { cache: "no-store" });
    if (response.ok) setGrants(((await response.json()) as { grants: Grant[] }).grants.filter((grant) => grant.active));
  }

  useEffect(() => {
    const requestId = new URL(window.location.href).searchParams.get("requestId");
    void loadGrants();
    if (!requestId) return;
    void fetch(`${api}/consent-info?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) return setInfo((await response.json()) as Info);
        setError(
          response.status === 403
            ? "Seu perfil não tem permissão para autorizar a leitura pelo Tape. Peça ao administrador do Yva’e."
            : "Este pedido de conexão expirou ou já foi usado. Volte ao Tape e clique de novo em Importar do Yva´E.",
        );
      })
      .catch(() => setError("Não foi possível carregar o pedido de conexão."));
  }, []);

  async function decide(decision: "approve" | "deny") {
    if (!info || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${api}/consents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: info.requestId, csrf: info.csrf, decision }),
      });
      if (!response.ok) throw new Error();
      window.location.assign(((await response.json()) as { redirectTo: string }).redirectTo);
    } catch {
      setError("Não foi possível registrar a decisão. Volte ao Tape e tente de novo.");
      setPending(false);
    }
  }

  async function revoke(grant: Grant) {
    const response = await fetch(`${api}/grants/${grant.grantId}`, { method: "DELETE", headers: { "X-CSRF-Token": grant.csrf } });
    if (response.ok) await loadGrants();
    else setError("Não foi possível encerrar a conexão.");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-slate-800">
      <h1 className="text-2xl font-semibold">Conectar o Yva’e ao Tape</h1>
      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6">
            <strong>{info.userName}</strong>, o Tape pede para <strong>ler</strong> os dados de campo deste Yva’e e
            copiá-los para o contrato Yva´E. O Tape não recebe a sua senha, não altera nada aqui, e a autorização vale
            por no máximo 8 horas. Você pode encerrá-la antes, nesta mesma página.
          </p>
          <h2 className="mt-4 text-sm font-semibold">O que o Tape poderá ler</h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {GROUPS.map(([key, label]) => (
              <li key={key} className="flex justify-between border-b border-slate-100 py-1">
                <span>{label}</span>
                <span className="font-medium tabular-nums">{info.summary[key] ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Ficam de fora: resultados de laboratório, índices de risco, contas de usuário e permissões.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => void decide("approve")}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
            >
              Autorizar leitura
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void decide("deny")}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Recusar
            </button>
          </div>
        </section>
      ) : null}
      {grants.length ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Conexões ativas com o Tape</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {grants.map((grant) => (
              <li key={grant.grantId} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                <span>
                  Autorizada em {time(grant.createdAt)} · vale até {time(grant.expiresAt)}
                </span>
                <button type="button" onClick={() => void revoke(grant)} className="text-red-700 hover:underline">
                  Encerrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

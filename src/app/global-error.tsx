"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Substitui o root layout quando o erro acontece nele, portanto o globals.css
// não está disponível aqui — os estilos são inline para preservar a marca.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Falha crítica na aplicação:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2.5rem 1rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "linear-gradient(180deg, #f8fcfd 0%, #eef5f8 100%)",
          color: "#17354c",
        }}
      >
        <section
          role="alert"
          style={{
            width: "100%",
            maxWidth: "32rem",
            textAlign: "center",
            borderRadius: "32px",
            border: "1px solid rgba(0, 66, 98, 0.14)",
            background: "rgba(255, 255, 255, 0.96)",
            boxShadow: "0 28px 80px -48px rgba(0, 66, 98, 0.24)",
            padding: "2rem",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "#ba1a1a",
              margin: 0,
            }}
          >
            Erro crítico
          </p>
          <h1
            style={{
              marginTop: "0.5rem",
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "#004262",
            }}
          >
            A aplicação encontrou um problema
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#60768b",
            }}
          >
            Recarregue para tentar novamente. Se o problema continuar, contate o
            suporte da equipe ATGC.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11px",
                color: "#60768b",
              }}
            >
              Código de referência: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "3rem",
              padding: "0 1.25rem",
              borderRadius: "12px",
              border: "none",
              background: "#004262",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Recarregar aplicação
          </button>
        </section>
      </body>
    </html>
  );
}

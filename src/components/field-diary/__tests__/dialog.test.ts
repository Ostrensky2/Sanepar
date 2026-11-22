import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "../ui";

describe("Diário: contrato acessível do diálogo", () => {
  it.each(["Novo registro", "Editar registro"])("nomeia o diálogo %s sem fechamento implícito", (title) => {
    const html = renderToStaticMarkup(React.createElement(Dialog, { title, onClose: () => {} }, "Conteúdo"));
    expect(html).toMatch(/^<dialog /);
    expect(html).toContain('aria-modal="true"');
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain(`>${title}</h2>`);
    expect(html).toContain('type="button" aria-label="Fechar"');
    expect(html).not.toContain('method="dialog"');
    expect(html).not.toContain(' open=""');
  });
});

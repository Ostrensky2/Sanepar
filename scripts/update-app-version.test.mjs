import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  incrementProductionVersion,
  resolveReleaseState,
  runProductionRelease,
} from "./update-app-version.mjs";

test("incrementa patch com carry geral", () => {
  assert.equal(incrementProductionVersion("1.1.0"), "1.1.1");
  assert.equal(incrementProductionVersion("1.1.9"), "1.2.0");
  assert.equal(incrementProductionVersion("1.9.9"), "2.0.0");
  assert.throws(() => incrementProductionVersion("1.1-beta"), /Versão inválida/);
});

test("é idempotente pela dupla SHA/release e falha fechado em colisões", async () => {
  const current = {
    version: "1.1.6",
    previousSha: "2857ec881d659b892ea4cb693319a5a92d4aba7b",
    previousRelease: "canonical-1.1.6",
  };
  assert.deepEqual(
    resolveReleaseState({ ...current, sha: current.previousSha, release: current.previousRelease }),
    { version: "1.1.6", changed: false },
  );
  assert.deepEqual(
    resolveReleaseState({
      ...current,
      sha: "198cc07a1582d1ff6ca1445e56d0351549b59c29",
      release: "production-2026-08-21",
    }),
    { version: "1.1.7", changed: true },
  );
  assert.throws(
    () => resolveReleaseState({ ...current, sha: current.previousSha, release: "outra" }),
    /Colisão/,
  );
  assert.throws(
    () => resolveReleaseState({ ...current, sha: "invalido", release: "outra" }),
    /SHA de release inválido/,
  );
  await assert.rejects(() => runProductionRelease([]), /Entrada inválida/);
});

test("não acopla incremento a dev ou build", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const appVersion = readFileSync("src/lib/app-version.ts", "utf8");
  assert.equal(pkg.version, "1.1.6");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(appVersion, /APP_VERSION = "1\.1\.6"/);
  assert.match(appVersion, /APP_LAST_UPDATED_LABEL = "21\/08\/2026"/);
  assert.match(appVersion, /APP_RELEASE_SHA = "2857ec881d659b892ea4cb693319a5a92d4aba7b"/);
  assert.match(appVersion, /APP_RELEASE_ID = "canonical-1\.1\.6"/);
  assert.match(pkg.scripts["release:production"], /--production/);
  assert.equal(pkg.scripts.dev, "next dev --hostname 127.0.0.1");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.predev, undefined);
  assert.equal(pkg.scripts.prebuild, undefined);
  assert.equal(pkg.scripts["sync:version"], undefined);
});

test("mantém identificação única no footer e nenhuma no menu lateral", () => {
  const stamp = readFileSync("src/components/app-version-stamp.tsx", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const footer = shell.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(stamp, /Yva’e Monitoramento/);
  assert.match(stamp, /PLATAFORMA INSTITUCIONAL ATGC \+ SANEPAR/);
  assert.match(stamp, /© 2026 YVA/);
  assert.match(stamp, /SISTEMA DE MONITORAMENTO AMBIENTAL/);
  assert.match(stamp, /Versão atual/);
  assert.match(stamp, /Última alteração em/);
  assert.match(stamp, /\{APP_VERSION\}/);
  assert.match(stamp, /\{APP_LAST_UPDATED_LABEL\}/);
  assert.ok(stamp.indexOf("Yva’e Monitoramento") < stamp.indexOf("PLATAFORMA INSTITUCIONAL"));
  assert.ok(stamp.indexOf("PLATAFORMA INSTITUCIONAL") < stamp.indexOf("© 2026"));
  assert.ok(stamp.indexOf("© 2026") < stamp.indexOf("Versão atual"));
  assert.match(stamp, /border-\[var\(--line-ghost\)\]/);
  assert.match(stamp, /text-\[var\(--brand-teal\)\]/);
  assert.match(stamp, /heading-font justify-self-center/);
  assert.doesNotMatch(stamp, /text-center/);
  assert.equal(shell.match(/<AppVersionStamp \/>/g)?.length, 1);
  assert.match(footer, /<AppVersionStamp \/>/);
  assert.doesNotMatch(shell, /APP_VERSION_LABEL/);
});

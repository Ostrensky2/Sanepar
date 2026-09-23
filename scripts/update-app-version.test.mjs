import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  incrementProductionVersion,
  plannedVersion,
  resolveReleaseState,
  runProductionRelease,
} from "./update-app-version.mjs";

function assertReleasePlanCheckpoint(root = ".") {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  let plan;
  try {
    plan = JSON.parse(readFileSync(join(root, "release-plan.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    assert.ok(Number(pkg.version.split(".")[0]) >= 2, "Plano ausente antes da versão 2.0.0");
    return;
  }
  assert.equal(plannedVersion(plan, pkg.version), "2.0.0");
}

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
    { version: "1.1.7", changed: true, planned: false },
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
  // A versão só muda pela release de produção: package, lockfile e app-version sempre iguais.
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.ok(appVersion.includes(`APP_VERSION = "${pkg.version}"`));
  assert.match(appVersion, /APP_LAST_UPDATED_LABEL = "\d{2}\/\d{2}\/\d{4}"/);
  assert.match(appVersion, /APP_RELEASE_SHA = "[0-9a-f]{7,40}"/);
  assert.match(appVersion, /APP_RELEASE_ID = "[a-z0-9][a-z0-9._-]*"/i);
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

test("plano de versão define a próxima release uma única vez (1.2.7 → 2.0.0) e depois volta ao incremento", async () => {
  assert.equal(plannedVersion(null, "1.2.7"), null);
  assert.equal(plannedVersion({ nextVersion: "2.0.0" }, "1.2.7"), "2.0.0");
  assert.throws(() => plannedVersion({ nextVersion: "1.2.7" }, "1.2.7"), /não é maior/);
  assert.throws(() => plannedVersion({ nextVersion: "2.0" }, "1.2.7"), /inválido/);

  const root = mkdtempSync(join(tmpdir(), "yvae-release-"));
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  writeFileSync(join(root, "src", "lib", "app-version.ts"), [
    'export const APP_VERSION = "1.2.7";',
    'export const APP_RELEASE_SHA = "4371d3e3cbbf32420cf52fa906035e10ba2e5593";',
    'export const APP_RELEASE_ID = "production-1.2.7";',
    "",
  ].join("\n"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", version: "1.2.7" }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "1.2.7", packages: { "": { version: "1.2.7" } } }));
  assert.throws(() => assertReleasePlanCheckpoint(root), /Plano ausente/);
  writeFileSync(join(root, "release-plan.json"), JSON.stringify({ nextVersion: "2.0.0" }));
  assertReleasePlanCheckpoint(root);
  const now = new Date("2026-09-24T15:00:00Z");
  const release = (sha, id) => runProductionRelease(["--production", "--sha", sha, "--release", id], now, root);

  assert.deepEqual(await release("abcdef1234567", "production-2.0.0"), { version: "2.0.0", changed: true, planned: true });
  assert.equal(existsSync(join(root, "release-plan.json")), false);
  assert.ok(readFileSync(join(root, "src", "lib", "app-version.ts"), "utf8").includes('APP_VERSION = "2.0.0"'));
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "2.0.0");
  assertReleasePlanCheckpoint(root);
  assert.deepEqual(await release("abcdef1234567", "production-2.0.0"), { version: "2.0.0", changed: false });
  assert.deepEqual(await release("1234567abcdef", "production-2.0.1"), { version: "2.0.1", changed: true, planned: false });
  assertReleasePlanCheckpoint(root);
});

test("valida o plano para 2.0.0 ou seu consumo após atingir essa versão", () => {
  assertReleasePlanCheckpoint();
});

// Cross-repo replay smoke: emit the kitchen fixture as a real .cnjob, then run
// OmniCam's VerifyJob through the full pipeline (import → nest → ops → offset
// → bundle → export verify). Exit code passes through VerifyJob's:
//   0 clean · 1 verification issues · 2 usage/import problem
//
//   node scripts/replay-omnicam.mjs [--build]
//
// The OmniCam repo is located via CABINETNC_REPO, else ../cabinetnc-cut.
// The pinned expectation lives in cabinetnc-cut's cab_lab_kitchen golden —
// this script is the headless smoke runner, not the assertion.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const omnicam = resolve(process.env.CABINETNC_REPO ?? join(repo, "..", "cabinetnc-cut"));
const cnjob = join(repo, "fixtures", "replay", "kitchen.cnjob");
const dll = join(omnicam, "dotnet", "tools", "VerifyJob", "bin", "Release", "net10.0", "VerifyJob.dll");
const csproj = join(omnicam, "dotnet", "tools", "VerifyJob", "VerifyJob.csproj");

const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

if (!existsSync(join(omnicam, "dotnet", "CabinetNC.slnx"))) {
  console.error(`OmniCam repo not found at ${omnicam} — set CABINETNC_REPO`);
  process.exit(2);
}

const emit = run("node", ["--experimental-strip-types", join(repo, "scripts", "emit-replay-cnjob.mjs")]);
if (emit.status !== 0) process.exit(emit.status ?? 2);

if (!existsSync(dll) || process.argv.includes("--build")) {
  const build = run("dotnet", ["build", csproj, "-c", "Release"]);
  if (build.status !== 0) process.exit(build.status ?? 2);
}

const verify = run("dotnet", [dll, cnjob]);
process.exit(verify.status ?? 2);

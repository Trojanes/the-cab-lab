// The Cab Lab: make sure node_modules/electron actually contains electron.exe.
//
// The official `electron` postinstall (install.js) can fail silently on some
// Windows / Node combinations, leaving only an empty dist/ folder. When that
// happens `npx electron .` throws "Electron failed to install correctly".
// This script downloads the matching zip via @electron/get and extracts it
// with PowerShell, then writes path.txt the same way install.js would.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const electronDir = path.join(__dirname, "node_modules", "electron");
const distDir = path.join(electronDir, "dist");
const pathTxt = path.join(electronDir, "path.txt");
const exe = path.join(distDir, "electron.exe");

if (process.platform !== "win32") {
  console.log("ensure-electron: non-Windows platform, relying on npm postinstall.");
  process.exit(0);
}

if (fs.existsSync(exe) && fs.existsSync(pathTxt)) {
  process.exit(0);
}

const { version } = require(path.join(electronDir, "package.json"));
console.log(`ensure-electron: electron.exe missing, fetching v${version}...`);

const { downloadArtifact } = require("@electron/get");

downloadArtifact({
  version,
  artifactName: "electron",
  platform: "win32",
  arch: process.arch,
})
  .then((zipPath) => {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" }
    );
    if (!fs.existsSync(exe)) {
      throw new Error("electron.exe still missing after extraction");
    }
    fs.writeFileSync(pathTxt, "electron.exe");
    console.log("ensure-electron: ok");
  })
  .catch((error) => {
    console.error("ensure-electron: failed:", error.message || error);
    process.exit(1);
  });

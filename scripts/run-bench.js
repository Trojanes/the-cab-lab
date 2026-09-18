// `npm run bench`: start the app with the generator bench window open
// (CABLAB_BENCH=1), portable across shells. Extra args go to electron.
const { spawn } = require("child_process");
const path = require("path");

const electron = require("electron"); // path to the binary when required from Node
const child = spawn(electron, [path.resolve(__dirname, ".."), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, CABLAB_BENCH: process.env.CABLAB_BENCH || "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));

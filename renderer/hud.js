// Cursor tooltip: one line that says what the cursor is doing right now
// ("Corner · cab-1", "On edge X", "Flush with cab-1 front", "Stopped at back wall").
import { canvasClientRect } from "./space.js";

const tip = document.getElementById("cursorTip");
const tipLines = [];
let tipKey = "";

/** Show `lines` (string or array) near the cursor. `tone` = "" | "warn" | "lock". */
export function showTip(clientX, clientY, lines, tone = "") {
  const r = canvasClientRect();
  const arr = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (!arr.length) return hideTip();
  const key = `${tone}\n${arr.join("\n")}`;
  if (key !== tipKey) {
    tipKey = key;
    while (tipLines.length < arr.length) {
      const d = document.createElement("div");
      tip.append(d);
      tipLines.push(d);
    }
    for (let i = 0; i < tipLines.length; i += 1) {
      const on = i < arr.length;
      tipLines[i].style.display = on ? "" : "none";
      if (on && tipLines[i].textContent !== arr[i]) tipLines[i].textContent = arr[i];
    }
    tip.className = tone;
  }
  tip.style.left = `${clientX - r.left + 16}px`;
  tip.style.top = `${clientY - r.top + 18}px`;
  tip.classList.remove("hidden");
}

export function hideTip() {
  tipKey = "";
  tip.classList.add("hidden");
}

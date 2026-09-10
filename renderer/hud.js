// Cursor tooltip: one line that says what the cursor is doing right now
// ("Corner · cab-1", "On edge X", "Flush with cab-1 front", "Stopped at back wall").
import { canvas } from "./space.js";

const tip = document.getElementById("cursorTip");

/** Show `lines` (string or array) near the cursor. `tone` = "" | "warn" | "lock". */
export function showTip(clientX, clientY, lines, tone = "") {
  const r = canvas.getBoundingClientRect();
  const arr = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (!arr.length) return hideTip();
  tip.replaceChildren(...arr.map((s) => { const d = document.createElement("div"); d.textContent = s; return d; }));
  tip.className = tone;
  tip.style.left = `${clientX - r.left + 16}px`;
  tip.style.top = `${clientY - r.top + 18}px`;
  tip.classList.remove("hidden");
}

export function hideTip() {
  tip.classList.add("hidden");
}

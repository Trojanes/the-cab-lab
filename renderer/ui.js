// UI shell wiring. Static mock: buttons switch panels and views only;
// nothing here touches job data yet.
import { setView, floorPointAt, canvas } from "./space.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// --- top bar: view segment -------------------------------------------------
$$("#viewGroup [data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b === btn));
    setView(btn.dataset.view);
    $("#viewLabel").textContent = btn.textContent;
  });
});

// --- top bar: actions (mock) ----------------------------------------------
$$("#topbar [data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    console.info("[ui] action:", btn.dataset.action, "(not wired)");
  });
});

// --- left rail ---------------------------------------------------------------
$$("#leftrail .rail-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#leftrail .rail-item").forEach((b) => b.classList.toggle("active", b === btn));
    const name = $(".rail-name", btn).textContent;
    $("#propTitle").textContent = name;
    $("#propSub").textContent = name === "Room" ? "Nothing selected — showing room" : "Placing " + name;
    $("#stSelection").textContent = "Selection: " + (name === "Room" ? "—" : name);
  });
});

// --- bottom drawer -----------------------------------------------------------
const drawer = $("#drawer");
$("#drawerToggle").addEventListener("click", () => drawer.classList.toggle("collapsed"));
$$("#drawer .dtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#drawer .dtab").forEach((t) => t.classList.toggle("active", t === tab));
    $$("#drawer .dpane").forEach((p) => p.classList.toggle("active", p.dataset.dpane === tab.dataset.dtab));
    drawer.classList.remove("collapsed");
  });
});

// --- status bar: cursor on floor ---------------------------------------------
const stCursor = $("#stCursor");
canvas.addEventListener("pointermove", (e) => {
  const p = floorPointAt(e.clientX, e.clientY);
  stCursor.textContent = p ? `X ${Math.round(p.x)}  Y ${Math.round(p.y)}` : "X — Y —";
});
canvas.addEventListener("pointerleave", () => {
  stCursor.textContent = "X — Y —";
});

// --- keyboard shortcuts (mock targets) ---------------------------------------
window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  const map = { n: "new", o: "open", s: "save", z: "undo", y: "redo" };
  const action = map[e.key.toLowerCase()];
  if (action) {
    e.preventDefault();
    console.info("[ui] shortcut:", action, "(not wired)");
  }
});

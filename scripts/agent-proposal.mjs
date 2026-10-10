// Generator-task proposal — the declared-intent contract shared by the run
// harness (exec gate + finish verdict) and the post-run review. A proposal
// is the agent stating what it is about to change BEFORE touching anything;
// every later check measures the run against that statement, not vibes.
//
// task.proposal:
// {
//   "changes": [
//     { "surface": "rules",  "name": "SUPPORT_STRIP_WIDTH",
//       "from": 100, "to": 95, "reason": "narrow strips 5mm" },
//     { "surface": "layout", "reason": "move T3 onto layout rules" }
//   ],
//   "scope": ["^kitchen-base\\.(B3|T1-1)\\."],   // allowed pin-drift paths
//   "maxChanges": 40                              // optional drift cap
// }
//
// verifyProposal returns [{id,severity,ok,detail}] like agent-review checks.
// Callers inject the two reads so the same logic serves a live run dir
// (fs) and a review re-run (sandboxed CLI):
//   readRules(moduleId) → rules.json doc | null
//   runDiff()           → { changes: [{path,from,to}] }

export function checkProposalShape(proposal) {
  if (!proposal || typeof proposal !== "object") return "proposal must be an object";
  if (!Array.isArray(proposal.changes) || !proposal.changes.length) return "proposal.changes must be a non-empty array";
  for (const c of proposal.changes) {
    if (c.surface === "rules" && (typeof c.name !== "string" || c.name === "")) return "rules change needs a name";
    if (!["rules", "layout"].includes(c.surface)) return `unknown surface '${c.surface}'`;
  }
  if (!Array.isArray(proposal.scope) || !proposal.scope.length) return "proposal.scope must declare allowed drift paths";
  for (const s of proposal.scope) { try { new RegExp(s); } catch { return `bad scope regex '${s}'`; } }
  return null;
}

/** Rule names the proposal allows bench.rules.set to touch. */
export function declaredRuleNames(proposal) {
  return new Set((proposal?.changes ?? []).filter((c) => c.surface === "rules").map((c) => c.name));
}

/** The four proposal gates: stale / applied / scoped / bounded. */
export function verifyProposal({ task, proposalBase = {}, readRules, runDiff }) {
  const out = [];
  const add = (id, ok, detail) => out.push({ id: `proposal.${id}`, severity: "block", ok, detail });
  const p = task.proposal;
  const ruleChanges = (p.changes ?? []).filter((c) => c.surface === "rules");
  const rules = ruleChanges.length ? readRules(task.generator) : null;

  // stale: the world the proposal claims it starts from must be the real one.
  // A wrong `from` means the agent's model of the generator was wrong when
  // it wrote the plan — different semantic, blocked, not a typo.
  const stale = ruleChanges.filter((c) => proposalBase[c.name] !== c.from);
  add("stale", stale.length === 0, {
    stale: stale.map((c) => ({ name: c.name, claimed: c.from, actual: proposalBase[c.name] ?? null })),
  });

  // applied: every declared change must have actually landed.
  const unapplied = ruleChanges.filter((c) => rules?.[c.name]?.value !== c.to);
  add("applied", unapplied.length === 0, {
    unapplied: unapplied.map((c) => ({ name: c.name, wanted: c.to, actual: rules?.[c.name]?.value ?? null })),
  });

  // scoped + bounded: the live pin drift must stay inside the declared surface.
  const scope = (p.scope ?? []).map((s) => new RegExp(s));
  const { changes = [] } = runDiff() ?? {};
  const outside = changes.filter((ch) => !scope.some((re) => re.test(ch.path)));
  add("scoped", outside.length === 0, {
    changes: changes.length, outside: outside.map((d) => d.path).slice(0, 10),
  });
  const max = p.maxChanges ?? null;
  add("bounded", max == null || changes.length <= max, { changes: changes.length, maxChanges: max });

  return out;
}

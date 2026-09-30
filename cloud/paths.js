// Cloud object-key conventions shared with OmniCam.
//
// Bucket layout (flat prefixes, refined by project/job id in a later phase):
//   cablab/   Cab Lab private data (jobs, generator io, bom)
//   omnicam/  OmniCam private data (jobs, nest, cam, nc, dxf)
//   shared/   data passed between the two (e.g. cnjob manufacturing snapshots)
//   temp/     transient compute / transfer files
//
// Keys are GCS object names: forward slashes, no drive letters, no "..".
"use strict";

const ROOTS = ["cablab", "omnicam", "shared", "temp"];

/** Join and normalise a key: forward slashes, no empty segments. */
function joinKey(...parts) {
  return parts
    .flatMap((p) => String(p || "").split("/"))
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

function isSafeRelKey(rel) {
  const key = String(rel || "");
  if (!key || key.startsWith("/") || key.startsWith("\\")) return false;
  // Keys must stay portable to a Windows filesystem (LocalStorageProvider) and
  // unambiguous in GCS: no drive letters, no backslash, no shell-y chars.
  if (/[<>:"\\|?*]/.test(key)) return false;
  if (key.includes("..") || key.includes("\0")) return false;
  if (key.endsWith("/")) return false;
  return true;
}

/**
 * Build an object key under one of the shared roots.
 * `root` may be "cablab/jobs" (nested under a root) — the first segment must
 * be a known root so neither app can write outside its lane by accident.
 */
function cloudKey(root, ...rel) {
  const key = joinKey(root, ...rel);
  if (!isSafeRelKey(key)) throw new Error(`unsafe cloud key: ${root}/${rel.join("/")}`);
  const first = key.split("/")[0];
  if (!ROOTS.includes(first)) throw new Error(`cloud key must start with ${ROOTS.join("|")}: ${key}`);
  return key;
}

module.exports = { ROOTS, joinKey, isSafeRelKey, cloudKey };

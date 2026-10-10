// Cloud storage configuration. One config shape shared with OmniCam
// (cabinetnc-cut/src/cloud/config.js) — keep the env names and the JSON file
// keys identical across both repos.
//
// Sources, lowest precedence first:
//   1. JSON file at CAB_CLOUD_CONFIG (optional local file, never committed)
//   2. environment variables
//
// Env / JSON keys:
//   CAB_CLOUD_ENABLED      "1" | "true" turns cloud sync on (default off)
//   CAB_CLOUD_PROVIDER     "gcp" (default) | "local" (mirror into a local dir)
//   CAB_CLOUD_ROOT         object-key root for this app (default "cablab")
//   CAB_GCP_PROJECT_ID     GCP project id
//   CAB_GCP_BUCKET         bucket name (e.g. cab-platform-dev-315764)
//   CAB_GCP_REGION         asia-southeast1 (informational; GCS is global-API)
//   CAB_GCP_CREDENTIALS    service-account key JSON path (else ADC / gcloud)
//   CAB_GCP_ACCESS_TOKEN   explicit bearer token (short-lived; dev/tests)
//   CAB_CLOUD_LOCAL_ROOT   root dir for the "local" provider
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return {};
  }
}

function pick(env, file, envName, fileKey) {
  const v = env[envName];
  if (v !== undefined && v !== "") return v;
  return file[fileKey];
}

function loadCloudConfig(env = process.env) {
  const file = env.CAB_CLOUD_CONFIG ? readJsonFile(env.CAB_CLOUD_CONFIG) : {};
  const enabled = TRUE_VALUES.has(String(pick(env, file, "CAB_CLOUD_ENABLED", "enabled") || "").toLowerCase());
  const provider = String(pick(env, file, "CAB_CLOUD_PROVIDER", "provider") || "gcp").toLowerCase();
  return {
    enabled,
    provider,
    root: String(pick(env, file, "CAB_CLOUD_ROOT", "root") || "cablab").replace(/^\/+|\/+$/g, ""),
    gcp: {
      projectId: pick(env, file, "CAB_GCP_PROJECT_ID", "gcpProjectId") || null,
      bucket: pick(env, file, "CAB_GCP_BUCKET", "gcpBucket") || null,
      region: pick(env, file, "CAB_GCP_REGION", "gcpRegion") || "asia-southeast1",
      credentialsFile: pick(env, file, "CAB_GCP_CREDENTIALS", "gcpCredentialsFile") || env.GOOGLE_APPLICATION_CREDENTIALS || null,
      accessToken: pick(env, file, "CAB_GCP_ACCESS_TOKEN", "gcpAccessToken") || null,
    },
    localRoot: pick(env, file, "CAB_CLOUD_LOCAL_ROOT", "localRoot")
      || path.join(os.tmpdir(), "cab-cloud-local"),
  };
}

module.exports = { loadCloudConfig };

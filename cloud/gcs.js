// Minimal Google Cloud Storage JSON-API client. Zero dependencies — the repo
// hand-rolls its other codecs (cnjobZip.js) the same way; the GCP surface we
// need is five REST calls and an OAuth2 bearer token.
//
// Token resolution order (first hit wins):
//   1. cfg.gcp.accessToken             explicit bearer (dev / tests)
//   2. cfg.gcp.credentialsFile         service-account JSON → signed JWT grant
//   3. gcloud application-default creds file (~ authorized_user refresh grant)
//   4. `gcloud auth … print-access-token` subprocess (application-default, then
//      the plain login token — the latter works after `gcloud auth login`)
// Dev machines normally land on (4) after `gcloud auth login`; a later phase
// should issue a service account per worker instead.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const API = "https://storage.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

let tokenCache = { token: null, expiresAt: 0 };

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serviceAccountToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || TOKEN_URI, iat: now, exp: now + 3600 })
  )}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(jwt), sa.private_key);
  return tokenRequest({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${jwt}.${b64url(signature)}`,
  }, sa.token_uri || TOKEN_URI);
}

async function tokenRequest(form, uri = TOKEN_URI) {
  const res = await fetch(uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`oauth token failed ${res.status}: ${data.error_description || data.error || res.statusText}`);
  }
  return { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
}

function adcFile() {
  const base = process.env.APPDATA
    ? path.join(process.env.APPDATA, "gcloud")
    : path.join(os.homedir(), ".config", "gcloud");
  const file = path.join(base, "application_default_credentials.json");
  return fs.existsSync(file) ? file : null;
}

function gcloudToken(...extraArgs) {
  // shell: gcloud is gcloud.cmd on Windows — execFile won't resolve .cmd
  // without one. All args are fixed literals, never user input.
  const args = `auth ${[...extraArgs, "print-access-token"].join(" ")}`;
  const cmds = [`gcloud ${args}`];
  if (process.platform === "win32") {
    // winget install lands here and does not touch PATH
    const sdk = path.join(process.env.LOCALAPPDATA || "", "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd");
    if (fs.existsSync(sdk)) cmds.push(`"${sdk}" ${args}`);
  }
  for (const cmd of cmds) {
    try {
      const out = execFileSync(cmd, {
        encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"], shell: true,
      }).trim();
      if (out) return out;
    } catch (_) { /* next candidate */ }
  }
  return null;
}

async function resolveAccessToken(cfg, { refresh = false } = {}) {
  if (!refresh && tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  if (cfg.gcp.accessToken) return cfg.gcp.accessToken;

  let next;
  if (cfg.gcp.credentialsFile && fs.existsSync(cfg.gcp.credentialsFile)) {
    const sa = JSON.parse(fs.readFileSync(cfg.gcp.credentialsFile, "utf8"));
    next = await serviceAccountToken(sa);
  } else {
    const adc = adcFile();
    let done = false;
    if (adc) {
      const creds = JSON.parse(fs.readFileSync(adc, "utf8"));
      if (creds.type === "authorized_user" && creds.refresh_token) {
        next = await tokenRequest({
          grant_type: "refresh_token",
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
        });
        done = true;
      } else if (creds.type === "service_account") {
        next = await serviceAccountToken(creds);
        done = true;
      }
    }
    if (!done) {
      const out = gcloudToken("application-default") || gcloudToken();
      if (!out) {
        throw new Error("no GCP credentials — set CAB_GCP_CREDENTIALS / CAB_GCP_ACCESS_TOKEN, or run: gcloud auth login");
      }
      next = { token: out, expiresAt: Date.now() + 2400_000 };
    }
  }
  tokenCache = next;
  return next.token;
}

/** One REST call against storage.googleapis.com with a bearer token. */
async function gcsRequest(cfg, { method = "GET", url, headers = {}, body, raw = false }) {
  const token = await resolveAccessToken(cfg);
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  if (res.status === 401 && !cfg.gcp.accessToken) {
    await resolveAccessToken(cfg, { refresh: true });
    return gcsRequest(cfg, { method, url, headers, body, raw });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`gcs ${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json().catch(() => ({}));
}

const enc = (key) => encodeURIComponent(key);

module.exports = {
  API,
  enc,
  resolveAccessToken,
  gcsRequest,
  _resetTokenCache: () => { tokenCache = { token: null, expiresAt: 0 }; },
};

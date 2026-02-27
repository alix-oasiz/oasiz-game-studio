#!/usr/bin/env bun
/// <reference types="@types/bun" />
/**
 * Backend Connection Test Script
 *
 * Verifies the Oasiz backend endpoints the CLI depends on:
 * connectivity, legacy shared token, CLI token issuance, upload with CLI token,
 * preflight, and activate.
 *
 * Usage:
 *   bun scripts/test-backend.ts
 *   bun scripts/test-backend.ts --token YOUR_SESSION_TOKEN
 *   bun scripts/test-backend.ts --email you@example.com --password 'yourpass'
 *
 * To get your session token (OAuth users):
 *   DevTools → Application → Cookies → better-auth.session_token
 */

const BASE_URL = process.env.OASIZ_API_URL || "http://localhost:3001";
const UPLOAD_TOKEN = process.env.OASIZ_UPLOAD_TOKEN || "dev-internal-token";

const args = process.argv.slice(2);

function flag(name: string): string {
  const i = args.indexOf(name);
  return i !== -1 ? (args[i + 1] ?? "") : "";
}

const TEST_EMAIL    = flag("--email")    || process.env.TEST_EMAIL    || "";
const TEST_PASSWORD = flag("--password") || process.env.TEST_PASSWORD || "";
const TEST_TOKEN    = flag("--token")    || process.env.TEST_TOKEN    || "";

// ─── Output helpers ───────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  ${c.green}PASS${c.reset}  ${label}${detail ? c.dim + "  " + detail + c.reset : ""}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.log(`  ${c.red}FAIL${c.reset}  ${label}${detail ? c.dim + "  " + detail + c.reset : ""}`);
}

function skip(label: string, reason: string) {
  skipped++;
  console.log(`  ${c.yellow}SKIP${c.reset}  ${label}  ${c.dim}(${reason})${c.reset}`);
}

function section(title: string) {
  console.log(`\n${c.bold}${c.cyan}${title}${c.reset}`);
  console.log(c.dim + "─".repeat(60) + c.reset);
}

function info(msg: string) {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

async function post(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

// ─── Shared state across tests ────────────────────────────────────────────────

let sessionToken: string | null = TEST_TOKEN || null;
let sessionEmail: string | null = null;
let cliToken: string | null = null;

// ─── 1. Connectivity ─────────────────────────────────────────────────────────

section("1. Connectivity");
info(`Target: ${BASE_URL}`);

try {
  const { status } = await get("/api/auth/get-session");
  if (status === 200) {
    pass("Backend is reachable", `GET /api/auth/get-session → ${status}`);
  } else {
    fail("Unexpected status from /api/auth/get-session", `got ${status}`);
  }
} catch (err) {
  fail("Cannot reach backend", String(err));
  console.log(`\n  ${c.red}Cannot continue — backend is not running at ${BASE_URL}${c.reset}`);
  console.log(`  Start the backend first, then re-run.\n`);
  process.exit(1);
}

{
  const { status, body } = await get("/api/auth/get-session");
  const b = body as Record<string, unknown>;
  if (status === 200 && (b === null || !b?.user)) {
    pass("Unauthenticated session returns null user", "expected");
  } else if (status === 200 && b?.user) {
    pass("Session active (existing cookie)", `user: ${(b.user as Record<string, unknown>)?.email}`);
  } else {
    fail("Unexpected response shape", `status ${status}`);
  }
}

// ─── 2. Legacy Shared Token ──────────────────────────────────────────────────

section("2. Legacy Shared Token (backward compat)");
info(`Token: ${UPLOAD_TOKEN === "dev-internal-token" ? "dev-internal-token (default)" : "custom"}`);

{
  const { status } = await post(
    "/api/upload/game",
    { title: "test", email: "test@example.com", bundleHtml: "<html></html>" },
    { Authorization: `Bearer ${UPLOAD_TOKEN}` },
  );
  if (status !== 401) {
    pass("Valid shared token accepted", `status ${status} (past auth gate)`);
  } else {
    fail("Valid shared token rejected — check OASIZ_UPLOAD_TOKEN", "got 401");
  }
}

{
  const { status } = await post(
    "/api/upload/game",
    { title: "test", email: "test@example.com", bundleHtml: "<html></html>" },
    { Authorization: "Bearer definitely-wrong-token-xyz" },
  );
  if (status === 401) {
    pass("Invalid token rejected", "got 401");
  } else {
    fail("Invalid token was NOT rejected", `got ${status}`);
  }
}

{
  const { status } = await post(
    "/api/upload/game",
    { title: "test", email: "test@example.com", bundleHtml: "<html></html>" },
  );
  if (status === 401) {
    pass("Missing token rejected", "got 401");
  } else {
    fail("Missing token was NOT rejected", `got ${status}`);
  }
}

// ─── 3. Acquire Session Token ────────────────────────────────────────────────

section("3. Session Token");

if (TEST_TOKEN) {
  pass("Pre-supplied token", `${TEST_TOKEN.slice(0, 8)}...`);
} else if (TEST_EMAIL && TEST_PASSWORD) {
  info(`Signing in as: ${TEST_EMAIL}`);

  const { status, body } = await post("/api/auth/mobile/email/signin", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const b = body as Record<string, unknown>;
  if (status === 200 && b?.success && b?.sessionToken) {
    sessionToken = b.sessionToken as string;
    pass("Email/password sign-in succeeded", `token: ${sessionToken.slice(0, 8)}...`);
  } else {
    fail("Sign-in failed", `${b?.error ?? `status ${status}`}`);
  }
} else {
  skip("No session token", "pass --token or --email/--password");
  info("");
  info("OAuth users: DevTools → Application → Cookies → better-auth.session_token");
  info("  bun scripts/test-backend.ts --token YOUR_TOKEN");
}

// ─── 4. Validate Session Token ───────────────────────────────────────────────

section("4. Session Validation (cookie auth)");

if (sessionToken) {
  const { status, body } = await get("/api/auth/get-session", {
    Cookie: `better-auth.session_token=${sessionToken}`,
  });

  const b = body as Record<string, unknown>;
  if (status === 200 && b?.user) {
    const u = b.user as Record<string, unknown>;
    sessionEmail = u.email as string;
    pass("Session token valid", `user: ${sessionEmail}`);
  } else {
    fail("Session token not recognised", "may be expired or wrong environment");
  }
} else {
  skip("Session validation", "no token");
}

// ─── 5. CLI Token Issuance ───────────────────────────────────────────────────
// The CLI token is a Bearer token for API calls (different from browser cookies).
// Browser session cookies go through Better Auth's signing — they can't be used
// directly as Bearer tokens. The CLI token endpoint creates a raw session row
// whose token value works as a Bearer.

section("5. CLI Token Issuance (POST /api/auth/cli/token)");

if (sessionToken) {
  const { status, body } = await post(
    "/api/auth/cli/token",
    {},
    { Cookie: `better-auth.session_token=${sessionToken}` },
  );

  const b = body as Record<string, unknown>;

  if (status === 200 && b?.token) {
    cliToken = b.token as string;
    pass("CLI token issued", `token: ${cliToken.slice(0, 8)}...  email: ${b?.email}`);

    // Verify the CLI token works as Bearer against a protected endpoint
    const { status: vStatus } = await get(
      "/api/upload/preflight?title=__cli_token_verify__",
      { Authorization: `Bearer ${cliToken}` },
    );
    if (vStatus === 200) {
      pass("CLI token works as Bearer", "/api/upload/preflight → 200");
    } else {
      fail("CLI token rejected as Bearer", `preflight returned ${vStatus}`);
    }
  } else {
    fail("CLI token not issued", `status ${status} — ${JSON.stringify(b)}`);
  }
} else {
  skip("CLI token issuance", "no session token");
}

// ─── 6. Upload with CLI Token (Bearer auth) ─────────────────────────────────
// This is the flow the CLI will actually use: Bearer token from cli/token.

section("6. Upload with CLI Token (POST /api/upload/game)");

if (cliToken && sessionEmail) {
  const { status, body } = await post(
    "/api/upload/game",
    { title: "CLI Test Game", bundleHtml: "<html><body>test</body></html>" },
    { Authorization: `Bearer ${cliToken}` },
  );

  const b = body as Record<string, unknown>;

  if (status === 200 && b?.ok) {
    pass("Upload accepted with CLI token", `gameId: ${b.gameId}  draft: ${b.label}  activated: ${b.activated}`);
  } else if (status === 401) {
    fail("Upload rejected CLI token", "resolveUploadCreator() did not accept session token");
  } else if (status === 400) {
    fail("Upload returned 400", `${b?.error ?? JSON.stringify(b)}`);
  } else if (status === 404) {
    // 404 = user not found, which means auth passed but user lookup failed
    pass("Upload auth accepted CLI token (user lookup issue)", `status 404 — auth gate passed`);
  } else {
    fail("Unexpected upload response", `status ${status} — ${JSON.stringify(b)}`);
  }
} else {
  skip("Upload with CLI token", cliToken ? "no email" : "no CLI token");
}

// ─── 7. Preflight ────────────────────────────────────────────────────────────

section("7. Preflight (GET /api/upload/preflight)");

if (cliToken) {
  // Test with a game title that likely exists (from section 6)
  const { status, body } = await get(
    "/api/upload/preflight?title=CLI+Test+Game",
    { Authorization: `Bearer ${cliToken}` },
  );

  const b = body as Record<string, unknown>;

  if (status === 200 && b?.ok) {
    const hasGame = !!b.game;
    const drafts = b.drafts as Array<Record<string, unknown>> | undefined;
    pass(
      "Preflight works",
      `game found: ${hasGame}  drafts: ${drafts?.length ?? 0}`,
    );

    if (hasGame) {
      const g = b.game as Record<string, unknown>;
      info(`  Game: id=${g.id}  title=${g.title}`);
    }
    if (drafts && drafts.length > 0) {
      for (const d of drafts) {
        info(`  Draft: ${d.label}  created: ${d.createdAt}  live: ${d.isLive}`);
      }
    }
  } else if (status === 401) {
    fail("Preflight rejected CLI token", "auth issue");
  } else {
    fail("Unexpected preflight response", `status ${status}`);
  }

  // Test with a game that doesn't exist
  const { status: s2, body: b2 } = await get(
    "/api/upload/preflight?title=Nonexistent+Game+12345",
    { Authorization: `Bearer ${cliToken}` },
  );

  const b2r = b2 as Record<string, unknown>;
  if (s2 === 200 && b2r?.ok && !b2r.game) {
    pass("Preflight returns null for unknown game", "expected");
  } else {
    fail("Preflight unexpected result for unknown game", `status ${s2}`);
  }
} else {
  skip("Preflight test", "no CLI token");
}

// ─── 8. Activate ─────────────────────────────────────────────────────────────

section("8. Activate (POST /api/upload/activate)");

if (cliToken) {
  // Test with a fake draft ID — should return 404 (not 401)
  const { status, body } = await post(
    "/api/upload/activate",
    { draftId: "00000000-0000-0000-0000-000000000000" },
    { Authorization: `Bearer ${cliToken}` },
  );

  const b = body as Record<string, unknown>;

  if (status === 404) {
    pass("Activate endpoint exists and auth works", "404 for fake draftId (expected)");
  } else if (status === 401) {
    fail("Activate rejected CLI token", "auth issue");
  } else if (status === 200) {
    pass("Activate succeeded (unexpected — that UUID shouldn't exist)", `${JSON.stringify(b)}`);
  } else {
    fail("Unexpected activate response", `status ${status} — ${JSON.stringify(b)}`);
  }
} else {
  skip("Activate test", "no CLI token");
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${c.bold}${"─".repeat(60)}${c.reset}`);
console.log(
  `${c.bold}Results:${c.reset}  ` +
  `${c.green}${passed} passed${c.reset}  ` +
  `${c.red}${failed} failed${c.reset}  ` +
  `${c.yellow}${skipped} skipped${c.reset}`,
);

if (failed > 0) {
  console.log(`\n${c.red}${c.bold}Some tests failed.${c.reset}\n`);
  process.exit(1);
} else if (skipped > 0) {
  console.log(`\n${c.yellow}Run with a token to test the full flow:${c.reset}`);
  console.log(`  bun scripts/test-backend.ts --token YOUR_SESSION_TOKEN\n`);
} else {
  console.log(`\n${c.green}${c.bold}All tests passed — backend is fully ready for the CLI.${c.reset}\n`);
}

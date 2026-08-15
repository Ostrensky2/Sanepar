import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const scrypt = promisify(scryptCallback);
const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY are required");
}

const parsedUrl = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("refusing to run outside an isolated local Supabase Auth instance");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomBytes(12).toString("hex");
const syntheticPassword = `Synthetic-${randomBytes(18).toString("base64url")}!9`;
const salt = randomBytes(16).toString("hex");
const derived = await scrypt(syntheticPassword, salt, 64);
const legacyHash = `scrypt$${salt}$${derived.toString("hex")}`;
const directEmail = `e6-direct-${suffix}@example.invalid`;
const progressiveEmail = `e6-progressive-${suffix}@example.invalid`;
const createdIds = [];

let directAccepted = false;
let directLoginAccepted = false;
let directRejectionStatus = null;
let progressiveCreateAccepted = false;
let progressiveLoginAccepted = false;

try {
  const direct = await admin.auth.admin.createUser({
    email: directEmail,
    password_hash: legacyHash,
    email_confirm: true,
  });
  directAccepted = !direct.error && Boolean(direct.data.user);
  directRejectionStatus = direct.error?.status ?? null;
  if (direct.data.user) {
    createdIds.push(direct.data.user.id);
    const login = await admin.auth.signInWithPassword({
      email: directEmail,
      password: syntheticPassword,
    });
    directLoginAccepted = !login.error && Boolean(login.data.session);
    if (login.data.session) await admin.auth.signOut({ scope: "local" });
  }

  const progressive = await admin.auth.admin.createUser({
    email: progressiveEmail,
    password: syntheticPassword,
    email_confirm: true,
  });
  progressiveCreateAccepted = !progressive.error && Boolean(progressive.data.user);
  if (progressive.data.user) {
    createdIds.push(progressive.data.user.id);
    const login = await admin.auth.signInWithPassword({
      email: progressiveEmail,
      password: syntheticPassword,
    });
    progressiveLoginAccepted = !login.error && Boolean(login.data.session);
    if (login.data.session) await admin.auth.signOut({ scope: "local" });
  }
} finally {
  for (const id of createdIds) {
    await admin.auth.admin.deleteUser(id, false);
  }
}

process.stdout.write(JSON.stringify({
  target: "isolated-local-gotrue",
  legacy_format: "scrypt$hex_salt$hex_derived_key",
  legacy_parameters: { N: 16384, r: 8, p: 1, key_length: 64, salt_bytes: 16 },
  direct_import: {
    accepted: directAccepted,
    login_accepted: directLoginAccepted,
    rejection_status: directRejectionStatus,
  },
  progressive_plaintext_handoff_after_local_verification: {
    create_accepted: progressiveCreateAccepted,
    login_accepted: progressiveLoginAccepted,
  },
  synthetic_users_remaining: 0,
}));

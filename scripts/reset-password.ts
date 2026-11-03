#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  closeDatabase,
  getDb,
  initDatabase,
} from "../packages/backend/src/database/connection";
import { hashPassword } from "../packages/backend/src/utils/password";

const username = process.argv[2];
if (!username) {
  console.error("Usage: bun run scripts/reset-password.ts <username>");
  process.exit(1);
}

const dbPath = resolve(process.env.DATABASE_PATH || "data/invoice.db");
if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  console.error("Set DATABASE_PATH to the database file used by your local app.");
  process.exit(1);
}
process.env.DATABASE_PATH = dbPath;

initDatabase();
try {
  const db = getDb();
  const user = db
    .query("SELECT id, is_admin, is_active, role FROM users WHERE username = ?")
    .get(username) as {
    id: string;
    is_admin: number;
    is_active: number;
    role: string | null;
  } | null;

  if (!user) {
    throw new Error(`User "${username}" was not found in ${dbPath}`);
  }
  if (!user.is_active) {
    throw new Error(`User "${username}" is inactive. Password reset alone will not enable login.`);
  }
  if (user.is_admin !== 1 && user.role !== "Owner" && user.role !== "Admin") {
    throw new Error(`User "${username}" is not an admin account; no password was changed.`);
  }

  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);
  db.run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [
    passwordHash,
    user.id,
  ]);
  console.log(
    `Password reset for ${username}. Temporary password (shown once): ${temporaryPassword}`,
  );
  console.log("Log in with it now, then change it to a password you control.");
} finally {
  closeDatabase();
}

/**
 * Runs a command with a throwaway in-memory MongoDB so
 * `tests/db.integration.test.ts` can exercise real queries.
 *
 *   npm run test:db
 *
 * The database is discarded when the command exits, so nothing here can touch a
 * real cluster. `npm test` deliberately stays runnable without any database —
 * the integration suite reports itself as skipped instead.
 *
 * The mongod binary is downloaded on first run (~120 MB, cached afterwards).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const [, , ...command] = process.argv;

if (command.length === 0) {
  console.error("usage: node tools/with-test-db.mjs <command> [args...]");
  process.exit(2);
}

// MongoMemoryServer otherwise scatters its temp databases through os.tmpdir(),
// which leaks a directory per interrupted run and can fill a small tmpfs.
// Keep them in one directory that is removed no matter how this exits.
const root = mkdtempSync(join(process.env.MONGOMS_TMPDIR ?? tmpdir(), "ls-testdb-"));
const dbPath = join(root, "db");
mkdirSync(dbPath);

const server = await MongoMemoryServer.create({
  instance: { dbName: "lecturescribe", dbPath, storageEngine: "wiredTiger" },
});
const uri = server.getUri();
// `MONGODB_DB` is read at import time by src/lib/db.ts, so the test suite and
// the app module must agree on the database name or the tests seed a different
// database than the one the helpers query.
const dbName = `lecturescribe_test_${Date.now()}`;

let code = 1;
try {
  const child = spawn(command[0], command.slice(1), {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName },
  });

  code = await new Promise((resolve) => {
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
    child.on("error", () => resolve(1));
  });
} finally {
  await server.stop().catch(() => {});
  rmSync(root, { recursive: true, force: true });
}

process.exit(code);
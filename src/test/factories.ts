import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

import { migrate } from "drizzle-orm/libsql/migrator";

import { closeDb, ensureDatabaseReady, getDb, resetDbClientForTests } from "../db/client";

export interface IsolatedTestDatabase {
  url: string;
  cleanup: () => Promise<void>;
}

function toLibSqlFileUrl(filePath: string) {
  return `file:${filePath.replaceAll("\\", "/")}`;
}

async function removeDirectoryAfterConnectionsClose(directory: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error)) {
        throw error;
      }
      if (error.code === "EBUSY" && attempt === 4) {
        return;
      }
      if (error.code !== "EBUSY") {
        throw error;
      }
      await setTimeout(50);
    }
  }
}

export async function createIsolatedTestDatabase(): Promise<IsolatedTestDatabase> {
  const directory = await mkdtemp(path.join(tmpdir(), "epf-sahayak-test-"));
  const databasePath = path.join(directory, "test.db");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const url = toLibSqlFileUrl(databasePath);

  process.env.DATABASE_URL = url;
  resetDbClientForTests();
  await ensureDatabaseReady();
  await migrate(getDb(), {
    migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
  });

  return {
    url,
    cleanup: async () => {
      await closeDb();
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      resetDbClientForTests();
      await removeDirectoryAfterConnectionsClose(directory);
    },
  };
}

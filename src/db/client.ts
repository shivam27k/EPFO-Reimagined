import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./schema";

type Database = LibSQLDatabase<typeof schema>;

interface CachedDatabase {
  url: string;
  client: Client;
  db: Database;
  ready: Promise<void>;
}

let cachedDatabase: CachedDatabase | undefined;

function defaultDatabaseUrl() {
  return "file:./.data/epf-sahayak.db";
}

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() || defaultDatabaseUrl();
}

export function getClient() {
  const url = databaseUrl();

  if (cachedDatabase?.url === url) {
    return cachedDatabase.client;
  }

  cachedDatabase?.client.close();

  const client = createClient({ url });
  cachedDatabase = {
    url,
    client,
    db: drizzle(client, { schema }),
    ready: client.execute("PRAGMA foreign_keys = ON").then(() => undefined),
  };

  return client;
}

export function getDb() {
  getClient();
  return cachedDatabase?.db as Database;
}

export async function ensureDatabaseReady() {
  getClient();
  await cachedDatabase?.ready;
}

export async function closeDb() {
  if (!cachedDatabase) {
    return;
  }

  await cachedDatabase.ready;
  cachedDatabase.client.close();
  cachedDatabase = undefined;
}

export function resetDbClientForTests() {
  cachedDatabase?.client.close();
  cachedDatabase = undefined;
}

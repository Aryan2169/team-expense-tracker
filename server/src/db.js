import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_FILE ?? path.join(__dirname, '..', 'data.db');

export const db = new Database(DB_PATH);

// Off by default in SQLite. Without this the ON DELETE RESTRICT in the schema
// is decorative and orphaned expenses become possible.
db.pragma('foreign_keys = ON');
// Readers don't block the writer; matters as soon as the UI polls while saving.
db.pragma('journal_mode = WAL');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

export const dbPath = DB_PATH;

// src/db.ts
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";

fs.mkdirSync("./cache", { recursive: true });

const db = new DatabaseSync("./cache/second-brain.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        vector TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        vector TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
`);
console.log("DB ready")
export default db;
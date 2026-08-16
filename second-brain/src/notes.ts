import db from "./db.js";
import { embedText } from "./embed.js";
import { cosineSimilarity } from "./math.js";

type Note = { id: number; text: string; vector: number[]; created_at: string };
type NoteRow = { id: number; text: string; vector: string; created_at: string };

function rowToNote(row: NoteRow): Note {
    return { ...row, vector: JSON.parse(row.vector) };
}

export async function saveNote(text: string): Promise<string> {
    const existing = db
        .prepare("SELECT id FROM notes WHERE LOWER(TRIM(text)) = LOWER(TRIM(?))")
        .get(text);

    if (existing) {
        return `Already saved: "${text}" — not adding a duplicate.`;
    }

    const vector = await embedText(text);
    const createdAt = new Date().toISOString();

    const result = db
        .prepare("INSERT INTO notes (text, vector, created_at) VALUES (?, ?, ?)")
        .run(text, JSON.stringify(vector), createdAt);

    return `Saved note #${result.lastInsertRowid}: "${text}"`;
}

export function listNotes(): string {
    const rows = db.prepare("SELECT * FROM notes ORDER BY id").all() as NoteRow[];
    if (rows.length === 0) return "No notes saved yet.";

    return rows.map(r => `#${r.id}: ${r.text} (saved ${r.created_at})`).join("\n");
}

export async function searchNotes(query: string, topK = 3): Promise<string> {
    const rows = db.prepare("SELECT * FROM notes").all() as NoteRow[];
    if (rows.length === 0) return "No notes saved yet.";

    const notes = rows.map(rowToNote);
    const queryVector = await embedText(query);

    const scored = notes.map(n => ({ note: n, score: cosineSimilarity(queryVector, n.vector) }));
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, topK).filter(s => s.score >= 0.3);
    if (top.length === 0) return "No relevant notes found.";

    return top.map(s => `#${s.note.id}: ${s.note.text} (score: ${s.score.toFixed(2)})`).join("\n");
}

export function deleteNote(id: number): string {
    const result = db.prepare("DELETE FROM notes WHERE id = ?").run(id);

    if (result.changes === 0) {
        return `No note found with id #${id}.`;
    }
    return `Deleted note #${id}.`;
}

export function countNotes(): number {
    const row = db.prepare("SELECT COUNT(*) as count FROM notes").get() as { count: number };
    return row.count;
}
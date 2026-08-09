import * as fs from "fs";
import {embedText} from "./embed.js"
import { cosineSimilarity } from "./math.js";

type Note = { id: number; text: string; vector:number[]; createdAt: string };

const NOTES_PATH = "./cache/notes.json";

function loadNotes(): Note[] {
    if (!fs.existsSync(NOTES_PATH)) return [];
    return JSON.parse(fs.readFileSync(NOTES_PATH, "utf-8"));
}

function persistNotes(notes: Note[]) {
    fs.mkdirSync("./cache", { recursive: true });
    fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

export async function saveNote(text: string): Promise<string> {
    const notes = loadNotes();

    const isDuplicate = notes.some(
        n => n.text.trim().toLowerCase() === text.trim().toLowerCase()
    );
    if (isDuplicate) {
        return `Already saved: "${text}" — not adding a duplicate.`;
    }

    const vector = await embedText(text);

    const newNote: Note = {
        id: notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1,
        text,
        vector,
        createdAt: new Date().toISOString()
    };
    notes.push(newNote);
    persistNotes(notes);
    return `Saved note #${newNote.id}: "${text}"`;
}

export function listNotes(): string {
    const notes = loadNotes();
    if (notes.length === 0) return "No notes saved yet.";
    return notes.map(n => `#${n.id}: ${n.text} (saved ${n.createdAt})`).join("\n");
}


export async function searchNotes(query: string, topK = 3): Promise<string> {
    const notes = loadNotes();
    if (notes.length === 0) return "No notes saved yet.";

    const queryVector = await embedText(query);
    const scored = notes.map(n => ({ note: n, score: cosineSimilarity(queryVector, n.vector) }));
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, topK).filter(s => s.score >= 0.3); // reuse the same relevance-gate idea
    if (top.length === 0) return "No relevant notes found.";

    return top.map(s => `#${s.note.id}: ${s.note.text} (score: ${s.score.toFixed(2)})`).join("\n");
}


export function deleteNote(id: number): string {
    const notes = loadNotes();
    const noteExists = notes.some(n => n.id === id);

    if (!noteExists) {
        return `No note found with id #${id}.`;
    }

    const updatedNotes = notes.filter(n => n.id !== id);
    persistNotes(updatedNotes);
    return `Deleted note #${id}.`;
}
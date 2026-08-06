import * as fs from "fs";

type Note = { id: number; text: string; createdAt: string };

const NOTES_PATH = "./cache/notes.json";

function loadNotes(): Note[] {
    if (!fs.existsSync(NOTES_PATH)) return [];
    return JSON.parse(fs.readFileSync(NOTES_PATH, "utf-8"));
}

function persistNotes(notes: Note[]) {
    fs.mkdirSync("./cache", { recursive: true });
    fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

export function saveNote(text: string): string {
    const notes = loadNotes();
    const newNote: Note = {
        id: notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1,
        text,
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
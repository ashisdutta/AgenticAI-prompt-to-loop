import { saveNote, listNotes } from "./notes.js";


export const toolDefinitions = [
    {
        type: "function",
        function: {
        name: "saveNote",
        description: "Save a note or fact the user wants remembered for later. Use this when the user says something like 'remember that...' or shares info to be saved.",
        parameters: {
            type: "object",
            properties: {
            text: { type: "string", description: "The note content to save" }
            },
            required: ["text"]
        }
        }
    },
    {
        type: "function",
        function: {
        name: "listNotes",
        description: "List all previously saved notes. Use this when the user asks what's been saved or remembered.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
        }
    }
];


export function executeTool(name: string, args: any): string {
    switch (name) {
        case "saveNote":
        return saveNote(args.text);
        case "listNotes":
        return listNotes();
        default:
        return `Unknown tool: ${name}`;
    }
}
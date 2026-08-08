import { saveNote, listNotes, searchNotes } from "./notes.js";


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
    },
    {
    type: "function",
    function: {
        name: "searchNotes",
        description: "Search saved notes for ones relevant to a specific question — use this to look up a specific saved fact, instead of listNotes.",
        parameters: {
            type: "object",
            properties: { query: { type: "string", description: "What to search for" } },
            required: ["query"]
        }
        }
    }
];

const requiredArgs: Record<string, string[]> = {
    saveNote: ["text"],
    listNotes: [],
    searchNotes: ["query"]
};

function validateArgs(name: string, args: any): string | null {
    const required = requiredArgs[name];
    if (required === undefined) return `Unknown tool: ${name}`;

    for (const field of required) { //here field may be =>"text", "query"
        if (!(field in args) || typeof args[field] !== "string" || args[field].trim() === "") {
        return `Missing or invalid required field "${field}" for tool "${name}"`;
        }
    }
    return null;
}


export async function executeTool(name: string, rawArgs: string): Promise<string> {
    let args: any;

    try {
        args = JSON.parse(rawArgs);
    } catch {
        return `Error: could not parse arguments for "${name}" — invalid JSON. Please retry with valid arguments.`;
    }

    const validationError = validateArgs(name, args);
    if (validationError) {
        return `Error: ${validationError}. Please retry with the correct arguments.`;
    }


    switch (name) {
        case "saveNote":
        return await saveNote(args.text);
        case "listNotes":
        return listNotes();
        case "searchNotes":
        return await searchNotes(args.text);
        default:
        return `Unknown tool: ${name}`;
    }
}
import { saveNote, listNotes, searchNotes, deleteNote } from "./notes.js";


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
    },
    {
    type: "function",
    function: {
        name: "getCurrentDateTime",
        description: "Get the current date and time. Use this whenever the user references relative dates like 'today', 'tomorrow', 'next week', or asks what time/date it is.",
        parameters: { type: "object", properties: {}, required: [] }
    }
    },
    {
    type: "function",
    function: {
        name: "deleteNote",
        description: "Delete a previously saved note by its id number. Use this when the user asks to forget, remove, or delete something specific they had saved. If you don't know the id, call listNotes or searchNotes first to find it.",
        parameters: {
        type: "object",
        properties: { id: { type: "number", description: "The id of the note to delete" } },
        required: ["id"]
        }
    }
}
];

const requiredArgs: Record<string, string[]> = {
    saveNote: ["text"],
    listNotes: [],
    searchNotes: ["query"],
    getCurrentDateTime: [],
    deleteNote: ["id"]
};

function validateArgs(name: string, args: any): string | null {
    const required = requiredArgs[name];
    if (required === undefined) return `Unknown tool: ${name}`;

    for (const field of required) {
        if (!(field in args)) {
        return `Missing required field "${field}" for tool "${name}"`;
        }
        const value = args[field];
        const isEmptyString = typeof value === "string" && value.trim() === "";
        const isInvalidNumber = typeof value === "number" && isNaN(value);
        if (isEmptyString || isInvalidNumber) {
        return `Invalid value for field "${field}" in tool "${name}"`;
        }
    }
    return null;
}

function getCurrentDateTime(): string {
    return new Date().toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
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
        return await searchNotes(args.query);
        case "getCurrentDateTime":
        return getCurrentDateTime();
        case "deleteNote":
        return deleteNote(Number(args.id));
        default:
        return `Unknown tool: ${name}`;
    }
}
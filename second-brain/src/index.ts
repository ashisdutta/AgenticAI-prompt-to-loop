import * as fs from "fs";
import "dotenv/config";
import * as readline from "node:readline";
import { encode } from "gpt-tokenizer";
import { extractText, chunkText, type Chunk } from "./ingest-chunk.js";
import { embedText, embedChunks, search,getCachedChunks, saveChunks, type EmbeddedChunk } from "./embed.js";
import { toolDefinitions, executeTool } from "./tools.js";

const {GROQ_API_KEY, GROQ_URL, MODEL } = process.env;
const MAX_TOKENS = 4096;
const PDF_PATH = "./notes/ashis_dutta_resume.pdf";
const SIMILARITY_THRESHOLD = 0.25; 

type Message = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
};

type AssistantMessage = {
    role: "assistant";
    content: string | null; 
    tool_calls?: {
        id: string;
        function: { name: string; arguments: string };
    }[];
};

// This array is short-term memory — stays lean, no retrieved context stored permanently
const messages: Message[] = [
    {
        role: "system",
        content: `You are my second brain. You have three sources of information:
        (1) our ongoing conversation, which you should always trust and refer back to freely,
        (2) retrieved notes from the resume, provided only on some turns when relevant, and
        (3) saved notes from earlier conversations, which you must actively check using the searchNotes tool whenever the user asks about something you don't already see in the conversation or retrieved resume context.
        Before saying you don't have information about something, ALWAYS try calling searchNotes first — don't assume something isn't saved just because it's not already in front of you.
        Only call saveNote when the user is giving you NEW information to remember. Never call saveNote to re-confirm or re-save something already saved earlier in the conversation.`
    }
];

async function callGroq(msgs: Message[]): Promise<AssistantMessage> {
    const res = await fetch(GROQ_URL as string, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({ model: MODEL, messages: msgs, tools: toolDefinitions, tool_choice: "auto" })
    });

    if (!res.ok) {
        throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.choices[0].message;
}

//added if in any reason it fails it should wake up again with same args. I don't have to rewrite again
async function callGroqWithRetry(msgs: Message[], maxRetries = 2): Promise<AssistantMessage> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
        return await callGroq(msgs);
        } catch (err) {
        lastError = err as Error;
        const isRateLimit = lastError.message.includes("429");

        if (attempt < maxRetries) {
            const waitMs = isRateLimit ? 8000 : 1000 * Math.pow(2, attempt); // rate limits need longer waits
            //console.log(`⚠️  Attempt ${attempt + 1} failed (${isRateLimit ? "rate limit" : "error"}) — retrying in ${waitMs / 1000}s...`);
            console.log(`⚠️  Attempt ${attempt + 1} failed: ${lastError.message} — retrying in ${waitMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        }
    }

    throw lastError; // all retries exhausted, let the outer try/catch in ask() handle it
}

function countTokens(msg: Message[]): number {
    const fullText = msg.map(m => m.content??"").join(" ");
    return encode(fullText).length;
}

function trimOldest() {
    while (countTokens(messages) > MAX_TOKENS && messages.length > 3) {
        messages.splice(1, 2);
        console.log("Trimmed oldest message pair to stay under budget.");
    }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Grab the last user+assistant exchange, if it exists, to pass it to user input for better context.
function buildSearchQuery(input: string, messages: Message[]): string {
    const recentExcludingSystem = messages
        .filter(m => m.role !== "system")
        .slice(-4)
        .map(m => m.content ?? "")
        .join(" ");
    return `${recentExcludingSystem} ${input}`.trim();
}


//call model → check if it wants a tool → run tool → feed result back → repeat
function ask(embeddedChunks: EmbeddedChunk[]) {
    rl.question("\nYou: ", async (input) => {
        if (input === "exit") { rl.close(); return; }

        const queryVector = await embedText(buildSearchQuery(input, messages));
        const scored = search(embeddedChunks, queryVector, 3);
        const topScore = scored[0]?.score ?? 0;

        let userContent = input;

        if (topScore >= SIMILARITY_THRESHOLD) {
        const context = scored.map(s => s.chunk.text).join("\n---\n");
        userContent = `Context from my notes:\n${context}\n\nQuestion: ${input}`;
        console.log(`[retrieved context — top score: ${topScore.toFixed(2)}]`);
        } else {
        console.log(`[no relevant match — top score: ${topScore.toFixed(2)}]`);
        }

        const apiMessages: Message[] = [ // here for my confusion, userContent contains both input and retrived chunk from the db is score is correct.
        ...messages,
        { role: "user", content: userContent }
        ];

        const currentTokens = countTokens(apiMessages);
        console.log(`[context: ${currentTokens}/${MAX_TOKENS} tokens]`);
        if (currentTokens > MAX_TOKENS) {
        trimOldest();
        }


        try {
        let assistantMessage = await callGroqWithRetry(apiMessages);

        const MAX_TOOL_ITERATIONS = 3;
        let iterations = 0;

        while (assistantMessage.tool_calls) {
            iterations++;
            if (iterations > MAX_TOOL_ITERATIONS) {
                console.log("⚠️  Max tool iterations reached — stopping to avoid a runaway loop.");
                break;
            }

            apiMessages.push(assistantMessage);
            for (const call of assistantMessage.tool_calls) {
                console.log(`[tool call: ${call.function.name}(${call.function.arguments})]`);
                const result = await executeTool(call.function.name, call.function.arguments); // raw string now, no JSON.parse here
                apiMessages.push({ role: "tool", tool_call_id: call.id, content: result });
            }
            assistantMessage = await callGroqWithRetry(apiMessages);
        }

        const reply = assistantMessage.content ?? "I hit a loop trying to complete that — could you try rephrasing?";
        console.log(`\nBrain: ${reply}`);

        messages.push({ role: "user", content: input });
        messages.push({ role: "assistant", content: reply });

        } catch (err) {
        console.error(`⚠️  Error: ${(err as Error).message}`);
        console.log("\nBrain: Sorry, I ran into an issue with that request. Could you rephrase or try again?");
        }

        ask(embeddedChunks);
    });
}

async function main() {
    let embedded: EmbeddedChunk[];

    const cached = getCachedChunks(PDF_PATH);

    if (cached.length > 0) {
        console.log("Found cached embeddings in database...");
        embedded = cached;
    } else {
        console.log("No cache found —- extracting and embedding PDF...");
        const text = await extractText(PDF_PATH);
        const chunks = chunkText(text, PDF_PATH);
        console.log(`Created ${chunks.length} chunks`);
        embedded = await embedChunks(chunks);
        console.log(`Ready -> ${embedded.length} chunks indexed and embedded.\n`);

        saveChunks(embedded);
        console.log("Saved embeddings to database.");
    }

    console.log("Second Brain (RAG-enabled) — type 'exit' to quit.\n");
    ask(embedded);
}

main();
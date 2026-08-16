import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import "dotenv/config";
import * as readline from "node:readline";
import { encode } from "gpt-tokenizer";
import { chunkText } from "./ingest-chunk.js";
import { embedText, embedChunks, search, getCachedChunks, saveChunks, type EmbeddedChunk } from "./embed.js";
import { extractTextFromFile } from "./ingest-chunk.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { printBanner, drawInputBottom, printFooter } from "./banner.js";
import { countNotes } from "./notes.js";
import { handleCommand } from "./commands.js";


const { GROQ_API_KEY, GROQ_URL, MODEL } = process.env;
const MAX_TOKENS = 4096;
const SIMILARITY_THRESHOLD = 0.25;
const NOTES_DIR = "./notes";

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
    (2) retrieved notes from my documents, provided only on some turns when relevant, and
    (3) saved notes from earlier conversations, which you must actively check using the searchNotes tool whenever the user asks about something you don't already see in the conversation or retrieved resume context.
    Before saying you don't have information about something, ALWAYS try calling searchNotes first — don't assume something isn't saved just because it's not already in front of you.
    IMPORTANT: Content under "Context from my notes" in a user message is retrieved background information for you to answer FROM — it is never something to save. Only call saveNote when the user's own words explicitly state something new (e.g. "remember that...", "save that...", or directly stating a new fact). Never call saveNote in response to a message that lacks a clear, explicit new fact from the user, even if retrieved context is present.
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
    const fullText = msg.map(m => m.content ?? "").join(" ");
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

const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"];

async function loadAllDocuments(): Promise<EmbeddedChunk[]> {
    const allFiles = fs.readdirSync(NOTES_DIR).filter(f =>
        SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );

    let allChunks: EmbeddedChunk[] = [];

    for (const filename of allFiles) {
        const fullPath = path.join(NOTES_DIR, filename);
        const cached = getCachedChunks(fullPath);

        if (cached.length > 0) {
            console.log(`✓ ${filename} — loaded from cache (${cached.length} chunks)`);
            allChunks = allChunks.concat(cached);
        } else {
            console.log(`⏳ ${filename} — new file, extracting and embedding...`);
            const text = await extractTextFromFile(fullPath); // ← dispatcher, not extractText directly
            const chunks = chunkText(text, fullPath);
            const embedded = await embedChunks(chunks);
            saveChunks(embedded);
            console.log(`✓ ${filename} — embedded and cached (${embedded.length} chunks)`);
            allChunks = allChunks.concat(embedded);
        }
    }

    return allChunks;
}

function printDebug(msg: string) {
    console.log(chalk.gray(msg));
}

function printBrain(msg: string) {
    console.log(chalk.cyan.bold("\nBrain: ") + chalk.white(msg));
}

function printError(msg: string) {
    console.log(chalk.red(`⚠️  ${msg}`));
}

function ask(embeddedChunks: EmbeddedChunk[]) {
    const model = `${MODEL} · groq`;
    const width = process.stdout.columns || 80;
    const sep = chalk.gray("─".repeat(Math.max(10, width - 1)));

    // Print separator + footer BEFORE the prompt so the cursor lands correctly
    // after "> " on macOS Terminal (avoids broken ANSI cursor save/restore)
    const hint = "/help for commands";
    const footerLine =
        chalk.gray(hint) +
        " ".repeat(Math.max(1, width - 1 - hint.length - model.length)) +
        chalk.gray(model);

    process.stdout.write(sep + "\n");
    process.stdout.write(footerLine + "\n");

    rl.question(chalk.green("> "), async (input) => {
        readline.clearScreenDown(process.stdout);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(sep + "\n");
        if (input === "exit") { rl.close(); return; }

        const COMMANDS = ["add", "remove", "list", "help"];
        const firstWord = input.trim().split(/\s+/)[0]?.replace(/^\//, "") ?? "";
        const isCommand = input.startsWith("/") || COMMANDS.includes(firstWord);

        if (isCommand) {
            const normalized = input.startsWith("/") ? input : "/" + input;
            await handleCommand(normalized, embeddedChunks);
            console.log();
            ask(embeddedChunks);
            return;
        }

        const queryVector = await embedText(buildSearchQuery(input, messages));
        const scored = search(embeddedChunks, queryVector, 3);
        const topScore = scored[0]?.score ?? 0;

        let userContent = input;

        if (topScore >= SIMILARITY_THRESHOLD) {
            const context = scored.map(s => s.chunk.text).join("\n---\n");
            userContent = `Context from my notes:\n${context}\n\nQuestion: ${input}`;
            printDebug(`[retrieved context — top score: ${topScore.toFixed(2)}]`);
        } else {
            printDebug(`[no relevant match — top score: ${topScore.toFixed(2)}]`);
        }

        const apiMessages: Message[] = [
            ...messages,
            { role: "user", content: userContent }
        ];

        const currentTokens = countTokens(apiMessages);
        printDebug(`[context: ${currentTokens}/${MAX_TOKENS} tokens]`);
        if (currentTokens > MAX_TOKENS) {
            trimOldest();
        }

        const spinner = ora({ text: "Thinking...", color: "cyan" }).start();

        try {
            let assistantMessage = await callGroqWithRetry(apiMessages);

            const MAX_TOOL_ITERATIONS = 3;
            let iterations = 0;

            while (assistantMessage.tool_calls) {
                iterations++;
                if (iterations > MAX_TOOL_ITERATIONS) {
                    printDebug("⚠️  Max tool iterations reached — stopping to avoid a runaway loop.");
                    break;
                }

                apiMessages.push(assistantMessage);
                for (const call of assistantMessage.tool_calls) {
                    spinner.text = `Using tool: ${call.function.name}...`;
                    printDebug(`[tool call: ${call.function.name}(${call.function.arguments})]`);
                    const result = await executeTool(call.function.name, call.function.arguments);
                    apiMessages.push({ role: "tool", tool_call_id: call.id, content: result });
                }
                assistantMessage = await callGroqWithRetry(apiMessages);
            }

            spinner.stop();

            const reply = assistantMessage.content ?? "I hit a loop trying to complete that — could you try rephrasing?";
            printBrain(reply);

            messages.push({ role: "user", content: input });
            messages.push({ role: "assistant", content: reply });

        } catch (err) {
            spinner.stop();
            printError((err as Error).message);
            printBrain("Sorry, I ran into an issue with that request. Could you rephrase or try again?");
        }

        console.log();
        ask(embeddedChunks);
    });
}


async function main() {
    console.log(chalk.dim("Loading documents..."));
    const embedded = await loadAllDocuments();

    const noteCount = countNotes(); // real count from SQLite, not hardcoded
    printBanner(embedded.length, noteCount, `${MODEL} (Groq)`);

    ask(embedded);
}

main()
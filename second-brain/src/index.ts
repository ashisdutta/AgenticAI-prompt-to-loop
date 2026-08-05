import * as fs from "fs";
import "dotenv/config";
import * as readline from "node:readline";
import { encode } from "gpt-tokenizer";
import { extractText, chunkText, type Chunk } from "./ingest-chunk.js";
import { embedText, embedChunks, search, type EmbeddedChunk } from "./embed.js";

const {GROQ_API_KEY, GROQ_URL, MODEL } = process.env;
const MAX_TOKENS = 4096;
const PDF_PATH = "./notes/ashis_dutta_resume.pdf";
const CACHE_PATH = "./cache/embedded.json";
const SIMILARITY_THRESHOLD = 0.35; 

type Message = { role: "system" | "user" | "assistant"; content: string };

// This array is short-term memory — stays lean, no retrieved context stored permanently
const messages: Message[] = [
    {
        role: "system",
        content: `You are my second brain. You have two sources of information: 
        (1) our ongoing conversation, which you should always trust and refer back to freely, and 
        (2) retrieved notes, provided only on some turns when relevant to the current question. 
        If notes aren't provided for a turn, that does NOT mean you lack information — check the conversation history first before saying you don't know something.
        Only say you lack information if the question is genuinely new and nothing in the conversation or provided notes addresses it.`
    }
];

async function callGroq(msgs: Message[]): Promise<string> {
    const res = await fetch(GROQ_URL as string, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({ model: MODEL, messages: msgs })
    });

    if (!res.ok) {
        throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
    }

    function countTokens(msg: Message[]): number {
    const fullText = msg.map(m => m.content).join(" ");
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
    const recent = messages.slice(-2).map(m => m.content).join(" ");
    return `${recent} ${input}`.trim();
}

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

        const apiMessages: Message[] = [
        ...messages,
        { role: "user", content: userContent }
        ];

        const currentTokens = countTokens(apiMessages);
        console.log(`[context: ${currentTokens}/${MAX_TOKENS} tokens]`);
        if (currentTokens > MAX_TOKENS) {
        trimOldest();
        }

        const reply = await callGroq(apiMessages);
        console.log(`\nBrain: ${reply}`);

        messages.push({ role: "user", content: input });
        messages.push({ role: "assistant", content: reply });

        ask(embeddedChunks);
    });
}

async function main() {
    let embedded: EmbeddedChunk[];

    if (fs.existsSync(CACHE_PATH)) {
    console.log("Found cached embeddings —- loading from disk...");
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    embedded = JSON.parse(raw);
    } else {
        console.log("No cache found —- extracting and embedding PDF...");
        const text = await extractText(PDF_PATH);
        const chunks = chunkText(text, PDF_PATH);
        console.log(`Created ${chunks.length} chunks`);
        embedded = await embedChunks(chunks);
        console.log(`Ready -> ${embedded.length} chunks indexed and embedded.\n`);

        // Save it for next time
        fs.mkdirSync("./cache", { recursive: true }); // creates the folder if it doesn't exist
        fs.writeFileSync(CACHE_PATH, JSON.stringify(embedded));
        console.log("Saved embeddings to cache.");
    }

    console.log("Second Brain (RAG-enabled) — type 'exit' to quit.\n");
    ask(embedded);
}

main();
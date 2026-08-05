import "dotenv/config";
import * as readline from "node:readline";
import { encode } from "gpt-tokenizer";
import { extractText, chunkText, type Chunk } from "./ingest-chunk.js";
import { embedText, embedChunks, search, type EmbeddedChunk } from "./embed.js";

const {GROQ_API_KEY, GROQ_URL, MODEL } = process.env;
const MAX_TOKENS = 4096;
const PDF_PATH = "./notes/ashis_dutta_resume.pdf";

type Message = { role: "system" | "user" | "assistant"; content: string };

// This array is short-term memory — stays lean, no retrieved context stored permanently
const messages: Message[] = [
    { role: "system", content: "You are my second brain. Use the provided context to answer accurately. If the context doesn't contain the answer, say so." }
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


function ask(embeddedChunks: EmbeddedChunk[]) {
    rl.question("\nYou: ", async (input) => {
        if (input === "exit") { rl.close(); return; }

        const queryVector = await embedText(input);
        const relevantChunks = search(embeddedChunks, queryVector, 3);
        const context = relevantChunks.map(c => c.text).join("\n---\n");

        const apiMessages: Message[] = [
        ...messages,
        { role: "user", content: `Context from my notes:\n${context}\n\nQuestion: ${input}` }
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

        ask(embeddedChunks); // this is where agentic loop is happening
    });
}

async function main() {
    console.log("Loading and embedding PDF...");
    const text = await extractText(PDF_PATH);
    const chunks = chunkText(text, PDF_PATH);

    console.log(`Created ${chunks.length} chunks`);
    // console.log("First chunk:\n", chunks[0]!.text);
    // console.log("------------------------------------------");
    // console.log("\nSecond chunk (notice the overlap at the start):\n", chunks[1]!.text.slice(0, 120));

    const embedded = await embedChunks(chunks);
    console.log(`Ready -> ${embedded.length} chunks indexed and embedded.\n`);

    console.log("Second Brain (RAG-enabled) — type 'exit' to quit.\n");
    ask(embedded);
}

main();
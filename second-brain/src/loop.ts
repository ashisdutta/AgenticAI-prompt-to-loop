import "dotenv/config";
import * as readline from "node:readline";
import {encode} from "gpt-tokenizer"

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = process.env.GROQ_URL;
const MODEL = process.env.MODEL;

type Message = { role: "system" | "user" | "assistant"; content: string };

// This array IS your short-term memory — no library, just state you manage
const messages: Message[] = [
    { role: "system", content: "You are my second brain. Answer clearly and concisely." }
];

async function callGroq(msgs: Message[]): Promise<string> {
    const res = await fetch(GROQ_URL as string, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
        model: MODEL,
        messages: msgs
        })
    });

    if (!res.ok) {
        throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function countTokens(msg: Message[]):number{
    const fullText = msg.map(m=>m.content).join(" ")
    return encode(fullText).length;
}

function trimOldest() {
    while (countTokens(messages) > MAX_TOKENS && messages.length > 3) {
        messages.splice(1, 2);
    }
}

const MAX_TOKENS = 4096;

function ask() {
    rl.question("\nYou: ", async (input) => {
        if (input === "exit") { rl.close(); return; }

        messages.push({ role: "user", content: input });

        const currentTokens = countTokens(messages)
        console.log(`[context: ${currentTokens}/${MAX_TOKENS} tokens]`);

        if (currentTokens > MAX_TOKENS) {
        console.log("⚠️  Over budget — trimming oldest messages...");
        trimOldest();
        }

        const reply = await callGroq(messages);
        console.log(`\nBrain: ${reply}`);

        messages.push({ role: "assistant", content: reply });

        ask(); // loop
    });
}

console.log("Second Brain (raw loop) — type 'exit' to quit.\n");
ask();
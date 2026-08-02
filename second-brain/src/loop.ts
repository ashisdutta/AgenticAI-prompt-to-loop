import "dotenv/config";
import * as readline from "node:readline";

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

function ask() {
  rl.question("\nYou: ", async (input) => {
    if (input === "exit") { rl.close(); return; }

    messages.push({ role: "user", content: input });

    const reply = await callGroq(messages);
    console.log(`\nBrain: ${reply}`);

    messages.push({ role: "assistant", content: reply });

    ask(); // loop
  });
}

console.log("Second Brain (raw loop) — type 'exit' to quit.\n");
ask();
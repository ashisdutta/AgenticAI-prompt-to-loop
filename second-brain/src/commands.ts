import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import { embedChunks, saveChunks, deleteChunks, type EmbeddedChunk } from "./embed.js";
import { extractTextFromFile, chunkText } from "./ingest-chunk.js";

const NOTES_DIR = "./notes";
const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"];

function printError(msg: string) {
    console.log(chalk.red(`⚠️  ${msg}`));
}

export async function handleAdd(filePath: string, chunks: EmbeddedChunk[]): Promise<void> {
    const resolved = path.resolve(filePath.trim());
    if (!fs.existsSync(resolved)) {
        printError(`File not found: ${resolved}`);
        return;
    }
    const ext = path.extname(resolved).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        printError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
        return;
    }
    const filename = path.basename(resolved);
    const dest = path.join(NOTES_DIR, filename);
    fs.copyFileSync(resolved, dest);
    const spinner = ora({ text: `Embedding ${filename}...`, color: "cyan" }).start();
    try {
        const text = await extractTextFromFile(dest);
        const rawChunks = chunkText(text, dest);
        const embedded = await embedChunks(rawChunks);
        saveChunks(embedded);
        chunks.push(...embedded);
        spinner.stop();
        console.log(chalk.green(`✓ ${filename} — added (${embedded.length} chunks)`));
    } catch (err) {
        spinner.stop();
        printError(`Failed to process file: ${(err as Error).message}`);
    }
}

export function handleRemove(filename: string, chunks: EmbeddedChunk[]): void {
    const name = path.basename(filename.trim());
    const filePath = path.join(NOTES_DIR, name);
    const fullResolved = path.resolve(filePath);

    const deleted = deleteChunks(fullResolved);
    if (deleted === 0) {
        printError(`No chunks found for "${name}". Is it loaded?`);
        return;
    }

    const before = chunks.length;
    chunks.splice(0, chunks.length, ...chunks.filter(c => c.source !== fullResolved));

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    console.log(chalk.green(`✓ ${name} — removed (${before - chunks.length} chunks deleted)`));
}

export function handleList(chunks: EmbeddedChunk[]): void {
    if (chunks.length === 0) {
        console.log(chalk.gray("No files loaded."));
        return;
    }
    const grouped = new Map<string, number>();
    for (const c of chunks) {
        const name = path.basename(c.source);
        grouped.set(name, (grouped.get(name) ?? 0) + 1);
    }
    console.log(chalk.white.bold("\nLoaded files:"));
    for (const [name, count] of grouped) {
        console.log(chalk.gray(`  • ${name}`) + chalk.dim(` (${count} chunks)`));
    }
    console.log();
}

export function handleHelp(): void {
    console.log(chalk.white.bold("\nCommands:"));
    console.log(chalk.gray("  /add <filepath>    ") + "Add and index a file (pdf, txt, md)");
    console.log(chalk.gray("  /remove <filename> ") + "Remove a file and delete its embeddings");
    console.log(chalk.gray("  /list              ") + "List all currently loaded files");
    console.log(chalk.gray("  /help              ") + "Show this help message");
    console.log(chalk.gray("  exit               ") + "Quit the application");
    console.log();
}

export async function handleCommand(input: string, chunks: EmbeddedChunk[]): Promise<void> {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(" ");

    switch (cmd) {
        case "/add":    return await handleAdd(arg, chunks);
        case "/remove": return handleRemove(arg, chunks);
        case "/list":   return handleList(chunks);
        case "/help":   return handleHelp();
        default: printError(`Unknown command "${cmd}". Type /help for available commands.`);
    }
}

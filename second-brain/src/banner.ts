// src/banner.ts
import chalk from "chalk";

// Pixel art rows — each printed on its own line, no side-by-side text.
const PIXEL_ROWS = [
    "  " + chalk.hex("#7f77dd")("██") + chalk.hex("#d85a30")("██"),
    chalk.hex("#1d9e75")("██") + chalk.hex("#d4537e")("██") + chalk.hex("#378ade")("██"),
    "  " + chalk.hex("#1d9e75")("██") + chalk.hex("#7f77dd")("██") + chalk.hex("#378ade")("██"),
    chalk.hex("#378ade")("██") + "  " + chalk.hex("#d4537e")("██"),
];

export function printBanner(chunkCount: number, notesCount: number, model: string) {
    const margin = "  ";

    // Print pixel art block
    process.stdout.write("\n");
    for (const row of PIXEL_ROWS) {
        process.stdout.write(margin + row + "\n");
    }

    // Print info block below the logo
    process.stdout.write("\n");
    process.stdout.write(margin + chalk.white.bold("Second Brain ") + chalk.gray("v1.0.0") + "\n");
    process.stdout.write(margin + chalk.gray(`${chunkCount} chunks · ${notesCount} notes loaded`) + "\n");
    process.stdout.write(margin + chalk.gray(model) + "\n");
    process.stdout.write("\n");

    process.stdout.write(chalk.gray("─".repeat(getWidth())) + "\n");
}

function getWidth(): number {
    return Math.max((process.stdout.columns || 80) - 1, 10);
}

export function drawInputTop() {
    console.log(chalk.gray("─".repeat(getWidth())));
}

export function drawInputBottom() {
    console.log(chalk.gray("─".repeat(getWidth())));
}

export function printFooter(model: string) {
    const width = getWidth();
    const left = "? for shortcuts";
    const right = model;
    const pad = Math.max(1, width - left.length - right.length);
    console.log(chalk.gray(left) + " ".repeat(pad) + chalk.gray(right));
}
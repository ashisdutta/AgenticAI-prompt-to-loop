// Extracts raw text from PDFs and splits it into overlapping 
// chunks for vector embedding and RAG retrieval.

/* 2 things happening here->
a) extracting text from the file(in my case a pdf), called Ingestion also
b) will chunk the text we got from step a) into chunkSize = 800, overlap = 100

then, will call both the fun in the main and will get the chunk [].
*/


import * as fs from "fs";
import { PDFParse } from "pdf-parse";
import * as path from "path";


export async function extractTextFromTxt(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, "utf-8");
}
export async function extractText(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
    }


export type Chunk = { id: number; text: string; source: string };

export function chunkText(text: string, source: string, chunkSize = 400, overlap = 50): Chunk[] {
    const chunks: Chunk[] = [];
    let start = 0;
    let id = 0;

    while (start < text.length) {
        const end = start + chunkSize;
        const chunkContent = text.slice(start, end);

        chunks.push({ id: id++, text: chunkContent, source });

        start += chunkSize - overlap;
    }

    return chunks;
}


export async function extractTextFromFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case ".pdf":
        return extractText(filePath);
        case ".md":
        return extractTextFromTxt(filePath);
        default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
}
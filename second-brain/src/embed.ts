/* here 2 thing is happening
a) Embedding model from hugging-face is used to convert the token to vector form
b) How "similarity" between two pieces of text becomes a math operation (cosine similarity)

- got the embedded model
- filled embeded vectors after converting it to embedding using  embedText fun
- using search function found cosine similarity where cosineSimilarity fun is used.
*/

import { pipeline } from "@huggingface/transformers";
import type { Chunk } from "./ingest-chunk.js";
import { cosineSimilarity } from "./math.js";
import db from "./db.js";

let embedder: any = null;

async function getEmbedder() {
    if (!embedder) {
        // Downloads once, caches locally after that
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return embedder;
}

export async function embedText(text: string): Promise<number[]> {
    console.log(`[embedText called with: ${JSON.stringify(text)}]`);
    const extractor = await getEmbedder();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
}


export type EmbeddedChunk = { id: number; text: string; source: string; vector: number[] };

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    const embedded: EmbeddedChunk[] = [];
    for (const chunk of chunks) {
        const vector = await embedText(chunk.text);
        embedded.push({ ...chunk, vector });
    }
    return embedded;
}

export function search(embeddedChunks: EmbeddedChunk[], queryVector: number[], topK = 5) {
    const scored = embeddedChunks.map(chunk => ({
        chunk,
        score: cosineSimilarity(queryVector, chunk.vector)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}



export function getCachedChunks(source: string): EmbeddedChunk[] {
    const rows = db.prepare("SELECT * FROM chunks WHERE source = ? ORDER BY id").all(source) as any[];
    return rows.map(r => ({ id: r.id, source: r.source, text: r.text, vector: JSON.parse(r.vector) }));
}

export function saveChunks(chunks: EmbeddedChunk[]) {
    const insert = db.prepare("INSERT INTO chunks (source, text, vector) VALUES (?, ?, ?)");
    for (const chunk of chunks) {
        insert.run(chunk.source, chunk.text, JSON.stringify(chunk.vector));
    }
}
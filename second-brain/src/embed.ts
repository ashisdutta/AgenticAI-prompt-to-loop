/* here 2 thing is happening
a) Embedding model from hugging-face is used to convert the token to vector form
b) How "similarity" between two pieces of text becomes a math operation (cosine similarity)

- got the embedded model
- filled embeded vectors after converting it to embedding using  embedText fun
- using search function found cosine similarity where cosineSimilarity fun is used.
*/

import { pipeline } from "@huggingface/transformers";
import type { Chunk } from "./ingest-chunk.js";

let embedder: any = null;

async function getEmbedder() {
    if (!embedder) {
        // Downloads once, caches locally after that
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return embedder;
}

export async function embedText(text: string): Promise<number[]> {
    const extractor = await getEmbedder();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
}


function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i]!;
        const bi = b[i]!;
        dotProduct += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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

export function search(embeddedChunks: EmbeddedChunk[], queryVector: number[], topK = 3) {
    const scored = embeddedChunks.map(chunk => ({
        chunk,
        score: cosineSimilarity(queryVector, chunk.vector)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
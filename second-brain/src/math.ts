export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }

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
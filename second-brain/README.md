# Second Brain

A personal AI assistant with real memory and RAG — built **entirely from scratch**, no LangChain, no vector database service, no agent framework. Just raw API calls, hand-rolled retrieval, and a real tool-calling loop, so every layer is understood, not imported.

```
> ashis's phone no.
[retrieved context — top score: 0.38]
Brain: Ashis Dutta's phone number is +91 6003926295

> remember that ashis has a bike
[tool call: saveNote({"text":"Ashis has a bike."})]
Brain: Got it! I've noted that Ashis has a bike.
```

## Why this exists

Most AI app tutorials wrap everything in a framework — you get a working demo, but not an understanding of what's actually happening underneath. This project is the opposite bet: build the tokenizer's-eye view of an agentic system by hand — chunking, embeddings, cosine similarity, tool-calling loops, structured output validation, and persistent memory — so every "why does this behave this way" question has a real, traceable answer in the code.

## Features

- **RAG over your own documents** — PDF, `.txt`, and `.md` supported. Drop files in `./notes/`, they're chunked, embedded, and cached automatically.
- **Long-term memory** — the assistant can save, search, list, and delete facts across sessions, backed by real semantic search over saved notes (not just keyword matching).
- **Real tool-calling agent loop** — `saveNote`, `listNotes`, `searchNotes`, `deleteNote`, `getCurrentDateTime`, with structured argument validation and a hard iteration cap to prevent runaway loops.
- **Relevance-gated retrieval** — irrelevant chunks don't get forced into casual conversation; a similarity threshold decides when retrieval actually fires.
- **Context-aware query rewriting** — short follow-up questions ("email?") inherit context from recent turns instead of failing to retrieve.
- **Token budget tracking** — live token counts per turn, with automatic trimming of oldest conversation history when the budget is exceeded.
- **Retry with backoff** — transient API failures (rate limits, flaky generations) retry automatically instead of crashing the session.
- **SQLite-backed storage** — both document embeddings and saved notes persist in a real database (`node:sqlite`), not flat JSON files.
- **Polished CLI** — colored output, a live spinner during tool calls, a boxed input prompt, and a small pixel-art banner on startup.

## Architecture
<img width="818" height="726" alt="Screenshot 2026-08-20 at 1 25 12 PM" src="https://github.com/user-attachments/assets/983e26c3-2fde-4173-960b-b84b689f026a" />
<img width="964" height="494" alt="Screenshot 2026-08-20 at 1 24 47 PM" src="https://github.com/user-attachments/assets/7ec72ce3-533b-41c9-8aeb-f6e9fae8ad5f" />

```
Documents (PDF/txt/md)
   │
   ▼
extractTextFromFile → chunkText → embedText (local model)
   │
   ▼
SQLite: chunks table  ──┐
                         │
User message ────────────┼──► buildSearchQuery → cosine similarity search
                         │         │
                         │         ▼
                         │   relevance threshold gate
                         │         │
                         ▼         ▼
                  apiMessages (system + history + retrieved context)
                         │
                         ▼
                     Groq API (openai/gpt-oss-120b)
                         │
                         ▼
              tool_calls? ──yes──► executeTool (validate → run → feed back) ──┐
                    │no                                                       │
                    ▼                                                         │
                 final reply ◄─────────────────────────────────────────────────┘
                    │
                    ▼
        SQLite: notes table (long-term memory)
```

No external vector database, no managed embeddings API, no agent framework — the embedding model runs locally, similarity search is a hand-written cosine similarity function, and the agent loop is a plain `while` loop around the Groq API.

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (Node.js 22+) |
| Inference | Groq API (`openai/gpt-oss-120b`) |
| Embeddings | `@huggingface/transformers` (local, `Xenova/all-MiniLM-L6-v2`) |
| Storage | `node:sqlite` (built into Node, no external dependency) |
| PDF parsing | `pdf-parse` |
| Tokenization (budget tracking) | `gpt-tokenizer` |
| CLI polish | `chalk`, `ora`, `boxen` |

## Setup

```bash
git clone <your-repo-url>
cd second-brain
npm install
```

Create a `.env` file:
```
GROQ_API_KEY=your_key_here
GROQ_URL=https://api.groq.com/openai/v1/chat/completions
MODEL=openai/gpt-oss-120b
```

Drop any documents you want it to know about into `./notes/` (PDF, `.txt`, or `.md`), then run:

```bash
npx tsx src/index.ts
```

First run will extract, chunk, and embed your documents (slower, one-time). Every run after that loads from the SQLite cache instantly.

## Project structure

```
src/
├── index.ts         # Entry point — chat loop, agent loop, retrieval wiring
├── ingest-chunk.ts   # Document extraction (PDF/txt/md) + chunking
├── embed.ts           # Embeddings, cosine similarity search, chunk caching
├── notes.ts            # Long-term memory — save/list/search/delete notes
├── tools.ts             # Tool schemas, argument validation, dispatch
├── db.ts                 # SQLite connection + schema
├── math.ts                # Shared cosine similarity implementation
└── banner.ts               # CLI startup banner + boxed input
```

## What's next

- Streaming responses (currently waits for the full reply before printing)
- Persistent logging/tracing to a file, not just terminal output
- A lightweight frontend, for anyone who'd rather not use a terminal

## Notes on the build

This project was built iteratively, with real bugs solved along the way rather than skipped — a duplicate-tool-name typo that silently broke saving, a runaway tool-calling loop that hit a real rate limit, retrieval scoring issues on short queries, and a subtle prompt-ambiguity bug that caused retrieved context to get saved as if it were new information. Each one is documented with cause and fix in the build log.

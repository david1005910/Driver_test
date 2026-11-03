# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A study app for the Korean driver's licence written exam (운전면허 학과시험), built on the official 999-question bank from 도로교통공단. Features: browsing all questions, 40-question mock exams, a wrong-answer notebook (오답노트), and a RAG-based AI tutor that runs on a local Ollama. The UI text, prompts and code comments are in Korean.

## Commands

Everything runs through Docker Compose. Ollama runs **on the host** at `localhost:11434` and must have `nomic-embed-text` and `qwen2.5:3b` pulled.

```bash
docker compose up -d --build                               # api (3002→3000), web (5173), db MySQL 8.4 (3307→3306)
docker exec driver_test_api node src/scripts/seed.js       # first run: importBank.js + buildEmbeddings.js (needs Ollama)
docker exec driver_test_api npm run import                 # re-import data/bank.json only (upsert on `no`)
docker exec driver_test_api npm run embed                  # rebuild all 999 embeddings only
docker exec driver_test_api node src/scripts/verifyData.js # check for missing explanations and missing/orphan images
docker compose down -v                                     # wipe the DB volume (init.sql runs again on the next start)
```

- On a Linux host, start with `docker compose -f docker-compose.yml -f docker-compose.linux.yml up -d`. This runs `api` (port 3002) and `web` on the host network so they can reach a host Ollama bound to `127.0.0.1`. It also avoids ufw, which drops container→host traffic.
- The backend uses `node --watch` and the frontend uses the Vite dev server. Both containers bind-mount the source, so edits reload without a rebuild.
- `npm run build` in `frontend/` writes `frontend/dist`, which Express also serves as static files.
- There are no tests, linter or formatter configured.
- To re-extract the bank from the source PDF: `pip install pymupdf && python3 scripts/extract_pdf.py [out.json]`. The PDF path is hard-coded to `/tmp/driver_bank.pdf`. This writes `data/bank.json` and `data/images/`.

## Architecture

**Data flow:** PDF → `scripts/extract_pdf.py` → `data/bank.json` + `data/images/*.png` → `backend/src/scripts/importBank.js` → MySQL `questions` → `buildEmbeddings.js` → `embeddings` table (vectors stored as a JSON column).

**Backend** (`backend/`, CommonJS, Express + `mysql2/promise`, no ORM):
- `config.js` reads all settings from env (see `docker-compose.yml`). Inside the container, data paths default to `/app/data/...`. When running outside Docker, set `BANK_JSON` and `IMAGES_DIR`.
- The schema lives only in `src/sql/init.sql`, which MySQL runs once when the volume is first created. Schema changes need `docker compose down -v` or a manual migration.
- The pool uses `jsonStrings: true`, so JSON columns (`options`, `answer`, `images`, `vector`) come back as strings. Every route `JSON.parse`s them, usually in a local `normalizeQuestion()`.
- `answer` is an array of 1-based option indexes. A question with more than one answer is a 5-choice/2-answer (5지선다 2답) question. Grading compares the sorted arrays.
- `routes/attempts.js` `addAttempt()` is the single write path for answers (study and exam). In one transaction it inserts into `attempts` and upserts `wrong_answers`. The 오답노트 list is `wrong_answers WHERE wrong_count > 0`.
- `GET /api/exam/paper` deliberately leaves `answer` out of its response. `POST /api/exam/grade` grades and records the answers. Pass marks: 1종 = 70, 2종 = 60.

**RAG** (`services/`):
- `ollama.js` calls Ollama's `/api/embed` and `/api/chat` directly with `fetch`. Default options are `temperature 0`, `top_p 0.1`.
- `llm.js` is the chat-provider layer that `ragService.js` calls (`chat`, `chatStream`). Every request resolves a model choice through `resolveTarget(id)`, an allowlist that falls back to the default for unknown ids.
  - **Choices:** `freellmapi:<model>` goes to an OpenAI-compatible `/v1/chat/completions`, using `LLM_MODEL` plus `LLM_MODELS`. `ollama:<model>` goes to `ollama.js`, using `OLLAMA_CHAT_MODEL` plus `LLM_OLLAMA_MODELS`.
  - **Default:** `LLM_PROVIDER` decides it.
  - **This machine:** a local FreeLLMAPI router at `127.0.0.1:3001` serves Gemini. Its key and model list live in the gitignored `.env`. Compose only passes variables listed under `environment:`, so a new variable must also be added to `docker-compose.linux.yml`.
  - **Model list:** `GET /api/rag/models` lists the choices and whether each Ollama model is installed.
  - **Frontend:** `components/ModelSelect.jsx` holds the choice in `llmChoice.js` (stored in `localStorage`). `api.js` `postStream()` adds it as `llm` to every `/rag/explain` and `/rag/ask` request. The SSE `meta`/`done` events return the `llm` that answered.
  - **Limits per provider:** cloud models use `LLM_NUM_PREDICT`/`LLM_CONTEXT_ITEMS` (800/4). Local models use `OLLAMA_NUM_PREDICT`/`OLLAMA_CONTEXT_ITEMS` (400/2 in the Linux override, because of the 4 GB RAM). The chart still shows all `k` results.
  - **Timeouts:** Ollama calls use an `undici` Agent with no headers/body timeout. Local models on this PC can take more than 5 minutes before the first token, which used to hit Node fetch's 300 s `headersTimeout`.
  - **Gemini thinking models:** models such as `gemini-3.5-flash` spend hidden reasoning tokens against `max_tokens`, which cuts answers short. Only `*-flash-lite` models are offered.
  - **Embeddings:** these always stay on Ollama `nomic-embed-text`, because the stored vectors depend on that model.
- `embedService.js` does hybrid retrieval. It loads every embedding and builds an in-memory BM25 index once (`cachedCorpus`); `buildEmbedding` invalidates that cache.
  - Dense score: cosine similarity over normalized vectors.
  - Sparse score: BM25 with a hand-written Korean tokenizer (suffix stripping, a stopword list, and 2-gram subword terms prefixed `bg:`).
  - Combined score: `alpha*dense + (1-alpha)*sparse`. The default `alpha` is 0.6. `searchMode` can be `hybrid`, `dense` or `sparse`.
  - Results below the score threshold are filtered out.
  - When explaining a question, that question's own stored vector is reused as the query, so no embed call is made.
  - It throws `EMBEDDINGS_EMPTY` if nothing has been seeded yet.
- `ragService.js` holds the system prompt and builds the prompts. It is tuned hard against hallucination: answer only from the retrieved context, and explain every option. If no retrieved item passes the threshold, the LLM gets no context. The low-scoring candidates are still returned, flagged `belowThreshold`, so the score chart can show them.
- `routes/rag.js` streams over SSE when `stream: true`. Each line is `data: {type: start|meta|delta|done|error}\n\n`. The frontend parses this in `api.js` `postStream()`, so both sides must change together.

**Frontend** (`frontend/`, React 18 + Vite, no router, no state library):
- `App.jsx` switches tabs, keeping the active tab in `location.hash`. The pages are in `src/pages/` and are all styled from a single `styles.css`.
- Pages talk to each other through a window `CustomEvent` (`nav.js` `openQuestion(no)`). For example, a similar-question link in the AI tutor opens that question in Study.
- The Vite dev server proxies `/api` and `/images` to `VITE_API_PROXY` (`http://api:3000` in compose).

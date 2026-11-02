const express = require("express");
const { getPool } = require("../db");
const {
  explainWrongQuestion,
  explainWrongQuestionStream,
  askFreeForm,
  askFreeFormStream,
  searchQuestions,
  getQuestionScores,
  getQuestionById,
} = require("../services/ragService");
const { isAvailable } = require("../services/ollama");
const { count: embeddingCount } = require("../services/embedService");

const router = express.Router();

function setupSse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "start" })}\n\n`);
}

function sseError(res, message) {
  const payload = JSON.stringify({ type: "error", message });
  if (res.headersSent) res.write(`data: ${payload}\n\n`);
  else res.status(500).json({ error: message, message: "RAG 해설 생성 실패" });
}

router.get("/status", async (req, res) => {
  try {
    const ollamaUp = await isAvailable().catch(() => false);
    const embedded = await embeddingCount();
    const [[{ totalQ }]] = await getPool().query("SELECT COUNT(*) AS totalQ FROM questions");
    res.json({
      ollama: ollamaUp,
      embedded,
      total_questions: totalQ,
      ready: ollamaUp && embedded === totalQ,
      searchModes: ["hybrid", "dense", "sparse"],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 특정 문항 기준 유사 문항 Dense / Sparse / Hybrid 스코어 즉시 조회 API
router.get("/scores/:questionId", async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    if (!questionId) return res.status(400).json({ error: "questionId required" });
    const q = await getQuestionById(questionId);
    if (!q) return res.status(404).json({ error: "question not found" });

    const searchMode = req.query.searchMode || "hybrid";
    const alpha = req.query.alpha !== undefined ? Number(req.query.alpha) : 0.6;
    const k = req.query.k !== undefined ? Number(req.query.k) : 4;

    const result = await getQuestionScores(q, { searchMode, alpha, k });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dense / Sparse / Hybrid 검색 스코어 조회 전용 API
router.post("/search", async (req, res) => {
  try {
    const { query, searchMode = "hybrid", alpha = 0.6, k = 5 } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: "query required" });
    const result = await searchQuestions(query.trim(), {
      searchMode,
      alpha: Number(alpha),
      k: Number(k) || 5,
    });
    res.json(result);
  } catch (err) {
    if (err.message === "EMBEDDINGS_EMPTY") {
      return res.status(409).json({
        error: "EMBEDDINGS_EMPTY",
        message: "임베딩이 아직 생성되지 않았습니다.",
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// 틀린 문제 RAG 해설 (stream: true 시 SSE)
router.post("/explain", async (req, res) => {
  try {
    const { questionId, wrongAnswer, stream, searchMode = "hybrid", alpha = 0.6, k = 4 } = req.body;
    if (!questionId) return res.status(400).json({ error: "questionId required" });
    const q = await getQuestionById(questionId);
    if (!q) return res.status(404).json({ error: "question not found" });

    const searchOpts = { searchMode, alpha: Number(alpha), k: Number(k) || 4 };

    if (!stream) {
      const result = await explainWrongQuestion(q, wrongAnswer || [1], searchOpts);
      return res.json(result);
    }

    setupSse(res);
    const meta = await explainWrongQuestionStream(
      q,
      wrongAnswer || [1],
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`);
      },
      searchOpts,
      (metaInit) => {
        res.write(
          `data: ${JSON.stringify({
            type: "meta",
            similar: metaInit.similar,
            searchMode: metaInit.searchMode,
            alpha: metaInit.alpha,
          })}\n\n`
        );
      }
    );
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        similar: meta.similar,
        searchMode: meta.searchMode,
        alpha: meta.alpha,
      })}\n\n`
    );
    res.end();
  } catch (err) {
    if (err.message === "EMBEDDINGS_EMPTY") {
      return res.status(409).json({ error: "EMBEDDINGS_EMPTY", message: "임베딩이 아직 생성되지 않았습니다. /api/rag/embed를 먼저 실행하세요." });
    }
    sseError(res, err.message);
    if (res.headersSent) res.end();
  }
});

// 자유 질문 (RAG 기반 답변, stream: true 시 SSE)
router.post("/ask", async (req, res) => {
  try {
    const { query, stream, searchMode = "hybrid", alpha = 0.6, k = 4 } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: "query required" });

    const searchOpts = { searchMode, alpha: Number(alpha), k: Number(k) || 4 };

    if (!stream) {
      const result = await askFreeForm(query.trim(), searchOpts);
      return res.json(result);
    }

    setupSse(res);
    const meta = await askFreeFormStream(
      query.trim(),
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`);
      },
      searchOpts,
      (metaInit) => {
        res.write(
          `data: ${JSON.stringify({
            type: "meta",
            similar: metaInit.similar,
            searchMode: metaInit.searchMode,
            alpha: metaInit.alpha,
          })}\n\n`
        );
      }
    );
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        similar: meta.similar,
        searchMode: meta.searchMode,
        alpha: meta.alpha,
      })}\n\n`
    );
    res.end();
  } catch (err) {
    if (err.message === "EMBEDDINGS_EMPTY") {
      return res.status(409).json({ error: "EMBEDDINGS_EMPTY", message: "임베딩이 아직 생성되지 않았습니다. /api/rag/embed를 먼저 실행하세요." });
    }
    sseError(res, err.message);
    if (res.headersSent) res.end();
  }
});

module.exports = router;

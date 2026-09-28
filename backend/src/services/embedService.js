const { getPool } = require("../db");
const { embed } = require("./ollama");
const config = require("../config");

function normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

function questionToText(q) {
  const parts = [q.question];
  if (Array.isArray(q.options)) {
    for (const [i, o] of q.options.entries()) {
      if (o) parts.push(`보기${i + 1}: ${o}`);
    }
  }
  if (q.explanation) parts.push(`해설: ${q.explanation}`);
  return parts.join(" ");
}

async function getEmbeddings() {
  const [rows] = await getPool().query(
    "SELECT e.question_id, q.no, e.vector, q.question, q.options, q.explanation FROM embeddings e JOIN questions q ON q.id = e.question_id"
  );
  return rows.map((r) => ({
    question_id: r.question_id,
    no: r.no,
    vector: normalize(JSON.parse(r.vector)),
    question: r.question,
    options: JSON.parse(r.options),
    explanation: r.explanation,
  }));
}

async function retrieveSimilar(queryText, k = 5, excludeId = null, minScore = 0.35) {
  const all = await getEmbeddings();
  if (all.length === 0) {
    throw new Error("EMBEDDINGS_EMPTY");
  }
  const qv = normalize(await embed(queryText));
  const scored = all
    .filter((r) => (excludeId == null ? true : r.question_id !== excludeId))
    .map((r) => ({
      ...r,
      score: r.vector.reduce((s, x, i) => s + x * qv[i], 0),
    }))
    .filter((r) => r.score >= minScore);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

async function buildEmbedding(q) {
  const vec = await embed(questionToText(q));
  const pool = getPool();
  await pool.query(
    `INSERT INTO embeddings (question_id, model, vector)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE model = VALUES(model), vector = VALUES(vector), updated_at = NOW()`,
    [q.id, config.ollama.embedModel, JSON.stringify(vec)]
  );
  return vec;
}

async function count() {
  const [rows] = await getPool().query("SELECT COUNT(*) AS c FROM embeddings");
  return rows[0].c;
}

module.exports = { buildEmbedding, count, getEmbeddings, retrieveSimilar, questionToText, normalize, embed };
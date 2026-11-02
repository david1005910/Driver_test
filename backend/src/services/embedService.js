const { getPool } = require("../db");
const { embed } = require("./ollama");
const config = require("../config");

const BM25_K1 = 1.5;
const BM25_B = 0.75;

const STOPWORDS = new Set([
  "다음", "중", "가장", "올바른", "것은", "무엇인가", "무엇인가요", "대한", "설명으로", "설명",
  "옳은", "틀린", "맞는", "경우", "때", "보기1", "보기2", "보기3", "보기4", "보기5",
  "해설", "문제", "방법으로", "바람직한", "모두", "고르시오", "고르면", "가지", "어떤",
  "있을", "있는", "없는", "하는", "한다", "이다", "있으며", "대해", "알려줘", "알려주세요",
  "무엇", "어떻게", "얼마", "몇", "기준", "요약", "해줘", "해주세요",
]);

const KOREAN_SUFFIXES = [
  "에서부터", "으로부터", "에서는", "으로는", "에게서", "이라고", "랍니다", "습니다", "입니다", "합니다",
  "해야", "하는", "할수록", "하거나", "하여", "하고", "하면", "해서", "한데",
  "에서", "으로", "에게", "한테", "보다", "처럼", "만큼", "까지", "부터", "마다", "조차", "마저",
  "이나", "거나", "든지", "라도", "은", "는", "이", "가", "을", "를", "의", "에", "로", "과", "와", "도", "만",
];

let cachedCorpus = null;

function normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

function stripKoreanSuffix(word) {
  if (!/^[가-힣]+$/.test(word) || word.length <= 2) return word;
  for (const suffix of KOREAN_SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 2) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

function tokenizeDetailed(text) {
  if (!text) return { tf: new Map(), length: 0, displayTerms: new Map() };
  const rawMatches = text.toLowerCase().match(/[가-힣a-z0-9]+/g) || [];
  const tf = new Map();
  const displayTerms = new Map();
  let totalLen = 0;

  function addTerm(term, weight, display) {
    if (!term || STOPWORDS.has(term)) return;
    tf.set(term, (tf.get(term) || 0) + weight);
    if (display && !displayTerms.has(term)) {
      displayTerms.set(term, display);
    }
    totalLen += weight;
  }

  for (const raw of rawMatches) {
    if (STOPWORDS.has(raw)) continue;
    const stem = stripKoreanSuffix(raw);
    if (STOPWORDS.has(stem)) continue;

    if (stem.length >= 2 || /\d/.test(stem)) {
      addTerm(stem, 1.0, stem);
    }
    if (raw !== stem && raw.length >= 2) {
      addTerm(raw, 0.6, stem);
    }
    // 한글 복합어(3글자 이상)는 2-gram 서브워드 토큰 추가
    if (/^[가-힣]+$/.test(stem) && stem.length >= 3) {
      for (let i = 0; i < stem.length - 1; i++) {
        const bg = stem.slice(i, i + 2);
        if (!STOPWORDS.has(bg)) {
          addTerm(`bg:${bg}`, 0.35, bg);
        }
      }
    }
  }

  return { tf, length: totalLen || 1, displayTerms };
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

async function getEmbeddings(forceRefresh = false) {
  if (cachedCorpus && !forceRefresh) {
    return cachedCorpus;
  }
  const [rows] = await getPool().query(
    "SELECT e.question_id, q.no, e.vector, q.question, q.options, q.answer, q.explanation FROM embeddings e JOIN questions q ON q.id = e.question_id"
  );

  const df = new Map();
  let totalDocLength = 0;

  const items = rows.map((r) => {
    const options = JSON.parse(r.options);
    const answer = r.answer ? JSON.parse(r.answer) : [];
    const docText = questionToText({
      question: r.question,
      options,
      explanation: r.explanation,
    });
    const tokenized = tokenizeDetailed(docText);
    totalDocLength += tokenized.length;
    for (const term of tokenized.tf.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
    return {
      question_id: r.question_id,
      no: r.no,
      vector: normalize(JSON.parse(r.vector)),
      question: r.question,
      options,
      answer,
      explanation: r.explanation,
      bm25Tf: tokenized.tf,
      bm25Len: tokenized.length,
    };
  });

  const N = items.length || 1;
  const avgdl = totalDocLength / N || 1;
  const idf = new Map();
  for (const [term, docFreq] of df.entries()) {
    const val = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
    idf.set(term, val);
  }

  cachedCorpus = { items, idf, avgdl, N };
  return cachedCorpus;
}

function computeSparseScores(queryText, corpus) {
  const { items, idf, avgdl } = corpus;
  const qTok = tokenizeDetailed(queryText);
  const queryTerms = [];

  for (const [term, qWeight] of qTok.tf.entries()) {
    const termIdf = idf.get(term);
    if (!termIdf || termIdf <= 0) continue;
    const isBigram = term.startsWith("bg:");
    queryTerms.push({
      term,
      isBigram,
      qWeight: isBigram ? Math.min(qWeight, 0.5) : Math.min(qWeight, 1.5),
      idf: termIdf,
      display: qTok.displayTerms.get(term) || term.replace(/^bg:/, ""),
    });
  }

  // 단문 쿼리(상위 8개 핵심 토큰)와 장문 쿼리(전체 문항 텍스트) 모두 0~1 구간에서 변별력을 갖도록 정규화 분모 산출
  const sortedTerms = [...queryTerms].sort((a, b) => b.idf * b.qWeight - a.idf * a.qWeight);
  const topTerms = sortedTerms.slice(0, 8);
  const top8Denom = topTerms.reduce((s, t) => s + t.idf * t.qWeight * 1.75, 0);
  const fullDenom = sortedTerms.reduce((s, t) => s + t.idf * t.qWeight * 0.55, 0);
  const normDenom = Math.max(top8Denom, fullDenom, 1);

  return items.map((doc) => {
    let rawBm25 = 0;
    const matchedSet = new Set();

    for (const qt of queryTerms) {
      const tf = doc.bm25Tf.get(qt.term) || 0;
      if (tf <= 0) continue;
      const num = tf * (BM25_K1 + 1);
      const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.bm25Len / avgdl));
      rawBm25 += qt.qWeight * qt.idf * (num / denom);
      if (!qt.isBigram && qt.display.length >= 2) {
        matchedSet.add(qt.display);
      }
    }

    // 만약 원형 단어 매칭이 없고 2-gram만 매칭된 경우 2-gram 표시어 추가
    if (matchedSet.size === 0 && rawBm25 > 0) {
      for (const qt of queryTerms) {
        if (doc.bm25Tf.has(qt.term)) {
          matchedSet.add(qt.display);
        }
      }
    }

    const sparseScore = Math.max(0, Math.min(1, rawBm25 / normDenom));
    return {
      question_id: doc.question_id,
      rawBm25: Number(rawBm25.toFixed(3)),
      sparseScore: Number(sparseScore.toFixed(4)),
      matchedKeywords: Array.from(matchedSet).slice(0, 6),
    };
  });
}

async function retrieveSimilar(queryText, k = 5, excludeId = null, minScore = 0.45, options = {}) {
  const searchMode = options.searchMode || "hybrid"; // 'hybrid' | 'dense' | 'sparse'
  const alpha = typeof options.alpha === "number" ? Math.max(0, Math.min(1, options.alpha)) : 0.6;
  const includeLowScore = !!options.includeLowScore;

  const corpus = await getEmbeddings();
  if (corpus.items.length === 0) {
    throw new Error("EMBEDDINGS_EMPTY");
  }

  let qv = null;
  if (excludeId != null) {
    const selfDoc = corpus.items.find((r) => r.question_id === Number(excludeId));
    if (selfDoc && selfDoc.vector) {
      qv = selfDoc.vector;
    }
  }
  if (!qv) {
    try {
      qv = normalize(await embed(queryText));
    } catch (err) {
      if (searchMode !== "sparse") throw err;
    }
  }

  const sparseList = computeSparseScores(queryText, corpus);
  const sparseMap = new Map(sparseList.map((s) => [s.question_id, s]));

  const scored = corpus.items
    .filter((r) => (excludeId == null ? true : r.question_id !== excludeId))
    .map((r) => {
      const rawDense = qv ? r.vector.reduce((s, x, i) => s + x * qv[i], 0) : 0;
      const denseScore = Number(Math.max(0, Math.min(1, rawDense)).toFixed(4));
      const sp = sparseMap.get(r.question_id) || { sparseScore: 0, rawBm25: 0, matchedKeywords: [] };
      const sparseScore = sp.sparseScore;
      const hybridScore = Number((alpha * denseScore + (1 - alpha) * sparseScore).toFixed(4));

      let activeScore = hybridScore;
      if (searchMode === "dense") activeScore = denseScore;
      else if (searchMode === "sparse") activeScore = sparseScore;

      return {
        question_id: r.question_id,
        no: r.no,
        question: r.question,
        options: r.options,
        answer: r.answer,
        explanation: r.explanation,
        score: activeScore,
        denseScore,
        sparseScore,
        hybridScore,
        rawBm25: sp.rawBm25,
        matchedKeywords: sp.matchedKeywords,
        searchMode,
        alpha,
      };
    });

  scored.sort((a, b) => b.score - a.score);

  if (includeLowScore) {
    return scored.slice(0, k);
  }

  const filtered = scored.filter((r) => {
    if (searchMode === "dense") return r.denseScore >= minScore;
    if (searchMode === "sparse") return r.sparseScore >= Math.min(minScore, 0.2);
    // hybrid 모드: 종합 점수가 기준 이상이거나, Dense/Sparse 중 하나가 명확히 높은 경우 허용
    const hybridThreshold = Math.min(minScore, 0.35);
    return r.hybridScore >= hybridThreshold || r.denseScore >= minScore || r.sparseScore >= 0.4;
  });

  return filtered.slice(0, k);
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
  cachedCorpus = null;
  return vec;
}

async function count() {
  const [rows] = await getPool().query("SELECT COUNT(*) AS c FROM embeddings");
  return rows[0].c;
}

module.exports = {
  buildEmbedding,
  count,
  getEmbeddings,
  retrieveSimilar,
  questionToText,
  normalize,
  embed,
};

import React, { useState } from "react";
import { post, postStream } from "../api";
import ScoreBarChart from "../components/ScoreBarChart.jsx";

export default function AITutor() {
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState("hybrid"); // 'hybrid' | 'dense' | 'sparse'
  const [alpha, setAlpha] = useState(0.6);

  async function ask() {
    if (!query.trim() || loading) return;
    const q = query.trim();
    const curMode = searchMode;
    const curAlpha = alpha;
    setLoading(true);
    setChat((c) => [
      ...c,
      { role: "user", text: q, searchMode: curMode, alpha: curAlpha },
      { role: "ai", text: "", similar: null, searchMode: curMode, alpha: curAlpha },
    ]);
    setQuery("");
    let acc = "";
    let latestSimilar = null;
    try {
      const meta = await postStream(
        "/rag/ask",
        { query: q, stream: true, searchMode: curMode, alpha: curAlpha, k: 4 },
        {
          onMeta: (m) => {
            latestSimilar = m.similar || null;
            setChat((c) => [
              ...c.slice(0, -1),
              {
                role: "ai",
                text: acc || "근거 문항 검색 완료! 답변 생성 중...",
                similar: latestSimilar,
                searchMode: m.searchMode || curMode,
                alpha: m.alpha ?? curAlpha,
              },
            ]);
          },
          onDelta: (t) => {
            acc += t;
            setChat((c) => [
              ...c.slice(0, -1),
              {
                role: "ai",
                text: acc,
                similar: latestSimilar,
                searchMode: curMode,
                alpha: curAlpha,
              },
            ]);
          },
        }
      );
      setChat((c) => [
        ...c.slice(0, -1),
        {
          role: "ai",
          text: acc,
          similar: meta.similar || latestSimilar,
          searchMode: meta.searchMode || curMode,
          alpha: meta.alpha ?? curAlpha,
        },
      ]);
    } catch (e) {
      setChat((c) => [...c.slice(0, -1), { role: "ai", text: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function searchOnly() {
    if (!query.trim() || loading) return;
    const q = query.trim();
    const curMode = searchMode;
    const curAlpha = alpha;
    setLoading(true);
    setChat((c) => [
      ...c,
      { role: "user", text: `[검색 스코어 비교] ${q}`, searchMode: curMode, alpha: curAlpha },
      { role: "ai", text: "검색 스코어를 분석 중입니다...", similar: null, searchMode: curMode, alpha: curAlpha },
    ]);
    setQuery("");
    try {
      const res = await post("/rag/search", {
        query: q,
        searchMode: curMode,
        alpha: curAlpha,
        k: 5,
      });
      setChat((c) => [
        ...c.slice(0, -1),
        {
          role: "ai",
          text: `🔍 "${q}"에 대한 상위 ${res.similar?.length || 0}개 문항의 Dense(의미 임베딩) / Sparse(BM25 키워드) / Hybrid 검색 스코어 결과입니다.`,
          similar: res.similar,
          searchMode: res.searchMode || curMode,
          alpha: res.alpha ?? curAlpha,
        },
      ]);
    } catch (e) {
      setChat((c) => [...c.slice(0, -1), { role: "ai", text: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "1종 보통 합격 기준 점수는?",
    "음주운전 벌점과 처벌 기준을 알려줘",
    "서행해야 하는 경우를 알려줘",
    "어린이 보호구역 운전 시 주의사항은?",
  ];

  const densePct = Math.round(alpha * 100);
  const sparsePct = 100 - densePct;

  const lastAiWithSimilar = [...chat].reverse().find((m) => m.role === "ai" && m.similar && m.similar.length > 0);
  const topCandidate = lastAiWithSimilar ? lastAiWithSimilar.similar[0] : null;
  const liveTopDense = topCandidate ? Number(topCandidate.denseScore ?? topCandidate.score ?? 0) : null;
  const liveTopSparse = topCandidate ? Number(topCandidate.sparseScore ?? 0) : null;
  const liveTopHybrid =
    liveTopDense !== null && liveTopSparse !== null
      ? Number((alpha * liveTopDense + (1 - alpha) * liveTopSparse).toFixed(4))
      : null;

  return (
    <div className="page">
      <h2>🤖 AI 튜터 & Hybrid RAG 검색</h2>
      <p className="muted">
        999문항에 대해 <strong>Dense 검색(임베딩 의미 유사도)</strong>과{" "}
        <strong>Sparse 검색(BM25 키워드 매칭)</strong>을 결합한 Hybrid RAG 시스템으로 근거 문항과 스코어를 막대그래프로 확인하고 답변을 생성합니다.
      </p>

      {/* 검색 방식 및 가중치 설정 패널 */}
      <div className="rag-control-panel">
        <div className="rag-mode-group">
          <span className="rag-control-label">검색 엔진 모드:</span>
          <div className="rag-mode-buttons">
            <button
              type="button"
              className={`rag-mode-btn ${searchMode === "hybrid" ? "active hybrid" : ""}`}
              onClick={() => setSearchMode("hybrid")}
            >
              ⚡ Hybrid {liveTopHybrid !== null ? `${liveTopHybrid.toFixed(3)} (${(liveTopHybrid * 100).toFixed(1)}%)` : "(Dense + Sparse)"}
            </button>
            <button
              type="button"
              className={`rag-mode-btn ${searchMode === "dense" ? "active dense" : ""}`}
              onClick={() => setSearchMode("dense")}
            >
              🧠 Dense {liveTopDense !== null ? `${liveTopDense.toFixed(3)} (${(liveTopDense * 100).toFixed(1)}%)` : "(임베딩 벡터)"}
            </button>
            <button
              type="button"
              className={`rag-mode-btn ${searchMode === "sparse" ? "active sparse" : ""}`}
              onClick={() => setSearchMode("sparse")}
            >
              🔤 Sparse {liveTopSparse !== null ? `${liveTopSparse.toFixed(3)} (${(liveTopSparse * 100).toFixed(1)}%)` : "(BM25 키워드)"}
            </button>
          </div>
        </div>

        <div className="rag-alpha-group">
          <span className="rag-control-label">
            Dense <strong>{densePct}%</strong> : Sparse <strong>{sparsePct}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            className="rag-alpha-slider"
          />
          {liveTopHybrid !== null && (
            <span className="inline-hybrid-badge">
              🟣 Hybrid Score: <strong>{liveTopHybrid.toFixed(3)}</strong> ({(liveTopHybrid * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      <div className="chat-box">
        <div className="chat-log">
          {chat.length === 0 && (
            <div className="chat-empty">
              <p>무엇이든 물어보세요. 질문 시 관련 문항의 Dense / Sparse / Hybrid 스코어 막대그래프가 함께 표시됩니다:</p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="chip" onClick={() => setQuery(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="msg-bubble">{m.text}</div>
              {m.role === "ai" && m.similar && m.similar.length > 0 && (
                <div className="msg-chart-wrap">
                  <ScoreBarChart
                    items={m.similar}
                    searchMode={m.searchMode || searchMode}
                    alpha={m.alpha ?? alpha}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            value={query}
            placeholder="운전면허 관련 질문 또는 검색 키워드 입력..."
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button
            type="button"
            className="btn"
            onClick={searchOnly}
            disabled={loading || !query.trim()}
            title="LLM 답변 없이 Dense/Sparse/Hybrid 검색 스코어 막대그래프만 즉시 확인합니다"
          >
            📊 스코어 검색
          </button>
          <button className="btn primary" onClick={ask} disabled={loading || !query.trim()}>
            🤖 AI 질문 전송
          </button>
        </div>
      </div>
    </div>
  );
}

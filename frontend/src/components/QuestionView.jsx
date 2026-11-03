import React, { useEffect, useMemo, useRef, useState } from "react";
import { get, imageUrl } from "../api";
import { openQuestion } from "../nav";
import ScoreBarChart from "./ScoreBarChart.jsx";
import ModelSelect from "./ModelSelect.jsx";

export default function QuestionView({
  q: item,
  showAnswer,
  onAnswered,
  aiExplain,
  onNext,
  onPrev,
  hasNext = true,
  hasPrev = true,
  onBack,
}) {
  const [selected, setSelected] = useState([]);
  const [answered, setAnswered] = useState(!!showAnswer);
  const [result, setResult] = useState(null);

  const multi = item.answer && item.answer.length > 1;

  function toggle(optIdx) {
    if (answered) return;
    setSelected((prev) =>
      multi
        ? prev.includes(optIdx)
          ? prev.filter((x) => x !== optIdx)
          : [...prev, optIdx].sort((a, b) => a - b)
        : [optIdx]
    );
  }

  function submit() {
    if (selected.length === 0) return;
    setAnswered(true);
    const isCorrect =
      JSON.stringify([...selected].sort((a, b) => a - b)) ===
      JSON.stringify([...(item.answer || [])].sort((a, b) => a - b));
    setResult(isCorrect);
    if (onAnswered) onAnswered(selected, isCorrect);
  }

  const circles = "①②③④⑤⑥⑦⑧⑨⑩";
  const correctSet = new Set(item.answer || []);

  return (
    <div className="question-box">
      <div className="question-head">
        <span className="q-no">{item.no}번</span>
        {item.answer && item.answer.length > 1 && <span className="tag multi">복수정답</span>}
        {item.images && item.images.length > 0 && <span className="tag img">이미지문제</span>}
      </div>

      {item.images && item.images.length > 0 && (
        <div className="q-images">
          {item.images.map((im) => (
            <img key={im} src={imageUrl(im)} alt={`문제 ${item.no} 이미지`} className="q-img" loading="lazy" />
          ))}
        </div>
      )}

      <div className="q-text">{item.question}</div>

      <div className="opts">
        {item.options.map((opt, i) => {
          const idx = i + 1;
          const isSel = selected.includes(idx);
          const isCorr = correctSet.has(idx);
          let cls = "opt";
          if (isSel) cls += " sel";
          if (answered) {
            if (isCorr) cls += " correct";
            else if (isSel) cls += " wrong";
          }
          return (
            <button key={i} className={cls} onClick={() => toggle(idx)} disabled={answered}>
              <span className="opt-circle">{circles[idx - 1]}</span>
              <span className="opt-text">{opt}</span>
              {answered && isCorr && <span className="opt-mark">✔</span>}
              {answered && isSel && !isCorr && <span className="opt-mark">✘</span>}
            </button>
          );
        })}
      </div>

      {!answered && (
        <div className="q-actions">
          <button className="btn primary" onClick={submit} disabled={selected.length === 0}>
            {multi ? "채점하기" : "정답 제출"}
          </button>
          {showAnswer && (
            <button className="btn" onClick={() => setAnswered(true)}>
              정답 보기
            </button>
          )}
        </div>
      )}

      {answered && (
        <div className={`result ${result === null ? "info" : result ? "pass" : "fail"}`}>
          {result === null
            ? "정답을 확인하세요."
            : result
            ? "정답입니다! 🎉"
            : `틀렸습니다. 정답: ${(item.answer || []).map((a) => `보기 ${a}`).join(", ")}`}
        </div>
      )}

      {answered && item.explanation && (
        <div className="explanation">
          <h4>📖 해설</h4>
          <p>{item.explanation}</p>
        </div>
      )}

      {aiExplain && typeof aiExplain === "function" && (
        <div style={{ marginTop: 12 }}>
          <AIExplain id={item.id} wrongAnswer={selected} explainer={aiExplain} />
        </div>
      )}

      {(onNext || onPrev || onBack) && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border-bottom)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          {onPrev ? (
            <button className="btn" onClick={onPrev} disabled={!hasPrev}>
              ← 이전 문제
            </button>
          ) : <div />}
          {onBack && (
            <button className="btn ghost" onClick={onBack}>
              ≡ 목록으로
            </button>
          )}
          {onNext && (
            <button className="btn primary" onClick={onNext} disabled={!hasNext}>
              다음 문제 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AIExplain({ id, wrongAnswer, explainer }) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null);
  const [baseSimilar, setBaseSimilar] = useState(null);
  const [showChart, setShowChart] = useState(false);
  const [error, setError] = useState(null);
  const [searchMode, setSearchMode] = useState("hybrid");
  const [alpha, setAlpha] = useState(0.6);
  const bufRef = useRef("");

  useEffect(() => {
    let alive = true;
    get(`/rag/scores/${id}?k=4`)
      .then((res) => {
        if (alive && res && res.similar) {
          setBaseSimilar(res.similar);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const liveSimilar = useMemo(() => {
    const raw = (content && content.similar) || baseSimilar;
    if (!raw || !raw.length) return [];
    const recalc = raw.map((it) => {
      const d = Number(it.denseScore ?? it.score ?? 0);
      const s = Number(it.sparseScore ?? 0);
      const h = Number((alpha * d + (1 - alpha) * s).toFixed(4));
      const active = searchMode === "dense" ? d : searchMode === "sparse" ? s : h;
      return {
        ...it,
        denseScore: d,
        sparseScore: s,
        hybridScore: h,
        score: active,
        searchMode,
        alpha,
      };
    });
    recalc.sort((a, b) => b.score - a.score);
    return recalc;
  }, [content, baseSimilar, alpha, searchMode]);

  const topItem = liveSimilar[0] || null;
  const topHybrid = topItem ? topItem.hybridScore : null;
  const topDense = topItem ? topItem.denseScore : null;
  const topSparse = topItem ? topItem.sparseScore : null;

  async function run(modeOverride) {
    const activeMode = typeof modeOverride === "string" ? modeOverride : searchMode;
    setLoading(true);
    setError(null);
    setContent(null);
    bufRef.current = "";
    let latestSimilar = baseSimilar;
    try {
      const meta = await explainer(
        id,
        wrongAnswer,
        (chunk) => {
          bufRef.current += chunk;
          setContent((prev) => ({
            answer: bufRef.current,
            similar: latestSimilar,
            searchMode: activeMode,
            alpha,
            llm: prev?.llm || null,
          }));
        },
        {
          searchMode: activeMode,
          alpha,
          onMeta: (m) => {
            latestSimilar = m.similar || baseSimilar;
            setContent({
              answer: bufRef.current || "유사 문항 스코어 분석 완료! AI 해설을 작성하고 있습니다...",
              similar: latestSimilar,
              searchMode: m.searchMode || activeMode,
              alpha: m.alpha ?? alpha,
              llm: m.llm || null,
            });
          },
        }
      );
      setContent({
        answer: bufRef.current,
        similar: meta ? meta.similar || latestSimilar : latestSimilar,
        searchMode: meta?.searchMode || activeMode,
        alpha: meta?.alpha ?? alpha,
        llm: meta?.llm || null,
      });
    } catch (e) {
      setError(e.message || "실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="ai-explain-toolbar">
        <button className="btn ghost" onClick={() => run(searchMode)} disabled={loading}>
          {loading ? "AI 해설 생성 중..." : content ? "🔄 AI 해설 다시 생성" : "🤖 AI 해설 보기 (RAG)"}
        </button>
        <ModelSelect compact disabled={loading} />
        <div className="rag-mode-buttons compact">
          <button
            type="button"
            className={`rag-mode-btn ${searchMode === "hybrid" ? "active hybrid" : ""}`}
            onClick={() => setSearchMode("hybrid")}
            disabled={loading}
          >
            ⚡ Hybrid {topHybrid !== null && <strong>{topHybrid.toFixed(3)} ({(topHybrid * 100).toFixed(1)}%)</strong>}
          </button>
          <button
            type="button"
            className={`rag-mode-btn ${searchMode === "dense" ? "active dense" : ""}`}
            onClick={() => setSearchMode("dense")}
            disabled={loading}
          >
            🧠 Dense {topDense !== null && <strong>{topDense.toFixed(3)} ({(topDense * 100).toFixed(1)}%)</strong>}
          </button>
          <button
            type="button"
            className={`rag-mode-btn ${searchMode === "sparse" ? "active sparse" : ""}`}
            onClick={() => setSearchMode("sparse")}
            disabled={loading}
          >
            🔤 Sparse {topSparse !== null && <strong>{topSparse.toFixed(3)} ({(topSparse * 100).toFixed(1)}%)</strong>}
          </button>
        </div>
        <div className="rag-alpha-inline">
          <span className="small muted">
            Dense {Math.round(alpha * 100)}:{Math.round((1 - alpha) * 100)} Sparse
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            disabled={loading}
            className="rag-alpha-slider small"
          />
          {topHybrid !== null && (
            <span className="inline-hybrid-badge" title={`TOP 1 유사문제(#${topItem.no}번) 기준 Hybrid Score`}>
              🟣 Hybrid Score: <strong>{topHybrid.toFixed(3)}</strong> ({(topHybrid * 100).toFixed(1)}%)
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setShowChart((v) => !v)}
        >
          {showChart ? "📊 막대그래프 숨기기" : "📊 막대그래프 보기"}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
      {liveSimilar.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <ScoreBarChart
            items={liveSimilar}
            searchMode={searchMode}
            alpha={alpha}
            expanded={showChart}
            onToggle={() => setShowChart((v) => !v)}
            title="유사 근거 문제 검색 스코어 (Dense vs Sparse vs Hybrid)"
          />
        </div>
      )}
      {content && (
        <div className="ai-explain">
          <h4>🤖 AI 튜터 해설{content.llm && <span className="llm-tag"> · {content.llm.label}</span>}</h4>
          <div className="ai-answer">{content.answer || (loading ? "생성 중..." : "")}</div>
        </div>
      )}
    </div>
  );
}
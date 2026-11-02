import React, { useState } from "react";
import { openQuestion } from "../nav";

const MODE_LABELS = {
  hybrid: "Hybrid (Dense + Sparse 결합)",
  dense: "Dense (의미 임베딩 코사인 유사도)",
  sparse: "Sparse (BM25 키워드 매칭)",
};

function pct(val) {
  const n = Number(val) || 0;
  return Math.max(0, Math.min(100, n * 100));
}

export default function ScoreBarChart({ items, searchMode = "hybrid", alpha = 0.6, title }) {
  const [expanded, setExpanded] = useState(true);

  if (!items || items.length === 0) return null;

  const numAlpha = Number(alpha ?? 0.6);
  const denseWeightPct = Math.round(numAlpha * 100);
  const sparseWeightPct = 100 - denseWeightPct;
  const hasBelowThreshold = items.some((it) => it.belowThreshold);

  return (
    <div className="score-chart-box">
      <div className="score-chart-header">
        <div className="score-chart-title-wrap">
          <span className="score-chart-title">
            📊 {title || "RAG 검색 스코어 분석 (Dense vs Sparse vs Hybrid)"}
          </span>
          <span className={`score-mode-badge ${searchMode}`}>
            {MODE_LABELS[searchMode] || MODE_LABELS.hybrid}
            {searchMode === "hybrid" && ` (${denseWeightPct}:${sparseWeightPct})`}
          </span>
        </div>
        <button
          type="button"
          className="btn ghost small"
          style={{ padding: "4px 10px" }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "그래프 접기 ▲" : "그래프 펼치기 ▼"}
        </button>
      </div>

      {/* 검색 방식 및 Hybrid 스코어 산출 공식 안내 */}
      <div className="score-method-info">
        <div>
          <span className="legend-dot dense" /> <strong>Dense Search</strong>: Ollama{" "}
          <code>nomic-embed-text</code> 임베딩 벡터 코사인 유사도 (의미·문맥 유사성)
        </div>
        <div>
          <span className="legend-dot sparse" /> <strong>Sparse Search</strong>: <code>Okapi BM25</code>{" "}
          알고리즘 (한국어 어근 분리 + 2-gram 서브워드 역색인 키워드 매칭)
        </div>
        <div>
          <span className="legend-dot hybrid" /> <strong>Hybrid Score</strong>:{" "}
          <code>
            {numAlpha.toFixed(1)} × Dense + {(1 - numAlpha).toFixed(1)} × Sparse
          </code>{" "}
          (의미 유사도 {denseWeightPct}% + 키워드 정확도 {sparseWeightPct}% 결합)
        </div>
      </div>

      {hasBelowThreshold && (
        <div className="score-threshold-warn">
          ⚠️ 검색된 상위 후보들의 유사도가 RAG 기준치보다 낮아 답변 환각 방지를 위해 참고용 스코어만 표시합니다.
        </div>
      )}

      <div className="score-legend">
        <span className={`legend-item ${searchMode === "hybrid" ? "active" : ""}`}>
          <span className="legend-dot hybrid" />
          Hybrid 종합 점수 ({denseWeightPct}:{sparseWeightPct})
        </span>
        <span className={`legend-item ${searchMode === "dense" ? "active" : ""}`}>
          <span className="legend-dot dense" />
          Dense 점수 (Cosine)
        </span>
        <span className={`legend-item ${searchMode === "sparse" ? "active" : ""}`}>
          <span className="legend-dot sparse" />
          Sparse 점수 (BM25)
        </span>
      </div>

      {expanded && (
        <>
          {/* 1. 문항별 수직 막대그래프 (Grouped Vertical Bar Chart) */}
          <div className="vchart-wrap">
            <div className="vchart-grid">
              {[100, 75, 50, 25, 0].map((g) => (
                <div key={g} className="vchart-grid-line" style={{ bottom: `${g}%` }}>
                  <span>{g}%</span>
                </div>
              ))}
              <div className="vchart-columns">
                {items.map((item, idx) => {
                  const dScore = Number(item.denseScore ?? item.score ?? 0);
                  const sScore = Number(item.sparseScore ?? 0);
                  const hScore = Number(
                    item.hybridScore ?? numAlpha * dScore + (1 - numAlpha) * sScore
                  );
                  const hPct = pct(hScore);
                  const dPct = pct(dScore);
                  const sPct = pct(sScore);
                  return (
                    <div key={item.question_id || idx} className="vchart-col-group">
                      <div className="vchart-bars">
                        <div
                          className="vchart-bar-slot"
                          title={`Hybrid Score: ${hScore.toFixed(3)} (${hPct.toFixed(1)}%)`}
                        >
                          <div
                            className={`vchart-bar hybrid ${searchMode === "hybrid" ? "primary-bar" : ""}`}
                            style={{ height: `${Math.max(hPct, 4)}%` }}
                          >
                            <span className="vchart-val hybrid">
                              {hScore.toFixed(2)}
                              <small>({hPct.toFixed(0)}%)</small>
                            </span>
                          </div>
                        </div>
                        <div
                          className="vchart-bar-slot"
                          title={`Dense Score: ${dScore.toFixed(3)} (${dPct.toFixed(1)}%)`}
                        >
                          <div
                            className={`vchart-bar dense ${searchMode === "dense" ? "primary-bar" : ""}`}
                            style={{ height: `${Math.max(dPct, 4)}%` }}
                          >
                            <span className="vchart-val dense">
                              {dScore.toFixed(2)}
                              <small>({dPct.toFixed(0)}%)</small>
                            </span>
                          </div>
                        </div>
                        <div
                          className="vchart-bar-slot"
                          title={`Sparse Score: ${sScore.toFixed(3)} (${sPct.toFixed(1)}%)`}
                        >
                          <div
                            className={`vchart-bar sparse ${searchMode === "sparse" ? "primary-bar" : ""}`}
                            style={{ height: `${Math.max(sPct, 4)}%` }}
                          >
                            <span className="vchart-val sparse">
                              {sScore.toFixed(2)}
                              <small>({sPct.toFixed(0)}%)</small>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 수직 그래프 하단 문항 번호 및 3종 스코어 수치 요약 라벨 */}
            <div className="vchart-bottom-labels">
              {items.map((item, idx) => {
                const dScore = Number(item.denseScore ?? item.score ?? 0);
                const sScore = Number(item.sparseScore ?? 0);
                const hScore = Number(
                  item.hybridScore ?? numAlpha * dScore + (1 - numAlpha) * sScore
                );
                return (
                  <div key={item.question_id || idx} className="vchart-col-meta">
                    <button
                      type="button"
                      className="vchart-label-btn"
                      onClick={() => openQuestion(item.no)}
                      title={item.question || `${item.no}번 문제 열기`}
                    >
                      #{item.no}번 문제
                    </button>
                    <div className="vchart-mini-scores">
                      <span className="mini-score hybrid">
                        H: <strong>{hScore.toFixed(3)}</strong> ({pct(hScore).toFixed(1)}%)
                      </span>
                      <span className="mini-score dense">
                        D: <strong>{dScore.toFixed(3)}</strong> ({pct(dScore).toFixed(1)}%)
                      </span>
                      <span className="mini-score sparse">
                        S: <strong>{sScore.toFixed(3)}</strong> ({pct(sScore).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. 문항별 상세 수평 막대그래프 및 매칭 키워드 */}
          <div className="hchart-list">
            {items.map((item, idx) => {
              const dScore = Number(item.denseScore ?? item.score ?? 0);
              const sScore = Number(item.sparseScore ?? 0);
              const hScore = Number(
                item.hybridScore ?? numAlpha * dScore + (1 - numAlpha) * sScore
              );
              const hPct = pct(hScore);
              const dPct = pct(dScore);
              const sPct = pct(sScore);

              return (
                <div key={item.question_id || idx} className="hchart-card">
                  <div className="hchart-card-head">
                    <div className="hchart-q-info">
                      <span className="hchart-rank">TOP {idx + 1}</span>
                      <button
                        type="button"
                        className="chip hchart-q-btn"
                        onClick={() => openQuestion(item.no)}
                      >
                        {item.no}번 문제 보기 ↗
                      </button>
                      {item.question && (
                        <span className="hchart-q-text">
                          {item.question.length > 62 ? `${item.question.slice(0, 62)}...` : item.question}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 문항별 3대 스코어 배지 한눈에 표시 */}
                  <div className="hchart-score-badges">
                    <span className={`score-pill hybrid ${searchMode === "hybrid" ? "active" : ""}`}>
                      🟣 Hybrid Score: <strong>{hScore.toFixed(4)}</strong> ({hPct.toFixed(1)}%)
                    </span>
                    <span className={`score-pill dense ${searchMode === "dense" ? "active" : ""}`}>
                      🔵 Dense Score: <strong>{dScore.toFixed(4)}</strong> ({dPct.toFixed(1)}%)
                    </span>
                    <span className={`score-pill sparse ${searchMode === "sparse" ? "active" : ""}`}>
                      🟢 Sparse Score: <strong>{sScore.toFixed(4)}</strong> ({sPct.toFixed(1)}%)
                    </span>
                  </div>

                  {item.matchedKeywords && item.matchedKeywords.length > 0 && (
                    <div className="hchart-keywords">
                      <span className="muted small">Sparse 매칭 키워드:</span>
                      {item.matchedKeywords.map((kw) => (
                        <span key={kw} className="kw-tag">
                          {kw}
                        </span>
                      ))}
                      {typeof item.rawBm25 === "number" && item.rawBm25 > 0 && (
                        <span className="muted small" style={{ marginLeft: 4 }}>
                          (BM25 원점수: {item.rawBm25.toFixed(2)})
                        </span>
                      )}
                    </div>
                  )}

                  <div className="hchart-rows">
                    <div className={`hchart-row ${searchMode === "hybrid" ? "highlight" : ""}`}>
                      <span className="hchart-row-label">
                        <span className="legend-dot hybrid" /> Hybrid 종합
                      </span>
                      <div className="hchart-track">
                        <div className="hchart-fill hybrid" style={{ width: `${hPct}%` }} />
                      </div>
                      <span className="hchart-row-val hybrid">
                        <strong>{hScore.toFixed(3)}</strong> ({hPct.toFixed(1)}%)
                      </span>
                    </div>

                    <div className={`hchart-row ${searchMode === "dense" ? "highlight" : ""}`}>
                      <span className="hchart-row-label">
                        <span className="legend-dot dense" /> Dense 벡터
                      </span>
                      <div className="hchart-track">
                        <div className="hchart-fill dense" style={{ width: `${dPct}%` }} />
                      </div>
                      <span className="hchart-row-val dense">
                        <strong>{dScore.toFixed(3)}</strong> ({dPct.toFixed(1)}%)
                      </span>
                    </div>

                    <div className={`hchart-row ${searchMode === "sparse" ? "highlight" : ""}`}>
                      <span className="hchart-row-label">
                        <span className="legend-dot sparse" /> Sparse 키워드
                      </span>
                      <div className="hchart-track">
                        <div className="hchart-fill sparse" style={{ width: `${sPct}%` }} />
                      </div>
                      <span className="hchart-row-val sparse">
                        <strong>{sScore.toFixed(3)}</strong> ({sPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

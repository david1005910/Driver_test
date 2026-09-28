import React, { useEffect, useRef, useState } from "react";
import { get, post, postStream } from "../api";
import QuestionView from "../components/QuestionView.jsx";
import { onOpenQuestion } from "../nav";

const PAGE_SIZE = 10;

export default function Study() {
  const [type, setType] = useState("");
  const [multi, setMulti] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [type, multi]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const query = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (type) query.set("type", type);
    if (multi) query.set("multi", multi);
    get(`/questions?${query}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && alert(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, multi, page]);

  useEffect(() => {
    return onOpenQuestion(({ no }) => {
      get(`/questions/by-no/${no}`)
        .then((q) => setActive(q))
        .catch((e) => alert(e.message));
    });
  }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  async function handleAnswered(questionId, userAnswer, isCorrect) {
    try {
      await post(`/questions/${questionId}/answer`, { userAnswer, mode: "study" });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="page">
      <div className="filters">
        <label>
          유형
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">전체</option>
            <option value="text">문장형</option>
            <option value="image">이미지(사진/일러스트/표지)형</option>
          </select>
        </label>
        <label>
          정답수
          <select value={multi} onChange={(e) => setMulti(e.target.value)}>
            <option value="">전체</option>
            <option value="1">1답 (사지선다)</option>
            <option value="2">2답 (오지선다)</option>
          </select>
        </label>
        <span className="muted">
          {data ? `${data.total}문항` : "..."}
        </span>
      </div>

      {active ? (
        <div>
          <button className="btn ghost" onClick={() => setActive(null)}>
            ← 목록으로
          </button>
          <h2>문제 {active.no}번</h2>
          <QuestionView
            q={active}
            onAnswered={(ua, ic) => handleAnswered(active.id, ua, ic)}
            aiExplain={(id, wrong, onDelta) =>
              postStream("/rag/explain", { questionId: id, wrongAnswer: wrong, stream: true }, { onDelta })
            }
          />
        </div>
      ) : (
        <div className="q-list">
          {loading && <p className="muted">로딩 중...</p>}
          {!loading && data?.items.map((q) => (
            <div key={q.id} className="q-list-item">
              <div className="q-list-head">
                <button className="btn link" onClick={() => setActive(q)}>
                  {q.no}번 · {q.question.slice(0, 70)}
                </button>
                {q.answer.length > 1 && <span className="tag multi">복수정답</span>}
                {q.images.length > 0 && <span className="tag img">이미지</span>}
              </div>
            </div>
          ))}
          {!loading && data && (
            <div className="pager">
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← 이전
              </button>
              <span className="muted">
                {page} / {totalPages}
              </span>
              <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                다음 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
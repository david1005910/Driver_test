import React, { useEffect, useState } from "react";
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
  const [pendingPos, setPendingPos] = useState(null); // 'first' | 'last'

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
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (pendingPos && d.items && d.items.length > 0) {
          if (pendingPos === "first") setActive(d.items[0]);
          else if (pendingPos === "last") setActive(d.items[d.items.length - 1]);
          setPendingPos(null);
        }
      })
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

  const activeIndex = data && active ? data.items.findIndex((q) => q.id === active.id) : -1;
  const hasPrev = activeIndex > 0 || page > 1;
  const hasNext = (data && activeIndex >= 0 && activeIndex < data.items.length - 1) || page < totalPages;

  function goPrev() {
    if (!data || activeIndex === -1) return;
    if (activeIndex > 0) {
      setActive(data.items[activeIndex - 1]);
    } else if (page > 1) {
      setPendingPos("last");
      setPage((p) => p - 1);
    }
  }

  function goNext() {
    if (!data || activeIndex === -1) return;
    if (activeIndex < data.items.length - 1) {
      setActive(data.items[activeIndex + 1]);
    } else if (page < totalPages) {
      setPendingPos("first");
      setPage((p) => p + 1);
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button className="btn ghost" onClick={() => setActive(null)}>
              ← 목록으로
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={goPrev} disabled={!hasPrev}>
                ← 이전 문제
              </button>
              <button className="btn primary" onClick={goNext} disabled={!hasNext}>
                다음 문제 →
              </button>
            </div>
          </div>
          <h2>문제 {active.no}번</h2>
          <QuestionView
            key={active.id}
            q={active}
            onAnswered={(ua, ic) => handleAnswered(active.id, ua, ic)}
            aiExplain={(id, wrong, onDelta) =>
              postStream("/rag/explain", { questionId: id, wrongAnswer: wrong, stream: true }, { onDelta })
            }
            onNext={goNext}
            onPrev={goPrev}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onBack={() => setActive(null)}
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
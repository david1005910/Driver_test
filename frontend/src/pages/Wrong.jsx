import React, { useEffect, useState } from "react";
import { del, get, post, postStream } from "../api";
import QuestionView from "../components/QuestionView.jsx";

export default function Wrong() {
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState(null);

  function load() {
    get("/wrong").then(setItems).catch((e) => alert(e.message));
  }
  useEffect(load, []);

  function next() {
    if (!items || !active) return;
    const idx = items.items.findIndex((q) => q.id === active.id);
    const next = items.items[idx + 1];
    setNotice(null);
    if (next) setActive(next);
    else setActive(null);
  }

  async function handleAnswered(questionId, questionNo, userAnswer, isCorrect) {
    try {
      await post(`/questions/${questionId}/answer`, { userAnswer, mode: "restudy" });
      if (isCorrect) {
        await del(`/wrong/${questionId}`);
      }
      const fresh = await get("/wrong");
      setItems(fresh);
      if (isCorrect) {
        setNotice(`✅ ${questionNo}번 다시 맞혔어요! 오답노트에서 제거됨.`);
        setActive(fresh.items.length ? fresh.items[0] : null);
      } else {
        const freshActive = fresh.items.find((q) => q.id === questionId);
        if (freshActive) setActive(freshActive);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function backToList() {
    setActive(null);
    setNotice(null);
  }

  if (active) {
    return (
      <div className="page">
        <div className="wrong-top">
          <button className="btn ghost" onClick={backToList}>
            ← 오답노트
          </button>
          <button className="btn" onClick={next}>
            다음 문제 →
          </button>
        </div>
        {notice && <div className="notice ok">{notice}</div>}
        <div className="muted" style={{ margin: "8px 0" }}>
          {active.no}번 · 지금까지 {active.wrong_count}회 틀렸어요. 다시 맞히면 노트에서 제거됩니다.
        </div>
        <QuestionView
          q={active}
          showAnswer
          onAnswered={(ua, ic) => handleAnswered(active.id, active.no, ua, ic)}
          aiExplain={(id, wrong, onDelta) =>
                postStream("/rag/explain", { questionId: id, wrongAnswer: wrong, stream: true }, { onDelta })
              }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <h2>오답노트</h2>
      {notice && <div className="notice ok">{notice}</div>}
      {!items ? (
        <p className="muted">로딩 중...</p>
      ) : items.items.length === 0 ? (
        <div className="empty">
          <p>🎉 틀린 문제가 없습니다.</p>
          <p className="muted">전체 학습이나 모의고사를 풀어 오답을 쌓아보세요.</p>
        </div>
      ) : (
        <div className="q-list">
          {items.items.map((q) => (
            <div key={q.id} className="q-list-item">
              <div className="q-list-head">
                <button className="btn link" onClick={() => setActive(q)}>
                  {q.no}번 · {q.question.slice(0, 70)}
                </button>
                <span className="tag warn">{q.wrong_count}회 틀림</span>
              </div>
              <div className="muted small">총 {q.solved_count}회 풀이</div>
            </div>
          ))}
          <p className="muted small">* 문제 풀이 시 정답 여부에 따라 자동으로 등록/관리됩니다.</p>
        </div>
      )}
    </div>
  );
}
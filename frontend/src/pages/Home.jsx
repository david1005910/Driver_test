import React, { useEffect, useState } from "react";
import { get } from "../api";

export default function Home({ goTo }) {
  const [stats, setStats] = useState(null);
  const [rag, setRag] = useState(null);

  useEffect(() => {
    get("/stats")
      .then(setStats)
      .catch((e) => console.error(e));
    get("/rag/status")
      .then(setRag)
      .catch(() => setRag({ ollama: false, embedded: 0 }));
  }, []);

  const cards = stats
    ? [
        { label: "총 문항", value: stats.total_questions, color: "blue" },
        { label: "풀이 횟수", value: stats.attempts, color: "green" },
        { label: "정답률", value: `${stats.accuracy}%`, color: "purple" },
        { label: "오답 문항", value: stats.wrong_questions, color: "red" },
        { label: "최근 7일 정답률", value: `${stats.recent7d.accuracy}%`, color: "teal" },
      ]
    : [];

  const ragReady = rag && rag.ollama && rag.embedded === rag.total_questions;

  return (
    <div className="page">
      <section>
        <h2>학습 현황</h2>
        {!stats ? (
          <p className="muted">로딩 중...</p>
        ) : (
          <div className="stat-cards">
            {cards.map((c) => (
              <div key={c.label} className={`stat-card ${c.color}`}>
                <div className="stat-value">{c.value}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>빠른 시작</h2>
        <div className="quick-grid">
          <button className="quick-card" onClick={() => (window.location.hash = "quiz")}>
            <span className="quick-icon">📝</span>
            <strong>40문제 모의고사</strong>
            <span>실전과 동일 · 40분 · 합격컷 60/70점</span>
          </button>
          <button className="quick-card" onClick={() => (window.location.hash = "study")}>
            <span className="quick-icon">📚</span>
            <strong>전체 학습</strong>
            <span>999문항 · 유형/난이도 필터</span>
          </button>
          <button className="quick-card" onClick={() => (window.location.hash = "wrong")}>
            <span className="quick-icon">✨</span>
            <strong>오답 재학습</strong>
            <span>틀린 문제만 다시 풀기</span>
          </button>
          <button className="quick-card" onClick={() => (window.location.hash = "ai")}>
            <span className="quick-icon">🤖</span>
            <strong>AI 튜터</strong>
            <span>RAG 기반 해설 · 유사문제 추천</span>
          </button>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>RAG 시스템 상태</h2>
        <div className="rag-status">
          <span className={`badge ${ragReady ? "ok" : rag?.ollama ? "warn" : "bad"}`}>
            {ragReady ? "AI 튜터 사용 가능" : rag?.ollama ? "임베딩 구축 필요" : "Ollama 미연결"}
          </span>
          <span className="muted">
            {rag ? `${rag.embedded}/${rag.total_questions} 문항 임베딩 · ${rag.ollama ? "Ollama 연결됨" : "Ollama 연결 안됨"}` : "상태 확인 중..."}
          </span>
        </div>
      </section>

      {stats && stats.weak_top5.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2>자주 틀리는 문제 TOP 5</h2>
          <div className="weak-list">
            {stats.weak_top5.map((q) => (
              <div key={q.id} className="weak-item">
                <span className="weak-count">{q.wrong_count}회 틀림</span>
                <span>{q.no}번 · {q.question.slice(0, 60)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
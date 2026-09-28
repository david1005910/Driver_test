import React, { useEffect, useState } from "react";
import { postStream } from "../api";
import { openQuestion } from "../nav";

export default function AITutor() {
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim() || loading) return;
    const q = query;
    setLoading(true);
    setChat((c) => [...c, { role: "user", text: q }, { role: "ai", text: "", similar: null }]);
    setQuery("");
    let acc = "";
    try {
      const meta = await postStream(
        "/rag/ask",
        { query: q, stream: true },
        {
          onDelta: (t) => {
            acc += t;
            setChat((c) => [...c.slice(0, -1), { role: "ai", text: acc, similar: null }]);
          },
        }
      );
      setChat((c) => [...c.slice(0, -1), { role: "ai", text: acc, similar: meta.similar }]);
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
    "보행자 보호 의무 요약 해줘",
  ];

  return (
    <div className="page">
      <h2>🤖 AI 튜터</h2>
      <p className="muted">
        문제은행의 999문항을 임베딩해 유사문제를 검색하고 근거를 바탕으로 답변합니다.
      </p>

      <div className="chat-box">
        <div className="chat-log">
          {chat.length === 0 && (
            <div className="chat-empty">
              <p>무엇이든 물어보세요. 예:</p>
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
                <div className="msg-sources small">
                  <span className="muted">근거 문제: </span>
                  {m.similar.map((s) => (
                    <button key={s.question_id} className="chip" onClick={() => openQuestion(s.no)}>
                      {s.no}번
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            value={query}
            placeholder="운전면허 관련 질문 입력..."
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button className="btn primary" onClick={ask} disabled={loading || !query.trim()}>
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
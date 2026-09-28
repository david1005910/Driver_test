import React, { useRef, useState } from "react";
import { imageUrl } from "../api";
import { openQuestion } from "../nav";

export default function QuestionView({
  q: item,
  showAnswer,
  onAnswered,
  aiExplain,
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
    </div>
  );
}

function AIExplain({ id, wrongAnswer, explainer }) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const bufRef = useRef("");

  async function run() {
    setLoading(true);
    setError(null);
    setContent(null);
    bufRef.current = "";
    try {
      const meta = await explainer(id, wrongAnswer, (chunk) => {
        bufRef.current += chunk;
        setContent({ answer: bufRef.current, similar: null });
      });
      setContent({ answer: bufRef.current, similar: meta ? meta.similar : null });
    } catch (e) {
      setError(e.message || "실패");
    } finally {
      setLoading(false);
    }
  }

  if (content) {
    return (
      <div className="ai-explain">
        <h4>🤖 AI 튜터 해설</h4>
        {error && <div className="error-text">{error}</div>}
        <div className="ai-answer">{content.answer || (loading ? "생성 중..." : "")}</div>
        {content.similar && content.similar.length > 0 && (
          <div className="ai-similar">
            <strong>함께 복습하면 좋은 문제:</strong>{" "}
            {content.similar.map((s) => (
              <button key={s.question_id} className="chip" onClick={() => openQuestion(s.no)}>
                {s.no}번
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <button className="btn ghost" onClick={run} disabled={loading}>
        {loading ? "AI 해설 생성 중..." : "🤖 AI 해설 보기 (RAG)"}
      </button>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
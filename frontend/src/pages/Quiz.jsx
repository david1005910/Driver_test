import React, { useEffect, useMemo, useRef, useState } from "react";
import { get, post } from "../api";
import QuestionView from "../components/QuestionView.jsx";

const DURATION = 40 * 60; // 40분

export default function Quiz() {
  const [license, setLicense] = useState(2);
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState({}); // qid -> [idx]
  const [saved, setSaved] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!paper) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => (t <= 0 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [paper]);

  useEffect(() => {
    if (timeLeft === 0 && paper && !saved) {
      submit();
    }
  }, [timeLeft]);

  function start() {
    setPaper(null);
    setAnswers({});
    setSaved(false);
    setTimeLeft(DURATION);
    get(`/exam/paper?license=${license}&count=40`).then(setPaper).catch((e) => alert(e.message));
  }

  function setAnswer(qid, idx) {
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      const q = paper.items.find((i) => i.id === qid);
      const multi = q && q.answer && q.answer.length > 1;
      if (multi) {
        return { ...prev, [qid]: cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx].sort((a, b) => a - b) };
      }
      return { ...prev, [qid]: [idx] };
    });
  }

  async function submit() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSaved(true);
    const body = {
      license,
      answers: Object.entries(answers).map(([question_id, user_answer]) => ({
        question_id: Number(question_id),
        user_answer,
      })),
    };
    try {
      const result = await post("/exam/grade", body);
      setResult(result);
    } catch (e) {
      alert(e.message);
      setSaved(false);
    }
  }

  const [result, setResult] = useState(null);
  const answeredCount = Object.keys(answers).length;
  const mm = Math.floor(timeLeft / 60);
  const ss = timeLeft % 60;

  if (!paper) {
    return (
      <div className="page">
        <h2>모의고사 (40문항 · 40분)</h2>
        <div className="quiz-setup">
          <label>
            면허 종류
            <select value={license} onChange={(e) => setLicense(Number(e.target.value))}>
              <option value={1}>1종 보통 (합격 70점)</option>
              <option value={2}>2종 보통 (합격 60점)</option>
            </select>
          </label>
          <p className="muted">
            실제 학과시험과 동일하게 100점 만점 기준으로 40문항이 출제됩니다.
          </p>
          <button className="btn primary big" onClick={start}>
            시험 시작
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page">
        <h2>채점 결과</h2>
        <div className={`result-big ${result.passed ? "pass" : "fail"}`}>
          <div className="rb-score">{result.score}점</div>
          <div className={`rb-label`}>{result.passed ? "합격 🎉" : "아쉬워요, 재도전!"}</div>
          <div className="muted">
            {result.total}문항 중 {result.correct}개 정답 · 합격 기준 {result.pass_score}점
          </div>
        </div>
        <button className="btn primary" onClick={() => { setPaper(null); window.location.hash = "wrong"; }}>
          오답노트에서 다시 학습하기
        </button>
        <button className="btn" onClick={() => setPaper(null)}>
          다시 도전
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="quiz-header">
        <span className="quiz-license">제{license === 1 ? "1종 보통" : "2종 보통"} · 40문제</span>
        <span className={`timer ${timeLeft < 300 ? "danger" : ""}`}>
          ⏱ {mm}:{ss.toString().padStart(2, "0")}
        </span>
        <span className="muted">{answeredCount}/40 답안</span>
      </div>

      <div className="nav-grid">
        {paper.items.map((q, i) => {
          const done = answers[q.id] && answers[q.id].length > 0;
          return (
            <button
              key={q.id}
              className={`nav-cell ${done ? "done" : ""}`}
              onClick={() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="q-panels">
        {paper.items.map((q, i) => {
          const sel = answers[q.id] || [];
          const circles = "①②③④⑤⑥";
          return (
            <div key={q.id} id={`q-${q.id}`} className="quiz-q">
              <div className="quiz-q-head">
                <span className="q-no">문제 {i + 1} · {q.no}번</span>
                {q.images && q.images.length > 0 && <span className="tag img">이미지문제</span>}
              </div>
              {q.images && q.images.length > 0 && (
                <div className="q-images">
                  {q.images.map((im) => (
                    <img key={im} src={`/images/${im}`} alt="문제 이미지" className="q-img" loading="lazy" />
                  ))}
                </div>
              )}
              <div className="q-text">{q.question}</div>
              <div className="opts">
                {q.options.map((opt, j) => {
                  const idx = j + 1;
                  const isSel = sel.includes(idx);
                  return (
                    <button
                      key={j}
                      className={`opt ${isSel ? "sel" : ""}`}
                      onClick={() => setAnswer(q.id, idx)}
                    >
                      <span className="opt-circle">{circles[j]}</span>
                      <span className="opt-text">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="quiz-submit-bar">
        <button className="btn primary big" onClick={submit} disabled={saved}>
          시험 제출 및 채점
        </button>
      </div>
    </div>
  );
}
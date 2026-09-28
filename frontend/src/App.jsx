import React, { useEffect, useState } from "react";
import Home from "./pages/Home.jsx";
import Study from "./pages/Study.jsx";
import Quiz from "./pages/Quiz.jsx";
import Wrong from "./pages/Wrong.jsx";
import AITutor from "./pages/AITutor.jsx";
import { onOpenQuestion } from "./nav.js";

const TABS = [
  { id: "home", label: "대시보드" },
  { id: "study", label: "전체 학습" },
  { id: "quiz", label: "모의고사" },
  { id: "wrong", label: "오답노트" },
  { id: "ai", label: "AI 튜터" },
];

export default function App() {
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return TABS.some((t) => t.id === h) ? h : "home";
  });

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  useEffect(() => {
    return onOpenQuestion(() => setTab("study"));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">🚗</span>
          <div>
            <h1>운전면허 필기시험</h1>
            <p>도로교통공단 문제은행 기반 학습 · 오답 재학습 · AI 튜터</p>
          </div>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === "home" && <Home />}
        {tab === "study" && <Study />}
        {tab === "quiz" && <Quiz />}
        {tab === "wrong" && <Wrong />}
        {tab === "ai" && <AITutor />}
      </main>
      <footer className="footer">
        출처: 한국도로교통공단 자동차 운전면허 학과시험 문제은행 (2026-03-09 시행) · 공공데이터포털 자료 활용
      </footer>
    </div>
  );
}
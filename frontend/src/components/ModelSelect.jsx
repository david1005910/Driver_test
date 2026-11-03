import React, { useEffect, useState, useSyncExternalStore } from "react";
import { get } from "../api";
import { getLlmChoice, setLlmChoice, subscribeLlmChoice } from "../llmChoice";

let modelsPromise = null;
function loadModels() {
  if (!modelsPromise) {
    modelsPromise = get("/rag/models").catch((e) => {
      modelsPromise = null;
      throw e;
    });
  }
  return modelsPromise;
}

// AI 답변 모델 선택 (FreeLLMAPI 클라우드 / 로컬 Ollama 모델)
export default function ModelSelect({ disabled, compact }) {
  const [data, setData] = useState(null);
  const choice = useSyncExternalStore(subscribeLlmChoice, getLlmChoice);

  useEffect(() => {
    let alive = true;
    loadModels()
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || !data.options.length) return null;

  const usable = (id) => data.options.some((o) => o.id === id && o.available);
  const value = usable(choice) ? choice : data.default;
  const selected = data.options.find((o) => o.id === value);

  return (
    <label className={`model-select ${compact ? "compact" : ""}`}>
      <span className="rag-control-label">답변 모델:</span>
      <select value={value} onChange={(e) => setLlmChoice(e.target.value)} disabled={disabled}>
        {data.options.map((o) => (
          <option key={o.id} value={o.id} disabled={!o.available}>
            {o.label}
            {o.available ? "" : " — 미설치"}
          </option>
        ))}
      </select>
      {selected && selected.provider === "ollama" && (
        <span className="small muted">로컬 모델은 이 PC에서 답변까지 수 분 걸릴 수 있어요</span>
      )}
    </label>
  );
}

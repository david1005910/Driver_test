// 앱 전체에서 공유하는 답변 모델(LLM) 선택값. 브라우저에 기억해 새로고침 후에도 유지
const STORAGE_KEY = "llmChoice";
const listeners = new Set();

let current = null;
try {
  current = window.localStorage.getItem(STORAGE_KEY);
} catch (e) {}

export function getLlmChoice() {
  return current;
}

export function setLlmChoice(id) {
  current = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {}
  listeners.forEach((l) => l());
}

export function subscribeLlmChoice(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

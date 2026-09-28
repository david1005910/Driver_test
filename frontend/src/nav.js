export const OPEN_QUESTION_EVENT = "open-question";

export function openQuestion(no) {
  window.dispatchEvent(new CustomEvent(OPEN_QUESTION_EVENT, { detail: { no } }));
}

export function onOpenQuestion(cb) {
  const handler = (e) => cb(e.detail);
  window.addEventListener(OPEN_QUESTION_EVENT, handler);
  return () => window.removeEventListener(OPEN_QUESTION_EVENT, handler);
}
const { Agent } = require("undici");
const config = require("../config");

// 저사양 PC에서 로컬 모델은 첫 토큰까지(프롬프트 처리) 5분 이상 걸릴 수 있어
// Node fetch 기본 headersTimeout(300초)을 해제한다
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

async function fetchJson(path, body) {
  const url = `${config.ollama.baseUrl}${path}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    dispatcher,
  });
  if (!res.ok) {
    throw new Error(`ollama ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function embed(text) {
  const data = await fetchJson("/api/embed", {
    model: config.ollama.embedModel,
    input: text,
    truncate: false,
  });
  return data.embeddings && data.embeddings[0];
}

async function isAvailable() {
  try {
    const data = await fetchJson("/api/tags");
    return (data.models || []).some((m) => m.name === config.ollama.embedModel || m.name.startsWith(config.ollama.embedModel.split(":")[0]));
  } catch (e) {
    return false;
  }
}

// 설치된 모델 이름 목록 (모델 선택 화면의 설치 여부 표시용)
async function listModels() {
  const data = await fetchJson("/api/tags");
  return (data.models || []).map((m) => m.name);
}

async function generate({ prompt, system, stream, model, options = {} }) {
  return fetchJson("/api/chat", {
    model: model || config.ollama.chatModel,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    stream: stream || false,
    keep_alive: config.ollama.keepAlive,
    options: { temperature: 0.0, top_p: 0.1, repeat_penalty: 1.2, ...options },
  });
}

async function generateStream({ prompt, system, model, options = {} }) {
  const url = `${config.ollama.baseUrl}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || config.ollama.chatModel,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      stream: true,
      keep_alive: config.ollama.keepAlive,
      options: { temperature: 0.0, top_p: 0.1, repeat_penalty: 1.2, ...options },
    }),
    dispatcher,
  });
  if (!res.ok) {
    throw new Error(`ollama /api/chat failed: ${res.status} ${await res.text()}`);
  }
  return res.body.getReader();
}

module.exports = { embed, generate, generateStream, isAvailable, listModels, fetchJson };
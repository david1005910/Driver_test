const config = require("../config");
const { generate, generateStream, listModels } = require("./ollama");

// LLM 채팅 공급자 추상화: "ollama"(기본) 또는 "openai"(FreeLLMAPI 등 OpenAI 호환 /v1 엔드포인트)
// 임베딩은 저장된 벡터와 호환되도록 항상 Ollama(nomic-embed-text)를 사용한다.

function buildMessages(prompt, system) {
  return [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
}

// 선택 가능한 채팅 모델 목록. id는 화면 ↔ API 간 선택값으로 사용
function staticOptions() {
  const options = [];
  if (config.llm.apiKey) {
    for (const m of [...new Set([config.llm.model, ...config.llm.models])]) {
      options.push({
        id: `freellmapi:${m}`,
        label: `${m} (FreeLLMAPI)`,
        provider: "openai",
        model: m,
        maxTokens: config.llm.numPredict,
        contextItems: config.llm.contextItems,
      });
    }
  }
  const ollamaModels = [...new Set([config.ollama.chatModel, ...config.llm.ollamaModels])];
  for (const m of ollamaModels) {
    options.push({
      id: `ollama:${m}`,
      label: `${m} (로컬 Ollama)`,
      provider: "ollama",
      model: m,
      maxTokens: config.ollama.numPredict,
      contextItems: config.ollama.contextItems,
    });
  }
  return options;
}

function defaultId() {
  return config.llm.provider === "openai" && config.llm.apiKey
    ? `freellmapi:${config.llm.model}`
    : `ollama:${config.ollama.chatModel}`;
}

// 허용 목록에 있는 id만 받아들이고, 없거나 모르는 값이면 기본 모델 사용
function resolveTarget(id) {
  const options = staticOptions();
  return options.find((o) => o.id === id) || options.find((o) => o.id === defaultId());
}

async function listOptions() {
  const installed = await listModels().catch(() => []);
  const isInstalled = (m) => installed.some((n) => n === m || n === `${m}:latest`);
  return {
    default: defaultId(),
    options: staticOptions().map(({ id, label, provider, model }) => ({
      id,
      label,
      provider,
      model,
      available: provider === "openai" ? true : isInstalled(model),
    })),
  };
}

function openaiBody({ prompt, system, maxTokens, stream, model }) {
  return {
    model,
    messages: buildMessages(prompt, system),
    stream,
    temperature: 0,
    top_p: 0.1,
    max_tokens: maxTokens,
  };
}

async function openaiFetch(body) {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`llm /chat/completions failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

// 줄 단위 스트림 파서: 청크 경계에서 잘린 줄은 다음 청크와 합쳐 처리하고, 종료 후 남은 조각도 반영
async function readLines(reader, onLine) {
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line && onLine(line) === false) return;
    }
  }
  const tail = (buf + decoder.decode()).trim();
  if (tail) onLine(tail);
}

async function chat({ prompt, system, target }) {
  const t = target || resolveTarget();
  if (t.provider === "openai") {
    const res = await openaiFetch(openaiBody({ prompt, system, maxTokens: t.maxTokens, stream: false, model: t.model }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
  const res = await generate({ prompt, system, model: t.model, options: { num_predict: t.maxTokens } });
  return res.message ? res.message.content : "";
}

async function chatStream({ prompt, system, target }, onDelta) {
  const t = target || resolveTarget();
  if (t.provider === "openai") {
    const res = await openaiFetch(openaiBody({ prompt, system, maxTokens: t.maxTokens, stream: true, model: t.model }));
    await readLines(res.body.getReader(), (line) => {
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return false;
      try {
        const content = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch (e) {}
    });
    return;
  }
  const reader = await generateStream({ prompt, system, model: t.model, options: { num_predict: t.maxTokens } });
  await readLines(reader, (line) => {
    try {
      const data = JSON.parse(line);
      if (data.message && data.message.content) onDelta(data.message.content);
      if (data.done) return false;
    } catch (e) {}
  });
}

function describe() {
  const t = resolveTarget();
  return {
    id: t.id,
    provider: t.provider,
    baseUrl: t.provider === "openai" ? config.llm.baseUrl : config.ollama.baseUrl,
    model: t.model,
  };
}

module.exports = { chat, chatStream, describe, resolveTarget, listOptions };

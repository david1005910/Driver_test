const config = require("../config");
const { generate, generateStream } = require("./ollama");

// LLM 채팅 공급자 추상화: "ollama"(기본) 또는 "openai"(FreeLLMAPI 등 OpenAI 호환 /v1 엔드포인트)
// 임베딩은 저장된 벡터와 호환되도록 항상 Ollama(nomic-embed-text)를 사용한다.

function buildMessages(prompt, system) {
  return [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
}

function openaiBody({ prompt, system, maxTokens, stream }) {
  return {
    model: config.llm.model,
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

async function chat({ prompt, system, maxTokens }) {
  if (config.llm.provider === "openai") {
    const res = await openaiFetch(openaiBody({ prompt, system, maxTokens, stream: false }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
  const res = await generate({ prompt, system, options: { num_predict: maxTokens } });
  return res.message ? res.message.content : "";
}

async function chatStream({ prompt, system, maxTokens }, onDelta) {
  if (config.llm.provider === "openai") {
    const res = await openaiFetch(openaiBody({ prompt, system, maxTokens, stream: true }));
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
  const reader = await generateStream({ prompt, system, options: { num_predict: maxTokens } });
  await readLines(reader, (line) => {
    try {
      const data = JSON.parse(line);
      if (data.message && data.message.content) onDelta(data.message.content);
      if (data.done) return false;
    } catch (e) {}
  });
}

function describe() {
  return config.llm.provider === "openai"
    ? { provider: "openai", baseUrl: config.llm.baseUrl, model: config.llm.model }
    : { provider: "ollama", baseUrl: config.ollama.baseUrl, model: config.ollama.chatModel };
}

module.exports = { chat, chatStream, describe };

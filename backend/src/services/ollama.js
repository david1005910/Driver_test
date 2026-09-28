const config = require("../config");

async function fetchJson(path, body) {
  const url = `${config.ollama.baseUrl}${path}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
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

async function generate({ prompt, system, stream, options = {} }) {
  return fetchJson("/api/chat", {
    model: config.ollama.chatModel,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    stream: stream || false,
    options: { temperature: 0.0, top_p: 0.9, repeat_penalty: 1.1, ...options },
  });
}

async function generateStream({ prompt, system, options = {} }) {
  const url = `${config.ollama.baseUrl}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollama.chatModel,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      stream: true,
      options: { temperature: 0.0, top_p: 0.9, repeat_penalty: 1.1, ...options },
    }),
  });
  if (!res.ok) {
    throw new Error(`ollama /api/chat failed: ${res.status} ${await res.text()}`);
  }
  return res.body.getReader();
}

module.exports = { embed, generate, generateStream, isAvailable, fetchJson };
const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (e) {}
    throw new Error(body?.message || body?.error || `${res.status}`);
  }
  return res.json();
}

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
export const del = (path) => request(path, { method: "DELETE" });

export function postStream(path, body, handlers = {}) {
  const { onDelta } = handlers;
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) {
      let errBody = null;
      try {
        errBody = await res.json();
      } catch (e) {}
      throw new Error(errBody?.message || errBody?.error || `${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let meta = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const event = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!event.startsWith("data:")) continue;
        let payload;
        try {
          payload = JSON.parse(event.slice(5).trim());
        } catch (e) {
          continue;
        }
        if (payload.type === "delta" && onDelta) onDelta(payload.content);
        else if (payload.type === "done") meta = payload;
        else if (payload.type === "error") throw new Error(payload.message);
      }
    }
    return { similar: meta ? meta.similar : null };
  });
}

export const imageUrl = (name) => `/images/${name}`;
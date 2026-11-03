require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "driver",
    password: process.env.DB_PASSWORD || "driver_dev_pass",
    database: process.env.DB_NAME || "driver_exam",
  },
  ollama: {
    baseUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    embedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
    chatModel: process.env.OLLAMA_CHAT_MODEL || "qwen2.5:3b",
    numPredict: Number(process.env.OLLAMA_NUM_PREDICT || 800),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || "5m",
    contextItems: Number(process.env.OLLAMA_CONTEXT_ITEMS || 4),
  },
  // 채팅 LLM 공급자: ollama(기본) | openai (FreeLLMAPI 등 OpenAI 호환 엔드포인트)
  llm: {
    provider: process.env.LLM_PROVIDER || "ollama",
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:3001/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "auto",
  },
  data: {
    bankJson: process.env.BANK_JSON || "/app/data/bank.json",
    imagesDir: process.env.IMAGES_DIR || "/app/data/images",
  },
};
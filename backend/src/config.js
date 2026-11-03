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
    // 화면에서 선택 가능한 FreeLLMAPI 모델 목록 (LLM_MODEL은 항상 포함)
    models: (process.env.LLM_MODELS || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    // 클라우드 LLM 응답 길이·근거 문항 수 (로컬 Ollama는 OLLAMA_NUM_PREDICT/OLLAMA_CONTEXT_ITEMS)
    numPredict: Number(process.env.LLM_NUM_PREDICT || 800),
    contextItems: Number(process.env.LLM_CONTEXT_ITEMS || 4),
    // 화면에서 선택 가능한 로컬 Ollama 채팅 모델 목록
    ollamaModels: (process.env.LLM_OLLAMA_MODELS || "qwen2.5:3b,qwen2.5:1.5b,openbmb/minicpm-v4")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  },
  data: {
    bankJson: process.env.BANK_JSON || "/app/data/bank.json",
    imagesDir: process.env.IMAGES_DIR || "/app/data/images",
  },
};
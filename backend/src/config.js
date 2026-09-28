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
  },
  data: {
    bankJson: process.env.BANK_JSON || "/app/data/bank.json",
    imagesDir: process.env.IMAGES_DIR || "/app/data/images",
  },
};
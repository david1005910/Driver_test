const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const { initDb } = require("./db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/images", express.static(config.data.imagesDir));

app.use("/api/questions", require("./routes/questions"));
app.use("/api/wrong", require("./routes/wrong"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/exam", require("./routes/exam"));
app.use("/api/rag", require("./routes/rag"));

app.get("/api/health", async (req, res) => {
  try {
    const pool = require("./db").getPool();
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", detail: err.message });
  }
});

const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

async function start() {
  try {
    await initDb();
    console.log("[db] MySQL connected");
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    console.error("[db] retrying in 5s...");
    setTimeout(start, 5000);
    return;
  }
  app.listen(config.port, () => {
    console.log(`Driver Test API listening on http://0.0.0.0:${config.port}`);
  });
}

start();
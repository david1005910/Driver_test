require("dotenv").config();
const config = require("../config");
const { initDb, getPool } = require("../db");
const { buildEmbedding, count } = require("../services/embedService");

async function main() {
  await initDb();
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, no, question, options, answer, explanation, images FROM questions ORDER BY no"
  );
  console.log(`total questions to embed: ${rows.length}`);

  let done = 0;
  let skipped = 0;
  for (const r of rows) {
    const q = {
      id: r.id,
      no: r.no,
      question: r.question,
      options: JSON.parse(r.options),
      answer: JSON.parse(r.answer),
      explanation: r.explanation,
      images: r.images ? JSON.parse(r.images) : [],
    };
    await buildEmbedding(q);
    done++;
    if (done % 50 === 0) console.log(`embedded ${done}/${rows.length}`);
  }
  console.log(`embedding done: ${done} (skipped ${skipped}), total in db: ${await count()}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
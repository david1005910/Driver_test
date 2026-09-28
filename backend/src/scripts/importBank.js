require("dotenv").config();
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { initDb, getPool } = require("../db");

async function main() {
  const bankPath = config.data.bankJson;
  if (!fs.existsSync(bankPath)) {
    console.error(`bank.json not found: ${bankPath}`);
    process.exit(1);
  }
  const bank = JSON.parse(fs.readFileSync(bankPath, "utf-8"));
  await initDb();
  const pool = getPool();

  let inserted = 0;
  let updated = 0;
  for (const q of bank.questions) {
    const images = q.images || [];
    const imageType = images.length > 0;
    const multi = q.answer.length > 1;
    const qType = imageType ? (multi ? "image-multi" : "image-single") : multi ? "text-multi" : "text-single";

    const [r] = await pool.query(
      `INSERT INTO questions (no, question, options, answer, explanation, images, question_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         question = VALUES(question),
         options = VALUES(options),
         answer = VALUES(answer),
         explanation = VALUES(explanation),
         images = VALUES(images),
         question_type = VALUES(question_type)`,
      [
        q.no,
        q.question,
        JSON.stringify(q.options),
        JSON.stringify(q.answer),
        q.explanation || null,
        JSON.stringify(images),
        qType,
      ]
    );
    if (r.affectedRows === 1) inserted++;
    else updated++;
  }
  const [[{ c }]] = await pool.query("SELECT COUNT(*) AS c FROM questions");
  console.log(`import done: ${inserted} inserted, ${updated} updated (total ${c})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
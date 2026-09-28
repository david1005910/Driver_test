require("dotenv").config();
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { initDb, getPool } = require("../db");

async function main() {
  await initDb();
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, no, question, images, explanation FROM questions ORDER BY no"
  );

  const imagesDir = config.data.imagesDir;
  const filesOnDisk = new Set(fs.readdirSync(imagesDir));

  const missingExplanation = [];
  const missingImageFiles = [];
  const dupRefs = [];
  const referencedFiles = new Set();
  let totalImageRefs = 0;

  for (const r of rows) {
    const images = r.images ? JSON.parse(r.images) : [];
    totalImageRefs += images.length;

    if (!r.explanation || !r.explanation.trim()) {
      missingExplanation.push(r.no);
    }

    const seenInQuestion = new Set();
    for (const img of images) {
      referencedFiles.add(img);
      if (seenInQuestion.has(img)) dupRefs.push({ no: r.no, img });
      seenInQuestion.add(img);
      if (!filesOnDisk.has(img)) missingImageFiles.push({ no: r.no, img });
    }
  }

  const orphanFiles = [...filesOnDisk].filter((f) => !referencedFiles.has(f));

  console.log(`total questions           : ${rows.length}`);
  console.log(`image refs (total)        : ${totalImageRefs} (문항 내 중복 포함)`);
  console.log(`unique image files        : ${referencedFiles.size} (디스크 ${filesOnDisk.size})`);
  console.log("");
  console.log(`explanations missing      : ${missingExplanation.length} -> 문제 ${missingExplanation.join(", ")}`);
  console.log(`image refs -> file missing: ${missingImageFiles.length}` +
    (missingImageFiles.length ? ` -> ${JSON.stringify(missingImageFiles)}` : ""));
  console.log(`duplicate refs in a question: ${dupRefs.length}` +
    (dupRefs.length ? ` -> ${JSON.stringify(dupRefs)}` : ""));
  console.log(`image files not referenced: ${orphanFiles.length}` +
    (orphanFiles.length ? ` -> ${orphanFiles.join(", ")}` : ""));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
require("dotenv").config();
const { execFileSync } = require("child_process");
const path = require("path");

function run(script) {
  const scriptPath = path.join(__dirname, script);
  console.log(`\n=== ${script} ===`);
  const out = execFileSync(process.execPath, [scriptPath], { stdio: "inherit" });
  return out;
}

async function main() {
  run("importBank.js");
  run("buildEmbeddings.js");
  console.log("\nseed complete: question bank imported + embeddings built.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
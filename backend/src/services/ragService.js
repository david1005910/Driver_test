const { getPool } = require("../db");
const { generate, generateStream } = require("./ollama");
const { retrieveSimilar, questionToText } = require("./embedService");

// 생성 토큰 상한. 요청 글자수(250~300자 ≈ 한국어 300토큰 내외)에
// 끝맺음 여유를 더해 문장 중간에 강제로 끊기지 않게 한다.
const MAX_TOKENS = 500;

const SYSTEM_PROMPT = `너는 대한민국 운전면허 학과시험(필기시험) 전문 학습 튜터야.

[엄격한 환각(Hallucination) 방지 규칙]
1. 오직 제시된 [내가 틀린 문제], [공식 원본 해설], 및 [문제은행에서 검색된 관련 근거]에 명시된 사실만을 바탕으로 답변한다.
2. 제공된 근거에 없는 법규, 범칙금 금액, 벌점, 규칙, 사유를 절대로 지어내거나 추측하여 설명하지 않는다.
3. 문제의 정답 해설 시, 반드시 문제의 보기 내용과 공식 원본 해설을 최우선 기준으로 작성한다.
4. 근거가 부족하거나 검색된 내용에 명시되지 않은 질문에는 추측하지 말고 "제시된 문제은행 근거에서 해당 내용을 찾을 수 없습니다."라고 분명히 안내한다.
5. 한국어로 자연스럽고 간결하게 답변하며, 끝맺음 문장으로 마무리한다.

[시험 구조 상식]
- 40문항·40분·100점 만점. 1종 보통 70점 이상, 2종 보통 60점 이상 합격.
- 4지선다(1답)와 5지선다(2답) 혼합 출제.
- 접수: 도로교통공단 안전운전 통합민원 (safedriving.or.kr)`;

function renderContext(items) {
  if (!items || items.length === 0) {
    return "(검색된 관련 문제은행 근거 없음)";
  }
  return items
    .map((it, i) => {
      const answerStr =
        it.answer && it.answer.length ? it.answer.map((a) => `보기${a}`).join(", ") : "정보 없음";
      const optionsStr = Array.isArray(it.options) && it.options.length
        ? it.options.map((opt, idx) => `  보기${idx + 1}: ${opt}`).join("\n")
        : "  보기 없음";
      const explanationStr = it.explanation ? `\n  공식해설: ${it.explanation}` : "";
      return `[참고근거 ${i + 1}] (${it.no}번 문제)
질문: ${it.question}
${optionsStr}
정답: ${answerStr}${explanationStr}`;
    })
    .join("\n\n");
}

function buildExplainPrompt(q, wrongAnswer, similar) {
  const wrongStr = Array.isArray(wrongAnswer) && wrongAnswer.length
    ? wrongAnswer.map((a) => `보기${a}`).join(", ")
    : "미선택";
  const correctStr = Array.isArray(q.answer) && q.answer.length
    ? q.answer.map((a) => `보기${a}`).join(", ")
    : "정보 없음";

  return `다음은 사용자가 틀린 운전면허 필기시험 문제이다. 아래 주어진 정보를 바탕으로 오답 해설을 작성해줘.

[내가 틀린 문제 - ${q.no}번]
질문: ${q.question}
보기:
${q.options.map((o, i) => `  보기${i + 1}: ${o}`).join("\n")}
사용자가 선택한 답: ${wrongStr}
실제 정답: ${correctStr}
공식 원본 해설: ${q.explanation || "없음"}

[문제은행 관련 근거]
${renderContext(similar)}

아래 형식으로 300자 이내로 간결하게 답변해줘:
1. 정답 이유: 공식 해설과 보기 내용을 근거로 왜 이 답이 맞는지 설명
2. 오답 분석: 선택한 오답(${wrongStr})이 틀린 이유 분석
3. 핵심 요약: 외워야 할 핵심 키워드/규칙
4. 관련 문제: 참고근거에 관련 문제가 있으면 문제 번호 표시 (${similar && similar.length ? similar.map(s => s.no + '번').join(', ') : '없음'})

* 주어진 원본 해설 및 보기 내용 외의 존재하지 않는 사실을 지어내지 말 것.`;
}

function buildAskPrompt(query, similar) {
  const hasSimilar = similar && similar.length > 0;
  return `사용자 질문: ${query}

[문제은행에서 검색된 관련 근거]
${renderContext(similar)}

${hasSimilar
  ? "위 [문제은행에서 검색된 관련 근거]에 명시된 객관적 사실만을 바탕으로 사용자 질문에 답변해줘."
  : "관련 근거가 없습니다. 함부로 규정이나 정보를 추측하지 말고 '문제은행 데이터에서 해당 질문에 대한 명확한 근거를 찾을 수 없습니다'라고 답변해줘."}

전체 답변 300자 이내로 간결하고 정확하게 작성해줘. 절대로 지어낸 수치나 법규를 적지 마.`;
}

function toSimilarMeta(similar) {
  return (similar || []).map((s) => ({ question_id: s.question_id, no: s.no, score: s.score }));
}

async function streamChat(prompt, onDelta) {
  const reader = await generateStream({ prompt, system: SYSTEM_PROMPT, options: { num_predict: MAX_TOKENS } });
  const decoder = new TextDecoder();
  let buf = "";
  let modelDone = false;
  while (!modelDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const data = JSON.parse(line);
        if (data.message && data.message.content) onDelta(data.message.content);
        if (data.done) {
          modelDone = true;
          break;
        }
      } catch (e) {}
    }
  }
  // done 직후 버퍼에 남은 마지막 조각(청크 경계에서 잘린 부분)까지 반영
  const tail = buf + decoder.decode();
  if (tail.trim()) {
    try {
      const data = JSON.parse(tail.trim());
      if (data.message && data.message.content) onDelta(data.message.content);
    } catch (e) {}
  }
}

async function explainWrongQuestion(q, wrongAnswer) {
  const similar = await retrieveSimilar(questionToText(q), 3, q.id, 0.35);
  const res = await generate({
    prompt: buildExplainPrompt(q, wrongAnswer, similar),
    system: SYSTEM_PROMPT,
    options: { num_predict: MAX_TOKENS },
  });
  return {
    question_id: q.id,
    similar: toSimilarMeta(similar),
    answer: res.message ? res.message.content : "",
  };
}

async function explainWrongQuestionStream(q, wrongAnswer, onDelta) {
  const similar = await retrieveSimilar(questionToText(q), 3, q.id, 0.35);
  await streamChat(buildExplainPrompt(q, wrongAnswer, similar), onDelta);
  return { question_id: q.id, similar: toSimilarMeta(similar) };
}

async function askFreeForm(query) {
  const similar = await retrieveSimilar(query, 3, null, 0.35);
  const res = await generate({
    prompt: buildAskPrompt(query, similar),
    system: SYSTEM_PROMPT,
    options: { num_predict: MAX_TOKENS },
  });
  return {
    similar: toSimilarMeta(similar),
    answer: res.message ? res.message.content : "",
  };
}

async function askFreeFormStream(query, onDelta) {
  const similar = await retrieveSimilar(query, 3, null, 0.35);
  await streamChat(buildAskPrompt(query, similar), onDelta);
  return { similar: toSimilarMeta(similar) };
}

async function getQuestionById(id) {
  const [rows] = await getPool().query(
    "SELECT id, no, question, options, answer, explanation, images FROM questions WHERE id = ?",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    no: r.no,
    question: r.question,
    options: JSON.parse(r.options),
    answer: JSON.parse(r.answer),
    explanation: r.explanation,
    images: r.images ? JSON.parse(r.images) : [],
  };
}

module.exports = {
  explainWrongQuestion,
  explainWrongQuestionStream,
  askFreeForm,
  askFreeFormStream,
  getQuestionById,
};
const { getPool } = require("../db");
const { generate, generateStream } = require("./ollama");
const { retrieveSimilar, questionToText } = require("./embedService");

// 생성 토큰 상한. 요청 글자수(250~300자 ≈ 한국어 300토큰 내외)에
// 끝맺음 여유를 더해 문장 중간에 강제로 끊기지 않게 한다.
const MAX_TOKENS = 500;

const SYSTEM_PROMPT = `너는 대한민국 운전면허 학과시험(필기시험) 전문 AI 튜터야.

[무조건 준수해야 하는 100% 팩트 기반 규칙 (절대적 환각 방지)]
1. 오직 제공된 [내가 틀린 문제], [공식 원본 해설], 및 [문제은행 관련 근거]에 직접 명시된 글자/사실만을 바탕으로 답변하라.
2. 제시된 근거에 없는 사실, 법규, 처벌 규정, 시나리오, 사유, 수치를 단 한 문장도 지어내거나 확장 추정(Extrapolation)하지 말라.
3. [공식 원본 해설]이 존재하면 반드시 공식 원본 해설의 핵심 내용만 요약하여 정답 이유로 설명하라.
4. 질문 내용이나 오답 이유가 제공된 근거에 명확히 명시되어 있지 않은 경우, 지어내지 말고 반드시 "제시된 문제은행 근거 데이터에서 관련 내용을 찾을 수 없습니다 😅"라고 밝혀라.
5. 말투는 다정하고 부드럽게 하되, 내용과 팩트는 100% 엄격함을 유지하라.

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

  return `아래 문제 및 공식 해설 데이터만을 바탕으로 오답 해설을 작성해 주세요.

[내가 틀린 문제 - ${q.no}번]
질문: ${q.question}
보기:
${q.options.map((o, i) => `  보기${i + 1}: ${o}`).join("\n")}
사용자가 선택한 답: ${wrongStr}
실제 정답: ${correctStr}
공식 원본 해설: ${q.explanation || "없음"}

[문제은행 관련 근거]
${renderContext(similar)}

[답변 작성 형식 (300자 이내)]
1. 정답 이유: 위 '공식 원본 해설' 및 정답 보기 문구만을 바탕으로 왜 정답인지 설명 (없는 내용을 지어내지 말 것)
2. 오답 분석: 선택한 오답(${wrongStr})이 왜 정답이 아닌지 보기 문구 대조 설명
3. 핵심 요약: 공식 해설의 핵심 포인트 1문장 요약
4. 추천 복습: 참고근거 문항 번호 (${similar && similar.length ? similar.map(s => s.no + '번').join(', ') : '없음'})

* 경고: [공식 원본 해설] 및 보기에 명시된 내용 외의 법규나 상식을 자의적으로 추정하여 적지 마세요.`;
}

function buildAskPrompt(query, similar) {
  const hasSimilar = similar && similar.length > 0;
  return `사용자 질문: ${query}

[문제은행에서 검색된 관련 근거]
${renderContext(similar)}

${hasSimilar
  ? "위 [문제은행에서 검색된 관련 근거]에 명시적으로 적혀 있는 글과 사실만을 바탕으로 사용자 질문에 답변해 주세요."
  : "관련 근거가 없습니다. 절대로 자의적으로 추정하지 말고 '문제은행 데이터에 해당 내용이 없어 알려드리기 어려워요 😅'라고 답변해 주세요."}

* 경고: 검색된 관련 근거 텍스트에 없는 법규, 수치, 행동 지침을 지어내거나 확장하여 답변하지 마세요.`;
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
  const similar = await retrieveSimilar(questionToText(q), 3, q.id, 0.45);
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
  const similar = await retrieveSimilar(questionToText(q), 3, q.id, 0.45);
  await streamChat(buildExplainPrompt(q, wrongAnswer, similar), onDelta);
  return { question_id: q.id, similar: toSimilarMeta(similar) };
}

async function askFreeForm(query) {
  const similar = await retrieveSimilar(query, 3, null, 0.45);
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
  const similar = await retrieveSimilar(query, 3, null, 0.45);
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
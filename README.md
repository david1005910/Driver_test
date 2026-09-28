# 운전면허 필기시험 학습 앱 (Driver Test)

도로교통공단 **학과시험 문제은행(999문항)** 기반의 운전면허 필기시험 대비 풀스택 앱입니다.

- **전체 학습**: 문장형/이미지형, 1답(4지선다)/2답(5지선다) 필터링으로 전체 문항 학습
- **모의고사**: 40문항·40분, 1종(합격 70점)/2종(합격 60점) 실전 구조, 채점·합격 판정
- **오답노트**: 틀린 문제 자동 등록. 다시 맞히면 노트에서 자동 제거
- **AI 튜터 (RAG)**: 문제은행을 임베딩(`nomic-embed-text`), 유사문제를 검색해 LLM(`qwen2.5:3b`)이 근거 기반 해설/추천 문제 제공

## 구조

```
Driver_test/
├── docker-compose.yml          # api / web / db (MySQL 8.4)
├── scripts/extract_pdf.py      # PDF → data/bank.json 추출 (재실행용)
├── data/
│   ├── bank.json               # 999문항 원본 (no/question/options/answer/explanation/images)
│   └── images/                 # 289개 문제 이미지 PNG
├── backend/                    # Node.js + Express + MySQL
│   └── src/
│       ├── server.js           # API 서버 (정적 dist 서빙 겸)
│       ├── sql/init.sql        # 테이블 생성 (db 컨테이너 자동 실행)
│       ├── routes/             # questions / exam / wrong / stats / rag
│       ├── services/           # ollama 연동, embedding+RAG, ragService
│       └── scripts/            # importBank / buildEmbeddings / seed
└── frontend/                   # React + Vite (대시보드·학습·모의고사·오답노트·AI튜터)
```

## 실행 방법

사전 요구: Docker Desktop(Windows/WSL2), 호스트에서 Ollama 실행 `localhost:11434`
필요 모델: `nomic-embed-text`, `qwen2.5:3b`

```bash
# 1. Ollama에 모델이 없으면
ollama pull nomic-embed-text
ollama pull qwen2.5:3b

# 2. 빌드 및 기동
docker compose up -d --build

# 3. 999문항 임포트 + 999개 임베딩 구축 (RAG에 필요, 최초 1회)
docker exec driver_test_api node src/scripts/seed.js
```

접속 주소:

| 서비스   | 주소                          |
| -------- | ----------------------------- |
| 프론트   | http://localhost:5173         |
| API      | http://localhost:3002         |
| MySQL    | localhost:3307                |

## 주요 API

| 메서드 | 경로                        | 설명                                   |
| ------ | --------------------------- | -------------------------------------- |
| GET    | `/api/questions`            | 문항 목록 (type/multi/page/limit 필터)  |
| GET    | `/api/questions/random`     | 랜덤 문항                              |
| POST   | `/api/questions/:id/answer` | 정답 제출 (오답노트 자동 등록)          |
| GET    | `/api/exam/paper`           | 모의고사 문항 구성 (license/count)      |
| POST   | `/api/exam/grade`           | 모의고사 제출·채점·합격 판정            |
| GET    | `/api/wrong`                | 오답노트 목록                           |
| DELETE | `/api/wrong/:id`            | 오답노트에서 제거                       |
| GET    | `/api/stats`                | 학습 통계 대시보드                      |
| GET    | `/api/rag/status`           | Rag 상태 (Ollama 연결/임베딩 수)        |
| POST   | `/api/rag/explain`          | 틀린 문제 RAG 해설 + 유사문제 추천      |
| POST   | `/api/rag/ask`              | 자유 질의 RAG 답변                      |

## 데이터 재구축

```bash
# 데이터만 초기화
docker compose down -v          # vol data 포함 전부 삭제
docker compose up -d --build
docker exec driver_test_api node src/scripts/seed.js

# 이미지 포함 문제도 data/images/, scripts/ 디렉토리를 그대로 두면 자동 반영
```

## 문제은행 출처 및 재추출

- 출처: [안전운전 통합민원](https://www.safedriving.or.kr) 공식 게시물(2026-03-09 시행 문제은행 PDF, `/tmp/driver_bank.pdf`)
- 공공데이터포털 CSV는 로그인/캡차로 자동 다운로드가 불가해 PDF 파싱 방식 선택
- 재추출이 필요하면:
  ```bash
  python3 -m pip install pymupdf
  python3 scripts/extract_pdf.py /tmp/driver_bank.pdf
  ```
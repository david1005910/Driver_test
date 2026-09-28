#!/usr/bin/env python3
"""운전면허 학과시험 문제은행 PDF → JSON 추출 (v3)"""
import re
import json
import sys
from pathlib import Path
import pymupdf

PDF = Path("/tmp/driver_bank.pdf")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "data/bank.json")
DEBUG = len(sys.argv) > 2 and sys.argv[2] == "debug"

IMG_EXT = {".jpeg": ".jpg", ".png": ".png", ".gif": ".gif", ".bmp": ".bmp", ".pbm": ".png"}
CIRCLES = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳" + "➀➁➂➃➄➅➆➇➈➉"


def norm(s: str) -> str:
    return " ".join(s.split())


def main():
    doc = pymupdf.open(PDF)
    img_dir = OUT.parent / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    chunks = []
    markers = []  # (pos, page_no) for page delimiters
    pos = 0
    page_imgs = {}
    for pno in range(doc.page_count):
        page = doc[pno]
        page_txt = "\n<<<PAGE%d>>>\n" % pno + page.get_text()
        chunks.append(page_txt)
        markers.append((pos, pno))
        pos += len(page_txt)

        imgs = []
        for im in page.get_images(full=True):
            xref = im[0]
            try:
                pix = pymupdf.Pixmap(doc, xref)
                if pix.width < 80 or pix.height < 80:
                    continue
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                name = f"img_p{pno}_{xref}.png"
                pix.save(img_dir / name)
                imgs.append(name)
            except Exception:
                continue
        page_imgs[pno] = imgs

    full = "".join(chunks)

    starts = []
    for m in re.finditer(r"(?<![\d.])Q?(\d{1,3})[\.．]\s*", full):
        starts.append((int(m.group(1)), m.start()))
    starts.sort(key=lambda x: x[1])

    chosen = []
    nxt = 1
    last_pos = -1
    for no, pos in starts:
        if no == nxt and pos > last_pos:
            chosen.append((no, pos))
            nxt += 1
            last_pos = pos

    def page_of(pos):
        lo = 0
        hi = len(markers) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if markers[mid][0] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return markers[lo][1]

    questions = []
    opt_pat = re.compile(r"[%s]" % CIRCLES)
    for idx, (no, pos) in enumerate(chosen):
        end = chosen[idx + 1][1] if idx + 1 < len(chosen) else len(full)
        seg = full[pos:end]
        page = page_of(pos)
        seg = re.sub(r"<<<PAGE\d+>>>", "", seg)

        qtext = seg

        answer = []
        explanation = ""
        am = re.search(r"■\s*정답\s*[:：]?\s*([\d,，.・\s]+?)(?=\s*■|$)", qtext, re.I)
        if am:
            answer = [int(x) for x in re.findall(r"\d+", am.group(1))]
            qtext = qtext[: am.start()] + qtext[am.end():]
        mm = re.search(r"■\s*해설\s*[:：]?\s*(.+)", qtext, re.S | re.I)
        if mm:
            explanation = norm(mm.group(1))
            qtext = qtext[: mm.start()]

        matches = list(opt_pat.finditer(qtext))
        options = []
        for i, m in enumerate(matches):
            body_start = m.end()
            body_end = matches[i + 1].start() if i + 1 < len(matches) else len(qtext)
            options.append(norm(qtext[body_start:body_end]))

        body = qtext
        for m in reversed(matches):
            body = body[: m.start()]
        body = norm(body)
        body = re.sub(r"(^[.\s]+|[.\s]+$)", "", body)

        questions.append(
            {
                "no": no,
                "page": page,
                "question": body,
                "options": options,
                "answer": answer,
                "explanation": explanation,
                "images": page_imgs.get(page, []),
            }
        )

    obj = {
        "source": "한국도로교통공단 자동차 운전면허 학과시험 문제은행 (2026-03-09 시행, 1·2종 보통/대형·특수)",
        "questions": questions,
    }
    OUT.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")

    print("questions:", len(questions))
    print("with answer:", sum(1 for q in questions if q["answer"]))
    print("with explanation:", sum(1 for q in questions if q["explanation"]))
    print("with options:", sum(1 for q in questions if q["options"]))
    print("with images:", sum(1 for q in questions if q["images"]))
    multi = [q["no"] for q in questions if len(q["answer"]) > 1]
    print("multi-answer:", len(multi))
    bad = [q["no"] for q in questions if q["answer"] and max(q["answer"]) > len(q["options"])]
    print("answer>options:", len(bad), bad[:15])
    noopt = [q["no"] for q in questions if not q["options"]]
    print("no-options:", len(noopt), noopt[:20])
    if DEBUG:
        for q in questions[506:510]:
            print(json.dumps({k: v for k, v in q.items() if k != "images"}, ensure_ascii=False)[:300])
            print("---")


if __name__ == "__main__":
    main()
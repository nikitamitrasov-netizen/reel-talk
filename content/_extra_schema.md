# Extra tasks — schema for `content/extra/*.json`

Each file is a JSON array. One object per film, matched by `id`. The build merges
these arrays into the base film object (`tools/build_data.py`), so **never edit
`content/films/*.json`** — only add extras here.

```json
[
  {
    "id": "home-alone",
    "gaps": [ {"line": "… ___ …", "answer": "word", "hint": "nudge", "adapted": false} ],
    "quiz": [ {"q": "…", "options": ["A", "B", "C"], "answer": 0, "why": "…"} ],
    "quotes": [ {"quote": "…", "options": ["A", "B", "C"], "answer": 1, "note": "…"} ],
    "truefalse": [ {"s": "Statement about the film.", "answer": true, "fix": ""} ],
    "shortAnswers": [ {"q": "Why …?", "model": "One or two sentences."} ]
  }
]
```

Counts per film — all five keys are required:

| key | count | notes |
|---|---|---|
| `gaps` | 5 | new lines, different from the ones already in the film |
| `quiz` | 3 | new comprehension questions, not repeats |
| `quotes` | 2 | new short quotes (max 15 words) |
| `truefalse` | 6 | exactly 3 true and 3 false; `fix` corrects the false ones, empty for true |
| `shortAnswers` | 4 | open questions with a model answer (1–2 sentences) |

Rules

- English only. Level-appropriate: A1/A2 short sentences, C1/C2 natural and idiomatic.
- Facts must be right. If you are not sure of a line, paraphrase and set `adapted: true`.
- Do not repeat a gap, question or quote that already exists in the film object.
- True/False statements must be unambiguous: a false statement should be false for one clear reason, and `fix` states the truth in one short sentence.
- Short answers ask "why", "how", "what would…", "compare…" — not yes/no plot recall.
- `options` always exactly 3, `answer` is the index 0–2.

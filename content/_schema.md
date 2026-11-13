# Reel Talk — film data schema

Every level file is a **JSON array of film objects**. Nothing else. No comments, no trailing commas.
`content/_example.json` is the reference object — copy its shape exactly.
Validate before you finish: `python tools/check_films.py content/films/<file>.json`

## Object

```json
{
  "id": "kebab-case, exactly as in content/_plan.md",
  "title": "English title",
  "year": 1990,
  "level": "A1|A2|B1|B2|C1|C2",
  "runtime": 103,                       // minutes, integer
  "genres": ["comedy", "family"],       // 2–3 from: drama, comedy, romance, thriller, crime, sci-fi, animation, family, musical, war, sport, mystery, noir, western, documentary, horror, historical
  "director": "Chris Columbus",
  "country": "USA",                     // one country
  "age": "all|12+|15+|18+",             // honest suitability flag for a classroom
  "mood": "warm|cool|noir|neon|sepia|pastel|earth|ice",
  "logline": "One sentence, present tense, no spoilers, max 28 words.",
  "why": "Two sentences: why this film works at this exact level (speed, clarity, topic, visuals).",
  "language": "One sentence on accent / speed / slang / dialect the group should expect.",
  "content": "One sentence, honest: sex, violence, strong language, upsetting scenes.",
  "scenes": [ ...4 items... ],
  "words": [ ...6 items... ],
  "questions": [ ...8 strings... ],
  "gaps": [ ...5 items... ],
  "quotes": [ ...3 items... ],
  "quiz": [ ...5 items... ],
  "roleplay": { ...1 object... },
  "quest": [ ...4 items... ]
}
```

### scenes — "moments" for pausing during the watch party
Approximate cue points. Aim for real turning points, spread across the film (not all in the first 20 minutes).
```json
{"at": "00:12:30", "title": "Three to five words", "task": "One clear instruction the host can read out loud.", "type": "observe"}
```
`type` is one of `observe` (notice a detail), `predict` (pause and guess), `listen` (catch a word/line), `speak` (retell / describe), `think` (interpret).

### words — 6 items
```json
{"w": "burglar", "def": "a person who breaks into a house to steal things", "ex": "The burglars watch the house from a van."}
```
`def` must be learner-friendly (A1/A2: 3–7 words, no hard words inside the definition). `ex` is one short sentence.

### gaps — 5 items (fill in the missing word)
```json
{"line": "When I grow up and get married, I'm living ___!", "answer": "alone", "hint": "not with anyone else", "adapted": false}
```
Exactly one blank written as `___`. `answer` = the missing word(s), lowercase, 1–2 words.
`adapted: true` when you paraphrased rather than quoted a line — be honest, the UI shows an “adapted” tag.

### quotes — 3 items (who said it)
```json
{"quote": "Keep the change, you filthy animal.", "options": ["Kevin", "The gangster on TV", "Marv"], "answer": 1, "note": "Kevin repeats it later as a joke — it becomes his line."}
```
Short quotes only (max 15 words). `answer` = index of the correct option.

### quiz — 5 items (comprehension)
```json
{"q": "Where does Kevin's family fly for Christmas?", "options": ["Paris", "London", "Rome"], "answer": 0, "why": "They fly to Paris and leave Kevin at home."}
```
Exactly 3 options, one correct index. `why` = one sentence shown after answering.

### roleplay — one scene to act out in class
```json
{"title": "The head count", "setting": "Airport check-in, 7 a.m. The family is late and nobody is counting children.", "roles": [{"role": "Kate", "brief": "You are the mother..."}, {"role": "Clerk", "brief": "You are bored..."}, {"role": "Kevin", "brief": "You are eight..."}], "challenge": "Play it twice: once as a comedy, once as a disaster film."}
```
2–3 roles. The scene must be playable with no props, in 2–3 minutes, using language the level can actually produce.

### quest — 4 team stations (QR treasure hunt)
```json
{"title": "The missing passenger", "task": "Find the moment the family counts heads. Who is missing — and who notices first?", "answer": "Kevin; his mother notices on the plane", "points": 10}
```
Each station is a self-contained team task answerable after (or while) watching. One should send teams back into the film for a detail, one should be a language puzzle (word/quote/definition), one should be creative (write/say/act), one should be a numbers/order task. Keep answers short (max 20 words) — they are the QR station answer key.

## Writing rules

- **English only** in all content fields.
- Level-appropriate: A1/A2 — short sentences, present simple, high-frequency words. C1/C2 — natural, idiomatic, but no academic jargon.
- Questions must invite opinions and personal experience, not only plot recall. At least one "would you…", one comparison with the students' own culture, one about a character's choice, one about a line they liked.
- No spoilers in `logline`. Discussion questions may touch the ending — that is fine.
- Keep it classroom-safe: no slurs, nothing sexual explicit, no instructional detail about violence. If a film is dark, say so in `content`.
- Be accurate about the film. If you are not sure of a line, paraphrase and set `adapted: true`.

## Series objects (wave 2)

A series episode is the same object with three extra keys:

```json
"kind": "series",
"episode": "S1E1",
"episodeTitle": "The One Where Monica Gets a Roommate"
```

`title` is the show name, `director` is the creator or episode director, `runtime` is the episode length.
Everything else — scenes, words, questions, gaps, quotes, quiz, roleplay, quest — works exactly the same.
For a series, `logline` describes the episode, not the whole show.

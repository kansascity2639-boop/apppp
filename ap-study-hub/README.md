# AP Study Hub

A free study hub for **AP Calculus AB and BC, AP Physics 1, AP Chemistry, AP Psychology, AP U.S. History, and AP World History**, aligned to the College Board course and exam descriptions for the 2026–27 school year (May 2027 exams).

## What's in it

| | Calc AB | Calc BC | Physics 1 | Chemistry | Psychology | APUSH | World |
|---|---|---|---|---|---|---|---|
| Multiple choice | 32 | 30 | 25 | 32 | 34 | 27 | 30 |
| FRQs / SAQs with scoring guides | 4 | 4 | 4 | 4 | 4 (2 AAQ, 2 EBQ) | 4 | 4 |
| Flashcards | 27 | 29 | 23 | 27 | 30 | 28 | 28 |

- **Multiple choice:** filter by unit, by questions not tried yet, or by questions you missed. **Practice mode** explains every answer and says why the wrong choice you picked is tempting. **Timed mode** runs at real 2027 exam pace. Correct answers are spread evenly across A–D (`tools/build_data.py` balances them), so there's no letter pattern to guess. Any question can go straight into a per-course **mistake log** note.
- **Free response / SAQ:** formats match 2027. APUSH and World SAQs each have a source and parts (a), (b), and (c). Psychology has the 7-point AAQ and EBQ. Calc, Physics, and Chem FRQs have point-by-point scoring guides. Students write their answers (autosaved), self-score each point, and can save the attempt to Notes.
- **Rewards:** a confetti burst for a correct answer, bigger bursts for streaks (3, 5, 10…), sets of 80% or better, full-mark FRQs, and finished flashcard decks. There's also a daily study streak. Reduced-motion settings get a soft glow instead, and a footer toggle turns rewards off.
- **Notes:** a rich-text notebook with:
  - **Formatting:** headings, bold, italic, underline, and strike; highlights and text colors; bullet, numbered, and checklist lists; quotes, code blocks, tables, dividers, and links.
  - **Extras:** callout boxes (key idea, definition, example, question) and LaTeX equations rendered with KaTeX, including chemistry via `\ce{}`.
  - **Markdown shortcuts:** `#`, `-`, `1.`, `[]`, `>`, and `---`.
  - **Templates:** class notes, Cornell, vocabulary, source analysis (historical situation, intended audience, purpose, point of view), problem set, mistake log, and unit review.
  - **Per-note settings:** course, tags, color, paper (plain, lined, grid, dots), font (sans, serif, mono, handwritten), and text size.
  - **Organizing:** search, sort, pin, focus mode, copy as Markdown, and download as .md or .html, or print.
- **Phones and desktop:** an iPhone-safe layout (notch and home-indicator insets, no zoom on input, 40px+ tap targets), swipe gestures on flashcards, Add to Home Screen support (manifest and icons), and the source beside the question on wide screens.
- **Resources:** history links are nonpartisan, credible sources. Math and science links come from professionally backed sources that are current within ten years.

The AI tutor and the OpenAI API call were removed. Everything runs in the browser, and progress and notes live in `localStorage`. **Download a backup** saves both to a file.

## Run it locally

```bash
npm start          # http://localhost:3000, no install needed
```

`scripts/dev-server.mjs` has no dependencies and applies the same headers, clean URLs, and rewrites as `vercel.json`, so what you see locally matches production. You can also open `public/index.html` directly.

## Deploy to Vercel

The site is fully static: no build step, no serverless functions, no environment variables. `vercel.json` sets `public/` as the output directory and adds security headers (including a strict Content-Security-Policy) and caching rules. `.vercelignore` keeps the authoring files (`content/`, `tools/`, `scripts/`) out of the upload.

**From GitHub (recommended)**
1. Unzip, then push this folder to a new GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Leave the defaults: Framework Preset **Other**, no build command, output directory comes from `vercel.json`.
4. Click **Deploy**. Every push to `main` redeploys.

**From the command line**
```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

After editing questions in `content/`, run `python3 tools/build_data.py` and commit the regenerated `public/js/data.js`. Vercel serves that file as-is.

## Edit content

Questions live in `content/*.py`, one file per course, which makes them easy to read and diff. After editing, rebuild and check:

```bash
python3 tools/build_data.py      # validates structure and writes public/js/data.js
python3 tools/verify_answers.py  # independently recomputes every numeric answer
node tools/check_math.cjs node_modules/katex   # renders every math expression (needs: npm install)
```

`build_data.py` rejects bad structure: an answer index out of range, an unknown unit, a scoring guide whose point count doesn't match the part's points, or a duplicate id.

## Sources for exam formats

- AP Calculus BC exam: https://apcentral.collegeboard.org/courses/ap-calculus-bc/exam
- AP Physics 1 exam: https://apcentral.collegeboard.org/courses/ap-physics-1/exam
- AP Chemistry exam: https://apcentral.collegeboard.org/courses/ap-chemistry/exam/ap-chemistry-exam
- AP U.S. History exam: https://apstudents.collegeboard.org/courses/ap-united-states-history/assessment
- AP Calculus AB exam: https://apcentral.collegeboard.org/courses/ap-calculus-ab/exam
- AP Psychology exam: https://apcentral.collegeboard.org/courses/ap-psychology/exam
- AP World History exam: https://apcentral.collegeboard.org/courses/ap-world-history/exam
- AP History exam updates (2027): https://apcentral.collegeboard.org/courses/ap-history-exam-updates
- 2027 exam dates: https://apstudents.collegeboard.org/exam-dates

AP® is a registered trademark of the College Board, which is not affiliated with this project. All practice questions are original.

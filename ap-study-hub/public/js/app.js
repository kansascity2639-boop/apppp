/* AP Study Hub: single-page app, no build step, no server calls.
   Content lives in js/data.js (generated from content/*.py). Progress and notes are kept in localStorage. */
(() => {
  "use strict";

  const DATA = window.HUB_DATA;
  const COURSES = DATA.courses;
  const byId = Object.fromEntries(COURSES.map((c) => [c.id, c]));
  const LETTERS = ["A", "B", "C", "D"];
  const main = document.getElementById("main");
  const Notes = window.HubNotes;
  const Fx = window.HubCelebrate || { celebrate() {}, setEnabled() {} };

  /* ---------------- helpers ---------------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const plural = (n, word, pl) => `${n} ${n === 1 ? word : pl || word + "s"}`;
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtClock = (sec) => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0");
  };
  const accentVar = (c) => `var(--${c.accent})`;
  const isHistory = (c) => c.id === "apush" || c.id === "world";
  const unitName = (c, id) => (c.units.find((u) => u.id === id) || {}).name || "Unit " + id;
  const unitLabel = (c, id) => (c.id === "apush" ? "Period " + id : "Unit " + id);
  const unitTopic = (c, id) => unitName(c, id).replace(/^Period \d+: /, "");
  const unitWord = (c) => (c.id === "apush" ? "period" : "unit");
  const frqWord = (c) => (isHistory(c) ? "Short answer" : "Free response");
  const frqShort = (c) => (isHistory(c) ? "SAQs" : "FRQs");
  const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  const bigFrac = (s) => s.replace(/\\tfrac/g, "\\dfrac"); // full-size fractions in answer choices
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  let framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }

  function daysUntil(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }
  function daysLabel(n) {
    if (n > 1) return `${n} days away`;
    if (n === 1) return "Tomorrow";
    if (n === 0) return "Today";
    return "Exam taken";
  }

  function typeset(el, course) {
    if (!course || !course.math || typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  /* ---------------- storage ---------------- */
  const STORE_KEY = "apStudyHub.v1";
  function normalize(s) {
    s = s && typeof s === "object" ? s : {};
    const settings = s.settings && typeof s.settings === "object" ? s.settings : {};
    return {
      mcq: s.mcq && typeof s.mcq === "object" ? s.mcq : {},
      frq: s.frq && typeof s.frq === "object" ? s.frq : {},
      cards: s.cards && typeof s.cards === "object" ? s.cards : {},
      sessions: Array.isArray(s.sessions) ? s.sessions.slice(-60) : [],
      focus: s.focus && typeof s.focus === "object" ? s.focus : {},
      days: s.days && typeof s.days === "object" ? s.days : {},
      theme: s.theme === "dark" || s.theme === "light" ? s.theme : null,
      settings: { celebrate: settings.celebrate !== false },
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    return normalize({});
  }
  let state = load();
  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  window.addEventListener("pagehide", saveNow);
  window.addEventListener("beforeunload", saveNow);

  function markStudied() {
    const k = dayKey();
    state.days[k] = (state.days[k] || 0) + 1;
    const keys = Object.keys(state.days).sort();
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((x) => delete state.days[x]);
  }
  function studyStreak() {
    let n = 0;
    const d = new Date();
    if (!state.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet: streak still counts through yesterday
    while (state.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function recordAttempt(qid, correct) {
    const r = state.mcq[qid] || { n: 0, c: 0 };
    r.n += 1;
    if (correct) r.c += 1;
    r.last = !!correct;
    r.t = Date.now();
    state.mcq[qid] = r;
    markStudied();
  }

  Fx.setEnabled(state.settings.celebrate);
  // Expose the header's live height so sticky toolbars sit right under it (it wraps on phones).
  const topbarEl = $(".topbar");
  const setTopbarH = () => document.documentElement.style.setProperty("--topbar-h", topbarEl.offsetHeight + "px");
  setTopbarH();
  if (window.ResizeObserver) new ResizeObserver(setTopbarH).observe(topbarEl);
  else window.addEventListener("resize", setTopbarH);
  if (Notes) Notes.init({ COURSES, byId, toast, framed });

  /* ---------------- stats ---------------- */
  function courseStats(c) {
    const qs = c.mcq;
    const seen = qs.filter((q) => state.mcq[q.id]);
    const right = seen.filter((q) => state.mcq[q.id].last);
    const missed = seen.filter((q) => !state.mcq[q.id].last);
    const frqDone = c.frq.filter((f) => state.frq[f.id] && state.frq[f.id].scores && state.frq[f.id].scores.length);
    const cardsKnown = c.flashcards.filter((_, i) => state.cards[c.id + ":" + i] === "know").length;
    return { total: qs.length, seen: seen.length, right: right.length, missed: missed.length, frqDone: frqDone.length, frqTotal: c.frq.length, cardsKnown, cardsTotal: c.flashcards.length };
  }
  function unitStats(c, unitId) {
    const qs = c.mcq.filter((q) => q.unit === unitId);
    const seen = qs.filter((q) => state.mcq[q.id]);
    const right = seen.filter((q) => state.mcq[q.id].last);
    return { total: qs.length, seen: seen.length, right: right.length };
  }

  /* ---------------- theme ---------------- */
  function applyTheme() {
    if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
    else document.documentElement.removeAttribute("data-theme");
    const dark = state.theme ? state.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#152035" : "#FFFFFF");
  }
  applyTheme();
  $("#themeBtn").addEventListener("click", () => {
    const isDark = state.theme ? state.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    state.theme = isDark ? "light" : "dark";
    applyTheme();
    save();
  });

  /* ---------------- celebrations setting ---------------- */
  const fxBtn = $("#fxBtn");
  const drawFxBtn = () => { if (fxBtn) { fxBtn.textContent = `Celebrations: ${state.settings.celebrate ? "on" : "off"}`; fxBtn.setAttribute("aria-pressed", String(state.settings.celebrate)); } };
  if (fxBtn) fxBtn.addEventListener("click", () => {
    state.settings.celebrate = !state.settings.celebrate;
    Fx.setEnabled(state.settings.celebrate);
    drawFxBtn();
    save();
    if (state.settings.celebrate) Fx.celebrate("correct", fxBtn);
  });
  drawFxBtn();

  /* ---------------- header nav ---------------- */
  function renderCourseNav(activeId) {
    $("#courseNav").innerHTML =
      COURSES.map((c) => `<a href="#/c/${c.id}" ${c.id === activeId ? 'aria-current="page"' : ""}>${esc(c.short)}</a>`).join("");
    const nb = $("#notesNav");
    if (nb) activeId === "__notes" ? nb.setAttribute("aria-current", "page") : nb.removeAttribute("aria-current");
    // keep the active course chip visible on narrow screens
    const cur = $('#courseNav [aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }

  /* ---------------- keyboard dispatch ---------------- */
  let keyHandler = null;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#timerPanel").hidden) { closeTimerPanel(); return; }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (keyHandler) keyHandler(e);
  });

  /* ---------------- MCQ session (in memory) ---------------- */
  let session = null;
  let sessionTick = null;
  let pendingSetup = null; // e.g. {courseId, pool:'missed'} set from Progress page

  /* ---------------- router ---------------- */
  let frqTick = null;
  function route() {
    keyHandler = null;
    clearInterval(frqTick);
    if (Notes) Notes.teardown();
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    main.style.removeProperty("--accent");
    main.classList.toggle("is-wide", false);
    if (parts[0] === "notes") {
      renderCourseNav("__notes");
      document.title = "Notes · AP Study Hub";
      main.classList.add("is-wide");
      main.innerHTML = `<div id="notesHost"></div>`;
      if (Notes) Notes.render($("#notesHost"), { base: "#/notes", openId: parts[1] || null });
      return;
    }
    if (parts[0] === "c" && byId[parts[1]]) {
      const c = byId[parts[1]];
      main.style.setProperty("--accent", accentVar(c));
      renderCourseNav(c.id);
      const tab = parts[2] || "overview";
      if (tab === "frq" && parts[3]) {
        const f = c.frq.find((x) => x.id === parts[3]);
        if (f) return renderFrqDetail(c, f);
      }
      if (tab === "notes") return renderCourseNotes(c, parts[3] || null);
      const views = { overview: renderOverview, mcq: renderMcq, frq: renderFrqList, cards: renderCards, resources: renderResources, progress: renderProgress };
      return (views[tab] || renderOverview)(c);
    }
    renderCourseNav(null);
    renderHome();
  }
  window.addEventListener("hashchange", () => { route(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); });

  function shell(c, tab, inner) {
    const days = daysUntil(c.examDate);
    const tabs = [
      ["overview", "Overview"],
      ["mcq", "Multiple choice"],
      ["frq", frqWord(c)],
      ["cards", "Flashcards"],
      ["notes", "Notes"],
      ["resources", "Resources"],
      ["progress", "Progress"],
    ];
    return `
      <div class="course-head">
        <div>
          <h1>${esc(c.name)}</h1>
          <p class="exam-meta">${esc(c.examSession)}</p>
        </div>
        <span class="days-left">${esc(daysLabel(days))}</span>
      </div>
      <nav class="tabs" aria-label="${esc(c.short)} sections">
        ${tabs.map(([id, label]) => `<a href="#/c/${c.id}/${id}" ${id === tab ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
      <div id="view">${inner}</div>`;
  }

  /* ================= HOME ================= */
  const PILL = { "calc-ab": "Calc AB", "calc-bc": "Calc BC", "physics-1": "Phys 1", chemistry: "Chem", psychology: "Psych", apush: "APUSH", world: "World" };
  function renderHome() {
    document.title = "AP Study Hub";
    const days = [];
    for (const start of [3, 10]) for (let i = 0; i < 5; i++) days.push(start + i);
    const examsByDay = {};
    COURSES.forEach((c) => {
      const d = Number(c.examDate.split("-")[2]);
      (examsByDay[d] = examsByDay[d] || []).push(c);
    });
    const upcoming = COURSES.filter((c) => daysUntil(c.examDate) >= 0).sort((a, b) => a.examDate.localeCompare(b.examDate) || a.examSession.localeCompare(b.examSession));
    const next = upcoming[0];
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const strip = days
      .map((d, i) => {
        const exams = (examsByDay[d] || []).slice().sort((a, b) => a.examSession.localeCompare(b.examSession));
        const head = `<span class="dow">${dow[i % 5]}</span><span class="dnum">${d}</span>`;
        if (!exams.length) return `<div class="exam-day" role="listitem" aria-label="${dow[i % 5]} May ${d}: no exams">${head}</div>`;
        const items = exams
          .map((c) => {
            const when = /Session 1/.test(c.examSession) ? "AM" : "PM";
            const isNext = next && next.examDate === c.examDate;
            return `<a class="exam-pill ${isNext ? "is-next" : ""}" href="#/c/${c.id}" style="--accent:${accentVar(c)}" aria-label="${esc(c.name)}, ${dow[i % 5]} May ${d}, ${when === "AM" ? "morning" : "afternoon"}"><span class="exam-name">${esc(PILL[c.id] || c.short)}</span><span class="exam-when">${when}</span></a>`;
          })
          .join("");
        return `<div class="exam-day has-exam" role="listitem">${head}<div class="exam-pills">${items}</div></div>`;
      });

    let countdown = "All of your 2027 exams are behind you.";
    if (next) {
      const n = daysUntil(next.examDate);
      const sameDay = upcoming.filter((c) => c.examDate === next.examDate).map((c) => c.name);
      countdown = `Your first exam is ${esc(sameDay.join(" and "))}: <strong>${esc(daysLabel(n).replace(" away", ""))}</strong>${n > 1 ? " from today" : ""}.`;
    }
    const streak = studyStreak();
    const studiedToday = !!state.days[dayKey()];

    const rows = COURSES.map((c) => {
      const s = courseStats(c);
      return `
        <article class="course-row" style="--accent:${accentVar(c)}">
          <div class="course-row-text">
            <h3><a href="#/c/${c.id}">${esc(c.name)}</a></h3>
            <div class="course-stats">
              <span><b>${s.seen}/${s.total}</b> questions tried</span>
              <span><b>${s.seen ? pct(s.right, s.seen) + "%" : "–"}</b> correct on latest try</span>
              <span><b>${s.frqDone}/${s.frqTotal}</b> ${frqShort(c)} scored</span>
              <span><b>${s.cardsKnown}/${s.cardsTotal}</b> flashcards known</span>
            </div>
          </div>
          <div class="btn-row">
            <a class="btn btn-primary btn-small" href="#/c/${c.id}/mcq">Practice</a>
            <a class="btn btn-small" href="#/c/${c.id}/frq">${frqWord(c)}</a>
            <a class="btn btn-small" href="#/c/${c.id}/cards">Flashcards</a>
            <a class="btn btn-small" href="#/c/${c.id}/notes">Notes</a>
          </div>
        </article>`;
    }).join("");

    const missedLines = COURSES.map((c) => ({ c, s: courseStats(c) })).filter((x) => x.s.missed > 0);
    const missedBlock = missedLines.length
      ? `<ul class="res-list">${missedLines
          .map(({ c, s }) => `<li><a href="#/c/${c.id}/mcq" data-missed="${c.id}"><span class="res-title">${esc(c.short)}: retry ${plural(s.missed, "missed question")}</span><span class="res-desc">Questions you got wrong on your latest try.</span></a></li>`)
          .join("")}</ul>`
      : `<p class="muted">Questions you get wrong show up here so you can retry them. Start with a short practice set in any course.</p>`;
    const noteCount = Notes ? Notes.count() : 0;

    main.innerHTML = `
      <section class="hero">
        <h1>Get ready for the May 2027 AP exams.</h1>
        <p class="lede">Exam-style practice for seven AP courses. Every answer has an explanation, and every free-response part has a scoring guide you can check yourself against.</p>
        <div class="exam-weeks" aria-label="May 2027 exam calendar">
          <div class="exam-week"><span class="exam-week-label">May 3–7</span><div class="exam-strip" role="list">${strip.slice(0, 5).join("")}</div></div>
          <div class="exam-week"><span class="exam-week-label">May 10–14</span><div class="exam-strip" role="list">${strip.slice(5).join("")}</div></div>
        </div>
        <p class="countdown-line">${countdown}</p>
        <p class="streak-line ${streak ? "has-streak" : ""}">${streak
          ? `<span class="streak-num">${streak}</span> ${streak === 1 ? "day" : "days"} in a row studying.${studiedToday ? " You've practiced today." : " Answer one question today to keep it going."}`
          : "Answer a question today to start a study streak."}</p>
      </section>
      <section>
        <div class="section-head"><h2>Your courses</h2></div>
        <div class="course-list">${rows}</div>
      </section>
      <div class="two-col">
        <section class="panel">
          <h2>Review your misses</h2>
          ${missedBlock}
        </section>
        <section class="panel">
          <h2>Your notes</h2>
          <p>${noteCount ? `You have ${plural(noteCount, "note")}.` : "Take class notes, build vocab lists, or keep a mistake log. Templates include Cornell notes and source analysis."} Notes support equations, checklists, tables, highlights, and custom paper.</p>
          <div class="btn-row"><a class="btn btn-primary" href="#/notes">${noteCount ? "Open notes" : "Start a note"}</a></div>
        </section>
      </div>
      <section class="panel" style="margin-top:20px">
        <h2>A study routine that works</h2>
        <ol class="tip-list routine">
          <li><b>Practice in short sets.</b> Do 10 questions in Practice mode and read every explanation, including the ones you got right.</li>
          <li><b>Save what you miss</b> to your mistake log, then retry those questions a day or two later. Spacing out reviews makes them stick.</li>
          <li><b>Write one free-response or SAQ answer a week</b> under time, then score yourself honestly with the guide.</li>
          <li><b>Take a timed set</b> in the weeks before the exam to practice the real pace.</li>
        </ol>
      </section>`;
    $$("[data-missed]", main).forEach((a) =>
      a.addEventListener("click", () => { pendingSetup = { courseId: a.dataset.missed, pool: "missed" }; })
    );
  }

  /* ================= OVERVIEW ================= */
  function renderOverview(c) {
    document.title = `${c.short} · AP Study Hub`;
    const s = courseStats(c);
    const units = c.units
      .map((u) => {
        const us = unitStats(c, u.id);
        return `<tr><td>${esc(unitLabel(c, u.id))}</td><td>${esc(unitTopic(c, u.id))}</td><td class="num">${esc(u.weight)}</td><td class="num">${us.total} Qs</td></tr>`;
      })
      .join("");
    main.innerHTML = shell(
      c,
      "overview",
      `
      <div class="two-col" style="margin-top:0">
        <section class="panel">
          <h2>The exam</h2>
          <p class="muted">${esc(c.delivery)}</p>
          <table class="format-table"><tbody>
            ${c.examFormat.map((f) => `<tr><th scope="row">${esc(f.section)}</th><td>${esc(f.detail)}</td></tr>`).join("")}
          </tbody></table>
          <p class="hint">Format from the College Board's official course pages for the 2026–27 school year.</p>
        </section>
        <section class="panel">
          <h2>Start practicing</h2>
          <p>${s.seen ? `You've tried ${s.seen} of ${s.total} questions and got ${pct(s.right, s.seen)}% right on your latest try.` : `${s.total} multiple-choice questions, ${s.frqTotal} ${frqWord(c).toLowerCase()} questions, and ${s.cardsTotal} flashcards.`}</p>
          <div class="btn-row">
            <a class="btn btn-primary" href="#/c/${c.id}/mcq">Practice multiple choice</a>
            <a class="btn" href="#/c/${c.id}/frq">${frqWord(c)}</a>
          </div>
          <h3 style="margin-top:24px">Scoring tips</h3>
          <ul class="tip-list">${c.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
        </section>
      </div>
      <section class="panel" style="margin-top:20px">
        <h2>${c.id === "apush" ? "Periods" : "Units"} and exam weighting</h2>
        <div class="table-scroll"><table class="unit-table">
          <thead><tr><th>${c.id === "apush" ? "Period" : "Unit"}</th><th>Topic</th><th>MCQ weight</th><th>In this hub</th></tr></thead>
          <tbody>${units}</tbody>
        </table></div>
      </section>`
    );
    typeset(main, c);
  }

  /* ================= MULTIPLE CHOICE ================= */
  function renderMcq(c) {
    document.title = `${c.short} multiple choice · AP Study Hub`;
    if (session && session.courseId === c.id) {
      return session.submitted ? renderResults(c) : renderRunner(c);
    }
    renderSetup(c);
  }

  function renderSetup(c) {
    const preset = pendingSetup && pendingSetup.courseId === c.id ? pendingSetup : null;
    pendingSetup = null;
    const otherSession = session && !session.submitted && session.courseId !== c.id ? byId[session.courseId] : null;
    const unitChips = c.units
      .map((u) => {
        const n = c.mcq.filter((q) => q.unit === u.id).length;
        return `<label class="chip" title="${esc(u.name)}"><input type="checkbox" name="unit" value="${u.id}" checked><span>${esc(unitLabel(c, u.id))} (${n})</span></label>`;
      })
      .join("");
    main.innerHTML = shell(
      c,
      "mcq",
      `
      ${otherSession ? `<p class="panel" style="margin-bottom:16px">You have an unfinished set in ${esc(otherSession.short)}. <a href="#/c/${otherSession.id}/mcq">Go back to it</a> or start a new one here.</p>` : ""}
      <form class="panel" id="setupForm">
        <h2>Build a practice set</h2>
        <fieldset class="field">
          <legend>${c.id === "apush" ? "Periods" : "Units"}</legend>
          <div class="chips" id="unitChips">${unitChips}</div>
          <div class="btn-row" style="margin-top:8px">
            <button type="button" class="linklike" data-units="all">Select all</button>
            <button type="button" class="linklike" data-units="none">Clear</button>
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>Which questions</legend>
          <div class="chips">
            <label class="chip"><input type="radio" name="pool" value="all" ${!preset ? "checked" : ""}><span>All</span></label>
            <label class="chip"><input type="radio" name="pool" value="new"><span id="poolNew">Not tried yet</span></label>
            <label class="chip"><input type="radio" name="pool" value="missed" ${preset && preset.pool === "missed" ? "checked" : ""}><span id="poolMissed">Missed last time</span></label>
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>How many</legend>
          <div class="chips">
            ${[5, 10, 20].map((n) => `<label class="chip"><input type="radio" name="count" value="${n}" ${n === 10 ? "checked" : ""}><span>${n}</span></label>`).join("")}
            <label class="chip"><input type="radio" name="count" value="all"><span>All matching</span></label>
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>Mode</legend>
          <div class="chips">
            <label class="chip"><input type="radio" name="mode" value="practice" checked><span>Practice: feedback after each question</span></label>
            <label class="chip"><input type="radio" name="mode" value="exam"><span>Timed: exam pace, results at the end</span></label>
          </div>
          <p class="hint" id="paceHint"></p>
        </fieldset>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit" id="startBtn">Start</button>
          <span class="muted" id="poolSummary" aria-live="polite"></span>
        </div>
      </form>`
    );

    const form = $("#setupForm");
    const update = () => {
      const units = $$('input[name="unit"]:checked', form).map((i) => Number(i.value));
      const inUnits = c.mcq.filter((q) => units.includes(q.unit));
      const nNew = inUnits.filter((q) => !state.mcq[q.id]).length;
      const nMissed = inUnits.filter((q) => state.mcq[q.id] && !state.mcq[q.id].last).length;
      $("#poolNew").textContent = `Not tried yet (${nNew})`;
      $("#poolMissed").textContent = `Missed last time (${nMissed})`;
      const pool = form.pool.value;
      const matching = pool === "new" ? nNew : pool === "missed" ? nMissed : inUnits.length;
      const countVal = form.count.value;
      const n = countVal === "all" ? matching : Math.min(Number(countVal), matching);
      $("#poolSummary").textContent = matching ? `${plural(n, "question")} from ${matching} matching` : "No questions match. Change the filters above.";
      $("#startBtn").disabled = !matching;
      const exam = form.mode.value === "exam";
      $("#paceHint").textContent = exam
        ? `Timed at the real exam pace: about ${fmtClock(c.mcqSecondsPerQuestion)} per question, so ${fmtClock(n * c.mcqSecondsPerQuestion)} for ${plural(n, "question")}. The set submits when time runs out.`
        : "You'll see whether you're right and why after each answer.";
    };
    form.addEventListener("change", update);
    $$("[data-units]", form).forEach((b) =>
      b.addEventListener("click", () => {
        $$('input[name="unit"]', form).forEach((i) => (i.checked = b.dataset.units === "all"));
        update();
      })
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const units = $$('input[name="unit"]:checked', form).map((i) => Number(i.value));
      const pool = form.pool.value;
      let qs = c.mcq.filter((q) => units.includes(q.unit));
      if (pool === "new") qs = qs.filter((q) => !state.mcq[q.id]);
      if (pool === "missed") qs = qs.filter((q) => state.mcq[q.id] && !state.mcq[q.id].last);
      if (!qs.length) return;
      const countVal = form.count.value;
      const n = countVal === "all" ? qs.length : Math.min(Number(countVal), qs.length);
      startSession(c, shuffle(qs).slice(0, n).map((q) => q.id), form.mode.value);
    });
    update();
  }

  function startSession(c, qids, mode) {
    clearInterval(sessionTick);
    session = {
      courseId: c.id, mode, qids, idx: 0, answers: {}, revealed: {}, flagged: {}, saved: {},
      streak: 0, bestStreak: 0,
      startedAt: Date.now(),
      endsAt: mode === "exam" ? Date.now() + qids.length * c.mcqSecondsPerQuestion * 1000 : null,
      submitted: false,
    };
    renderRunner(c);
  }

  function qById(c, id) { return c.mcq.find((q) => q.id === id); }

  function renderRunner(c) {
    const s = session;
    const q = qById(c, s.qids[s.idx]);
    const exam = s.mode === "exam";
    const chosen = s.answers[q.id];
    const revealed = !exam && s.revealed[q.id];

    const nav = s.qids
      .map((id, i) => {
        const cls = [];
        if (i === s.idx) cls.push("current");
        if (s.answers[id] !== undefined) cls.push("answered");
        if (!exam && s.revealed[id]) cls.push(s.answers[id] === qById(c, id).answer ? "right" : "wrong");
        if (s.flagged[id]) cls.push("flagged");
        const status = s.answers[id] === undefined ? "unanswered" : "answered";
        return `<button type="button" class="${cls.join(" ")}" data-go="${i}" aria-label="Question ${i + 1}, ${status}${s.flagged[id] ? ", flagged" : ""}" ${i === s.idx ? 'aria-current="step"' : ""}>${i + 1}</button>`;
      })
      .join("");

    const choices = q.choices
      .map(bigFrac)
      .map((ch, i) => {
        const cls = ["choice"];
        let tag = "";
        if (revealed) {
          if (i === q.answer) { cls.push("correct"); tag = `<span class="tag">Correct answer</span>`; }
          else if (i === chosen) { cls.push("incorrect"); tag = `<span class="tag">Your answer</span>`; }
        } else if (i === chosen) cls.push("selected");
        return `<li><button type="button" class="${cls.join(" ")}" data-choice="${i}" ${revealed ? "disabled" : ""} aria-pressed="${i === chosen}">
            <span class="letter" aria-hidden="true">${LETTERS[i]}</span><span><span class="sr-only">Choice ${LETTERS[i]}: </span>${ch}${tag}</span></button></li>`;
      })
      .join("");

    let feedback = "";
    if (revealed) {
      const right = chosen === q.answer;
      const trap = !right && q.notes && q.notes[String(chosen)];
      const praise = ["Correct", "Nice work", "That's right", "Exactly", "You got it"][Math.abs(q.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 5];
      feedback = `<div class="feedback ${right ? "is-right" : "is-wrong"}" role="status">
          <h3>${right ? praise : `Not quite. The answer is ${LETTERS[q.answer]}.`}${right && s.streak >= 2 ? ` <span class="streak-tag">${s.streak} in a row</span>` : ""}</h3>
          <p style="margin:0">${q.explain}</p>
          ${trap ? `<p class="trap"><b>Why ${LETTERS[chosen]} is tempting:</b> ${trap}</p>` : ""}
          ${Notes ? `<div class="feedback-actions"><button class="btn btn-small" data-act="save-note" ${s.saved[q.id] ? "disabled" : ""}>${s.saved[q.id] ? "Saved to mistake log" : right ? "Save to my notes" : "Save to mistake log"}</button></div>` : ""}
        </div>`;
    }

    const last = s.idx === s.qids.length - 1;
    let primary;
    if (exam) primary = last ? `<button class="btn btn-primary" data-act="submit">Submit set</button>` : `<button class="btn btn-primary" data-act="next">Next</button>`;
    else if (!revealed) primary = `<button class="btn btn-primary" data-act="check" ${chosen === undefined ? "disabled" : ""}>Check answer</button>`;
    else primary = last ? `<button class="btn btn-primary" data-act="submit">See results</button>` : `<button class="btn btn-primary" data-act="next">Next question</button>`;

    const hasStim = !!q.stimulus;
    main.innerHTML = shell(
      c,
      "mcq",
      `
      <div class="panel runner">
        <div class="runner-bar">
          <div class="runner-progress">Question ${s.idx + 1} of ${s.qids.length}<span class="unit-tag">${esc(unitLabel(c, q.unit))}: ${esc(unitTopic(c, q.unit))}</span></div>
          <div class="btn-row">
            ${exam ? `<span class="clock" id="clock" role="timer" aria-label="Time remaining"></span>` : s.streak >= 2 ? `<span class="streak-pill" aria-label="${s.streak} correct in a row">${s.streak} in a row</span>` : ""}
            <button class="btn btn-small" data-act="flag" aria-pressed="${!!s.flagged[q.id]}">${s.flagged[q.id] ? "Unflag" : "Flag"}</button>
            <button class="btn btn-small" data-act="quit">${exam ? "End set" : "Finish"}</button>
          </div>
        </div>
        <div class="progress-track" aria-hidden="true"><i style="width:${pct(Object.keys(exam ? s.answers : s.revealed).length, s.qids.length)}%"></i></div>
        <div class="qnav" aria-label="Question navigator">${nav}</div>
        <div class="q-layout ${hasStim ? "has-stim" : ""}">
          ${hasStim ? `<div class="stimulus">${q.stimulus}</div>` : ""}
          <div class="q-main">
            <div class="question" id="qtext" data-qid="${q.id}">${q.q}</div>
            <ol class="choices" aria-label="Answer choices">${choices}</ol>
            ${feedback}
          </div>
        </div>
        <div class="runner-foot">
          <button class="btn" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>Previous</button>
          ${primary}
        </div>
        <p class="kbd-hint">Shortcuts: <kbd>A</kbd>–<kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> to choose, <kbd>Enter</kbd> to ${exam ? "go on" : "check and go on"}, <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>F</kbd> to flag.</p>
      </div>`
    );
    typeset($("#view"), c);

    const view = $("#view");
    view.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.choice !== undefined) return choose(Number(btn.dataset.choice));
      if (btn.dataset.go !== undefined) { s.idx = Number(btn.dataset.go); return renderRunner(c); }
      const act = btn.dataset.act;
      if (act === "check") return check();
      if (act === "next") { s.idx = Math.min(s.idx + 1, s.qids.length - 1); return renderRunner(c); }
      if (act === "prev") { s.idx = Math.max(0, s.idx - 1); return renderRunner(c); }
      if (act === "flag") { s.flagged[q.id] = !s.flagged[q.id]; return renderRunner(c); }
      if (act === "submit") return submit(c);
      if (act === "save-note") {
        Notes.saveQuestion(c, q, s.answers[q.id], LETTERS, `${unitLabel(c, q.unit)}: ${unitTopic(c, q.unit)}`);
        s.saved[q.id] = true;
        btn.disabled = true;
        btn.textContent = "Saved to mistake log";
        toast(`Saved to your ${c.short} mistake log in Notes`);
        return;
      }
      if (act === "quit") {
        if (btn.dataset.confirm) return submit(c);
        btn.dataset.confirm = "1";
        btn.textContent = exam ? "Tap again to submit" : "Tap again to finish";
      }
    });

    function choose(i) {
      if (revealed) return;
      s.answers[q.id] = i;
      renderRunner(c);
      const sel = $(`[data-choice="${i}"]`, main);
      if (sel) sel.focus({ preventScroll: true });
    }
    function check() {
      if (s.answers[q.id] === undefined || s.revealed[q.id]) return;
      s.revealed[q.id] = true;
      const right = s.answers[q.id] === q.answer;
      recordAttempt(q.id, right);
      s.streak = right ? s.streak + 1 : 0;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      save();
      renderRunner(c);
      const next = $('[data-act="next"],[data-act="submit"]', main);
      if (next) next.focus({ preventScroll: true });
      const fb = $(".feedback", main);
      if (fb && fb.scrollIntoView) {
        const r = fb.getBoundingClientRect();
        if (r.bottom > window.innerHeight) fb.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      if (right) {
        const el = $(".choice.correct", main);
        if ([3, 5, 10, 15, 20].includes(s.streak)) { Fx.celebrate("streak", el); toast(`${s.streak} in a row!`); }
        else Fx.celebrate("correct", el);
      }
    }

    keyHandler = (e) => {
      const k = e.key.toLowerCase();
      const map = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
      if (k in map && !revealed) { e.preventDefault(); return choose(map[k]); }
      if (k === "enter") {
        const b = $('[data-act="check"]:not([disabled]),[data-act="next"],[data-act="submit"]', main);
        const ae = document.activeElement;
        if (b && ae && ae.tagName === "BUTTON" && ae.dataset.choice === undefined && ae !== b) return; // let the focused button act
        if (b) { e.preventDefault(); b.click(); }
      }
      if (k === "arrowright" && (exam || revealed) && !last) { e.preventDefault(); s.idx++; renderRunner(c); }
      if (k === "arrowleft" && s.idx > 0) { e.preventDefault(); s.idx--; renderRunner(c); }
      if (k === "f") { e.preventDefault(); s.flagged[q.id] = !s.flagged[q.id]; renderRunner(c); }
    };

    if (exam) {
      const clock = $("#clock");
      const tick = () => {
        if (!session || session !== s || s.submitted) return clearInterval(sessionTick);
        const left = (s.endsAt - Date.now()) / 1000;
        if (clock && document.body.contains(clock)) {
          clock.textContent = fmtClock(left);
          clock.classList.toggle("is-low", left <= 60);
        }
        if (left <= 0) {
          clearInterval(sessionTick);
          toast("Time's up. Your set was submitted.");
          if (location.hash.startsWith(`#/c/${c.id}/mcq`)) submit(c);
          else finalize(c);
        }
      };
      clearInterval(sessionTick);
      sessionTick = setInterval(tick, 500);
      tick();
    }
  }

  function finalize(c) {
    const s = session;
    if (s.submitted) return;
    s.submitted = true;
    s.finishedAt = Date.now();
    clearInterval(sessionTick);
    if (s.mode === "exam") {
      s.qids.forEach((id) => {
        if (s.answers[id] !== undefined) recordAttempt(id, s.answers[id] === qById(c, id).answer);
      });
    }
    const scored = s.qids.filter((id) => s.mode === "exam" || s.revealed[id]);
    const right = scored.filter((id) => s.answers[id] === qById(c, id).answer).length;
    state.sessions.push({ course: c.id, mode: s.mode, right, total: s.mode === "exam" ? s.qids.length : scored.length, t: Date.now(), secs: Math.round((s.finishedAt - s.startedAt) / 1000) });
    state.sessions = state.sessions.slice(-60);
    saveNow();
  }

  function submit(c) {
    finalize(c);
    renderResults(c);
    window.scrollTo(0, 0);
  }

  function renderResults(c) {
    const s = session;
    const exam = s.mode === "exam";
    const ids = exam ? s.qids : s.qids.filter((id) => s.revealed[id]);
    const right = ids.filter((id) => s.answers[id] === qById(c, id).answer).length;
    const missedIds = ids.filter((id) => s.answers[id] !== qById(c, id).answer);
    const p = pct(right, ids.length);
    const byUnit = {};
    ids.forEach((id) => {
      const q = qById(c, id);
      const u = (byUnit[q.unit] = byUnit[q.unit] || { right: 0, total: 0 });
      u.total++;
      if (s.answers[id] === q.answer) u.right++;
    });
    const unitRows = Object.keys(byUnit)
      .map(Number)
      .sort((a, b) => a - b)
      .map((u) => `<div class="prog-row"><span>${esc(unitLabel(c, u))}: ${esc(unitTopic(c, u))}</span><span class="bar"><i style="width:${pct(byUnit[u].right, byUnit[u].total)}%"></i></span><span class="num">${byUnit[u].right}/${byUnit[u].total}</span></div>`)
      .join("");
    const review = s.qids
      .map((id, i) => {
        const q = qById(c, id);
        const a = s.answers[id];
        const counted = exam || s.revealed[id];
        const badge = !counted ? `<span class="badge skip">Not checked</span>` : a === undefined ? `<span class="badge skip">Skipped</span>` : a === q.answer ? `<span class="badge ok">Correct</span>` : `<span class="badge no">Missed</span>`;
        const trap = a !== undefined && a !== q.answer && q.notes && q.notes[String(a)];
        return `<details class="review-item" ${counted && a !== q.answer ? "open" : ""}>
            <summary>${badge}<span><b>Q${i + 1}.</b> ${esc(unitLabel(c, q.unit))}${s.flagged[id] ? ", flagged" : ""}</span></summary>
            <div style="margin-top:12px">
              ${q.stimulus ? `<div class="stimulus">${q.stimulus}</div>` : ""}
              <div class="question">${q.q}</div>
              <ol class="choices">${q.choices
                .map(bigFrac)
                .map((ch, j) => `<li><div class="choice ${j === q.answer ? "correct" : j === a ? "incorrect" : ""}"><span class="letter">${LETTERS[j]}</span><span>${ch}${j === q.answer ? '<span class="tag">Correct answer</span>' : j === a ? '<span class="tag">Your answer</span>' : ""}</span></div></li>`)
                .join("")}</ol>
              <div class="feedback"><p style="margin:0">${q.explain}</p>${trap ? `<p class="trap"><b>Why ${LETTERS[a]} is tempting:</b> ${trap}</p>` : ""}
              ${Notes && counted ? `<div class="feedback-actions"><button class="btn btn-small" data-save="${id}" ${s.saved[id] ? "disabled" : ""}>${s.saved[id] ? "Saved to mistake log" : "Save to mistake log"}</button></div>` : ""}</div>
            </div>
          </details>`;
      })
      .join("");
    const time = s.finishedAt ? fmtClock((s.finishedAt - s.startedAt) / 1000) : "";
    const verdict = !ids.length ? "" : p === 100 ? "Perfect set." : p >= 80 ? "Strong work." : p >= 60 ? "Solid progress. Review the misses below." : "Keep going. Every miss below is something you'll know next time.";
    main.innerHTML = shell(
      c,
      "mcq",
      `
      <section class="panel results-head">
        <h2>${exam ? "Timed set results" : "Practice set results"}</h2>
        ${ids.length ? `<div class="score-big" id="scoreBig">${right}/${ids.length}</div>
        <p><b>${esc(verdict)}</b> ${p}% correct${time ? ` in ${time}` : ""}.${exam ? ` The exam pace for this set was ${fmtClock(s.qids.length * c.mcqSecondsPerQuestion)}.` : ""}${s.bestStreak >= 3 ? ` Best streak: ${s.bestStreak} in a row.` : ""}</p>` : `<p>No answers were checked in this set.</p>`}
        <div class="btn-row">
          ${missedIds.length ? `<button class="btn btn-primary" data-act="retry">Retry the ${plural(missedIds.length, "question")} you missed</button>` : ""}
          <button class="btn ${missedIds.length ? "" : "btn-primary"}" data-act="new">Build a new set</button>
        </div>
      </section>
      ${unitRows ? `<section class="panel" style="margin-top:20px"><h2>By ${unitWord(c)}</h2>${unitRows}</section>` : ""}
      <section class="panel" style="margin-top:20px"><h2>Review</h2>${review}</section>`
    );
    typeset($("#view"), c);
    $('[data-act="new"]', main).addEventListener("click", () => { session = null; renderSetup(c); });
    const retry = $('[data-act="retry"]', main);
    if (retry) retry.addEventListener("click", () => startSession(c, shuffle(missedIds), "practice"));
    $$("[data-save]", main).forEach((b) =>
      b.addEventListener("click", () => {
        const q = qById(c, b.dataset.save);
        Notes.saveQuestion(c, q, s.answers[q.id], LETTERS, `${unitLabel(c, q.unit)}: ${unitTopic(c, q.unit)}`);
        s.saved[q.id] = true;
        b.disabled = true;
        b.textContent = "Saved to mistake log";
        toast(`Saved to your ${c.short} mistake log in Notes`);
      })
    );
    if (!s.celebrated && ids.length >= 3 && p >= 80) {
      s.celebrated = true;
      setTimeout(() => Fx.celebrate("big", $("#scoreBig")), 150);
    }
  }

  /* ================= FREE RESPONSE / SAQ ================= */
  function renderFrqList(c) {
    document.title = `${c.short} ${frqWord(c).toLowerCase()} · AP Study Hub`;
    const list = c.frq
      .map((f) => {
        const rec = state.frq[f.id];
        const best = rec && rec.scores && rec.scores.length ? Math.max(...rec.scores.map((x) => x.score)) : null;
        const units = f.unit.map((u) => unitLabel(c, u)).join(", ");
        return `<a class="frq-card" href="#/c/${c.id}/frq/${f.id}">
            <h3>${esc(f.title)}</h3>
            <span class="meta">${esc(f.type || (f.calculator ? "Calculator active" : "No calculator"))}, ${esc(units)}, ${f.totalPoints} points, about ${f.minutes} min</span>
            <span class="score-pill">${best === null ? (rec && rec.drafts && Object.values(rec.drafts).some((t) => t && t.trim()) ? "Draft saved" : "Not started") : `Best ${best}/${f.totalPoints}`}</span>
          </a>`;
      })
      .join("");
    const intros = {
      apush: "These follow the 2027 SAQ format: a source, then parts (a), (b), and (c), each worth 1 point. Write your answers, then check them against the scoring guide. On the exam you have 40 minutes for 3 required SAQs, about 13 minutes each.",
      world: "These follow the 2027 SAQ format: every SAQ has a source (secondary, primary, or non-text) and parts (a), (b), and (c), each worth 1 point. On the exam you have 40 minutes for 3 required SAQs from different periods.",
      psychology: "Practice the two exam FRQ types. The Article Analysis Question (AAQ) has parts A–F about one study. The Evidence-Based Question (EBQ) asks for a claim backed by evidence from two sources. Each is worth 7 points. Write your answers, then score yourself with the point-by-point guide.",
    };
    const intro = intros[c.id] || "Multi-part free-response questions in the AP style. Write your work for each part, then check it against the point-by-point scoring guide and mark the points you earned. Show your setup: on the real exam most points go to the setup and reasoning, not only the final number.";
    main.innerHTML = shell(c, "frq", `<p class="lede">${intro}</p><div class="frq-list">${list}</div>`);
  }

  function renderFrqDetail(c, f) {
    document.title = `${f.title} · ${c.short} · AP Study Hub`;
    const rec = (state.frq[f.id] = state.frq[f.id] || { drafts: {}, marks: {}, scores: [] });
    rec.drafts = rec.drafts || {};
    rec.marks = rec.marks || {};
    rec.scores = rec.scores || [];
    const revealed = !!rec.revealed;
    const partLabel = (l) => (l.length === 1 && l === l.toLowerCase() ? `(${l})` : l);
    const parts = f.parts
      .map((p, pi) => {
        const marks = rec.marks[p.label] || [];
        return `<section class="part" data-part="${esc(p.label)}">
          <div class="part-head"><span class="part-label">${esc(partLabel(p.label))}</span><div class="part-prompt">${p.prompt}</div><span class="part-points">${plural(p.points, "point")}</span></div>
          <label class="sr-only" for="ans-${pi}">Your answer for part ${esc(p.label)}</label>
          <textarea id="ans-${pi}" data-draft="${esc(p.label)}" placeholder="${isHistory(c) ? "Answer in 1–3 complete sentences. Be specific." : c.id === "psychology" ? "Use specific details from the study or sources." : "Write your setup, work, and answer with units."}"></textarea>
          <div class="wordcount" data-wc="${pi}"></div>
          ${revealed ? `<div class="rubric">
              <h4>Scoring guide: check each point you earned</h4>
              ${p.rubric.map((r, i) => `<label><input type="checkbox" data-mark="${esc(p.label)}" data-i="${i}" ${marks[i] ? "checked" : ""}><span>${r}</span></label>`).join("")}
              ${p.notes ? `<p class="pitfall"><b>Watch out:</b> ${p.notes}</p>` : ""}
            </div>` : ""}
        </section>`;
      })
      .join("");
    const scoreNow = () => f.parts.reduce((sum, p) => sum + (rec.marks[p.label] || []).filter(Boolean).length, 0);
    const best = rec.scores.length ? Math.max(...rec.scores.map((x) => x.score)) : null;

    main.innerHTML = shell(
      c,
      "frq",
      `
      <p><a href="#/c/${c.id}/frq">All ${frqWord(c).toLowerCase()} questions</a></p>
      <article class="panel">
        <h2>${esc(f.title)}</h2>
        <div class="frq-meta-row">
          ${f.type ? `<span class="pill">${esc(f.type)}</span>` : ""}
          ${c.id.startsWith("calc") ? `<span class="pill">${f.calculator ? "Graphing calculator required" : "No calculator"}</span>` : ""}
          <span class="pill">${f.totalPoints} points</span>
          <span class="pill">Suggested time: ${f.minutes} min</span>
          ${best !== null ? `<span class="pill">Your best: ${best}/${f.totalPoints}</span>` : ""}
        </div>
        <div class="btn-row" style="margin-bottom:18px">
          <button class="btn btn-small" id="frqTimerBtn">Start ${f.minutes}-minute timer</button>
          <span class="clock" id="frqClock" hidden role="timer"></span>
          ${Notes ? `<button class="btn btn-small" id="frqToNotes">Save to notes</button>` : ""}
        </div>
        <div class="stimulus">${f.stimulus}</div>
        ${parts}
        <div class="sticky-tally">
          ${revealed
            ? `<span><b>Your self-score: <span id="tally">${scoreNow()}</span>/${f.totalPoints}</b></span>
               <div class="btn-row"><button class="btn btn-primary" id="saveScore">Save score</button><button class="btn" id="clearFrq">Start over</button></div>`
            : `<span class="muted">Answer every part first. Then check yourself against the scoring guide.</span>
               <button class="btn btn-marker" id="revealBtn">Check against scoring guide</button>`}
        </div>
      </article>`
    );
    typeset($("#view"), c);

    $$("[data-draft]", main).forEach((ta, pi) => {
      const label = ta.dataset.draft;
      ta.value = typeof rec.drafts[label] === "string" ? rec.drafts[label] : "";
      const wc = $(`[data-wc="${pi}"]`, main);
      const grow = () => { ta.style.height = "auto"; ta.style.height = Math.max(120, ta.scrollHeight + 2) + "px"; };
      const showWc = () => {
        const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        wc.textContent = n ? `${plural(n, "word")}, saved` : "";
      };
      showWc();
      grow();
      ta.addEventListener("input", () => { rec.drafts[label] = ta.value; save(); showWc(); grow(); });
    });

    const toNotes = $("#frqToNotes");
    if (toNotes) toNotes.addEventListener("click", () => {
      const id = Notes.saveFrq(c, f, rec.drafts);
      toast("Saved as a new note");
      toNotes.outerHTML = `<a class="btn btn-small" href="#/c/${c.id}/notes/${id}">Open the note</a>`;
    });

    const reveal = $("#revealBtn");
    if (reveal)
      reveal.addEventListener("click", () => {
        const empty = f.parts.filter((p) => !(rec.drafts[p.label] || "").trim());
        if (empty.length && !reveal.dataset.confirm) {
          reveal.dataset.confirm = "1";
          reveal.textContent = `${empty.length === f.parts.length ? "All parts are" : `Part${empty.length > 1 ? "s" : ""} ${empty.map((p) => partLabel(p.label)).join(", ")} ${empty.length > 1 ? "are" : "is"}`} blank. Show the guide anyway?`;
          return;
        }
        rec.revealed = true;
        markStudied();
        saveNow();
        const y = window.scrollY;
        renderFrqDetail(c, f);
        window.scrollTo(0, y);
      });

    $$("[data-mark]", main).forEach((cb) =>
      cb.addEventListener("change", () => {
        const arr = (rec.marks[cb.dataset.mark] = rec.marks[cb.dataset.mark] || []);
        arr[Number(cb.dataset.i)] = cb.checked;
        save();
        $("#tally").textContent = scoreNow();
        if (cb.checked) Fx.celebrate("correct", cb);
      })
    );
    const saveBtn = $("#saveScore");
    if (saveBtn)
      saveBtn.addEventListener("click", () => {
        const sc = scoreNow();
        rec.scores.push({ score: sc, t: Date.now() });
        rec.scores = rec.scores.slice(-20);
        saveNow();
        const prevBest = best;
        toast(sc === f.totalPoints ? `Full marks: ${sc}/${f.totalPoints}!` : prevBest !== null && sc > prevBest ? `New best: ${sc}/${f.totalPoints}` : `Saved: ${sc}/${f.totalPoints}`);
        const y = window.scrollY;
        renderFrqDetail(c, f);
        window.scrollTo(0, y);
        if (sc === f.totalPoints) Fx.celebrate("big", $("#saveScore"));
        else if (sc / f.totalPoints >= 0.7 || (prevBest !== null && sc > prevBest)) Fx.celebrate("streak", $("#saveScore"));
      });
    const clearBtn = $("#clearFrq");
    if (clearBtn)
      clearBtn.addEventListener("click", () => {
        if (!clearBtn.dataset.confirm) {
          clearBtn.dataset.confirm = "1";
          clearBtn.textContent = "Tap again to clear your answers";
          return;
        }
        rec.drafts = {};
        rec.marks = {};
        rec.revealed = false;
        saveNow();
        renderFrqDetail(c, f);
        window.scrollTo(0, 0);
      });

    // Writing timer
    const tBtn = $("#frqTimerBtn"), tClock = $("#frqClock");
    let endsAt = null;
    clearInterval(frqTick);
    tBtn.addEventListener("click", () => {
      if (endsAt) {
        endsAt = null;
        clearInterval(frqTick);
        tClock.hidden = true;
        tBtn.textContent = `Start ${f.minutes}-minute timer`;
        return;
      }
      endsAt = Date.now() + f.minutes * 60000;
      tClock.hidden = false;
      tBtn.textContent = "Stop timer";
      const tick = () => {
        const left = (endsAt - Date.now()) / 1000;
        tClock.textContent = left >= 0 ? fmtClock(left) : "+" + fmtClock(-left) + " over";
        tClock.classList.toggle("is-low", left <= 60);
      };
      tick();
      frqTick = setInterval(tick, 500);
    });
  }

  /* ================= FLASHCARDS ================= */
  function renderCards(c) {
    document.title = `${c.short} flashcards · AP Study Hub`;
    const opts = c.units.map((u) => `<option value="${u.id}">${esc(unitLabel(c, u.id))}: ${esc(unitTopic(c, u.id))}</option>`).join("");
    main.innerHTML = shell(
      c,
      "cards",
      `
      <div class="panel">
        <div class="cards-top">
          <label class="deck-select">Deck <select id="deckUnit" class="input">
            <option value="all">All ${c.id === "apush" ? "periods" : "units"}</option>${opts}</select></label>
          <label class="chip"><input type="checkbox" id="hideKnown" checked><span>Skip cards I know</span></label>
        </div>
        <div id="cardArea"></div>
        <p class="kbd-hint" style="text-align:center">Shortcuts: <kbd>Space</kbd> to flip, <kbd>→</kbd> I know it, <kbd>←</kbd> still learning.</p>
        <p class="touch-hint">Tap the card to flip it. Swipe right if you know it, left if you're still learning.</p>
      </div>`
    );
    let deck = [], pos = 0, flipped = false, sessionKnown = 0;
    const inDeckCards = () => {
      const u = $("#deckUnit").value;
      return c.flashcards.map((card, i) => ({ card, key: c.id + ":" + i })).filter((x) => u === "all" || x.card.unit === Number(u));
    };
    const build = () => {
      const hide = $("#hideKnown").checked;
      const all = inDeckCards();
      const learning = all.filter((x) => state.cards[x.key] !== "know");
      deck = hide ? shuffle(learning) : shuffle(learning).concat(shuffle(all.filter((x) => state.cards[x.key] === "know")));
      pos = 0;
      flipped = false;
      sessionKnown = 0;
      draw();
    };
    const draw = () => {
      const area = $("#cardArea");
      const all = inDeckCards();
      const known = all.filter((x) => state.cards[x.key] === "know").length;
      if (pos >= deck.length) {
        const allKnown = known === all.length && all.length > 0;
        area.innerHTML = `<div class="empty" id="deckDone"><h3>${deck.length ? (allKnown ? "You know every card in this deck" : "Deck finished") : "You know every card in this deck"}</h3>
          <p>You've marked ${known} of ${all.length} cards as known.</p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-primary" id="again">Go through again</button>
            ${known ? `<button class="btn" id="resetCards">Mark all as still learning</button>` : ""}
          </div></div>`;
        $("#again").addEventListener("click", build);
        const r = $("#resetCards");
        if (r) r.addEventListener("click", () => { all.forEach((x) => delete state.cards[x.key]); save(); build(); });
        keyHandler = null;
        if (deck.length && (allKnown || sessionKnown >= 5)) Fx.celebrate(allKnown ? "big" : "streak", $("#deckDone h3"));
        return;
      }
      const { card, key } = deck[pos];
      area.innerHTML = `
        <div class="card-stage" id="cardStage">
          <button class="flashcard ${flipped ? "flipped" : ""}" id="flash" aria-label="${flipped ? "Showing answer. Activate to show the prompt." : "Showing prompt. Activate to reveal the answer."}">
            <div class="face front" aria-hidden="${flipped}"><span class="corner">${esc(unitLabel(c, card.unit))}</span><div class="face-body">${card.front}</div></div>
            <div class="face back" aria-hidden="${!flipped}"><span class="corner">Answer</span><div class="face-body">${card.back}</div></div>
          </button>
          <span class="swipe-label swipe-know" aria-hidden="true">I know it</span>
          <span class="swipe-label swipe-learn" aria-hidden="true">Still learning</span>
        </div>
        <div class="card-controls">
          <button class="btn" id="learn">Still learning</button>
          <button class="btn btn-primary" id="know">I know it</button>
        </div>
        <p class="card-count">Card ${pos + 1} of ${deck.length}${state.cards[key] === "know" ? " (marked known)" : ""}. ${known}/${all.length} known in this deck.</p>`;
      typeset(area, c);
      const flashEl = $("#flash");
      const flip = () => { flipped = !flipped; draw(); $("#flash").focus({ preventScroll: true }); };
      const mark = (v) => {
        state.cards[key] = v;
        if (v === "know") { sessionKnown++; Fx.celebrate("correct", $("#know")); }
        markStudied();
        save();
        pos++;
        flipped = false;
        draw();
      };
      // tap to flip; swipe to sort (touch). Touch events with a non-passive move so a horizontal
      // swipe isn't taken over by the browser's own panning (which cancels pointer events on iOS).
      let sx = 0, sy = 0, dx = 0, tracking = false, moved = false;
      const stage = $("#cardStage");
      flashEl.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        tracking = true; moved = false; dx = 0;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      flashEl.addEventListener("touchmove", (e) => {
        if (!tracking) return;
        dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) moved = true;
        if (moved) {
          e.preventDefault();
          flashEl.style.transition = "none";
          flashEl.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)${flipped ? " rotateY(180deg)" : ""}`;
          stage.dataset.swipe = dx > 40 ? "know" : dx < -40 ? "learn" : "";
        }
      }, { passive: false });
      const end = () => {
        if (!tracking) return;
        tracking = false;
        stage.dataset.swipe = "";
        flashEl.style.transition = "";
        if (moved && Math.abs(dx) > 90) { mark(dx > 0 ? "know" : "learn"); return; }
        flashEl.style.transform = "";
      };
      flashEl.addEventListener("touchend", end);
      flashEl.addEventListener("touchcancel", end);
      flashEl.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; return; } flip(); });
      $("#know").addEventListener("click", () => mark("know"));
      $("#learn").addEventListener("click", () => mark("learn"));
      keyHandler = (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (e.key === "ArrowRight" || e.key.toLowerCase() === "k") { e.preventDefault(); mark("know"); }
        else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") { e.preventDefault(); mark("learn"); }
      };
    };
    $("#deckUnit").addEventListener("change", build);
    $("#hideKnown").addEventListener("change", build);
    build();
  }

  /* ================= NOTES (course tab) ================= */
  function renderCourseNotes(c, openId) {
    document.title = `${c.short} notes · AP Study Hub`;
    main.classList.add("is-wide");
    main.innerHTML = shell(c, "notes", `<div id="notesHost"></div>`);
    if (Notes) Notes.render($("#notesHost"), { base: `#/c/${c.id}/notes`, course: c.id, openId });
  }

  /* ================= RESOURCES ================= */
  function renderResources(c) {
    document.title = `${c.short} resources · AP Study Hub`;
    const groups = [];
    c.resources.forEach((r) => {
      let g = groups.find((x) => x.name === r.group);
      if (!g) groups.push((g = { name: r.group, items: [] }));
      g.items.push(r);
    });
    groups.push({ name: "Exam day", items: DATA.sharedResources });
    const link = (r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">
        <span class="res-title">${esc(r.title)}</span><span class="res-domain">${esc(domainOf(r.url))}</span>
        <span class="res-desc">${esc(r.desc)}</span></a></li>`;
    const why = isHistory(c)
      ? "Every link is free and comes from a nonpartisan, credible source: the College Board, national archives and libraries, peer-reviewed open textbooks, and nonprofit course providers."
      : "Every link is free and comes from a professionally backed source, such as the College Board, a university, a professional organization, or a peer-reviewed open textbook, and is current within the last ten years.";
    main.innerHTML = shell(
      c,
      "resources",
      `<p class="lede">${why} Start with the College Board's past exam questions: nothing is closer to the real test.</p>
      ${groups.map((g) => `<section class="res-group"><h2>${esc(g.name)}</h2><ul class="res-list">${g.items.map(link).join("")}</ul></section>`).join("")}`
    );
  }

  /* ================= PROGRESS ================= */
  function renderProgress(c) {
    document.title = `${c.short} progress · AP Study Hub`;
    const s = courseStats(c);
    const unitRows = c.units
      .map((u) => {
        const us = unitStats(c, u.id);
        const label = `${unitLabel(c, u.id)}: ${unitTopic(c, u.id)}`;
        return `<div class="prog-row"><span>${esc(label)}<br><span class="muted" style="font-size:13px">${us.seen}/${us.total} tried</span></span>
          <span class="bar" role="img" aria-label="${us.seen ? pct(us.right, us.seen) + "% correct" : "not started"}"><i style="width:${us.seen ? pct(us.right, us.seen) : 0}%"></i></span>
          <span class="num">${us.seen ? pct(us.right, us.seen) + "%" : "–"}</span></div>`;
      })
      .join("");
    const frqRows = c.frq
      .map((f) => {
        const rec = state.frq[f.id];
        const sc = rec && rec.scores && rec.scores.length ? rec.scores : null;
        const best = sc ? Math.max(...sc.map((x) => x.score)) : null;
        return `<div class="prog-row"><span><a href="#/c/${c.id}/frq/${f.id}">${esc(f.title)}</a><br><span class="muted" style="font-size:13px">${sc ? plural(sc.length, "scored attempt") : "Not scored yet"}</span></span>
          <span class="bar"><i style="width:${best === null ? 0 : pct(best, f.totalPoints)}%"></i></span><span class="num">${best === null ? "–" : best + "/" + f.totalPoints}</span></div>`;
      })
      .join("");
    const recent = state.sessions.filter((x) => x.course === c.id).slice(-8).reverse();
    const recentRows = recent.length
      ? recent.map((x) => `<div class="prog-row"><span>${new Date(x.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${x.mode === "exam" ? "Timed" : "Practice"} set</span><span class="bar"><i style="width:${pct(x.right, x.total)}%"></i></span><span class="num">${x.right}/${x.total}</span></div>`).join("")
      : `<p class="muted">No sets finished yet.</p>`;
    const tried = c.units.map((u) => ({ u, st: unitStats(c, u.id) })).filter((x) => x.st.seen >= 2);
    const weakest = tried.sort((a, b) => a.st.right / a.st.seen - b.st.right / b.st.seen)[0];

    main.innerHTML = shell(
      c,
      "progress",
      `
      <div class="two-col" style="margin-top:0">
        <section class="panel">
          <h2>Multiple choice</h2>
          <p>${s.seen ? `You've tried <b>${s.seen}</b> of ${s.total} questions. On your latest try you got <b>${pct(s.right, s.seen)}%</b> right.` : "You haven't answered any questions yet."}
          ${weakest && weakest.st.right < weakest.st.seen ? ` Your weakest area so far is <b>${esc(unitLabel(c, weakest.u.id))}: ${esc(unitTopic(c, weakest.u.id))}</b>.` : ""}</p>
          <div class="btn-row">
            ${s.missed ? `<button class="btn btn-primary" id="practiceMissed">Retry ${plural(s.missed, "missed question")}</button>` : ""}
            <a class="btn" href="#/c/${c.id}/mcq">New practice set</a>
          </div>
        </section>
        <section class="panel">
          <h2>Flashcards</h2>
          <p><b>${s.cardsKnown}</b> of ${s.cardsTotal} cards marked as known.</p>
          <div class="bar"><i style="width:${pct(s.cardsKnown, s.cardsTotal)}%"></i></div>
          <p style="margin-top:14px"><a class="btn" href="#/c/${c.id}/cards">Study flashcards</a></p>
        </section>
      </div>
      <section class="panel" style="margin-top:20px"><h2>By ${unitWord(c)} (latest try)</h2>${unitRows}</section>
      <section class="panel" style="margin-top:20px"><h2>${frqWord(c)} self-scores</h2>${frqRows}</section>
      <section class="panel" style="margin-top:20px"><h2>Recent sets</h2>${recentRows}</section>
      <p style="margin-top:20px"><button class="btn btn-small" id="resetCourse">Reset my ${esc(c.short)} progress</button> <span class="hint">Notes aren't affected.</span></p>`
    );
    const pm = $("#practiceMissed");
    if (pm) pm.addEventListener("click", () => { pendingSetup = { courseId: c.id, pool: "missed" }; if (session && session.courseId === c.id) session = null; location.hash = `#/c/${c.id}/mcq`; });
    const rb = $("#resetCourse");
    rb.addEventListener("click", () => {
      if (!rb.dataset.confirm) { rb.dataset.confirm = "1"; rb.textContent = "Tap again to erase this course's progress"; return; }
      c.mcq.forEach((q) => delete state.mcq[q.id]);
      c.frq.forEach((f) => delete state.frq[f.id]);
      c.flashcards.forEach((_, i) => delete state.cards[c.id + ":" + i]);
      state.sessions = state.sessions.filter((x) => x.course !== c.id);
      if (session && session.courseId === c.id) session = null;
      saveNow();
      toast(`${c.short} progress reset`);
      renderProgress(c);
    });
  }

  /* ================= FOCUS TIMER ================= */
  const MODES = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const timer = { mode: "focus", left: MODES.focus, running: false, endAt: 0, iv: null };
  const chip = $("#timerChip"), panel = $("#timerPanel");
  function drawTimer() {
    const txt = fmtClock(timer.left);
    $("#timerFace").textContent = txt;
    const active = timer.running || timer.left !== MODES[timer.mode];
    $("#timerChipText").textContent = active ? (timer.mode === "focus" ? "Focus " : "Break ") + txt : "Focus";
    chip.classList.toggle("is-running", timer.running);
    $("#timerStart").textContent = timer.running ? "Pause" : timer.left !== MODES[timer.mode] ? "Resume" : "Start";
    const done = state.focus[dayKey()] || 0;
    $("#timerNote").textContent = done ? `${plural(done, "focus block")} finished today.` : "Work in focused blocks, then take a short break.";
    $$(".timer-modes button").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === timer.mode));
  }
  function beep() {
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, actx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.2, actx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.2);
        o.connect(g).connect(actx.destination);
        o.start(actx.currentTime + t);
        o.stop(actx.currentTime + t + 0.22);
      });
    } catch (e) { /* audio not available */ }
  }
  function setMode(m) {
    clearInterval(timer.iv);
    timer.mode = m; timer.left = MODES[m]; timer.running = false;
    drawTimer();
  }
  function timerTick() {
    timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    if (timer.left <= 0) {
      clearInterval(timer.iv);
      timer.running = false;
      beep();
      if (timer.mode === "focus") {
        const k = dayKey();
        state.focus = { [k]: (state.focus[k] || 0) + 1 }; // keep only today
        markStudied();
        save();
        toast("Focus block done. Take a 5-minute break.");
        Fx.celebrate("streak", chip);
        setMode("short");
      } else {
        toast("Break's over. Ready for another focus block?");
        setMode("focus");
      }
      return;
    }
    drawTimer();
  }
  $("#timerStart").addEventListener("click", () => {
    if (timer.running) {
      clearInterval(timer.iv);
      timer.running = false;
    } else {
      timer.endAt = Date.now() + timer.left * 1000;
      timer.running = true;
      clearInterval(timer.iv);
      timer.iv = setInterval(timerTick, 500);
    }
    drawTimer();
  });
  $("#timerReset").addEventListener("click", () => setMode(timer.mode));
  $$(".timer-modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  function closeTimerPanel() { panel.hidden = true; chip.setAttribute("aria-expanded", "false"); }
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    chip.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("#timerStart").focus();
  });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && !chip.contains(e.target)) closeTimerPanel(); });
  drawTimer();

  /* ================= EXPORT / IMPORT ================= */
  // Embedded previews block downloads, so only offer the export where it can work.
  if (framed) { const b = $("#exportBtn"); if (b) b.remove(); }
  const exportBtn = $("#exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => {
    saveNow();
    const payload = { app: "ap-study-hub", version: 2, exported: new Date().toISOString(), state, notes: Notes ? Notes.exportAll() : null };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ap-study-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || parsed.app !== "ap-study-hub" || !parsed.state) throw new Error("bad file");
        state = normalize(parsed.state);
        if (parsed.notes && Notes) Notes.importAll(parsed.notes);
        saveNow();
        applyTheme();
        Fx.setEnabled(state.settings.celebrate);
        drawFxBtn();
        session = null;
        toast("Progress and notes restored");
        route();
      } catch (err) {
        toast("That file isn't an AP Study Hub backup.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  route();
})();

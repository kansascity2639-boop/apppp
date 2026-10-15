/* Notes: a rich-text notebook that lives in the browser.
   Formatting toolbar, Markdown-style shortcuts, templates, equations (KaTeX), checklists, tables,
   per-note paper/font/size/color, tags, course filing, search, pin, focus mode, export. */
(() => {
  "use strict";

  const KEY = "apStudyHub.notes.v1";
  let ctx = null; // set by init(): { COURSES, byId, toast, framed }
  let store = loadStore();
  let saveTimer = null;

  /* ---------------- storage ---------------- */
  function loadStore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === "object" && s.notes) return { notes: s.notes, prefs: s.prefs || {}, mistakeLog: s.mistakeLog || {} };
      }
    } catch (e) { /* ignore */ }
    return { notes: {}, prefs: {}, mistakeLog: {} };
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      if (ctx) ctx.toast("Couldn't save: this browser's storage is full. Export some notes and delete them.");
      return false;
    }
  }
  function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); }
  window.addEventListener("pagehide", () => saveTimer && persist());

  /* ---------------- helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const plainText = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    $$(".eq", d).forEach((e) => (e.textContent = e.dataset.tex || ""));
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  };

  /* ---------------- sanitizer ---------------- */
  const ALLOWED = {
    P: [], BR: [], H1: [], H2: [], H3: [], STRONG: [], B: [], EM: [], I: [], U: [], S: [], STRIKE: [], DEL: [], SUB: [], SUP: [],
    MARK: [], SPAN: ["class", "style", "data-tex"], UL: ["class"], OL: [], LI: ["data-checked"], BLOCKQUOTE: [], PRE: [], CODE: [],
    HR: [], A: ["href"], TABLE: ["class"], THEAD: [], TBODY: [], TR: [], TH: ["colspan", "rowspan"], TD: ["colspan", "rowspan"],
    DIV: ["class"], FONT: ["color"],
  };
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TEMPLATE", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "NOSCRIPT", "VIDEO", "AUDIO", "IMG", "CANVAS"]);
  const CLASS_OK = /^(eq|eq-block|checklist|callout|callout-(key|example|question|definition)|cornell|note-table)$/;
  const COLOR_OK = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|inherit)$/i;

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstChild;
    (function clean(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) { child.remove(); return; }
        const tag = child.tagName;
        if (DROP.has(tag)) { child.remove(); return; }
        if (!ALLOWED[tag]) {
          clean(child);
          // unwrap unknown wrappers but keep block breaks
          const frag = doc.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
          return;
        }
        Array.from(child.attributes).forEach((a) => {
          const name = a.name.toLowerCase();
          if (!ALLOWED[tag].includes(name)) { child.removeAttribute(a.name); return; }
          if (name === "href" && !/^(https?:|mailto:)/i.test(a.value.trim())) child.removeAttribute(a.name);
          if (name === "class") {
            const keep = a.value.split(/\s+/).filter((c) => CLASS_OK.test(c));
            keep.length ? child.setAttribute("class", keep.join(" ")) : child.removeAttribute("class");
          }
          if (name === "style") {
            const keep = a.value.split(";").map((d) => d.trim()).filter(Boolean).filter((d) => {
              const [p, ...v] = d.split(":");
              const prop = (p || "").trim().toLowerCase();
              const val = v.join(":").trim();
              return (prop === "color" || prop === "background-color") && COLOR_OK.test(val);
            });
            keep.length ? child.setAttribute("style", keep.join("; ")) : child.removeAttribute("style");
          }
          if (name === "color" && !COLOR_OK.test(a.value)) child.removeAttribute(a.name);
          if (name === "data-checked" && a.value !== "true") child.removeAttribute(a.name);
        });
        if (tag === "A") { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
        if (tag === "SPAN" && child.classList.contains("eq")) {
          child.textContent = "";
          child.setAttribute("contenteditable", "false");
          return;
        }
        clean(child);
      });
    })(root);
    return root.innerHTML;
  }

  /* ---------------- equations ---------------- */
  function renderEq(span) {
    const tex = span.dataset.tex || "";
    span.setAttribute("contenteditable", "false");
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "0");
    span.setAttribute("aria-label", "Equation: " + tex + ". Activate to edit.");
    if (window.katex) {
      try { window.katex.render(tex, span, { throwOnError: false, displayMode: span.classList.contains("eq-block") }); return; } catch (e) { /* fall through */ }
    }
    span.textContent = tex;
  }
  function renderAllEq(root) { $$(".eq", root).forEach(renderEq); }
  /** Turn $...$ in authored course HTML into equation chips. */
  function mathToChips(html) {
    return html.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (m, a, b) => `<span class="eq${a ? " eq-block" : ""}" data-tex="${esc(a || b)}"></span>`);
  }

  /* ---------------- templates ---------------- */
  const TEMPLATES = [
    { id: "blank", name: "Blank page", desc: "Start from nothing.", title: "", html: () => "<p><br></p>" },
    {
      id: "class", name: "Class notes", desc: "Topic, key ideas, examples, questions, summary.", title: "Class notes",
      html: () => `<p><strong>Date:</strong> ${esc(today())} &nbsp; <strong>Topic:</strong> </p><h2>Key ideas</h2><ul><li><br></li></ul><h2>Examples</h2><ul><li><br></li></ul><h2>Questions to ask</h2><ul class="checklist"><li><br></li></ul><h2>Summary</h2><p><br></p>`,
    },
    {
      id: "cornell", name: "Cornell notes", desc: "Cues on the left, notes on the right, summary below.", title: "Cornell notes",
      html: () => `<p><strong>Date:</strong> ${esc(today())} &nbsp; <strong>Topic:</strong> </p><table class="cornell"><thead><tr><th>Cues and questions</th><th>Notes</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><h2>Summary</h2><p>In two or three sentences: </p>`,
    },
    {
      id: "vocab", name: "Vocabulary list", desc: "Term, definition, and an example of each.", title: "Vocabulary",
      html: () => `<table class="note-table"><thead><tr><th>Term</th><th>Definition</th><th>Example or why it matters</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>`,
    },
    {
      id: "source", name: "Source analysis", desc: "Historical situation, audience, purpose, point of view.", title: "Source analysis",
      html: () => `<p><strong>Source:</strong> &nbsp; <strong>Date:</strong> </p><h2>Main idea</h2><p><br></p><h2>Sourcing</h2><ul><li><strong>Historical situation:</strong> </li><li><strong>Intended audience:</strong> </li><li><strong>Purpose:</strong> </li><li><strong>Point of view:</strong> </li></ul><h2>Evidence I could use</h2><ul><li><br></li></ul><h2>Connections</h2><p><br></p>`,
    },
    {
      id: "problem", name: "Problem set", desc: "Given, setup, work, answer, and a check.", title: "Problem set",
      html: () => `<h2>Problem 1</h2><p><strong>Given:</strong> </p><p><strong>Find:</strong> </p><p><strong>Setup:</strong> </p><p><strong>Work:</strong> </p><p><strong>Answer (with units):</strong> </p><div class="callout callout-question"><p><strong>Check:</strong> Does the answer make sense?</p></div>`,
    },
    {
      id: "mistakes", name: "Mistake log", desc: "What went wrong, what's right, and what to review.", title: "Mistake log",
      html: () => `<table class="note-table"><thead><tr><th>Question</th><th>What I did</th><th>What's right</th><th>Concept to review</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody></table>`,
    },
    {
      id: "review", name: "Unit review sheet", desc: "Topic checklist, must-know facts, and practice plan.", title: "Unit review",
      html: () => `<h2>Topics</h2><ul class="checklist"><li>Topic 1</li><li>Topic 2</li><li>Topic 3</li></ul><h2>Must-know</h2><div class="callout callout-key"><p><strong>Key idea:</strong> </p></div><ul><li><br></li></ul><h2>Practice plan</h2><ul class="checklist"><li>10 multiple-choice questions</li><li>1 free-response question, timed</li><li>Flashcards for this unit</li></ul>`,
    },
  ];

  /* ---------------- model ---------------- */
  function newNote({ template = "blank", course = "", title } = {}) {
    const t = TEMPLATES.find((x) => x.id === template) || TEMPLATES[0];
    const c = course && ctx.byId[course];
    const note = {
      id: uid(),
      title: title != null ? title : t.title ? (c ? `${c.short}: ${t.title}` : t.title) : "",
      html: t.html(),
      course: course || "",
      tags: [],
      color: "none",
      pinned: false,
      paper: template === "cornell" ? "lined" : "plain",
      font: "sans",
      size: "m",
      created: Date.now(),
      updated: Date.now(),
    };
    store.notes[note.id] = note;
    persist();
    return note;
  }

  function listNotes({ course, query, sort }) {
    const q = (query || "").trim().toLowerCase();
    let arr = Object.values(store.notes);
    if (course) arr = arr.filter((n) => n.course === course);
    if (q) arr = arr.filter((n) => (n.title + " " + plainText(n.html) + " " + (n.tags || []).join(" ")).toLowerCase().includes(q));
    const by = sort || "updated";
    arr.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (by === "title") return (a.title || "Untitled").localeCompare(b.title || "Untitled");
      if (by === "created") return b.created - a.created;
      return b.updated - a.updated;
    });
    return arr;
  }

  /* ---------------- markdown export ---------------- */
  function toMarkdown(note) {
    const d = document.createElement("div");
    d.innerHTML = note.html;
    const inline = (node) => {
      let out = "";
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) { out += c.textContent; return; }
        if (c.nodeType !== 1) return;
        const t = c.tagName;
        const inner = inline(c);
        if (c.classList.contains("eq")) out += c.classList.contains("eq-block") ? `$$${c.dataset.tex}$$` : `$${c.dataset.tex}$`;
        else if (t === "STRONG" || t === "B") out += inner.trim() ? `**${inner}**` : inner;
        else if (t === "EM" || t === "I") out += inner.trim() ? `_${inner}_` : inner;
        else if (t === "S" || t === "STRIKE" || t === "DEL") out += `~~${inner}~~`;
        else if (t === "CODE") out += "`" + inner + "`";
        else if (t === "A") out += `[${inner}](${c.getAttribute("href") || ""})`;
        else if (t === "BR") out += "\n";
        else out += inner;
      });
      return out;
    };
    const lines = [`# ${note.title || "Untitled"}`, ""];
    const block = (el, depth = 0) => {
      const t = el.tagName;
      if (!t) { const s = el.textContent.trim(); if (s) lines.push(s, ""); return; }
      if (/^H[1-3]$/.test(t)) lines.push("#".repeat(Number(t[1]) + 1) + " " + inline(el).trim(), "");
      else if (t === "UL" || t === "OL") {
        Array.from(el.children).forEach((li, i) => {
          const sub = Array.from(li.children).filter((x) => x.tagName === "UL" || x.tagName === "OL");
          const clone = li.cloneNode(true);
          $$(":scope > ul, :scope > ol", clone).forEach((x) => x.remove());
          const mark = el.classList.contains("checklist") ? (li.dataset.checked === "true" ? "- [x] " : "- [ ] ") : t === "OL" ? `${i + 1}. ` : "- ";
          lines.push("  ".repeat(depth) + mark + inline(clone).trim());
          sub.forEach((s) => block(s, depth + 1));
        });
        if (!depth) lines.push("");
      } else if (t === "BLOCKQUOTE") lines.push(...inline(el).trim().split("\n").map((l) => "> " + l), "");
      else if (t === "PRE") lines.push("```", el.textContent.replace(/\n$/, ""), "```", "");
      else if (t === "HR") lines.push("---", "");
      else if (t === "TABLE") {
        const rows = $$("tr", el).map((tr) => $$("th,td", tr).map((c) => inline(c).replace(/\|/g, "\\|").replace(/\n/g, " ").trim()));
        if (rows.length) {
          lines.push("| " + rows[0].join(" | ") + " |", "| " + rows[0].map(() => "---").join(" | ") + " |");
          rows.slice(1).forEach((r) => lines.push("| " + r.join(" | ") + " |"));
          lines.push("");
        }
      } else if (t === "DIV") Array.from(el.childNodes).forEach((c) => (c.nodeType === 1 ? block(c, depth) : null));
      else { const s = inline(el).trim(); if (s) lines.push(s, ""); }
    };
    // group loose inline content at the top level into paragraphs
    const BLOCKS = /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|DIV)$/;
    let para = null;
    Array.from(d.childNodes).forEach((n) => {
      if (n.nodeType === 1 && BLOCKS.test(n.tagName)) { para = null; return; }
      if (!para) { para = document.createElement("p"); d.insertBefore(para, n); }
      para.appendChild(n);
    });
    Array.from(d.childNodes).forEach((n) => block(n));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileName = (note, ext) => ((note.title || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "note") + "." + ext;

  /* ---------------- UI ---------------- */
  const COLORS = [
    ["none", "No color"], ["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"], ["pink", "Pink"], ["purple", "Purple"],
  ];
  const HIGHLIGHTS = [["#FFE066", "Yellow"], ["#B9F2C7", "Green"], ["#BFDBFE", "Blue"], ["#FBCFE8", "Pink"], ["transparent", "None"]];
  const TEXT_COLORS = [["inherit", "Default"], ["#D93025", "Red"], ["#1A73E8", "Blue"], ["#188038", "Green"], ["#8E44AD", "Purple"], ["#E8710A", "Orange"]];
  const EQ_SNIPPETS = [
    ["\\frac{a}{b}", "a/b"], ["x^{2}", "x²"], ["x_{1}", "x₁"], ["\\sqrt{x}", "√"], ["\\int_{a}^{b} f(x)\\,dx", "∫"], ["\\sum_{n=1}^{\\infty}", "Σ"],
    ["\\lim_{x\\to a}", "lim"], ["\\frac{dy}{dx}", "dy/dx"], ["\\Delta", "Δ"], ["\\theta", "θ"], ["\\pi", "π"], ["\\le", "≤"], ["\\ge", "≥"],
    ["\\to", "→"], ["\\pm", "±"], ["\\times", "×"], ["^{\\circ}", "°"], ["\\ce{H2O}", "H₂O"], ["\\ce{A + B -> C}", "A+B→C"], ["\\ce{<=>}", "⇌"],
  ];

  /** Render the notes app into `container`. opts: { base, course, openId } */
  let renderAbort = null;
  function teardown() {
    if (renderAbort) renderAbort.abort();
    renderAbort = null;
    document.body.classList.remove("notes-focus");
  }
  function render(container, opts) {
    teardown();
    renderAbort = new AbortController();
    const sig = renderAbort.signal;
    const base = opts.base; // e.g. "#/notes" or "#/c/calc-ab/notes"
    const fixedCourse = opts.course || "";
    const prefs = store.prefs;
    let query = "";
    let filterCourse = fixedCourse || prefs.filterCourse || "";
    let openId = opts.openId && store.notes[opts.openId] ? opts.openId : null;

    container.innerHTML = `
      <div class="notes-app ${openId ? "has-open" : ""}" id="notesApp">
        <aside class="notes-side" aria-label="Your notes">
          <div class="notes-side-head">
            <h2>${fixedCourse ? esc(ctx.byId[fixedCourse].short) + " notes" : "Notes"}</h2>
            <div class="new-wrap">
              <button class="btn btn-primary btn-small" id="newNoteBtn" aria-haspopup="true" aria-expanded="false">New note</button>
              <div class="menu" id="templateMenu" hidden role="menu">
                ${TEMPLATES.map((t) => `<button role="menuitem" data-template="${t.id}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join("")}
              </div>
            </div>
          </div>
          <label class="sr-only" for="noteSearch">Search notes</label>
          <input type="search" id="noteSearch" class="input" placeholder="Search notes and tags" autocomplete="off">
          <div class="notes-filters">
            ${fixedCourse ? "" : `<label class="sr-only" for="noteCourseFilter">Course</label><select id="noteCourseFilter" class="input"><option value="">All courses</option>${ctx.COURSES.map((c) => `<option value="${c.id}" ${c.id === filterCourse ? "selected" : ""}>${esc(c.short)}</option>`).join("")}<option value="__none" ${filterCourse === "__none" ? "selected" : ""}>Not filed</option></select>`}
            <label class="sr-only" for="noteSort">Sort</label>
            <select id="noteSort" class="input">
              <option value="updated" ${prefs.sort !== "title" && prefs.sort !== "created" ? "selected" : ""}>Last edited</option>
              <option value="created" ${prefs.sort === "created" ? "selected" : ""}>Newest</option>
              <option value="title" ${prefs.sort === "title" ? "selected" : ""}>Title A–Z</option>
            </select>
          </div>
          <ul class="note-list" id="noteList"></ul>
        </aside>
        <section class="notes-main" id="notesMain" aria-label="Note editor"></section>
      </div>`;

    const app = $("#notesApp", container);
    const listEl = $("#noteList", container);
    const mainEl = $("#notesMain", container);

    /* ----- list ----- */
    function drawList() {
      const fc = filterCourse === "__none" ? null : filterCourse;
      let arr = listNotes({ course: fc, query, sort: prefs.sort });
      if (filterCourse === "__none") arr = arr.filter((n) => !n.course);
      if (!arr.length) {
        listEl.innerHTML = `<li class="note-empty">${query ? "No notes match your search." : "No notes yet. Use New note to start one, or pick a template on the right."}</li>`;
        return;
      }
      listEl.innerHTML = arr
        .map((n) => {
          const c = n.course && ctx.byId[n.course];
          const snippet = plainText(n.html).slice(0, 90);
          return `<li><a href="${base}/${n.id}" class="note-item color-${n.color || "none"} ${n.id === openId ? "is-open" : ""}" ${n.id === openId ? 'aria-current="true"' : ""}>
              <span class="note-item-title">${n.pinned ? '<span class="pin-dot" aria-label="Pinned"></span>' : ""}${esc(n.title || "Untitled")}</span>
              <span class="note-item-snippet">${esc(snippet || "Empty note")}</span>
              <span class="note-item-meta">${c ? `<span class="course-chip" style="--accent:var(--${c.accent})">${esc(c.short)}</span>` : ""}${(n.tags || []).slice(0, 3).map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join("")}<span>${ago(n.updated)}</span></span>
            </a></li>`;
        })
        .join("");
    }

    $("#noteSearch", container).addEventListener("input", (e) => { query = e.target.value; drawList(); });
    const cf = $("#noteCourseFilter", container);
    if (cf) cf.addEventListener("change", () => { filterCourse = cf.value; prefs.filterCourse = cf.value; persistSoon(); drawList(); });
    $("#noteSort", container).addEventListener("change", (e) => { prefs.sort = e.target.value; persistSoon(); drawList(); });

    const newBtn = $("#newNoteBtn", container), menu = $("#templateMenu", container);
    const closeMenu = () => { menu.hidden = true; newBtn.setAttribute("aria-expanded", "false"); };
    newBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      newBtn.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) $("button", menu).focus();
    });
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== newBtn) closeMenu(); }, { capture: true, signal: sig });
    menu.addEventListener("keydown", (e) => {
      const items = $$("button", menu);
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === "Escape") { closeMenu(); newBtn.focus(); }
    });
    const create = (template) => {
      const fc = fixedCourse || (filterCourse && filterCourse !== "__none" ? filterCourse : "");
      const n = newNote({ template, course: fc });
      closeMenu();
      location.hash = `${base}/${n.id}`;
    };
    $$("[data-template]", menu).forEach((b) => b.addEventListener("click", () => create(b.dataset.template)));

    /* ----- editor or empty state ----- */
    if (!openId) {
      mainEl.innerHTML = `
        <div class="notes-welcome">
          <h2>Start a note</h2>
          <p class="muted">Notes save automatically in this browser. Pick a layout to begin. You can change anything afterward.</p>
          <div class="template-grid">
            ${TEMPLATES.map((t) => `<button class="template-card" data-template="${t.id}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join("")}
          </div>
          <details class="notes-help">
            <summary>Formatting shortcuts</summary>
            <ul>
              <li>Type <kbd>#</kbd>, <kbd>##</kbd>, or <kbd>###</kbd> then a space for headings.</li>
              <li>Type <kbd>-</kbd> or <kbd>*</kbd> then a space for bullets, <kbd>1.</kbd> for numbers, <kbd>[]</kbd> for a checklist.</li>
              <li>Type <kbd>&gt;</kbd> then a space for a quote, <kbd>---</kbd> then Enter for a divider.</li>
              <li><kbd>Ctrl/⌘ B</kbd> bold, <kbd>I</kbd> italic, <kbd>U</kbd> underline, <kbd>K</kbd> link, <kbd>E</kbd> equation, <kbd>⇧H</kbd> highlight.</li>
            </ul>
          </details>
        </div>`;
      $$("[data-template]", mainEl).forEach((b) => b.addEventListener("click", () => create(b.dataset.template)));
      drawList();
      return;
    }

    const note = store.notes[openId];
    note.tags = note.tags || [];
    const courseOptions = `<option value="">Not filed</option>${ctx.COURSES.map((c) => `<option value="${c.id}" ${c.id === note.course ? "selected" : ""}>${esc(c.short)}</option>`).join("")}`;
    const canDownload = !ctx.framed;

    mainEl.innerHTML = `
      <div class="editor">
        <div class="editor-top">
          <a class="btn btn-small editor-back" href="${base}">All notes</a>
          <label class="sr-only" for="noteTitle">Note title</label>
          <input id="noteTitle" class="note-title" placeholder="Untitled note" value="${esc(note.title)}" autocomplete="off">
          <div class="editor-actions">
            <button class="icon-btn" id="pinBtn" aria-pressed="${note.pinned}" title="${note.pinned ? "Unpin" : "Pin to top"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 4 4H6l4-4-1-6zM12 14v6"/></svg><span class="sr-only">${note.pinned ? "Unpin" : "Pin"}</span></button>
            <button class="icon-btn" id="focusBtn" title="Focus mode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="sr-only">Focus mode</span></button>
            <div class="new-wrap">
              <button class="icon-btn" id="moreBtn" aria-haspopup="true" aria-expanded="false" title="More"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span class="sr-only">More actions</span></button>
              <div class="menu menu-right" id="moreMenu" hidden role="menu">
                <button role="menuitem" data-act="copy-md"><b>Copy as text</b><span>Markdown, for pasting anywhere</span></button>
                ${canDownload ? `<button role="menuitem" data-act="dl-md"><b>Download .md</b><span>Markdown file</span></button>
                <button role="menuitem" data-act="dl-html"><b>Download .html</b><span>Opens in any browser or Word</span></button>
                <button role="menuitem" data-act="print"><b>Print or save as PDF</b><span>Uses your browser's print dialog</span></button>` : ""}
                <button role="menuitem" data-act="duplicate"><b>Duplicate</b><span>Make a copy of this note</span></button>
                <button role="menuitem" data-act="delete" class="danger"><b>Delete note</b><span>This can't be undone</span></button>
              </div>
            </div>
          </div>
        </div>

        <details class="customize" ${store.prefs.customizeOpen ? "open" : ""}>
          <summary>Customize</summary>
          <div class="customize-grid">
            <label>Course <select id="noteCourse" class="input">${courseOptions}</select></label>
            <label>Tags <input id="noteTags" class="input" placeholder="unit 3, exam review" value="${esc(note.tags.join(", "))}"></label>
            <fieldset class="seg"><legend>Color</legend>${COLORS.map(([v, l]) => `<label class="swatch swatch-${v}" title="${l}"><input type="radio" name="noteColor" value="${v}" ${note.color === v ? "checked" : ""}><span class="sr-only">${l}</span></label>`).join("")}</fieldset>
            <fieldset class="seg"><legend>Paper</legend>${[["plain", "Plain"], ["lined", "Lined"], ["grid", "Grid"], ["dots", "Dots"]].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="notePaper" value="${v}" ${note.paper === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
            <fieldset class="seg"><legend>Font</legend>${[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"], ["hand", "Handwritten"]].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="noteFont" value="${v}" ${note.font === v ? "checked" : ""}><span class="font-${v}">${l}</span></label>`).join("")}</fieldset>
            <fieldset class="seg"><legend>Text size</legend>${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="noteSize" value="${v}" ${note.size === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
          </div>
        </details>

        <div class="toolbar" role="toolbar" aria-label="Formatting" id="toolbar">
          <div class="tb-group">
            <button data-cmd="undo" title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg><span class="sr-only">Undo</span></button>
            <button data-cmd="redo" title="Redo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/></svg><span class="sr-only">Redo</span></button>
          </div>
          <div class="tb-group">
            <label class="sr-only" for="blockStyle">Text style</label>
            <select id="blockStyle" title="Text style">
              <option value="p">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option><option value="pre">Code block</option>
            </select>
          </div>
          <div class="tb-group">
            <button data-cmd="bold" title="Bold (Ctrl/⌘ B)"><b>B</b></button>
            <button data-cmd="italic" title="Italic (Ctrl/⌘ I)"><i>I</i></button>
            <button data-cmd="underline" title="Underline (Ctrl/⌘ U)"><u>U</u></button>
            <button data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
            <button data-pop="hl" title="Highlight (Ctrl/⌘ Shift H)"><span class="hl-icon">H</span></button>
            <button data-pop="color" title="Text color"><span class="color-icon">A</span></button>
          </div>
          <div class="tb-group">
            <button data-cmd="insertUnorderedList" title="Bulleted list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg><span class="sr-only">Bulleted list</span></button>
            <button data-cmd="insertOrderedList" title="Numbered list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5c0-1 2.5-1 2.5.3 0 1-2.5 2-2.5 3.7h3"/></svg><span class="sr-only">Numbered list</span></button>
            <button data-act="checklist" title="Checklist"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="6" height="6" rx="1"/><path d="M4.5 7l1.3 1.3L8 6M12 7h9M3 15h6v6H3zM12 18h9"/></svg><span class="sr-only">Checklist</span></button>
            <button data-cmd="outdent" title="Decrease indent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H11M21 12H11M21 18H11M7 9l-3 3 3 3"/></svg><span class="sr-only">Decrease indent</span></button>
            <button data-cmd="indent" title="Increase indent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H11M21 12H11M21 18H11M4 9l3 3-3 3"/></svg><span class="sr-only">Increase indent</span></button>
          </div>
          <div class="tb-group">
            <button data-act="eq" title="Equation (Ctrl/⌘ E)"><span class="eq-icon">∑</span><span class="tb-label">Equation</span></button>
            <button data-act="link" title="Link (Ctrl/⌘ K)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg><span class="sr-only">Link</span></button>
            <button data-pop="block" title="Insert box"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/></svg><span class="tb-label">Box</span></button>
            <button data-act="table" title="Insert table"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg><span class="sr-only">Insert table</span></button>
            <button data-act="hr" title="Divider"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18"/></svg><span class="sr-only">Divider</span></button>
            <button data-cmd="removeFormat" title="Clear formatting"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12M12 5l-3 14M4 20L20 4"/></svg><span class="sr-only">Clear formatting</span></button>
          </div>
          <div class="tb-group tb-table" id="tableTools" hidden>
            <button data-act="row-add" title="Add row">+ Row</button>
            <button data-act="col-add" title="Add column">+ Column</button>
            <button data-act="row-del" title="Delete row">− Row</button>
            <button data-act="col-del" title="Delete column">− Column</button>
          </div>
        </div>

        <div class="pop" id="pop" hidden></div>

        <div class="note-page paper-${note.paper} font-${note.font} size-${note.size} color-${note.color}" id="noteBody"
             contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note text" spellcheck="true"></div>

        <div class="editor-status" aria-live="polite"><span id="saveState">Saved</span><span id="wordCount"></span><span class="muted">Created ${esc(new Date(note.created).toLocaleDateString())}</span></div>
      </div>`;

    const body = $("#noteBody", mainEl);
    body.innerHTML = sanitize(note.html || "<p><br></p>");
    renderAllEq(body);
    try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* ignore */ }
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* ignore */ }

    const saveState = $("#saveState", mainEl), wc = $("#wordCount", mainEl);
    function serialize() {
      const clone = body.cloneNode(true);
      $$(".eq", clone).forEach((e) => { e.innerHTML = ""; e.removeAttribute("role"); e.removeAttribute("tabindex"); e.removeAttribute("aria-label"); });
      return sanitize(clone.innerHTML);
    }
    function updateCount() {
      const txt = plainText(body.innerHTML);
      const n = txt ? txt.split(/\s+/).length : 0;
      wc.textContent = `${n} ${n === 1 ? "word" : "words"}`;
    }
    let dirtyTimer = null;
    function markDirty() {
      saveState.textContent = "Saving…";
      clearTimeout(dirtyTimer);
      dirtyTimer = setTimeout(commit, 400);
    }
    function commit() {
      clearTimeout(dirtyTimer);
      note.html = serialize();
      note.updated = Date.now();
      const ok = persist();
      saveState.textContent = ok ? "Saved" : "Not saved: storage full";
      updateCount();
      drawList();
    }
    updateCount();
    drawList();

    /* ----- meta ----- */
    const titleEl = $("#noteTitle", mainEl);
    titleEl.addEventListener("input", () => { note.title = titleEl.value; markDirty(); });
    titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); body.focus(); } });
    if (!note.title && plainText(note.html) === "") setTimeout(() => titleEl.focus(), 0);
    $("#noteCourse", mainEl).addEventListener("change", (e) => { note.course = e.target.value; commit(); });
    $("#noteTags", mainEl).addEventListener("change", (e) => {
      note.tags = e.target.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 12);
      e.target.value = note.tags.join(", ");
      commit();
    });
    const setPageClass = () => { body.className = `note-page paper-${note.paper} font-${note.font} size-${note.size} color-${note.color}`; };
    [["noteColor", "color"], ["notePaper", "paper"], ["noteFont", "font"], ["noteSize", "size"]].forEach(([name, prop]) =>
      $$(`input[name="${name}"]`, mainEl).forEach((r) => r.addEventListener("change", () => { note[prop] = r.value; setPageClass(); commit(); }))
    );
    $(".customize", mainEl).addEventListener("toggle", (e) => { store.prefs.customizeOpen = e.target.open; persistSoon(); });

    $("#pinBtn", mainEl).addEventListener("click", (e) => {
      note.pinned = !note.pinned;
      e.currentTarget.setAttribute("aria-pressed", String(note.pinned));
      e.currentTarget.title = note.pinned ? "Unpin" : "Pin to top";
      ctx.toast(note.pinned ? "Pinned to the top of your list" : "Unpinned");
      commit();
    });
    const focusBtn = $("#focusBtn", mainEl);
    const setFocus = (on) => {
      document.body.classList.toggle("notes-focus", on);
      focusBtn.setAttribute("aria-pressed", String(on));
      if (on) ctx.toast("Focus mode. Press Esc to exit.");
    };
    focusBtn.addEventListener("click", () => setFocus(!document.body.classList.contains("notes-focus")));

    /* ----- more menu ----- */
    const moreBtn = $("#moreBtn", mainEl), moreMenu = $("#moreMenu", mainEl);
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moreMenu.hidden = !moreMenu.hidden;
      moreBtn.setAttribute("aria-expanded", String(!moreMenu.hidden));
    });
    document.addEventListener("click", (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) { moreMenu.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); } }, { capture: true, signal: sig });
    moreMenu.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      commit();
      const act = b.dataset.act;
      if (act === "copy-md") {
        const md = toMarkdown(note);
        try { await navigator.clipboard.writeText(md); ctx.toast("Copied as text"); }
        catch (err) {
          const ta = document.createElement("textarea");
          ta.value = md; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); ctx.toast("Copied as text"); } catch (e2) { ctx.toast("Couldn't copy. Select the text and copy it manually."); }
          ta.remove();
        }
      } else if (act === "dl-md") download(fileName(note, "md"), toMarkdown(note), "text/markdown");
      else if (act === "dl-html") {
        const page = body.cloneNode(true);
        $$(".eq", page).forEach((x) => { x.removeAttribute("role"); x.removeAttribute("tabindex"); });
        download(fileName(note, "html"), `<!doctype html><meta charset="utf-8"><title>${esc(note.title || "Note")}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css"><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px 10px}.callout{border-left:4px solid #999;padding:6px 12px;background:#f5f5f5}ul.checklist li[data-checked=true]{text-decoration:line-through}</style><h1>${esc(note.title || "Note")}</h1>${page.innerHTML}`, "text/html");
      } else if (act === "print") { document.body.classList.add("print-note"); window.print(); setTimeout(() => document.body.classList.remove("print-note"), 500); }
      else if (act === "duplicate") {
        const copy = Object.assign({}, note, { id: uid(), title: (note.title || "Untitled") + " (copy)", created: Date.now(), updated: Date.now(), pinned: false, tags: note.tags.slice() });
        store.notes[copy.id] = copy;
        persist();
        location.hash = `${base}/${copy.id}`;
      } else if (act === "delete") {
        if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.querySelector("b").textContent = "Click again to delete"; return; }
        delete store.notes[note.id];
        Object.keys(store.mistakeLog).forEach((k) => { if (store.mistakeLog[k] === note.id) delete store.mistakeLog[k]; });
        persist();
        ctx.toast("Note deleted");
        document.body.classList.remove("notes-focus");
        location.hash = base;
        return;
      }
      moreMenu.hidden = true;
    });

    /* ----- selection helpers ----- */
    let savedRange = null;
    const saveSel = () => {
      const s = window.getSelection();
      if (s.rangeCount && body.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
    };
    const restoreSel = () => {
      const s = window.getSelection();
      if (s.rangeCount && body.contains(s.anchorNode) && document.activeElement === body) return; // already where we want it
      body.focus({ preventScroll: true });
      if (savedRange && body.contains(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); }
    };
    const exec = (cmd, val = null) => { restoreSel(); document.execCommand(cmd, false, val); saveSel(); markDirty(); syncToolbar(); };
    const currentBlock = () => {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      let n = s.anchorNode;
      while (n && n !== body) {
        if (n.nodeType === 1 && /^(P|H1|H2|H3|LI|BLOCKQUOTE|PRE|DIV|TD|TH)$/.test(n.tagName)) return n;
        n = n.parentNode;
      }
      return null;
    };
    const closestIn = (tag) => {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      let n = s.anchorNode;
      while (n && n !== body) { if (n.nodeType === 1 && n.tagName === tag) return n; n = n.parentNode; }
      return null;
    };

    function syncToolbar() {
      const blk = currentBlock();
      let tag = "p";
      let n = blk;
      while (n && n !== body) {
        if (/^(H1|H2|H3|BLOCKQUOTE|PRE)$/.test(n.tagName)) { tag = n.tagName.toLowerCase(); break; }
        n = n.parentNode;
      }
      $("#blockStyle", mainEl).value = tag;
      ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList"].forEach((c) => {
        const b = $(`[data-cmd="${c}"]`, mainEl);
        let on = false;
        try { on = document.queryCommandState(c); } catch (e) { /* ignore */ }
        if (b) b.setAttribute("aria-pressed", String(on));
      });
      $("#tableTools", mainEl).hidden = !closestIn("TABLE");
    }
    document.addEventListener("selectionchange", () => {
      if (!document.body.contains(body)) return;
      const s = window.getSelection();
      if (s.rangeCount && body.contains(s.anchorNode)) { saveSel(); syncToolbar(); }
    }, { signal: sig });

    /* ----- toolbar ----- */
    const toolbar = $("#toolbar", mainEl);
    toolbar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); }); // keep selection
    toolbar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.cmd) return exec(b.dataset.cmd);
      if (b.dataset.pop) return openPop(b.dataset.pop, b);
      const a = b.dataset.act;
      if (a === "checklist") toggleChecklist();
      else if (a === "eq") openEq(null);
      else if (a === "link") openPop("link", b);
      else if (a === "table") insertHTML(`<table class="note-table"><thead><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>`);
      else if (a === "hr") insertHTML("<hr><p><br></p>");
      else tableAction(a);
    });
    $("#blockStyle", mainEl).addEventListener("change", (e) => { exec("formatBlock", `<${e.target.value}>`); });

    // Sentinel colors mark "remove this color"; we unwrap them afterward so the theme color shows through.
    const CLEAR_FG = "#010203", CLEAR_BG = "#010204";
    function unwrap(el) { const p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); el.remove(); }
    function normalizeColors() {
      $$("font", body).forEach((f) => {
        const c = (f.getAttribute("color") || "").toLowerCase();
        if (c === CLEAR_FG) unwrap(f);
      });
      $$("[style]", body).forEach((el) => {
        const st = el.style;
        const bg = st.backgroundColor.replace(/\s/g, ""), fg = st.color.replace(/\s/g, "");
        if (bg === "rgb(1,2,4)" || bg === "transparent") st.backgroundColor = "";
        if (fg === "rgb(1,2,3)") st.color = "";
        if (!el.getAttribute("style").trim()) { el.removeAttribute("style"); if (el.tagName === "SPAN" && !el.className) unwrap(el); }
      });
    }
    function applyHighlight(v) {
      restoreSel();
      const val = v === "transparent" ? CLEAR_BG : v;
      document.execCommand("styleWithCSS", false, true);
      if (!document.execCommand("hiliteColor", false, val)) document.execCommand("backColor", false, val);
      document.execCommand("styleWithCSS", false, false);
      normalizeColors();
      saveSel();
      markDirty();
    }
    function applyColor(v) {
      restoreSel();
      document.execCommand("foreColor", false, v === "inherit" ? CLEAR_FG : v);
      normalizeColors();
      saveSel();
      markDirty();
    }

    function insertNodeAtCaret(tex, block) {
      restoreSel();
      const sel = window.getSelection();
      if (!sel.rangeCount || !body.contains(sel.anchorNode)) { body.focus(); const r0 = document.createRange(); r0.selectNodeContents(body); r0.collapse(false); sel.removeAllRanges(); sel.addRange(r0); }
      const r = sel.getRangeAt(0);
      r.deleteContents();
      // If the caret sits at the end of a bold/italic/underline run that's been switched off, insert after it.
      const fmt = { B: "bold", STRONG: "bold", I: "italic", EM: "italic", U: "underline" };
      let node = r.startContainer;
      const atEnd = (n, off) => (n.nodeType === 3 ? off >= n.textContent.length : off >= n.childNodes.length);
      if (atEnd(node, r.startOffset)) {
        let el = node.nodeType === 3 ? node.parentNode : node;
        while (el && el !== body && fmt[el.tagName] && !(eqFmt[fmt[el.tagName]]) && (el.lastChild === node || el === node)) {
          r.setStartAfter(el); r.collapse(true);
          node = el; el = el.parentNode;
        }
      }
      const span = document.createElement("span");
      span.className = "eq" + (block ? " eq-block" : "");
      span.dataset.tex = tex;
      const space = document.createTextNode("\u00a0");
      r.insertNode(space);
      r.insertNode(span);
      renderEq(span);
      const after = document.createRange();
      after.setStartAfter(space);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      saveSel();
      markDirty();
    }

    function insertHTML(html) {
      restoreSel();
      document.execCommand("insertHTML", false, html);
      renderAllEq(body);
      saveSel();
      markDirty();
    }

    function toggleChecklist() {
      restoreSel();
      const ul = closestIn("UL");
      if (ul) { ul.classList.toggle("checklist"); markDirty(); return; }
      // Build the list by hand: execCommand would merge it into a neighboring list.
      const blk = currentBlock();
      const list = document.createElement("ul");
      list.className = "checklist";
      const li = document.createElement("li");
      list.appendChild(li);
      if (blk && blk !== body && /^(P|DIV|H1|H2|H3|BLOCKQUOTE)$/.test(blk.tagName) && !blk.classList.contains("callout")) {
        while (blk.firstChild) li.appendChild(blk.firstChild);
        blk.replaceWith(list);
      } else {
        const s = window.getSelection();
        const r = s.getRangeAt(0);
        r.insertNode(list);
      }
      if (!li.textContent.trim() && !li.querySelector(".eq")) li.innerHTML = "<br>";
      const r2 = document.createRange();
      r2.selectNodeContents(li);
      r2.collapse(false);
      const s2 = window.getSelection();
      s2.removeAllRanges();
      s2.addRange(r2);
      saveSel();
      markDirty();
    }

    function tableAction(a) {
      restoreSel();
      const cell = closestIn("TD") || closestIn("TH");
      const table = closestIn("TABLE");
      if (!cell || !table) return;
      const row = cell.parentNode;
      const idx = Array.from(row.children).indexOf(cell);
      if (a === "row-add") {
        const r = document.createElement("tr");
        Array.from(row.children).forEach(() => { const td = document.createElement("td"); td.innerHTML = "<br>"; r.appendChild(td); });
        (row.parentNode.tagName === "THEAD" ? table.tBodies[0] || table.createTBody() : row.parentNode).insertBefore(r, row.parentNode.tagName === "THEAD" ? (table.tBodies[0] || {}).firstChild || null : row.nextSibling);
      } else if (a === "col-add") {
        $$("tr", table).forEach((tr) => {
          const ref = tr.children[idx];
          const c = document.createElement(tr.parentNode.tagName === "THEAD" ? "th" : "td");
          c.innerHTML = "<br>";
          tr.insertBefore(c, ref ? ref.nextSibling : null);
        });
      } else if (a === "row-del") {
        if ($$("tr", table).length <= 1) table.remove(); else row.remove();
      } else if (a === "col-del") {
        if (row.children.length <= 1) table.remove(); else $$("tr", table).forEach((tr) => tr.children[idx] && tr.children[idx].remove());
      }
      markDirty();
      syncToolbar();
    }

    /* ----- popovers ----- */
    const pop = $("#pop", mainEl);
    function placePop(anchor) {
      const r = anchor.getBoundingClientRect(), host = mainEl.getBoundingClientRect();
      pop.style.left = Math.max(0, Math.min(r.left - host.left, host.width - 300)) + "px";
      pop.style.top = r.bottom - host.top + 6 + "px";
    }
    function closePop() { pop.hidden = true; pop.innerHTML = ""; }
    function openPop(kind, anchor) {
      saveSel();
      if (!pop.hidden && pop.dataset.kind === kind) return closePop();
      pop.dataset.kind = kind;
      if (kind === "hl" || kind === "color") {
        const list = kind === "hl" ? HIGHLIGHTS : TEXT_COLORS;
        pop.innerHTML = `<div class="pop-swatches" role="group" aria-label="${kind === "hl" ? "Highlight color" : "Text color"}">${list
          .map(([v, l]) => `<button data-v="${v}" title="${l}" class="pop-swatch" style="${kind === "hl" ? `background:${v === "transparent" ? "var(--surface)" : v}` : `color:${v === "inherit" ? "var(--ink)" : v}`}">${kind === "hl" ? (v === "transparent" ? "×" : "") : "A"}<span class="sr-only">${l}</span></button>`)
          .join("")}</div>`;
        $$(".pop-swatch", pop).forEach((b) => b.addEventListener("click", () => {
          if (kind === "hl") applyHighlight(b.dataset.v);
          else applyColor(b.dataset.v);
          closePop();
        }));
      } else if (kind === "block") {
        pop.innerHTML = `<div class="pop-list">${[["key", "Key idea"], ["definition", "Definition"], ["example", "Example"], ["question", "Question"]]
          .map(([v, l]) => `<button data-v="${v}" class="pop-item"><span class="callout-dot callout-${v}"></span>${l}</button>`).join("")}</div>`;
        $$(".pop-item", pop).forEach((b) => b.addEventListener("click", () => {
          const label = b.textContent.trim();
          insertHTML(`<div class="callout callout-${b.dataset.v}"><p><strong>${esc(label)}:</strong>&nbsp;</p></div><p><br></p>`);
          closePop();
        }));
      } else if (kind === "link") {
        const sel = window.getSelection();
        const existing = closestIn("A");
        pop.innerHTML = `<form class="pop-form"><label for="linkUrl">Link address</label><input id="linkUrl" class="input" type="url" inputmode="url" placeholder="https://…" value="${existing ? esc(existing.getAttribute("href")) : ""}">
          <div class="btn-row"><button class="btn btn-primary btn-small" type="submit">${existing ? "Update link" : "Add link"}</button>${existing ? '<button class="btn btn-small" type="button" data-unlink>Remove link</button>' : ""}<button class="btn btn-small" type="button" data-cancel>Cancel</button></div>
          <p class="hint">${sel && !sel.isCollapsed ? "Links the selected text." : "Inserts the address as a link."} Ctrl/⌘-click a link to open it.</p></form>`;
        const form = $("form", pop), input = $("#linkUrl", pop);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          let url = input.value.trim();
          if (!url) return;
          if (!/^(https?:|mailto:)/i.test(url)) url = "https://" + url;
          restoreSel();
          const s = window.getSelection();
          if (s.isCollapsed && !existing) document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
          else document.execCommand("createLink", false, url);
          $$("a", body).forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
          markDirty();
          closePop();
        });
        const un = $("[data-unlink]", pop);
        if (un) un.addEventListener("click", () => { restoreSel(); document.execCommand("unlink"); markDirty(); closePop(); });
        $("[data-cancel]", pop).addEventListener("click", () => { closePop(); restoreSel(); });
        setTimeout(() => input.focus(), 0);
      }
      pop.hidden = false;
      placePop(anchor);
    }

    let eqFmt = {};
    function openEq(span) {
      saveSel();
      eqFmt = {};
      ["bold", "italic", "underline"].forEach((k) => { try { eqFmt[k] = document.queryCommandState(k); } catch (e) { eqFmt[k] = false; } });
      pop.dataset.kind = "eq";
      const tex = span ? span.dataset.tex : "";
      const isBlock = span ? span.classList.contains("eq-block") : false;
      pop.innerHTML = `<form class="pop-form eq-form">
          <label for="eqInput">Equation (LaTeX)</label>
          <textarea id="eqInput" class="input" rows="2" placeholder="\\frac{dy}{dx} = 3x^2" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(tex)}</textarea>
          <div class="eq-snippets">${EQ_SNIPPETS.map(([t, l]) => `<button type="button" data-snip="${esc(t)}" title="${esc(t)}">${esc(l)}</button>`).join("")}</div>
          <div class="eq-preview" id="eqPreview" aria-live="polite"></div>
          <label class="check"><input type="checkbox" id="eqBlock" ${isBlock ? "checked" : ""}> Show on its own line</label>
          <div class="btn-row"><button class="btn btn-primary btn-small" type="submit">${span ? "Update" : "Insert"}</button>${span ? '<button class="btn btn-small" type="button" data-remove>Remove</button>' : ""}<button class="btn btn-small" type="button" data-cancel>Cancel</button></div>
        </form>`;
      const input = $("#eqInput", pop), prev = $("#eqPreview", pop);
      const preview = () => {
        if (!input.value.trim()) { prev.innerHTML = '<span class="muted">Preview appears here</span>'; return; }
        if (window.katex) { try { window.katex.render(input.value, prev, { throwOnError: false, displayMode: $("#eqBlock", pop).checked }); } catch (e) { prev.textContent = input.value; } }
        else prev.textContent = input.value;
      };
      input.addEventListener("input", preview);
      $("#eqBlock", pop).addEventListener("change", preview);
      $$("[data-snip]", pop).forEach((b) => b.addEventListener("click", () => {
        const s = input.selectionStart, e2 = input.selectionEnd;
        input.value = input.value.slice(0, s) + b.dataset.snip + input.value.slice(e2);
        input.focus();
        input.selectionStart = input.selectionEnd = s + b.dataset.snip.length;
        preview();
      }));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form", pop).requestSubmit(); } if (e.key === "Escape") { closePop(); restoreSel(); } });
      $("form", pop).addEventListener("submit", (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        const block = $("#eqBlock", pop).checked;
        if (span) {
          span.dataset.tex = v;
          span.classList.toggle("eq-block", block);
          renderEq(span);
          markDirty();
        } else {
          insertNodeAtCaret(v, block);
        }
        closePop();
      });
      const rm = $("[data-remove]", pop);
      if (rm) rm.addEventListener("click", () => { span.remove(); markDirty(); closePop(); });
      $("[data-cancel]", pop).addEventListener("click", () => { closePop(); restoreSel(); });
      pop.hidden = false;
      placePop(span || $('[data-act="eq"]', mainEl));
      preview();
      setTimeout(() => input.focus(), 0);
    }
    document.addEventListener("mousedown", (e) => {
      if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("#toolbar")) closePop();
    }, { signal: sig });

    /* ----- editor events ----- */
    body.addEventListener("input", () => { markDirty(); });
    body.addEventListener("click", (e) => {
      const eq = e.target.closest(".eq");
      if (eq && body.contains(eq)) { e.preventDefault(); openEq(eq); return; }
      const a = e.target.closest("a");
      if (a && (e.metaKey || e.ctrlKey)) { window.open(a.href, "_blank", "noopener"); return; }
      const li = e.target.closest("ul.checklist > li");
      if (li) {
        const r = li.getBoundingClientRect();
        if (e.clientX - r.left < 28) {
          li.dataset.checked === "true" ? li.removeAttribute("data-checked") : li.setAttribute("data-checked", "true");
          markDirty();
        }
      }
    });
    body.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.target.classList && e.target.classList.contains("eq") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEq(e.target); return; }
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPop("link", $('[data-act="link"]', mainEl)); return; }
      if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); openEq(null); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); commit(); ctx.toast("Saved"); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "h") { e.preventDefault(); saveSel(); applyHighlight("#FFE066"); return; }
      if (e.key === "Tab") {
        if (closestIn("LI")) { e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent"); markDirty(); return; }
        const cell = closestIn("TD") || closestIn("TH");
        if (cell) {
          e.preventDefault();
          const cells = $$("td,th", closestIn("TABLE"));
          const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
          if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
          return;
        }
        e.preventDefault(); document.execCommand("insertText", false, "    "); return;
      }
      if (e.key === " " || e.key === "Enter") {
        const blk = currentBlock();
        if (!blk || blk.tagName === "PRE") return;
        const s = window.getSelection();
        if (!s.isCollapsed) return;
        const text = (blk.textContent || "").replace(/ /g, " ");
        const rules = e.key === " "
          ? { "#": ["formatBlock", "<h1>"], "##": ["formatBlock", "<h2>"], "###": ["formatBlock", "<h3>"], "-": ["insertUnorderedList"], "*": ["insertUnorderedList"], "1.": ["insertOrderedList"], "[]": ["checklist"], "[ ]": ["checklist"], ">": ["formatBlock", "<blockquote>"] }
          : { "---": ["hr"], "```": ["formatBlock", "<pre>"] };
        const rule = rules[text.trim()];
        if (!rule) return;
        if (/^(TD|TH)$/.test(blk.tagName)) return;
        if (blk.tagName === "LI" && rule[0] !== "checklist") return;
        // only trigger when the caret is at the end of the marker
        const r = s.getRangeAt(0);
        const pre = document.createRange();
        pre.selectNodeContents(blk);
        pre.setEnd(r.startContainer, r.startOffset);
        if (pre.toString().replace(/ /g, " ").trim() !== text.trim()) return;
        e.preventDefault();
        blk.innerHTML = "<br>";
        const rr = document.createRange(); rr.setStart(blk, 0); rr.collapse(true); s.removeAllRanges(); s.addRange(rr);
        if (rule[0] === "checklist") toggleChecklist();
        else if (rule[0] === "hr") { document.execCommand("insertHTML", false, "<hr><p><br></p>"); }
        else document.execCommand(rule[0], false, rule[1] || null);
        markDirty();
        return;
      }
      if (e.key === "Enter") return;
    });
    body.addEventListener("keyup", (e) => {
      // new checklist items shouldn't inherit the checked state
      if (e.key === "Enter") {
        const li = closestIn("LI");
        if (li && li.dataset.checked && !li.textContent.trim()) li.removeAttribute("data-checked");
      }
    });
    body.addEventListener("paste", (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData("text/html");
      if (html) document.execCommand("insertHTML", false, sanitize(html));
      else document.execCommand("insertText", false, cd.getData("text/plain"));
      renderAllEq(body);
      markDirty();
    });
    body.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) e.preventDefault(); });
    body.addEventListener("blur", () => { if (saveState.textContent !== "Saved") commit(); });

    const escHandler = (e) => {
      if (!document.body.contains(body)) { document.removeEventListener("keydown", escHandler); return; }
      if (e.key === "Escape" && document.body.classList.contains("notes-focus") && pop.hidden) setFocus(false);
    };
    document.addEventListener("keydown", escHandler, { signal: sig });
    syncToolbar();
  }

  /* ---------------- integrations ---------------- */
  function logNoteFor(course) {
    let id = store.mistakeLog[course.id];
    if (!id || !store.notes[id]) {
      const n = newNote({ template: "blank", course: course.id, title: `${course.short} mistake log` });
      n.html = `<p>Questions you saved while practicing. Review these before the exam.</p>`;
      n.color = "pink";
      store.mistakeLog[course.id] = n.id;
      id = n.id;
    }
    return store.notes[id];
  }
  /** Append an MCQ (with your answer and the explanation) to the course's mistake log. */
  function saveQuestion(course, q, chosenIdx, letters, unitLabel) {
    const n = logNoteFor(course);
    const conv = (h) => (course.math ? mathToChips(h) : h);
    const right = chosenIdx === q.answer;
    const block = `<h3>${esc(unitLabel)}: ${esc(new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</h3>
      ${q.stimulus ? conv(q.stimulus) : ""}
      <p><strong>Question:</strong> ${conv(q.q)}</p>
      <ul>${q.choices.map((c, i) => `<li>${letters[i]}. ${conv(c)}${i === q.answer ? " <strong>(correct)</strong>" : i === chosenIdx ? " <em>(my answer)</em>" : ""}</li>`).join("")}</ul>
      <div class="callout callout-key"><p><strong>Why:</strong> ${conv(q.explain)}</p></div>
      ${!right && q.notes && q.notes[String(chosenIdx)] ? `<p><strong>My trap:</strong> ${conv(q.notes[String(chosenIdx)])}</p>` : ""}
      <hr>`;
    n.html = sanitize(n.html + block);
    n.updated = Date.now();
    persist();
    return n.id;
  }
  /** Save an FRQ attempt (prompts + the student's answers) as a new note. */
  function saveFrq(course, f, drafts) {
    const conv = (h) => (course.math ? mathToChips(h) : h);
    const n = newNote({ template: "blank", course: course.id, title: `${course.short}: ${f.title}` });
    n.html = sanitize(`<p><strong>${esc(f.type || "Free response")}</strong>, ${f.totalPoints} points</p>${conv(f.stimulus)}${f.parts
      .map((p) => `<h3>Part ${esc(p.label)}</h3><p>${conv(p.prompt)}</p><blockquote>${esc(drafts[p.label] || "(no answer yet)").replace(/\n/g, "<br>")}</blockquote>`)
      .join("")}<h2>What I'd do differently</h2><p><br></p>`);
    persist();
    return n.id;
  }

  window.HubNotes = {
    init(c) { ctx = c; },
    render,
    teardown,
    saveQuestion,
    saveFrq,
    count(courseId) { return Object.values(store.notes).filter((n) => !courseId || n.course === courseId).length; },
    exportAll() { persist(); return store; },
    importAll(obj) {
      if (!obj || typeof obj !== "object" || !obj.notes) return false;
      const notes = {};
      Object.values(obj.notes).forEach((n) => {
        if (!n || typeof n !== "object") return;
        const id = typeof n.id === "string" && /^[\w-]{1,40}$/.test(n.id) ? n.id : uid();
        notes[id] = {
          id, title: String(n.title || "").slice(0, 200), html: sanitize(String(n.html || "")),
          course: ctx.byId[n.course] ? n.course : "", tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 12) : [],
          color: ["none", "yellow", "green", "blue", "pink", "purple"].includes(n.color) ? n.color : "none",
          pinned: !!n.pinned, paper: ["plain", "lined", "grid", "dots"].includes(n.paper) ? n.paper : "plain",
          font: ["sans", "serif", "mono", "hand"].includes(n.font) ? n.font : "sans", size: ["s", "m", "l"].includes(n.size) ? n.size : "m",
          created: Number(n.created) || Date.now(), updated: Number(n.updated) || Date.now(),
        };
      });
      store = { notes, prefs: obj.prefs && typeof obj.prefs === "object" ? obj.prefs : {}, mistakeLog: obj.mistakeLog && typeof obj.mistakeLog === "object" ? obj.mistakeLog : {} };
      persist();
      return true;
    },
    _sanitize: sanitize,
    _toMarkdown: toMarkdown,
  };
})();

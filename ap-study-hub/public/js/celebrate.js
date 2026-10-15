/* Small, quick reward effects: a confetti burst from an element, a bigger shower for milestones.
   Honors prefers-reduced-motion (falls back to a soft glow) and a user on/off setting. */
(() => {
  "use strict";
  const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  let enabled = true;
  let canvas = null, ctx = null, parts = [], raf = 0, dpr = 1;

  const palette = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, f) => (cs.getPropertyValue(n) || "").trim() || f;
    return [v("--marker", "#FFE066"), v("--good", "#1D7445"), v("--calc", "#2E5BCC"), v("--phys", "#6B45C9"), v("--chem", "#0F7F6A"), v("--hist", "#A8452B"), "#FF8FB1"];
  };

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "confetti-layer";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }

  function spawn(x, y, n, spread, power, colors) {
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = power * (0.55 + Math.random() * 0.6);
      parts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: colors[(Math.random() * colors.length) | 0],
        life: 0,
        max: 55 + Math.random() * 35,
        shape: Math.random() < 0.3 ? "dot" : "rect",
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life++;
      p.vy += 0.32; // gravity
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const fade = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "dot") {
        ctx.beginPath();
        ctx.arc(0, 0, (p.h / 1.4) * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect((-p.w / 2) * dpr, (-p.h / 2) * dpr, p.w * dpr, p.h * dpr);
      }
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function glow(el) {
    if (!el) return;
    el.classList.remove("reward-glow");
    void el.offsetWidth;
    el.classList.add("reward-glow");
    setTimeout(() => el.classList.remove("reward-glow"), 900);
  }

  function originOf(el) {
    if (!el || !el.getBoundingClientRect) return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width, 80) / 2 + 10, y: r.top + r.height / 2 };
  }

  /** kind: "correct" | "streak" | "big" */
  function celebrate(kind, el) {
    if (!enabled) return;
    if (reduce.matches) { glow(el); return; }
    ensureCanvas();
    const colors = palette();
    const o = originOf(el);
    if (kind === "correct") spawn(o.x, o.y, 26, Math.PI * 0.9, 9, colors);
    else if (kind === "streak") { spawn(o.x, o.y, 46, Math.PI * 1.1, 11, colors); }
    else {
      const w = window.innerWidth;
      spawn(w * 0.2, window.innerHeight * 0.95, 70, Math.PI * 0.55, 17, colors);
      spawn(w * 0.8, window.innerHeight * 0.95, 70, Math.PI * 0.55, 17, colors);
    }
    glow(el);
  }

  window.HubCelebrate = {
    celebrate,
    setEnabled(v) { enabled = !!v; },
    isEnabled() { return enabled; },
  };
})();

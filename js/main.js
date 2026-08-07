(() => {
  'use strict';

  const body = document.body;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wheel-paced pin-and-cycle scroll animation doesn't map to touch
  // gestures, so at tablet width and below every pinned section drops
  // its pin and every scroll-driven text effect drops its motion —
  // same "just show the resting state" goal prefersReduced already
  // serves, just gated on viewport width instead of an OS setting. A
  // function, not a cached const like prefersReduced, because width
  // (unlike an OS motion preference) routinely changes mid-session —
  // devtools resize, tablet rotation — and callers check it live, every
  // scroll/resize tick, not just once at setup.
  const isCompact = () => window.innerWidth <= 1024;

  // .brandid__blueprint-stage and .brandid__color-stage are ONE element
  // carrying both class names: the symbol diagram, the wordmark, the
  // mark redrawing itself, and Color Principle all run inside a single
  // pinned sticky so that nothing scrolls in from below once the
  // wordmark is done ("워드마크 섹션 지나고 이어서 자연스럽게 그 섹션에서
  // 모든동작이 일어나길").
  // These two fractions of that stage's runway are where the phases
  // split. Shared at this scope because three separate functions have to
  // agree on them — initBlueprintTransition (panels), initColorPinball
  // (redraw + handover), and updateColor inside initBrandIdentity
  // (colour steps) — and each remaps the raw progress into its own 0-1.
  // Widened from .28/.57 once the symbol and wordmark drawings became
  // scroll-scrubbed too: an auto-played animation needs no runway of its
  // own, but a scrubbed one is only as long as the scroll you give it.
  // Re-cut so the COLOUR phase gets more of the runway without the two
  // phases ahead of it losing any: the stage grew 840→920svh at the same
  // time, and these two fractions were reduced to match, which leaves
  // the diagram/wordmark and the redraw at the same absolute scroll
  // length they already had (~369svh and ~148svh) while Color Principle
  // goes from ~222svh to ~303svh. Warm White is the state that was
  // getting squeezed — see the hold windows in updateColor.
  // Re-cut a second time when the wordmark gained a hold at its sharpest
  // frame (WM_HOLD in initBlueprintTransition, on request "가장
  // 선명해지는 구간에서... 살짝 걸려서 선명한 부분을 오래 볼 수 있게").
  // The stage grew 920→968svh to pay for that hold, so the runway went
  // 820→868svh and these two moved with it — every other phase keeps the
  // exact scroll length it already had (~369svh of drawing plus 48svh of
  // hold, then ~148svh of redraw, then ~303svh of colour).
  const BLUEPRINT_END = .4804;  // diagram + wordmark, hold included
  const COLOR_INTRO_END = .6505; // ...then the redraw, then Color Principle

  /* ---------- Custom cursor: a point, plus a scribbled line trailing it ---------- */

  function initCustomCursor() {
    if (prefersReduced) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    // Two elements, not one — a fixed-size dot IS the point, and a
    // thin tail only exists while moving, growing back from it in the
    // direction just travelled. A single element that stretches into a
    // pill (tried first) has no distinct point to read as "the cursor"
    // versus "the stroke" — both ends are equally rounded, which is
    // what read as blunt rather than drawn. Still plain DOM/SVG, not
    // canvas: a canvas trail's fade is asymptotic and always leaves a
    // faint residue on dark backgrounds (see the settled-on-DOM
    // decision elsewhere in this file's history) — here the tail is
    // just this frame's own geometry, redrawn from scratch every
    // frame, so there is nothing to accumulate or fade.
    const dot = document.createElement('div');
    dot.className = 'custom-cursor-dot';
    body.appendChild(dot);

    // The tail is an SVG polygon, not a rotated CSS box — a flat
    // rectangle/triangle can only ever be straight, and an actual
    // zigzag (see tailPoly below) needs a real bent outline, built
    // from the cursor's own recent path, which CSS transforms can't
    // produce. Drawn in raw viewport pixels (no viewBox), so its own
    // coordinate system already matches clientX/clientY 1:1.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const tailSvg = document.createElementNS(SVG_NS, 'svg');
    tailSvg.setAttribute('class', 'custom-cursor-line');
    // <path> now, not <polygon> — a polygon's edges are dead straight
    // between whatever points happen to be in the trail that frame, so
    // a tight turn (circling the cursor) showed up as visibly faceted
    // corners instead of a curve, on request ("커서 이리저리 돌릴때
    // 다각형처럼 원형이 생성되는데"). smoothOutline (below) draws the
    // same outline as a series of quadratic curves through those same
    // points instead.
    const tailPath = document.createElementNS(SVG_NS, 'path');
    tailSvg.appendChild(tailPath);
    body.appendChild(tailSvg);

    let x = 0, y = 0; // eased position — trails the raw target with a
    let tx = 0, ty = 0; // slight lag, which is what gives the tail an
    let started = false; // actual path to record below (a dot glued
    // 1:1 to the pointer would have no path of its own to trail).
    // The tail's actual spine: the last TRAIL_LEN eased positions,
    // oldest first. A real recorded path, not a synthetic curve
    // estimated from how much the direction recently changed (tried
    // first) — that estimate could only ever produce one smooth bow,
    // never an actual zigzag, because it never remembered more than
    // "how much am I turning right now." Pushed every frame and
    // shifted once full, so a stationary cursor's trail is entirely
    // duplicate points within TRAIL_LEN frames and collapses to
    // nothing on its own — same "redrawn from scratch, nothing to
    // fade" guarantee the single-frame version had, just built from a
    // short rolling window instead of one frame's velocity.
    const TRAIL_LEN = 16;
    let trail = [];

    function setActive(on) {
      dot.classList.toggle('is-active', on);
      tailSvg.classList.toggle('is-active', on);
    }

    // Same set body/a/button/etc. carry cursor: none for — reused here
    // rather than kept in sync by hand, so a new interactive element
    // added to that CSS rule automatically grows the dot too.
    const HOVER_SELECTOR = 'a, button, [role="button"], input, textarea, select, label';

    function onMove(e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!started) {
        // First move: snap straight there instead of visibly easing in
        // from the top-left corner where x/y start at 0,0.
        x = tx; y = ty;
        started = true;
        setActive(true);
      }
      // e.target is the actual page element under the pointer — the
      // dot/tail can't be hit themselves (pointer-events: none), so
      // this is always what's genuinely underneath, no elementFromPoint
      // call needed.
      const hovering = !!(e.target && e.target.closest && e.target.closest(HOVER_SELECTOR));
      dot.classList.toggle('is-hover', hovering);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', () => setActive(false));
    document.addEventListener('mouseenter', () => {
      if (started) setActive(true);
    });

    // Draws the same closed outline a straight-edged polygon would have
    // (the ribbon's left side, then its right side reversed), but as
    // quadratic curves through the points instead of straight lines
    // between them — a tight turn used to show up as visibly faceted
    // corners rather than a curve. Standard "midpoint smoothing": each
    // curve's control point is the actual recorded point, and it ends
    // at the midpoint to the NEXT point rather than at that point
    // itself, which is what removes the corner at every vertex except
    // the very first and last (kept exact, so the tail still starts and
    // ends precisely on the dot).
    function smoothOutline(pts) {
      if (pts.length < 2) return '';
      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const cx = pts[i][0], cy = pts[i][1];
        const mx = (cx + pts[i + 1][0]) / 2, my = (cy + pts[i + 1][1]) / 2;
        d += ` Q${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
      }
      const last = pts[pts.length - 1];
      d += ` L${last[0].toFixed(1)},${last[1].toFixed(1)} Z`;
      return d;
    }

    function frame() {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;

      // translate(-50%, -50%) last is what centres the dot ON (x, y)
      // rather than anchoring its top-left corner there.
      dot.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;

      trail.push({ x, y });
      if (trail.length > TRAIL_LEN) trail.shift();

      // Builds a tapered ribbon along the ACTUAL recorded path —
      // thinnest at index 0 (oldest point) growing to thickest at the
      // last index (current position, under the dot) — rather than a
      // shape estimated from a couple of smoothed turn values. This is
      // what lets a genuine zigzag or an up-down scribble show up as
      // one, instead of always reading as a single smooth bow no
      // matter how the mouse actually moved.
      // Flat now — no taper at all, on request ("커서 끝 아예 굵기
      // 다르지 않고 일정하게 해보고"). Was HALF_W(1.6) at the dot end
      // narrowing to MIN_W(0.7, previously 0.2) at the tail's far end;
      // now both ends use the same width.
      const TAIL_W = 1.2;
      const n = trail.length;
      if (n < 2) {
        tailPath.setAttribute('d', '');
      } else {
        const left = [], right = [];
        for (let i = 0; i < n; i++) {
          const pt = trail[i];
          // Local tangent from the neighbouring recorded points (not
          // just the next one), so the perpendicular offset follows
          // the path's own direction at THIS point rather than a
          // single shared angle for the whole ribbon — this is what
          // lets each segment bend independently along a real zigzag.
          const prev = trail[Math.max(0, i - 1)];
          const next = trail[Math.min(n - 1, i + 1)];
          const dx = next.x - prev.x, dy = next.y - prev.y;
          const dlen = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / dlen, ny = dx / dlen;
          const w = TAIL_W;
          left.push([pt.x + nx * w, pt.y + ny * w]);
          right.push([pt.x - nx * w, pt.y - ny * w]);
        }
        right.reverse();
        tailPath.setAttribute('d', smoothOutline(left.concat(right)));
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  initCustomCursor();

  /* ---------- Hero entrance: background blur-focuses, then title/copy
     wipe in — choreographed once, independent of scroll position. ---------- */

  function runHeroEntrance() {
    const bg = document.getElementById('heroBg');
    const steps = [
      ['mark', 400],
      ['eyebrow', 650],
      ['title', 900],
      ['meta', 1600],
    ];

    // Was scoped `.hero [data-hero-timed="${name}"]` — the "mark" one
    // (#heroLogo) can be reparented out of .hero to <body> by then
    // (initHeroLogoNav's setPortaled, once scrolled past the hero) if
    // the reader scrolls fast enough within this timer's own delay, on
    // request ("로고 또 갑자기 안보인다"): the scoped selector then
    // found nothing, .is-in never got added, and the mark stayed at
    // .hero-in's base opacity:0 permanently — no scroll position could
    // ever fix it since nothing re-runs this once-only reveal. Dropping
    // the `.hero` prefix finds it wherever it currently lives;
    // data-hero-timed is only ever used inside the hero to begin with,
    // so this can't accidentally match anything else on the page.
    if (prefersReduced) {
      if (bg) bg.classList.add('is-focused');
      steps.forEach(([name]) => {
        const el = document.querySelector(`[data-hero-timed="${name}"]`);
        if (el) el.classList.add('is-in');
      });
      const titleEl = document.querySelector('[data-hero-timed="title"]');
      if (titleEl) titleEl.classList.add('title-shine');
      return;
    }

    setTimeout(() => { if (bg) bg.classList.add('is-focused'); }, 50);
    steps.forEach(([name, delay]) => {
      setTimeout(() => {
        const el = document.querySelector(`[data-hero-timed="${name}"]`);
        if (el) el.classList.add('is-in');
      }, delay);
    });

    // Only after the clip-reveal has finished, so the wipe and the
    // shine never animate the title at the same time.
    setTimeout(() => {
      const el = document.querySelector('[data-hero-timed="title"]');
      if (el) el.classList.add('title-shine');
    }, 2000);
  }

  /* ---------- Scroll reveal ---------- */

  function startReveals() {
    const els = Array.from(document.querySelectorAll('.reveal'));
    // The default stagger is derived from document order, which is
    // arbitrary for any group that needs a specific running order.
    // `data-delay` lets an element opt out and state its own.
    els.forEach((el, i) => {
      const own = el.dataset.delay;
      el.style.transitionDelay = own !== undefined ? `${own}ms` : `${(i % 6) * 60}ms`;
    });

    let pending = els.slice();
    const threshold = window.innerHeight * 0.88;

    function check() {
      pending = pending.filter(el => {
        if (el.getBoundingClientRect().top > threshold) return true;
        el.classList.add('is-in');
        return false;
      });
      if (!pending.length) window.removeEventListener('scroll', onScroll);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      setTimeout(() => { check(); ticking = false; }, 80);
    }

    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  startReveals();
  runHeroEntrance();

  /* ---------- Our Approach: sticky background, scrolling steps ---------- */

  function initApproachActive() {
    const sec = document.getElementById('ourApproach');
    if (!sec) return;
    const bg = sec.querySelector('.acycle__bg');
    const grounds = Array.from(sec.querySelectorAll('.acycle__ground'));
    const steps = Array.from(sec.querySelectorAll('.acycle__step'));
    // The steps' own horizontal scroll container at compact widths (see
    // .acycle__steps in style.css) — swiping through it doesn't fire a
    // window 'scroll' event (element scroll doesn't bubble), so it needs
    // its own listener, and "which step is active" becomes a horizontal
    // centre test instead of the vertical one below.
    const stepsWrap = sec.querySelector('.acycle__steps');
    if (!steps.length || !grounds.length) return;

    // Same "step whose top has crossed the viewport's centre line is the
    // active one" test this section's own earlier active-step logic used
    // — a discrete switch, not a scroll-position blend, since the ground
    // is now a plain crossfade (see .acycle__ground.is-active) rather
    // than something driven frame-by-frame.
    //
    // A small parallax drift rides alongside that: the pinned background
    // otherwise sits dead still for the section's whole scroll, which
    // reads as static against Lenis's inertial scroll everywhere else on
    // the page. --acycle-parallax (read by .acycle__ground's own
    // transform, see style.css) drifts the ground a little further than
    // the content as the section's pinned range plays out — oversized
    // and clipped (.acycle__ground's top/height, .acycle__bg's overflow)
    // so the drift never uncovers an edge.
    const PARALLAX_RANGE = 48; // px, total travel start to end of section

    // Desktop/vertical: page scroll position decides which step is active.
    function updateVertical() {
      const line = window.innerHeight * 0.5;
      let idx = 0;
      steps.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) idx = i;
      });
      grounds.forEach((g, i) => g.classList.toggle('is-active', i === idx));

      if (!prefersReduced) {
        const r = sec.getBoundingClientRect();
        const runway = r.height - window.innerHeight;
        const progress = runway <= 0 ? 0 : Math.max(0, Math.min(1, -r.top / runway));
        const y = (progress - 0.5) * PARALLAX_RANGE;
        bg.style.setProperty('--acycle-parallax', `${y.toFixed(2)}px`);
      }
    }

    // Compact/horizontal: .acycle__steps' own scrollLeft decides instead
    // — request: "아워 어프로치 섹션 컨텐츠도 좌우로 터치스크롤 구조로
    // 바꿔줘". Whichever step's own horizontal centre sits closest to
    // the container's centre is active; no parallax (that's "no motion"
    // scope, same as before).
    function updateHorizontal() {
      if (!stepsWrap) return;
      const wrapRect = stepsWrap.getBoundingClientRect();
      const center = wrapRect.left + wrapRect.width / 2;
      let idx = 0, best = Infinity;
      steps.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const dist = Math.abs((r.left + r.width / 2) - center);
        if (dist < best) { best = dist; idx = i; }
      });
      grounds.forEach((g, i) => g.classList.toggle('is-active', i === idx));
    }

    function update() {
      if (isCompact()) updateHorizontal();
      else updateVertical();
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (stepsWrap) stepsWrap.addEventListener('scroll', onScroll, { passive: true });
  }

  initApproachActive();

  /* ---------- Our Approach: copy clears out of a mist as it rises in ---------- */

  function initApproachTextFog() {
    // Background-follows-content (initApproachActive) stays on at
    // compact widths — it's just "which step's top has crossed the
    // viewport centre," which works the same under touch as wheel, and
    // is the whole point of "터치스크롤하면 내용에 따라 배경도 같이
    // 바뀌면 될것 같아". This blur-clear/fade-in on the copy itself is
    // a different thing — scroll-driven text motion, in scope for the
    // standing "no text animation" rule — so it alone skips.
    if (prefersReduced || isCompact()) return;
    const sec = document.getElementById('ourApproach');
    if (!sec) return;
    // Only the intro title and the first step (Essential) — the two
    // pieces of copy shown over the misty bg_approach.png ground. The
    // other three steps each get their own reveal instead, tuned to
    // their own ground and copy (see initApproachReveals below).
    const firstStep = sec.querySelector('.acycle__step');
    const targets = [
      sec.querySelector('.acycle__intro-title'),
      firstStep && firstStep.querySelector('.acycle__word'),
      firstStep && firstStep.querySelector('.acycle__copy'),
    ].filter(Boolean);
    if (!targets.length) return;

    const MAX_BLUR = 10; // px, fully fogged at the bottom of the viewport

    // Continuous and scroll-position-driven — not a one-shot class
    // toggle — so every element's clarity always matches where it
    // currently sits, however fast or slow the reader scrolls, rather
    // than a flag that can fire early and be stale by the time the
    // reader actually looks (the bug in the background version this
    // replaced).
    function update() {
      targets.forEach(el => {
        const top = el.getBoundingClientRect().top;
        // 0 right at the bottom edge of the viewport, 1 by the time the
        // element has risen 65% of the way up the screen — cleared well
        // before it settles into its resting place.
        const progress = Math.max(0, Math.min(1,
          (window.innerHeight - top) / (window.innerHeight * 0.65)
        ));
        const blur = (1 - progress) * MAX_BLUR;
        el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
        el.style.opacity = (0.35 + progress * 0.65).toFixed(3);
      });
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initApproachTextFog();

  /* ---------- Our Approach: each step's own reveal ---------- */

  function initApproachReveals() {
    // Same reasoning as initApproachTextFog just above — this is the
    // per-step rise-and-fade/letter-split text motion, not the
    // background switch, so it alone skips at compact widths.
    if (prefersReduced || isCompact()) return;
    const sec = document.getElementById('ourApproach');
    if (!sec) return;
    const steps = Array.from(sec.querySelectorAll('.acycle__step'));
    if (steps.length < 4) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    function progressFor(el, span) {
      const top = el.getBoundingClientRect().top;
      return clamp01((window.innerHeight - top) / (window.innerHeight * span));
    }

    // Every step's Korean copy shares one plain rise-and-fade from
    // below, no matter which step it is — only the English word above
    // it gets a distinct, per-step character (see below). Essential's
    // is included here too; its word keeps the separate fog treatment
    // from initApproachTextFog above, but its copy reads the same as
    // the other three now.
    //
    // The last step (Sustainable) gets a smaller span than the rest:
    // with nothing after it, the page runs out of scroll before its
    // copy — sitting well down its own step, below the word — ever
    // rises far enough up the viewport to satisfy the same .65 the
    // other three use, so it was stalling at partial opacity forever.
    // A smaller span reaches full opacity earlier (while still lower on
    // screen), comfortably before the page hits its max scroll.
    const COPY_SPANS = [.65, .65, .65, .25];
    const COPY_RISE = 36; // px
    const copies = steps.map(s => s.querySelector('.acycle__copy')).filter(Boolean);

    // Splits a word into one span per letter, same technique
    // initPhilosophyScatter uses for OUR PHILOSOPHY — each letter gets
    // its own starting offset and animates independently, while the
    // word's own letter-spacing still governs where each one RESTS
    // (transforms are purely visual, they don't move layout).
    function splitLetters(el) {
      const text = el.textContent;
      el.textContent = '';
      return Array.from(text).map(ch => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.display = 'inline-block';
        el.appendChild(span);
        return span;
      });
    }

    // Narrows the gap after whichever "a" in the word isn't its very
    // first letter (Appropriate's own first letter is an A too — that
    // one stays at the word's normal spacing; the second a, in
    // "appropri-a-te", is the one this targets. Integrated has just the
    // one, in "integr-a-ted", and it was never the first letter to
    // begin with). Letter-spacing on a single-letter span only ever
    // adds trailing space after THAT letter, same technique as the
    // point-letter kerning used elsewhere on this page.
    function tightenLaterA(letters) {
      letters.forEach(({ span }, i) => {
        if (i === 0) return;
        if (span.textContent.toLowerCase() === 'a') span.style.letterSpacing = '-.15em';
      });
    }

    // Appropriate (bg_approach_02.png: one lit shape singled out among
    // otherwise identical ones) — each letter starts scattered at its
    // own random-reading position and rotation (a deterministic sine
    // sequence keyed by index, not Math.random(), so it pours the same
    // way on every load) and settles into place, like the right choice
    // assembling itself out of scattered options.
    const appropriateWord = steps[1] && steps[1].querySelector('.acycle__word');
    const appropriateLetters = appropriateWord ? splitLetters(appropriateWord).map((span, i) => {
      const a = i * 53.7;
      return {
        span,
        sx: Math.sin(a) * 46,
        sy: Math.cos(a * 0.8) * 34,
        sr: Math.sin(a * 1.3) * 50,
      };
    }) : [];
    tightenLaterA(appropriateLetters);

    // Integrated (bg_approach_03.png: separate shapes strung together
    // on one glowing wire) — letters start scattered left/right,
    // alternating, and slide together into the connected word.
    const integratedWord = steps[2] && steps[2].querySelector('.acycle__word');
    const integratedLetters = integratedWord ? splitLetters(integratedWord).map((span, i) => ({
      span,
      sx: (i % 2 === 0 ? -1 : 1) * (48 + (i % 3) * 14),
    })) : [];
    tightenLaterA(integratedLetters);

    // Sustainable (bg_approach_04.png: one unbroken flowing ribbon) —
    // letters rise in a staggered wave rather than all at once, each a
    // little further behind its neighbour, echoing the ribbon's curve
    // rather than the word just snapping in as a block.
    const sustainableWord = steps[3] && steps[3].querySelector('.acycle__word');
    const sustainableLetters = sustainableWord ? splitLetters(sustainableWord).map((span, i) => ({
      span,
      delay: i * 0.045,
    })) : [];

    function update() {
      copies.forEach((copy, i) => {
        const p = progressFor(copy, COPY_SPANS[i] || COPY_SPANS[0]);
        copy.style.transform = `translateY(${(COPY_RISE * (1 - p)).toFixed(2)}px)`;
        copy.style.opacity = p.toFixed(3);
      });

      if (appropriateWord) {
        const p = progressFor(appropriateWord, .7);
        const t = 1 - p;
        appropriateLetters.forEach(({ span, sx, sy, sr }) => {
          span.style.transform = `translate(${(sx * t).toFixed(2)}px, ${(sy * t).toFixed(2)}px) rotate(${(sr * t).toFixed(2)}deg)`;
          span.style.opacity = (0.15 + p * 0.85).toFixed(3);
        });
      }

      if (integratedWord) {
        const p = progressFor(integratedWord, .7);
        const t = 1 - p;
        integratedLetters.forEach(({ span, sx }) => {
          span.style.transform = `translateX(${(sx * t).toFixed(2)}px)`;
          span.style.opacity = (0.15 + p * 0.85).toFixed(3);
        });
      }

      if (sustainableWord) {
        // .85 (like the copy's old .65, see COPY_SPANS above) barely
        // reached 1 by the natural end of scroll — with no scroll room
        // left after the last step, that let Lenis's inertial settle
        // land a hair short, leaving the staggered per-letter wave
        // visibly (if faintly) unresolved forever instead of finishing
        // uniform. .55 finishes with real margin, and once it's
        // genuinely done every letter is forced to the exact same
        // resting values rather than each solving the (base - delay)
        // formula slightly differently — the wave is only ever visible
        // while actually entering, never as a lingering gradient.
        const base = progressFor(sustainableWord, .55);
        sustainableLetters.forEach(({ span, delay }) => {
          if (base >= 1) {
            span.style.transform = 'translateY(0px)';
            span.style.opacity = '1';
            return;
          }
          const p = clamp01((base - delay) / (1 - delay));
          span.style.transform = `translateY(${((1 - p) * 28).toFixed(2)}px)`;
          span.style.opacity = p.toFixed(3);
        });
      }
    }

    // Appropriate and Sustainable are the two --right steps (see
    // .acycle__step--right .acycle__copy in style.css) whose Korean
    // copy reads left-aligned rather than centred — its indent should
    // line up with the start of the word's 4th letter (the line right
    // after the 3rd), same idea as the old initApproachCopyAlign this
    // replaces, now measured off that letter SPAN directly rather than
    // a dedicated point-letter wrapper. A sibling's own transform never
    // affects another letter's layout position, so only the ONE target
    // letter needs its transform cleared before measuring (and restored
    // after) — it normally sits mid-animation (scattered/off to the
    // side) rather than at its resting layout position.
    const COPY_ALIGN_INDEX = 2;
    function alignCopyUnderLetter(letters, copy, index) {
      if (!copy || letters.length <= index) return;
      const target = letters[index].span;
      const saved = target.style.transform;
      target.style.transform = 'none';
      copy.style.marginLeft = '0px';
      const x = target.getBoundingClientRect().left - copy.getBoundingClientRect().left;
      copy.style.marginLeft = `${Math.max(0, x).toFixed(2)}px`;
      target.style.transform = saved;
    }
    function alignCopies() {
      alignCopyUnderLetter(appropriateLetters, steps[1] && steps[1].querySelector('.acycle__copy'), COPY_ALIGN_INDEX);
      alignCopyUnderLetter(sustainableLetters, steps[3] && steps[3].querySelector('.acycle__copy'), COPY_ALIGN_INDEX);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    alignCopies();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { alignCopies(); onScroll(); }, { passive: true });
  }

  initApproachReveals();

  /* ---------- Statement: photograph swaps as the section passes ---------- */

  function initStatementMedia() {
    const sec = document.querySelector('.statement');
    if (!sec) return;
    const frames = Array.from(sec.querySelectorAll('.statement__img'));
    if (frames.length < 2 || isCompact()) return;

    let shown = 0;
    function update() {
      const r = sec.getBoundingClientRect();
      // How far the section has travelled past the viewport's midline,
      // normalised over its own height plus one screen so the last
      // frame is reached before the section leaves.
      const span = r.height + window.innerHeight;
      const progress = (window.innerHeight - r.top) / span;
      const idx = Math.min(
        frames.length - 1,
        Math.max(0, Math.floor(progress * frames.length))
      );
      if (idx === shown) return;
      frames[shown].classList.remove('is-on');
      frames[idx].classList.add('is-on');
      shown = idx;
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      setTimeout(() => { update(); ticking = false; }, 80);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initStatementMedia();

  /* ---------- Statement: the photograph rises into place as the section arrives ---------- */

  function initStatementParallax() {
    if (prefersReduced || isCompact()) return;
    const media = document.getElementById('statementMedia');
    if (!media) return;

    // CSS (.statement__figure's margin-top, see style.css) sets where the
    // photo RESTS: just above PHILO's line. This function only adds a
    // temporary offset on top of that rest position — it holds the photo
    // lower before the section arrives, then eases it up to the CSS rest
    // spot, then lets it drift a little further as the section continues
    // past. It never needs to know the rest position's own value; it only
    // ever asks "how far is the frame from the point where it should have
    // fully arrived," via the SAME frame it is animating.
    //
    // It must not be applied to .statement__figure — that element carries
    // .reveal, and an inline transform would fight that entrance.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const lerp = (a, b, t) => a + (b - a) * t;

    // Both as a fraction of the frame's own height, so they scale with
    // however large the 60vw photo happens to be.
    const ENTRY_RISE = 0.16; // how far below rest it starts — "positioned at the bottom"
    const SETTLE_RISE = 0.03; // a small continued rise once past centre, so it keeps a little life

    let ticking = false;
    // The transform is on the element being measured, so its own offset
    // is inside every rect read back. Subtracting it recovers the actual
    // laid-out (CSS rest) position; without this the output feeds its own
    // input and the motion compounds instead of tracking the scroll.
    let applied = 0;

    function update() {
      ticking = false;
      const r = media.getBoundingClientRect();
      const top = r.top - applied;
      // -1 with the frame a screen below the fold, 0 as it crosses the
      // middle, +1 a screen above it.
      const span = window.innerHeight + r.height;
      const raw = ((window.innerHeight - top) / span) * 2 - 1;
      const p = Math.max(-1, Math.min(1, raw));

      // Squared easing on both legs: the rise creeps in and then
      // accelerates rather than moving at a constant rate, which is what
      // makes it read as settling rather than sliding.
      const entry = seg(p, -1, 0); const entryEased = entry * entry;
      const past = seg(p, 0, 1); const pastEased = past * past;
      const down = lerp(ENTRY_RISE, 0, entryEased);
      const extraRise = lerp(0, SETTLE_RISE, pastEased);
      const y = (down - extraRise) * r.height;

      applied = y;
      media.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    }

    // rAF rather than the timeout the other watchers use: this one moves
    // continuously, and an 80ms step would read as judder against Lenis.
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initStatementParallax();

  /* ---------- Statement: OUR / PHILO / SOPHY spills in letter by letter ---------- */

  function initPhilosophyScatter() {
    const word = document.getElementById('philosophyWord');
    if (!word) return;
    const lines = Array.from(word.querySelectorAll('.statement__line'));
    if (!lines.length) return;
    // Title (lead) and body (detail) — each gets its own beat once the
    // English has finished pouring in, rather than appearing together.
    const koreans = Array.from(
      document.querySelectorAll('.statement__korean-in')
    );

    // Reduced motion: leave the words exactly as authored, static and
    // fully visible. No DOM rebuild, so there is nothing to go wrong.
    // The Korean paragraphs carry their own opacity:0 default (see
    // .statement__korean-in in style.css), so they still need is-in
    // added even when the English split is skipped, or they would be
    // permanently invisible under reduced motion.
    if (prefersReduced || isCompact()) {
      koreans.forEach(el => el.classList.add('is-in'));
      return;
    }

    // Rebuilds each line's text as individual letter spans, each carrying
    // a scattered starting transform (--sx/--sy/--sr/--sscale) — the
    // "spilled out of a toy box" starting state — so the word can
    // assemble itself one letter at a time instead of appearing as a
    // single block.
    //
    // Every letter shares ONE direction — up and to the right, as if
    // poured from the hero section's lower-right corner, which sits
    // ABOVE section 02 on the page. Up is negative Y in a translate, so
    // the starting offset is (+x, -y): right and up from the letter's
    // final position, which is what makes it read as falling DOWN-LEFT
    // out of the hero's corner into place, rather than rising up from
    // below this section. A single shared vector, large enough to be
    // unmistakable, is what reads as "coming from somewhere" — only the
    // MAGNITUDE and rotation vary per letter (via sine waves keyed to a
    // running index, not Math.random(), so a reload always pours the
    // same way and the numbers are checkable), which keeps it a stream
    // of individual letters rather than one rigid block moving together.
    //
    // Sized off the viewport rather than a fixed px figure, so the
    // "distance travelled" reads the same proportionally on a phone and
    // a 27" monitor.
    const baseDX = window.innerWidth * 0.30;
    const baseDY = window.innerHeight * 0.30;
    // Real, measured overflow: OUR/PHILO/SOPHY sit at three different
    // indents (0/.78/.83em — SOPHY in particular now starts almost as
    // far right as PHILO, from the alignment work elsewhere in this
    // file), so a single shared --sx pushed the later lines' letters —
    // whichever already sit closest to the right edge — well past the
    // viewport (scrollWidth exceeded clientWidth by 300px+ in testing).
    // The fix appends every letter FIRST with no offset, measures each
    // one's real on-screen right edge, and clamps that letter's own sx
    // to whatever room is actually left before the edge — so a letter
    // near the edge still pours in, just over a shorter distance,
    // rather than overflowing the page.
    const SAFE_MARGIN = 24;

    let count = 0;
    const letters = [];
    lines.forEach(line => {
      const text = line.textContent;
      line.textContent = '';
      Array.from(text).forEach(ch => {
        const span = document.createElement('span');
        span.className = 'scatter-letter';
        span.textContent = ch;
        line.appendChild(span);
        letters.push(span);
      });
    });

    letters.forEach(span => {
      const rect = span.getBoundingClientRect();
      const a = count * 47.7;
      // .75-1.15x of the base distance — visible per-letter spread
      // without ever cancelling the shared up-right direction.
      const mag = 0.75 + Math.abs(Math.sin(a * 0.6)) * 0.4;
      const desiredSx = baseDX * mag;
      const maxSx = Math.max(0, window.innerWidth - SAFE_MARGIN - rect.right);
      const sx = Math.min(desiredSx, maxSx);
      const sy = -baseDY * (0.8 + Math.abs(Math.cos(a * 0.8)) * 0.4);
      // Tumbling toward upright: mostly one sign, with the odd letter
      // turning the other way so it doesn't look mechanical.
      const sr = 32 + Math.sin(a) * 26;
      const sscale = 0.5 + Math.abs(Math.sin(a * 0.6)) * 0.25;
      span.style.setProperty('--sx', sx.toFixed(1) + 'px');
      span.style.setProperty('--sy', sy.toFixed(1) + 'px');
      span.style.setProperty('--sr', sr.toFixed(1) + 'deg');
      span.style.setProperty('--sscale', sscale.toFixed(2));
      count++;
    });

    // Same scroll-threshold + debounce pattern as startReveals, but two-
    // way rather than one-shot: scrolling back up past the section resets
    // the letters to their scattered start, so scrolling back down pours
    // them in again instead of finding them already settled. The two
    // thresholds are deliberately different (enter at 85% down the
    // viewport, exit only once the word is fully below it) — using one
    // shared line would let the pour re-trigger on every small scroll
    // wobble right at the boundary.
    // How long the English pour itself takes, end to end: the last
    // letter's own stagger delay plus its transition duration (must
    // match the 62/1300 used below and in .scatter-letter's CSS — there
    // is no single shared source for these, so keep the three in sync
    // by hand if either changes).
    const POUR_STAGGER_MS = 62;
    const POUR_DURATION_MS = 1300;
    const POUR_TOTAL_MS = (letters.length - 1) * POUR_STAGGER_MS + POUR_DURATION_MS;
    // Korean used to wait for the English pour to fully finish
    // (POUR_TOTAL_MS + 200ms), which read as noticeably late. It now
    // starts once most of the pour has visibly settled (70% of
    // POUR_TOTAL_MS — the last few letters are still finishing, but the
    // bulk of the word already reads as arrived) rather than the very
    // last pixel coming to rest, with a shorter gap and a shorter
    // stagger between title and body. "각각" (title and body each on
    // their own beat) is still true — they are not simultaneous — just
    // closer together than before.
    const KOREAN_START_FRACTION = .7;
    const KOREAN_GAP_MS = 50;
    const KOREAN_STAGGER_MS = 150;
    let shown = false;
    // Timeouts for the delayed Korean reveal, so reset() can cancel them
    // — without this, scrolling away right after the English pour ends
    // but before these timeouts fire would still reveal them a moment
    // later, on a section that has already reset.
    let laterTimers = [];

    function pour() {
      shown = true;
      // The stagger IS the "one letter at a time" — each letter's own
      // transition starts a little later than the one before it, so they
      // visibly settle into place in sequence rather than snapping
      // together as a block. 62ms/1300ms so the whole pour (last letter's
      // delay + its own duration, ~2s here) has time to read while the
      // section is scrolling into view, rather than finishing before the
      // reader's eye gets there.
      letters.forEach((span, i) => {
        span.style.transitionDelay = `${i * POUR_STAGGER_MS}ms`;
        span.classList.add('is-in');
      });
      // Korean starts once most of the English pour has settled — see
      // KOREAN_START_FRACTION above for why this is a fraction of
      // POUR_TOTAL_MS rather than the full amount.
      koreans.forEach((el, i) => {
        const id = setTimeout(() => {
          el.classList.add('is-in');
        }, POUR_TOTAL_MS * KOREAN_START_FRACTION + KOREAN_GAP_MS + i * KOREAN_STAGGER_MS);
        laterTimers.push(id);
      });
    }

    function reset() {
      shown = false;
      laterTimers.forEach(id => clearTimeout(id));
      laterTimers = [];
      // No delay on the way out — it should vanish promptly, not replay
      // the settle animation backwards, since it is about to pour in
      // again from scratch next time.
      letters.forEach(span => {
        span.style.transitionDelay = '0ms';
        span.classList.remove('is-in');
      });
      koreans.forEach(el => el.classList.remove('is-in'));
    }

    function check() {
      const top = word.getBoundingClientRect().top;
      if (!shown && top <= window.innerHeight * 0.85) {
        pour();
      } else if (shown && top > window.innerHeight) {
        reset();
      }
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      setTimeout(() => { check(); ticking = false; }, 80);
    }

    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initPhilosophyScatter();

  /* ---------- Statement: photo tilts under the sticky column's weight ---------- */

  function initStatementStickyPress() {
    // Also isCompact(), not just "self-disables because .statement__col
    // isn't sticky any more" — true for the PRESS animation itself
    // (pinState() reads getComputedStyle(col).top, NaN on a static
    // element, so it never reports pinned), but line 1 ("우리는
    // 기술보다") still gets its initial measure()+render(0) at setup,
    // which is the pre-press "right-aligned to line 2" entrance
    // position, not its natural flush-left rest — that render never
    // gets corrected afterward since setTarget(0) is a no-op when
    // target is already 0. Skipping the function outright avoids ever
    // writing that entrance transform in the first place.
    if (prefersReduced || isCompact()) return;
    const col = document.querySelector('.statement__col');
    const tilt = document.querySelector('.statement__tilt');
    const line2 = document.querySelector('.statement__line:nth-child(2)');
    const line3 = document.querySelector('.statement__line:nth-child(3)');
    const body = document.querySelector('.statement__body');
    const detail = body ? body.querySelector('.statement__detail') : null;
    const lead = body ? body.querySelector('.statement__lead') : null;
    const line1 = lead ? lead.querySelector('.statement__lead-line1') : null;
    if (!col || !tilt) return;

    // .statement__tilt (a plain wrapper between .statement__figure and
    // #statementMedia) carries the tilt, not #statementMedia itself —
    // that inner element already has its own JS-driven transform (the
    // rise-into-place parallax in initStatementParallax), and setting
    // .transform directly every frame there would clobber whatever this
    // adds. Also not .statement__figure directly any more — that
    // element's overflow:hidden now acts as a stable clip mask around
    // the tilt, on request ("계단현상... 클리핑 마스크로"), which only
    // works if figure itself never rotates. Either way, the tilt
    // target has no transform of its own otherwise, so it and the
    // parallax below compose independently instead of fighting over
    // one inline style.
    //
    // Every element below is driven off ONE shared `current` value
    // (0 = released, 1 = pressed) inside a single render(p) call each
    // frame — not a CSS transition on either side. Two separately-timed
    // transitions (rotateY on the photo, margin/left on the text) can
    // never be guaranteed to land in step, because a 3D rotateY's
    // on-screen pixel motion under perspective isn't linear with the
    // angle the way plain 2D margin/left motion is linear with itself —
    // matching durations and curves only hides the drift, it doesn't
    // remove it. Computing both from the same number each frame does.
    //
    // Rest values (line2/line3/detail's margin-left, body's left) are
    // measured from computed style rather than hardcoded, so this stays
    // correct if the CSS clamp()s or -60px offsets above ever change.
    let restLine2 = 0, restLine3 = 0, restDetail = 0, restBodyLeft = 0, pressedBodyLeft = 0, line1PressShift = 0;
    // One-way latch: false until the column has been pinned at least
    // once (see step() below), then permanently true — line 1 reads
    // right-aligned only for that first approach, BEFORE it has ever
    // pinned; every release afterward, in either scroll direction,
    // leaves it flush left rather than reverting.
    let line1Locked = false;
    // render() below writes these same properties as inline styles, so a
    // later measure() (on resize) would otherwise read back its OWN
    // previous inline value instead of the true CSS rest position —
    // clearing the inline override before each read is what keeps this
    // safe to call more than once.
    function measure() {
      if (line2) { line2.style.marginLeft = ''; restLine2 = parseFloat(getComputedStyle(line2).marginLeft) || 0; }
      if (line3) { line3.style.marginLeft = ''; restLine3 = parseFloat(getComputedStyle(line3).marginLeft) || 0; }
      if (detail) { detail.style.marginLeft = ''; restDetail = parseFloat(getComputedStyle(detail).marginLeft) || 0; }
      if (line1 && lead) {
        // Only pinned target: line 1's rest position is plain flush
        // left (no override at all — see style.css), so the only thing
        // to measure is how far RIGHT it needs to travel to reach line
        // 2's own last real character. lead's final child is line 2's
        // text node ("문제를 먼저 봅니다."); a Range over everything
        // but its trailing period gives that character's actual ink
        // edge rather than the period's, which sits noticeably further
        // right despite being a fraction of a character wide.
        line1.style.transform = '';
        const line2Text = lead.lastChild;
        let dEdge = null;
        if (line2Text && line2Text.nodeType === Node.TEXT_NODE && line2Text.length > 1) {
          const r = document.createRange();
          r.setStart(line2Text, 0);
          r.setEnd(line2Text, line2Text.length - 1);
          const rects = r.getClientRects();
          if (rects.length) dEdge = rects[rects.length - 1].right;
        }
        line1PressShift = dEdge === null ? 0 : dEdge - line1.getBoundingClientRect().right;
      }
      if (body) {
        body.style.left = '';
        restBodyLeft = parseFloat(getComputedStyle(body).left) || 0;
        // The pressed target is calc(-1 * (--st-gap + --st-overlap)) —
        // .statement__big's own margin-left already resolves to exactly
        // that (see style.css), so reading ITS computed value sidesteps
        // reading the two custom properties directly: getPropertyValue
        // on a custom property returns its literal authored text (e.g.
        // "clamp(20px, 2.6vw, 48px)"), not the resolved px number, so
        // parseFloat on it would silently grab just the clamp's first
        // argument instead of the real viewport-resolved value.
        const big = document.querySelector('.statement__big');
        pressedBodyLeft = big ? (parseFloat(getComputedStyle(big).marginLeft) || 0) : 0;
      }
    }

    // One render, driven by the shared progress value — the only place
    // that writes to either the photo's transform or any text offset.
    function render(p) {
      tilt.style.transformOrigin = '0% 10%';
      tilt.style.transform = `perspective(1000px) rotateY(${(9 * p).toFixed(3)}deg)`;
      // The clip mask on .statement__figure didn't touch the staircase
      // artifact — it turned out to be on the rotated layer's own
      // diagonal top/bottom edges (inside the box, not overflowing
      // it), not something a stable window could crop away. A blur
      // proportional to p softens those hard steps directly instead:
      // 0 at rest (p=0, nothing to hide) rising to a still-subtle
      // ~0.6px at full press, on request ("완화된것 같지않고 똑같네").
      tilt.style.filter = p > .001 ? `blur(${(p * .6).toFixed(2)}px)` : 'none';
      if (line2) line2.style.marginLeft = `${(restLine2 * (1 - p)).toFixed(2)}px`;
      if (line3) line3.style.marginLeft = `${(restLine3 * (1 - p)).toFixed(2)}px`;
      if (detail) detail.style.marginLeft = `${(restDetail * (1 - p)).toFixed(2)}px`;
      if (body) body.style.left = `${(restBodyLeft + (pressedBodyLeft - restBodyLeft) * p).toFixed(2)}px`;
      // Opposite direction AND a one-way latch, unlike everything else
      // in this function: line 1 starts right-aligned to line 2's last
      // character and moves flush left as the column pins — but once
      // it has genuinely reached flush left (line1Locked, set in
      // step() below), it stays flush left through every release and
      // re-approach after that, in either scroll direction, rather
      // than reverting. Only the very first approach — before it has
      // ever pinned — reads right-aligned.
      if (line1) {
        const line1P = line1Locked ? 1 : p;
        line1.style.transform = `translateX(${(line1PressShift * (1 - line1P)).toFixed(2)}px)`;
      }
    }

    // A stuck sticky element's own rect.top holds exactly at its CSS
    // `top` for as long as it's pinned — before engaging it's larger
    // (still scrolling down normally) and after releasing it's smaller
    // (scrolling away again) — so "currently pinned" is just "close to
    // that value right now", checked continuously rather than a one-shot
    // flag, so the press holds for the whole pinned stretch and clears
    // the instant it isn't.
    //
    // stickyTopPx is read fresh on every call rather than cached once at
    // init — .statement__col's own `top` is 10vh-based (see style.css),
    // so it genuinely changes whenever the viewport height does. Caching
    // it once meant this compared the CURRENT rect against a STALE
    // target after any height change that didn't also reload the page —
    // toggling fullscreen (F11) being the case that was actually
    // reported broken, but any viewport-height change would have hit it.
    let current = 0;
    let target = 0;
    let rafId = null;
    const DURATION = 550; // ms for a full 0->1 (or 1->0) sweep

    // Returns both whether the column is CURRENTLY pinned and, when it
    // isn't, which SIDE of the pin point it's sitting on — top >
    // stickyTopPx means it's still approaching from below (hasn't
    // reached the pin point yet, normal scroll flow); top < stickyTopPx
    // means it has already scrolled past it (released, continuing on,
    // whether toward Vision or having doubled back up through it and
    // out the near side again). Both isPinned() and line 1's own reset
    // in update() below need this same distinction, not just a bare
    // pinned/not-pinned boolean.
    function pinState() {
      const stickyTopPx = parseFloat(getComputedStyle(col).top);
      if (Number.isNaN(stickyTopPx)) return { pinned: false, before: false };
      const top = col.getBoundingClientRect().top;
      return {
        pinned: Math.abs(top - stickyTopPx) < 1.5,
        before: top > stickyTopPx + 1.5,
      };
    }

    let animStart = null;
    let animFrom = 0;
    function step(now) {
      if (animStart === null) { animStart = now; animFrom = current; }
      const elapsed = now - animStart;
      const span = Math.abs(target - animFrom) * DURATION || 1;
      const t = Math.min(1, elapsed / span);
      current = animFrom + (target - animFrom) * t;
      render(current);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        current = target;
        // Latches line 1 flush-left for good the moment a pin
        // animation actually finishes (target === 1, not just
        // requested) — reaching it, not merely heading toward it, is
        // what should make it permanent.
        if (target === 1) line1Locked = true;
        render(current);
        rafId = null;
        animStart = null;
      }
    }

    function setTarget(next) {
      if (next === target) return;
      target = next;
      animStart = null; // restart the timer from wherever `current` is now
      if (rafId === null) rafId = requestAnimationFrame(step);
    }

    function update() {
      const state = pinState();
      // Resets line 1's latch only when genuinely BEFORE the pin point
      // — approaching in normal scroll flow, not yet pinned — which is
      // true both for a first-ever approach and for having scrolled
      // all the way back up PAST the pin point again after a full trip
      // down to Vision and back (sticky re-engages on the way up too,
      // so by the time the column is back above it, that's a fresh
      // approach in every way that matters). A release that continues
      // FORWARD, past the pin point rather than back before it, leaves
      // this untouched — that's the "stays flush left toward Vision"
      // case, unaffected on purpose.
      if (state.before && line1Locked) {
        line1Locked = false;
        // setTarget below only re-renders when `target` itself
        // changes — here target is already 0 both before and after
        // this reset (released either way), so without an explicit
        // render here the DOM would silently keep showing flush left
        // until some LATER, unrelated target change happened to
        // repaint it. The flag flips immediately; the paint needs to
        // follow immediately too.
        render(current);
      }
      setTarget(state.pinned ? 1 : 0);
    }

    function onResize() {
      measure();
      render(current);
      update();
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    measure();
    render(current);
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
  }

  initStatementStickyPress();

  /* ---------- 02 -> 03: VISION zooms past and the ground changes ---------- */

  function initVisionWipe() {
    const sec = document.getElementById('visionWipe');
    if (!sec) return;
    const word = sec.querySelector('.vwipe__word');
    const to = sec.querySelector('.vwipe__ground--to');
    if (!word || !to) return;
    // Checked before any setup/listener below, not live inside update()
    // — a scroll listener that only ever bails after being invoked
    // still costs a requestAnimationFrame callback and a full
    // getBoundingClientRect/update pass every single scroll tick, which
    // on a real touch device compounds across every section's own
    // listener into visibly janky scrolling (reported: "휠로 컨텐츠
    // 확인함에 있어 엄청 느리게 느려진다"). Skipping attachment entirely
    // costs the live resize-into-compact case (matches how
    // prefersReduced already behaves here) in exchange for not paying
    // this per-frame tax on every real compact-viewport scroll.
    if (isCompact()) return;
    const vsteps = Array.from(sec.querySelectorAll('.vwipe__vstep'));
    // The released statement column, faded out below as VISION grows in
    // (see the ENTRY_END-keyed opacity further down) — bridges the
    // handoff instead of leaving it sitting fully opaque over the blank
    // paper while the word is still small, which is what read as a gap
    // between the two sections rather than one leading into the other.
    const statementCol = document.querySelector('.statement__col');

    // Reduced motion still needs the ground to change, or section 03
    // arrives on a photograph the page never introduced. The vision
    // statements settle on the LAST one (CSS default, see
    // .vwipe--static) rather than the first, since that is the
    // statement the ground's own settled state belongs with — there is
    // no scroll motion here to reach the other two.
    if (prefersReduced) {
      to.style.opacity = '1';
      to.style.transform = 'none';
      word.style.opacity = '0';
      sec.classList.add('vwipe--static');
      return;
    }

    // Read from CSS so the peak lives in one place: the stylesheet sizes
    // the element by it, and the script divides by it.
    const peak = parseFloat(getComputedStyle(sec).getPropertyValue('--vwipe-peak')) || 5.5;
    // Same idea for the phase split: how much of this section's total
    // scroll goes to the zoom versus the vision-statement cycle that
    // follows it, read from --vwipe-zoom-fraction so the CSS height and
    // this split can't drift apart from each other by hand.
    const zoomFraction = parseFloat(getComputedStyle(sec).getPropertyValue('--vwipe-zoom-fraction')) || .52;
    // Captured once, before the per-frame writes below ever touch
    // word.style.fontSize — this is the fixed "at peak" reference the
    // overflow math needs. Reading it live later would feed the fade
    // calculation whatever size the word happens to be mid-zoom instead
    // of its true peak, breaking pOverflow.
    const basePeakFontPx = parseFloat(getComputedStyle(word).fontSize) || 0;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    // Progress across one leg of the sequence, clamped at both ends.
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const lerp = (a, b, t) => a + (b - a) * t;
    // Same HOLD/FADE shape as the abandoned standalone section's own
    // cross-blur used — see that version's comment for why the two
    // reach past half the 1.0 spacing between steps (both partially
    // visible and blurred at once is what makes it read as a double
    // exposure rather than a plain sequential fade). HOLD widened
    // (.16 → .26) — the first statement ("더 명확한 경험") in
    // particular read as passing too quickly, on request ("여기 파트가
    // 조금 빨리 지나가는듯"). Widening HOLD gives every step (not just
    // the first — they all share this same shape) more scroll distance
    // fully sharp before it starts blurring into the next.
    const V_HOLD = .26;
    const V_FADE = .5;
    const V_MAX_BLUR_PX = 18;

    let ticking = false;

    function update() {
      ticking = false;
      const r = sec.getBoundingClientRect();
      // What is left of the section once the sticky stage has filled the
      // screen — the actual pinned distance, so this stays correct if the
      // section's height changes.
      const runway = r.height - window.innerHeight;
      // EARLY_START pulls the whole sequence's start point down the
      // page: instead of p=0 exactly when the section's top reaches the
      // viewport top (i.e. only once the sticky stage has fully arrived
      // and pinned), p now starts advancing while the section is still
      // this far below that — the word visibly begins growing as the
      // section slides up into view, so the whole thing reads as
      // arriving earlier. The endpoint (p=1) is untouched — span grows
      // by the same amount EARLY_START adds to the numerator's range, so
      // stretching the start earlier doesn't push the finish out too.
      const EARLY_START = window.innerHeight * 0.45;
      const span = runway + EARLY_START;
      const p = span <= 0 ? 0 : clamp01((EARLY_START - r.top) / span);
      // The section's raw 0-1 progress now covers TWO phases — the zoom
      // (unchanged) and the vision cycle that follows it. zoomP
      // reproduces EXACTLY the old p's behaviour within the first
      // zoomFraction of the scroll (clamped to 1 for the remainder,
      // holding the zoom's end state). The cycle's own start point is
      // computed further down, once pOverflow is known — see there for
      // why a static zoomFraction boundary is not what it uses.
      const zoomP = clamp01(p / zoomFraction);

      // BUG FIXED HERE (historical — p already means zoomP below): p
      // used to be clamp01(...) a few lines up and only ever ranged
      // [0,1], never negative. An earlier version of this entry leg
      // used seg(p,-1,-.35), copied from initStatementParallax's
      // DIFFERENT convention (that function's own p genuinely spans
      // [-1,1]). Since this p can never be less than 0, that branch's
      // condition (p < -.35) was never true, so the word skipped
      // straight to the "continuing zoom" formula and rendered at
      // ~1.275 of peak from the very first visible frame — appearing
      // already enlarged instead of growing from nothing, exactly the
      // symptom reported.
      //
      // ENTRY_END splits the ZOOM into two legs, both using zoomP's own
      // real [0,1] range: before it, the word grows from true zero size
      // up to .86 of peak — hidden at the section's bottom, then
      // zooming up to what used to be this sequence's own starting
      // size. After it, the .86->peak zoom, the fade-out and the ground
      // transition are all UNCHANGED from before this leg existed (same
      // .82/.68/.86/.10/.40 breakpoints) — only the zoom's own start
      // point moves from the old hard-coded .04 to ENTRY_END, so the two
      // legs still meet at exactly .86 with no jump at the seam.
      const ENTRY_END = .12;
      // Faded out over the exact same window VISION grows through, so
      // the two overlap instead of one sitting static while the other
      // is still tiny — by the time the entry leg above hands off to
      // the main zoom, the old section's text has fully dissolved.
      if (statementCol) {
        statementCol.style.opacity = (1 - seg(zoomP, 0, ENTRY_END)).toFixed(3);
      }
      // 55, not 30: the word is centred via flex at 50%, so a 30svh
      // offset only pushed its centre to 80% down the viewport — still
      // on-screen, just low. 55 puts it at 105%, genuinely below the
      // browser's bottom edge at the very start, which is what "emerges
      // from the bottom of the browser" needs — matters most here since
      // this is also where effectiveSize is smallest, so the visible
      // growth reads as rising up INTO frame rather than just growing
      // in place a bit low.
      const y = lerp(55, 0, seg(zoomP, 0, ENTRY_END));
      // Squared, so it creeps and then rushes: a linear scale reads as a
      // mechanical push rather than something passing the camera. Used
      // for both legs, so the growth character doesn't change at the seam.
      const entryEased = seg(zoomP, 0, ENTRY_END) ** 2;
      const z = seg(zoomP, ENTRY_END, .82);
      const eased = z * z;
      const effectiveSize = zoomP < ENTRY_END
        ? lerp(0, .86, entryEased)
        : lerp(.86, peak, eased);
      // Fraction of the peak size this frame renders at. Applied to
      // font-size directly (see the bottom of this function) rather than
      // as a transform: scale() — scaling a huge pre-rasterised layer
      // down to a small fraction is exactly the extreme-minification
      // case GPUs blur, which is what made the word look soft right at
      // first entry, when this fraction is smallest. Setting font-size
      // itself makes the browser rasterise fresh glyphs at every size,
      // so it stays crisp through the whole zoom.
      const s = effectiveSize / peak;
      // Fade-out point solved from the word's own geometry rather than
      // a guessed .68: this finds the SCALE at which the word's
      // rendered ink first reaches the viewport's height — the point it
      // starts being clipped at both the top and bottom edges — and
      // maps it back to a p via the same easing the zoom itself uses.
      // The word stays fully opaque right up to that point instead of
      // fading early, and only starts leaving once it is actually
      // overflowing.
      // INK_RATIO matters here and was missing before: line-height:1
      // makes the element's own BOX exactly fontSize tall, but "VISION"
      // in Outfit only paints .708 of that (measured — no descenders in
      // an all-caps word, but real air above/below the glyphs remains).
      // Treating the full font-size as if it were the ink height made
      // the fade trigger while the letters were still ~30% short of the
      // viewport's edges, which is the premature-disappearance reported.
      // Falls back to fading at peak (p=.82) if the aspect ratio means
      // it never grows taller than the viewport at all (portrait/narrow
      // screens) — better than never fading.
      const INK_RATIO = .708;
      const sOverflow = Math.min(1, window.innerHeight / (basePeakFontPx * INK_RATIO));
      const easedOverflow = clamp01((sOverflow * peak - .86) / (peak - .86));
      const pOverflow = ENTRY_END + Math.sqrt(easedOverflow) * (.82 - ENTRY_END);
      const FADE_SPAN = .08;
      const o = 1 - seg(zoomP, pOverflow, pOverflow + FADE_SPAN);

      word.style.transform = `translate3d(0, ${y.toFixed(2)}svh, 0)`;
      word.style.fontSize = `${(s * basePeakFontPx).toFixed(2)}px`;
      word.style.opacity = o.toFixed(3);
      // Ground comes up early and settles out of a push-in on the SAME
      // eased term the word uses, so both accelerate together instead of
      // the photograph sliding in on its own clock.
      const toOpacity = seg(zoomP, .10, .40);
      to.style.opacity = toOpacity.toFixed(3);
      to.style.transform = `scale(${lerp(1.14, 1, eased).toFixed(4)})`;
      // Drives the equalizer's data-eq-bg contrast switch (see
      // initContrastSwitchers) in step with the SAME crossfade the
      // ground itself just used, rather than a static "dark" flag on
      // the whole section flipping the instant its DOM bounds are
      // entered — that read as switching before the section had
      // actually darkened at all, on request ("아워필라서피 섹션
      // 지나기도전에... 페이퍼색으로 변해있어서 안보이는... 비전
      // 섹션 어둡게 올라올때 색상 자연스럽게 변경되는게 맞을듯"). .from
      // (paper) is what's visible below this threshold, .to (a
      // darkened photo) above it.
      sec.dataset.eqBg = toOpacity > .5 ? 'dark' : 'light';

      // Phase 2: three vision statements cross-blur in the same centred
      // spot the word just vacated — but only once it has ACTUALLY
      // vacated it. wordGoneAt maps pOverflow+FADE_SPAN (in zoomP terms,
      // where the word's own opacity reaches exactly 0) back to the
      // section's raw p.
      //
      // Two bugs shipped here before this, both from the same root
      // cause — clamping cycleP to [0,1] pins vp at exactly 0 for the
      // entire zoom phase, and step 0's distance from vp=0 is 0:
      //  1st attempt (static zoomFraction boundary): step 0 sat at full
      //  presence from the very first frame, visible under/alongside
      //  the still-zooming word.
      //  2nd attempt (this dynamic wordGoneAt boundary, but STILL
      //  clamping cycleP before use): fixed frame 1, but V_FADE (.5) is
      //  wide enough relative to wordGoneAt's actual position that step
      //  0's presence started bleeding in around p=.30 — while the word
      //  was still fully opaque (o=1) — because clamping cycleP at 0
      //  means "distance to step 0" stops growing the instant p ticks
      //  below wordGoneAt, rather than continuing to grow the further
      //  back p actually is.
      // The fix: leave cycleP UNCLAMPED for computing distance (so it
      // keeps growing negative the earlier p is, correctly pushing dist
      // past HOLD+FADE), and ONLY clamp what actually gets multiplied
      // into vp — done here via enterGate, a hard 0/1 switch on whether
      // p has reached wordGoneAt at all, applied to step 0 alone. Steps
      // 1 and 2 need no such gate: at vp=0 their own distance is
      // already 1 and 2, both past HOLD+FADE on their own, with no
      // clamp-induced flooring to cause the same bleed.
      const wordGoneAt = clamp01(pOverflow + FADE_SPAN) * zoomFraction;
      const cycleP = (p - wordGoneAt) / Math.max(0.0001, 1 - wordGoneAt);
      // A quick ramp rather than a hard on/off switch — .06 of cycleP's
      // own 0-1 range is a small fraction of the total cycle runway, so
      // step 0 still fades rather than popping in, just over a short
      // span starting right at the handoff instead of bleeding back
      // into the still-visible word.
      const enterGate = clamp01(cycleP / 0.06);
      const vp = Math.max(0, cycleP) * (vsteps.length - 1);
      vsteps.forEach((step, i) => {
        const dist = Math.abs(vp - i);
        let presence = 1 - clamp01((dist - V_HOLD) / V_FADE);
        if (i === 0) presence *= enterGate;
        step.style.opacity = presence.toFixed(3);
        step.style.filter = `blur(${((1 - presence) * V_MAX_BLUR_PX).toFixed(2)}px)`;
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initVisionWipe();

  /* ---------- Our Vision: three statements cross-blur as the section scrolls ---------- */

  function initVisionCycle() {
    const sec = document.getElementById('visionCycle');
    if (!sec) return;
    const steps = Array.from(sec.querySelectorAll('.vcycle__step'));
    if (!steps.length) return;

    // Reduced motion: one static, readable, stacked list — no runway,
    // no sticky pin, no scroll-driven blur. See .vcycle-section--static
    // in style.css for what this class actually changes.
    if (prefersReduced) {
      sec.classList.add('vcycle-section--static');
      return;
    }

    const clamp01 = v => Math.max(0, Math.min(1, v));
    // How much of each step's own 1.0-wide "slot" stays perfectly sharp
    // before it starts blurring toward its neighbour, and how wide that
    // blur transition is. Two adjacent steps' presence windows overlap
    // whenever their combined reach (HOLD+FADE, doubled) exceeds their
    // 1.0 spacing — 2*(.16+.5) = 1.32 here — which is deliberate: it is
    // that overlap, both partially visible and both blurred at once,
    // that produces the reference's double-exposure "ghost" moment
    // rather than a plain sequential fade. An earlier pass at .22/.32
    // technically overlapped too, but only to 12.5% presence each at
    // the midpoint — too faint to read as the reference's fairly
    // pronounced double exposure. This widens FADE and narrows HOLD so
    // the two neighbours sit at 30% presence each at the midpoint, and
    // spend more of the scroll actually in that overlapped state rather
    // than snapping through it.
    const HOLD = .16;
    const FADE = .5;
    const MAX_BLUR_PX = 18;

    let ticking = false;

    function update() {
      ticking = false;
      const r = sec.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const pRaw = runway <= 0 ? 0 : clamp01(-r.top / runway);
      // Scaled from the section's own 0-1 scroll fraction to 0..(N-1),
      // one whole unit per step, so HOLD/FADE above can be reasoned
      // about in "distance from this step's own slot" rather than a
      // fraction of the whole section.
      const p = pRaw * (steps.length - 1);

      steps.forEach(step => {
        const i = Number(step.dataset.i);
        const dist = Math.abs(p - i);
        const presence = 1 - clamp01((dist - HOLD) / FADE);
        step.style.opacity = presence.toFixed(3);
        step.style.filter = `blur(${((1 - presence) * MAX_BLUR_PX).toFixed(2)}px)`;
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    steps.forEach((step, i) => { step.dataset.i = i; });
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initVisionCycle();

  /* ---------- Why Piltong: mark rises through the marquee, then the
     copy cross-blurs one beat at a time ---------- */

  function initWhyPiltong() {
    const sec = document.getElementById('whyPiltong');
    if (!sec) return;
    const marqueeStage = sec.querySelector('.whyp__marquee-stage');
    const media = sec.querySelector('.whyp__media');
    const mediaVideo = media ? media.querySelector('video') : null;
    const solidRow = sec.querySelector('.whyp__row--solid');
    const outlineRow = sec.querySelector('.whyp__row--outline');
    const copyStage = sec.querySelector('.whyp__copy-stage');
    const copyBg = sec.querySelector('.whyp__copy-bg');
    const steps = Array.from(sec.querySelectorAll('.whyp__step'));
    const keywords = Array.from(sec.querySelectorAll('.whyp__keyword'));

    // No marquee loop, no scroll-driven mark/blur/cross-blur — see the
    // .whyp--static rules in style.css for what this actually changes.
    if (prefersReduced) {
      sec.classList.add('whyp--static');
      return;
    }
    // Separate from prefersReduced on purpose, not folded into the same
    // branch — .whyp--static stops the marquee loop entirely, which is
    // correct for reduced-motion but wasn't what compact wanted: the
    // marquee is a plain CSS animation (not this function's own
    // per-frame work) and reads fine keeping its motion on a touch
    // device, only the two SCROLL-driven pins (marquee mark rise, copy
    // cross-fade) needed to go (reported: "와이필통 타이틀 좌우로
    // 흘러가는거 정지되어있는데 다시 돌아가게 해주고" — an earlier pass
    // wrongly reused .whyp--static here and stopped it). .whyp--compact
    // (style.css) leaves .whyp__row--solid/--outline's own animation
    // untouched, unpins both stages into normal flow, and exposes
    // .whyp__media in place instead of leaving it parked 90vh below the
    // fold at its pre-scroll rest position (request: "흘러가는 타이틀
    // 밑에 피시에서 달려오던 영상 그냥 노출해주고").
    if (isCompact()) {
      sec.classList.add('whyp--compact');
      if (mediaVideo) mediaVideo.play().catch(() => {});
      return;
    }

    // No JS-driven "resume across reloads" any more (a negative
    // animation-delay computed from a sessionStorage-remembered start
    // time, tried previously) — reassigning animation-delay on an
    // already-running CSS animation from JS is exactly the kind of
    // runtime override that can make a browser visibly re-trigger or
    // jump the animation right after load, which read as the marquee
    // going blank and "reloading" rather than flowing continuously.
    // Left as a plain CSS `animation: ... infinite` (see
    // whypMarqueeL/R in style.css) instead — it always starts cleanly
    // at 0% and never needs any runtime intervention, which is what
    // actually guarantees it reads as full and continuous in every
    // situation, not just most of them.

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const seg = (t, a, b) => clamp01((t - a) / (b - a));

    // The mark's own rise/scale-in window, as a fraction of the
    // marquee stage's runway. .1/.8 — much wider than every previous
    // pass (.08/.34 and narrower before that), taking up most of the
    // runway on purpose: a slow, deliberate, unhurried rise is what
    // "고급지게" actually asks for, not a quick reveal early in the
    // scroll. Because seg()/smoothstep() below are pure functions of
    // the CURRENT scroll position (not time, not direction), scrolling
    // back UP through this same window reverses at exactly the same
    // pace — there's no separate "rollback" case to tune.
    const MEDIA_START = .1;
    const MEDIA_END = .8;
    const MAX_MARQUEE_BLUR = 14;
    // No scripted EXIT any more (a symmetric sink-back-down + marquee
    // fade-out, tried previously) — that was its own transition effect
    // sitting between the video and the copy stage, which is exactly
    // what's no longer wanted. The video now just stays fully risen
    // for whatever's left of the runway after MEDIA_END, and the
    // section's own sticky pin releases NATURALLY once its bottom
    // scrolls past — since MEDIA_END is .8, only .2 of the runway is
    // left at that point, so the copy stage still arrives within a few
    // ordinary wheel scrolls, just without any authored hand-off
    // moment engineered into it.
    // Smoothstep (3t^2 - 2t^3), not the raw linear seg() value — eases
    // in from a standing start and eases out into place at the end
    // instead of moving at one constant speed the whole way, which is
    // what "smooth"/"고급지게" actually means here as opposed to just
    // "slower."
    const smoothstep = t => t * t * (3 - 2 * t);

    // Non-keyword beats went through a whole run of clip-path wipe
    // variants, but against this section's new bg_why.png backdrop the
    // original blur/opacity cross-blur reads better — reverted to
    // that, unchanged from its first version (same HOLD/FADE, same
    // overlapping crossfade, no sequencing). The keywords beat below
    // keeps its own current (sequenced, non-overlapping) timing as
    // asked — it's a different entrance (scatter/gather) that never
    // used blur anyway, so there's nothing to revert there.
    const HOLD = .18;
    const FADE = .55;
    const MAX_COPY_BLUR = 16;
    // Keywords' own HOLD/HALF split (sequenced entrance, unrelated to
    // the blur beats' HOLD/FADE above): each beat holds fully clear for
    // HOLD units either side of its own slot, and the remaining gap to
    // its neighbour splits exactly in half between exiting/entering.
    const KW_HOLD = .18;
    const KW_HALF = (1 - 2 * KW_HOLD) / 2;
    // A neighbouring (non-keyword) beat's own HOLD+FADE reach (.18+.55
    // = .73) used to run well past where the keywords beat starts
    // revealing on ITS side (KW_HOLD+KW_HALF = .5) — both beats were
    // live and legible at once for roughly p ∈ [.5, .73] either side of
    // the keywords step, which is the "버그" (디자인/기술/AI/전략
    // entering/leaving): the previous ghosted paragraph still faintly
    // in frame, blurred, behind the words scattering in. Confirmed via
    // static trace, not width-dependent. Only the two beats actually
    // adjacent to keywords get the narrower fade — every other
    // beat-to-beat handoff keeps the original .55 overlap.
    const FADE_NEAR_KEYWORDS = (KW_HOLD + KW_HALF) - HOLD;
    const keywordsIndex = steps.findIndex(s => s.classList.contains('whyp__keywords'));
    // .whyp__copy-bg's own fade-out — the fade-in is computed inline
    // below (against the section's pre-pin arrival, not this), but the
    // exit is still simplest as a plain pRaw threshold: held through
    // every beat, out over the last 12% so it's gone before the
    // section releases into Brand wall.
    const BG_WHY_OUT = .88;

    // Four fixed scatter vectors for the keyword beat, one per word,
    // scaled off the viewport (not fixed px) so the "spilled out"
    // starting spread reads the same proportionally on any screen —
    // same idea .scatter-letter uses for OUR/PHILO/SOPHY, just four
    // whole words instead of individual letters. Large enough to start
    // past the edge of the viewport itself (not just this step's own
    // box), for an actual burst-into-frame arrival rather than a
    // gather from just-off-centre.
    const KEYWORD_OFFSETS = [
      { x: -.65, y: -.5, r: -22 },
      { x: .7, y: -.4, r: 16 },
      { x: -.6, y: .55, r: 18 },
      { x: .65, y: .48, r: -16 },
    ];

    let ticking = false;
    let videoPlaying = false;

    function update() {
      ticking = false;

      if (marqueeStage) {
        const r = marqueeStage.getBoundingClientRect();
        const runway = r.height - window.innerHeight;
        const p = runway <= 0 ? 0 : clamp01(-r.top / runway);
        // A single value, driven purely by the current scroll position
        // — no separate exit multiplier any more, so there's nothing
        // asymmetric between scrolling down into it and back up out of
        // it; it's exactly the same curve either way.
        const mediaP = smoothstep(seg(p, MEDIA_START, MEDIA_END));
        if (media) {
          // translateY only, no opacity fade — it's fully hidden below
          // the viewport at rest (see the matching 90vh in style.css),
          // so the rise alone is what reveals it, dragged by the same
          // inertial scroll carrying the rest of the page rather than
          // growing/fading from a fixed point.
          media.style.transform = `translate(-50%, -50%) translateY(${lerp(90, 0, mediaP).toFixed(2)}vh)`;
        }
        // Blur tied directly to the mark's own presence — a
        // consequence of the mark taking over, not a second effect
        // racing it on its own clock. No opacity fade on the marquee
        // rows either any more — they just stay visible (blurred)
        // behind the video for the rest of the runway, until the
        // section's own sticky pin releases naturally.
        const blur = (mediaP * MAX_MARQUEE_BLUR).toFixed(2);
        if (solidRow) solidRow.style.filter = `blur(${blur}px)`;
        if (outlineRow) outlineRow.style.filter = `blur(${blur}px)`;

        // Plays only once the mark has actually started rising into
        // view and pauses again once it's fully back out — not tied
        // to page load, and not left running the whole time the
        // section merely EXISTS on the page. videoPlaying guards
        // against calling play()/pause() every single scroll frame
        // (harmless but wasteful, and repeated play() calls can log
        // "interrupted by a new load request" warnings).
        if (mediaVideo) {
          const shouldPlay = mediaP > 0;
          if (shouldPlay && !videoPlaying) {
            videoPlaying = true;
            mediaVideo.play().catch(() => {});
          } else if (!shouldPlay && videoPlaying) {
            videoPlaying = false;
            mediaVideo.pause();
          }
        }
      }

      if (copyStage && steps.length) {
        const r = copyStage.getBoundingClientRect();
        const runway = r.height - window.innerHeight;
        const pRaw = runway <= 0 ? 0 : clamp01(-r.top / runway);
        const p = pRaw * (steps.length - 1);

        if (copyBg) {
          // preEntry covers the section's natural scroll-up ARRIVAL —
          // 0 the moment it first touches the viewport's bottom edge,
          // 1 exactly when its top reaches the viewport top (which is
          // also the exact instant pRaw picks up from 0 and the sticky
          // pin engages). Fading in against THIS instead of pRaw is
          // what makes the backdrop feel already-arriving while the
          // section is still visibly scrolling into place, rather than
          // popping in immediately once it's fully pinned.
          const preEntry = clamp01(1 - r.top / window.innerHeight);
          let bgOpacity;
          if (preEntry < 1) {
            bgOpacity = smoothstep(preEntry);
          } else if (pRaw > BG_WHY_OUT) {
            bgOpacity = 1 - smoothstep(seg(pRaw, BG_WHY_OUT, 1));
          } else {
            bgOpacity = 1;
          }
          copyBg.style.opacity = bgOpacity.toFixed(3);
        }

        steps.forEach((step, i) => {
          const isKeywords = step.classList.contains('whyp__keywords');

          if (isKeywords) {
            // Unchanged: same sequenced (non-overlapping) reveal and
            // the same entrance position/timing as before this pass.
            let reveal;
            if (p >= i - KW_HOLD && p <= i + KW_HOLD) {
              reveal = 1;
            } else if (p > i + KW_HOLD && p <= i + KW_HOLD + KW_HALF && i + 1 < steps.length) {
              reveal = 1 - smoothstep(seg(p, i + KW_HOLD, i + KW_HOLD + KW_HALF));
            } else if (p < i - KW_HOLD && p >= i - KW_HOLD - KW_HALF && i - 1 >= 0) {
              reveal = smoothstep(seg(p, i - KW_HOLD - KW_HALF, i - KW_HOLD));
            } else {
              reveal = 0;
            }
            // No clip-path frame here — it would clip to this
            // element's own box, chopping off the scattered words the
            // instant they move past its edges. Opacity + blur (same
            // MAX_COPY_BLUR as the other beats, for the same reason:
            // reads as one consistent "coming into focus" language
            // across every beat) show/hide it; the scatter transform
            // is what reads as the entrance on top of that.
            step.style.opacity = reveal.toFixed(3);
            step.style.filter = `blur(${((1 - reveal) * MAX_COPY_BLUR).toFixed(2)}px)`;
            step.style.clipPath = 'none';
            // Reuses this SAME value for the gather, rather than a
            // second one — the words arrive exactly as their beat
            // becomes legible, not on some separately-tuned clock that
            // could drift out of step with their own reveal.
            keywords.forEach((kw, k) => {
              const off = KEYWORD_OFFSETS[k % KEYWORD_OFFSETS.length];
              const spread = 1 - reveal;
              const tx = off.x * window.innerWidth * spread;
              const ty = off.y * window.innerHeight * spread;
              const rot = off.r * spread;
              kw.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
            });
          } else {
            // Reverted: original overlapping cross-blur, not the
            // sequenced clip-path wipe. Narrower fade for the two beats
            // adjacent to the keywords step (see FADE_NEAR_KEYWORDS
            // above) so this beat is fully gone by the exact point the
            // keywords step starts revealing on its side, instead of
            // still being faintly visible while the words scatter in.
            const dist = Math.abs(p - i);
            const nearKeywords = keywordsIndex >= 0 && Math.abs(i - keywordsIndex) === 1;
            const fade = nearKeywords ? FADE_NEAR_KEYWORDS : FADE;
            const presence = 1 - clamp01((dist - HOLD) / fade);
            step.style.opacity = presence.toFixed(3);
            step.style.filter = `blur(${((1 - presence) * MAX_COPY_BLUR).toFixed(2)}px)`;
            step.style.clipPath = 'none';
          }
        });
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initWhyPiltong();

  /* ---------- Brand wall: background rises in, then drifts gently ---------- */

  function initBrandWall() {
    const sec = document.querySelector('.brandwall');
    const bg = sec ? sec.querySelector('.brandwall__bg') : null;
    const logo = sec ? sec.querySelector('.brandwall__logo') : null;
    const glyphs = logo ? Array.from(logo.querySelectorAll('.bw-glyph')) : [];
    // Checked independently below (each against the video's ACTUAL
    // rendered box) — they sit at different margins from their own
    // corner (equalizer: 9px; hero logo: 20-28px), so a single shared
    // covered/uncovered value doesn't hold for both at once.
    const eqTarget = document.getElementById('musicToggle');
    const navLogoTarget = document.getElementById('heroLogo');
    // isCompact() reuses the same @media(prefers-reduced-motion:reduce)
    // fallback below (style.css) rather than a bespoke one — both want
    // the identical end state (glyphs fully in, bg at rest scale, a
    // solid fill behind it since nothing scrolls it to cover the
    // section), on request ("와이필통 마지막에 나오는 브랜드월
    // 섹션도 풀로 풀어서 위치시켜주고").
    if (!sec || !bg || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);

    // p is just "how far through the last screen's worth of scroll are
    // we": 0 when the section's top first touches the viewport's
    // bottom edge, 1 once it reaches the top — one continuous value
    // for the whole approach, so there's no separate "arrival" vs
    // "settled" case to hand off between.
    const RISE_START = 8;  // vh below rest, at p = 0
    const RISE_END = -2;   // vh past rest, at p = 1 — a slight
                            // overshoot so it's still gently drifting
                            // as the scroll runs out, rather than
                            // stopping dead the moment it arrives.
    const SCALE_START = .45;  // small, at p = 0
    const SCALE_END = 1;      // full size, at p = 1

    // Left late on purpose: smoothstep(.7) is already .784 of the way
    // from SCALE_START to SCALE_END, so the background reads as
    // "mostly arrived" by the time the logo starts — the two never
    // race each other in, the mark only shows up once there's
    // something behind it to land on.
    const LOGO_IN = .7;
    // Each glyph's own reveal window: staggered starts (7 * .02 = .14
    // of runway) each spanning .16 — glyph 0 finishes at .7+.16=.86,
    // glyph 7 finishes exactly at p=1. Driven directly by p (not a
    // class-toggled keyframe animation), so scrolling back up is
    // exactly this same formula at a lower p — there's no separate
    // "reverse" case to keep in sync with the entrance, which is what
    // kept reading as an abrupt stop instead of the entrance undoing
    // itself.
    const LOGO_STAGGER = .02;
    const LOGO_SPAN = .16;
    let ticking = false;

    function update() {
      ticking = false;
      const r = sec.getBoundingClientRect();
      const p = clamp01(1 - r.top / window.innerHeight);
      const eased = smoothstep(p);
      const y = lerp(RISE_START, RISE_END, eased);
      const scale = lerp(SCALE_START, SCALE_END, eased);
      bg.style.transform = `translateY(${y.toFixed(2)}vh) scale(${scale.toFixed(3)})`;
      // Same y/scale handed to the scrim (style.css, .brandwall::before)
      // via custom properties, so it rides along with the video as one
      // body instead of sitting static at full section size underneath
      // its own opacity fade.
      sec.style.setProperty('--brandwall-y', y.toFixed(2) + 'vh');
      sec.style.setProperty('--brandwall-scale', scale.toFixed(3));
      // Full density for the whole approach now, on request — was
      // gated to fade in only from p=.85 (nothing to soften while the
      // video was still small).
      sec.style.setProperty('--brandwall-scrim', '1');
      glyphs.forEach(g => {
        const gi = parseFloat(g.style.getPropertyValue('--i')) || 0;
        const start = LOGO_IN + gi * LOGO_STAGGER;
        const ge = smoothstep(clamp01((p - start) / LOGO_SPAN));
        g.style.opacity = ge.toFixed(3);
        g.style.transform = `translateY(${lerp(9, 0, ge).toFixed(2)}px)`;
      });

      // The video scales down toward its own centre as p falls — well
      // before it's fully grown, its edges have already retreated past
      // the corners, uncovering the page's own paper-white background
      // there. The equalizer sits right in the bottom-right corner, so
      // a static data-eq-bg="dark" (removed from the HTML) had it
      // reading paper against that exposed light background for most
      // of the approach, not just fully dark video, on request
      // ("이퀄라이저 있는 부분이 밝아지는데 이때는 잉크색으로... 어두운
      // 배경이 이퀄라이저에 들어오면 이때 자연스럽게 페이퍼색으로 전환
      // 로고도 마찬가지"). Checked against the video's ACTUAL rendered
      // box (not a guessed scale threshold) so it's correct at any
      // viewport size. Checked SEPARATELY per target (data-eq-bg-
      // equalizer / data-eq-bg-logo, read by isLightAt's scoped lookup)
      // — assuming both corners uncover "at essentially the same point"
      // turned out wrong: the equalizer sits 9px from its corner, the
      // hero logo 20-28px from its own, so the logo's corner is
      // uncovered by the shrinking video well before the equalizer's
      // is, and forcing them to share one value left the logo reading
      // the wrong colour (low-contrast/"회색") for that gap, on request
      // ("여전히... 브랜드월에서 왼쪽 상단 로고 회색으로 보여").
      const bgRect = bg.getBoundingClientRect();
      const coveredAt = target => {
        const r = target.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        return x >= bgRect.left && x <= bgRect.right && y >= bgRect.top && y <= bgRect.bottom;
      };
      if (eqTarget) sec.dataset.eqBgEqualizer = coveredAt(eqTarget) ? 'dark' : 'light';
      if (navLogoTarget) sec.dataset.eqBgLogo = coveredAt(navLogoTarget) ? 'dark' : 'light';
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initBrandWall();

  /* ---------- Brand Identity ---------- */

  function initBrandIdentity() {
    const sec = document.getElementById('brandIdentity');
    if (!sec) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const smoothstep = t => t * t * (3 - 2 * t);
    const rgbStr = c => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
    const lerpArr = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

    // ---- Intro ----
    // Was a dark-to-light background hand-off keyed to preEntry
    // (charcoal, matching Brand wall's own colour, easing through a
    // warm grey to paper) — removed on request; the section is just
    // paper from the start now (see .brandid__intro in style.css).
    // preEntry itself stays — the letter pour below still needs it.

    // BRAND/IDENTITY's own per-letter scatter-pour entrance — same feel
    // as OUR PHILOSOPHY's initPhilosophyScatter (letters tumble in from
    // up-and-right, staggered, sine-varied magnitude/rotation/scale so
    // it reads as a stream rather than one rigid block) but driven
    // continuously off preEntry instead of a scroll-threshold + CSS
    // transition, so it stays reversible by construction like the rest
    // of this section already is.
    const introLetters = [];
    let introIdentityLine = null;
    (function setupIntroLetters() {
      const lines = Array.from(sec.querySelectorAll('.brandid__intro-index-line'));
      if (!lines.length) return;
      lines.forEach(line => {
        const rebuilt = [];
        Array.from(line.childNodes).forEach(node => {
          if (node.nodeType === 3) {
            Array.from(node.textContent).forEach(ch => {
              const span = document.createElement('span');
              span.className = 'brandid__intro-letter';
              span.textContent = ch;
              rebuilt.push(span);
            });
          } else if (node.nodeType === 1) {
            // Already its own span (the T kerning span) — keep it,
            // just add the scatter class alongside its own.
            node.classList.add('brandid__intro-letter');
            rebuilt.push(node);
          }
        });
        line.replaceChildren(...rebuilt);
        introLetters.push(...rebuilt);
      });
      // E, N, the second T, and Y paint IN FRONT of the photo instead
      // of behind it (unlike the rest of IDENTITY, "D" included, which
      // stays hidden behind it) — fully opaque now, on request, not the
      // translucent overlap this had before.
      introIdentityLine = lines[1];
      if (introIdentityLine) {
        [2, 3, 6, 7].forEach(i => { // E(2), N(3), kern-T(6), Y(7)
          const el = introIdentityLine.children[i];
          if (el) el.classList.add('brandid__intro-letter--front');
        });
      }
    })();
    // Scatter vectors depend on window.innerWidth/innerHeight and each
    // letter's own rendered rect (via maxSx) — split out from DOM setup
    // above so it can be re-run on resize (same debounced pattern as
    // alignIntroWord/measurePhotoScale below) instead of only ever
    // running once at load. A devtools viewport RESIZE without a full
    // reload otherwise leaves every letter's travel distance keyed to
    // whatever width the page happened to load at.
    function computeIntroLetterVectors() {
      if (!introLetters.length) return;
      const baseDX = window.innerWidth * 0.30;
      const baseDY = window.innerHeight * 0.30;
      const SAFE_MARGIN = 24;
      introLetters.forEach((span, i) => {
        const rect = span.getBoundingClientRect();
        const a = i * 47.7;
        const mag = 0.75 + Math.abs(Math.sin(a * 0.6)) * 0.4;
        const desiredSx = baseDX * mag;
        const maxSx = Math.max(0, window.innerWidth - SAFE_MARGIN - rect.right);
        const sx = Math.min(desiredSx, maxSx);
        // IDENTITY starts BELOW its resting spot and rises into place —
        // reads as still carrying the upward motion of scrolling past
        // Brand Wall, on request — VISUAL keeps the original up-and-
        // right tumble (negative sy).
        const isIdentity = span.parentElement === introIdentityLine;
        const sy = isIdentity
          ? baseDY * (1.0 + Math.abs(Math.cos(a * 0.8)) * 0.4)
          : -baseDY * (0.8 + Math.abs(Math.cos(a * 0.8)) * 0.4);
        const sr = 32 + Math.sin(a) * 26;
        const sscale = 0.5 + Math.abs(Math.sin(a * 0.6)) * 0.25;
        span.dataset.sx = sx.toFixed(1);
        span.dataset.sy = sy.toFixed(1);
        span.dataset.sr = sr.toFixed(1);
        span.dataset.sscale = sscale.toFixed(3);
      });
    }
    computeIntroLetterVectors();
    let introVectorResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(introVectorResizeTimer);
      introVectorResizeTimer = setTimeout(computeIntroLetterVectors, 120);
    }, { passive: true });

    // VISUAL/IDENTITY's own horizontal placement — measured off the
    // real rendered rects rather than a fixed px offset, since the
    // word's font-size is a vw-based clamp: an offset tuned at one
    // viewport width reads correctly only at that width and drifts at
    // any other (this is what made the first two attempts here look
    // "unchanged"/wrong to eyes on a wider window than the one they
    // were tuned against).
    function alignIntroWord() {
      const identityLine = sec.querySelector('.brandid__intro-index-line--identity');
      const brandLine = sec.querySelector('.brandid__intro-index-line--brand');
      const photoEl = sec.querySelector('.brandid__intro-photo');
      if (!identityLine || !brandLine || !photoEl) return;
      const dEl = identityLine.children[1]; // I(0) D(1)
      const eEl = identityLine.children[2]; // E(2)
      const vEl = brandLine.children[0]; // V(0)
      if (!dEl || !eEl || !vEl) return;

      // D/E/V each carry their own scatter-pour transform (see
      // introLetters above), and the photo carries its own scale/slide
      // entrance transform (see updateIntro) — both are things
      // getBoundingClientRect measures straight through, and this runs
      // more than once (on load, on resize, once fonts/the image are
      // actually ready): by the second call, the section's own
      // scroll-driven update() has already run at least once and given
      // the photo a very non-identity transform, which silently
      // corrupts every measurement below (the photo's scale in
      // particular shifts its OWN left edge, which this function reads
      // directly). Neutralised for the duration of this one pass and
      // restored after, so this only ever reads true, untransformed
      // layout positions.
      const affected = [dEl, eEl, vEl, photoEl];
      const savedTransforms = affected.map(el => el.style.transform);
      affected.forEach(el => { el.style.transform = 'none'; });

      // IDENTITY: shift so the photo's own left edge falls at "D"'s
      // horizontal centre.
      const dRect = dEl.getBoundingClientRect();
      const photoRect = photoEl.getBoundingClientRect();
      const identityML = parseFloat(getComputedStyle(identityLine).marginLeft) || 0;
      const desiredDLeft = photoRect.left - dRect.width / 2;
      identityLine.style.marginLeft = (identityML + (desiredDLeft - dRect.left)).toFixed(1) + 'px';

      // VISUAL: re-measured AFTER the identity shift above (moving
      // IDENTITY also moves where "E" sits), then pulled under it —
      // same staggered-indent idea OUR PHILOSOPHY's PHILO/SOPHY lines
      // use (see .statement__line:nth-child(2/3)).
      const eRect = eEl.getBoundingClientRect();
      const vRect = vEl.getBoundingClientRect();
      const brandML = parseFloat(getComputedStyle(brandLine).marginLeft) || 0;
      brandLine.style.marginLeft = (brandML + (eRect.left - vRect.left)).toFixed(1) + 'px';

      affected.forEach((el, i) => { el.style.transform = savedTransforms[i]; });
    }
    alignIntroWord();
    // Runs against whatever font is ACTUALLY rendering the letters at
    // that instant — if Outfit (a webfont) hasn't finished loading yet,
    // that's still the fallback stack (Pretendard/system sans), with
    // different glyph widths. Once Outfit swaps in, "D"/"E"/"V" resize
    // and every offset computed against the fallback's metrics is now
    // wrong — this is what made the alignment look right in a warm-
    // cache test but land off-target on a real first load.
    // document.fonts.ready re-measures once the real font is actually
    // in.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { alignIntroWord(); });
    }
    let alignIntroWordResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(alignIntroWordResizeTimer);
      alignIntroWordResizeTimer = setTimeout(alignIntroWord, 120);
    }, { passive: true });

    // ENTRY_SPAN_MULT stretches preEntry's own denominator past a flat
    // one screen, on request ("스크롤 횟수를 더 늘려서... 생각보다 많이") —
    // everything below (letters, photo, row) is a window WITHIN this
    // SAME extended 0-1 preEntry, no pinning (removed earlier for
    // reading as a heavy drag against Lenis's inertia). Rolled back to
    // this exact 2.6/.72/.97 configuration on request — a specific
    // earlier point in the conversation, before the row-timing overflow
    // bug and the troubleshooting churn after it.
    const ENTRY_SPAN_MULT = 2.6;
    const INTRO_POUR_START = 0, INTRO_POUR_END = .5, INTRO_POUR_DURATION = .22;
    const introStagger = introLetters.length > 1
      ? (INTRO_POUR_END - INTRO_POUR_START - INTRO_POUR_DURATION) / (introLetters.length - 1)
      : 0;

    const introRowReveals = Array.from(sec.querySelectorAll('.brandid__intro-row .brandid__reveal'));
    const introPhotoEl = sec.querySelector('.brandid__intro-photo');
    const introStackEl = sec.querySelector('.brandid__intro-stack');
    // Was 0.72/0.97 — measured against the real header, that window
    // resolved after .brandid__intro-head had already scrolled above
    // the viewport (headBottom goes negative around preEntry ~0.83),
    // so the photo's settle — and the stack-gap close that rides on the
    // same photoT, which is what's supposed to bring the front letters
    // draping over the photo into view — was finishing entirely
    // off-screen. Same 0.22 span, moved earlier so it plays out while
    // the header is still on screen (headBottom is still ~160px into
    // the viewport at preEntry 0.7).
    const PHOTO_START = 0.48, PHOTO_END = 0.70;
    // How much bigger than its resting width, and how much further
    // down than its resting spot, the photo starts — measured off the
    // real viewport/element size (not guessed). Re-measured on resize
    // below.
    let photoScaleStart = 1;
    let photoSlideDistance = 0;
    // The wide gap under the title (see .brandid__intro-stack in
    // style.css) is only the STARTING point now, on request — it should
    // close back down to the old tucked-under overlap as the photo
    // shrinks into place, the same "naturally resolves like Brand Wall"
    // motion the scale/slide already do, not sit at a fixed gap
    // throughout. Mirrors that CSS rule's own clamp() by hand (rather
    // than reading it via getComputedStyle) so start/end track viewport
    // width the same way the CSS default already did.
    const cssClamp = (min, vw, max) => Math.max(min, Math.min(vw * window.innerWidth / 100, max));
    let stackGapStart = 0;
    let stackGapEnd = 0;
    function measurePhotoScale() {
      if (!introPhotoEl) return;
      const saved = introPhotoEl.style.transform;
      introPhotoEl.style.transform = 'none';
      const rect = introPhotoEl.getBoundingClientRect();
      introPhotoEl.style.transform = saved;
      if (!rect.width) return;
      // Starts with side breathing room now, on request — was a true
      // edge-to-edge full-bleed fill (innerWidth / rect.width * 1.04).
      // rect.width (the resting, max-width:1200px size) is already close
      // to innerWidth on narrower desktop widths, so a fixed side margin
      // alone can undershoot rect.width there and invert the animation
      // (start smaller than rest, growing instead of shrinking) — the
      // 1.05 floor guarantees a start that's always at least a little
      // bigger than rest, and the margin only fully applies once the
      // viewport is wide enough to give it room.
      const PHOTO_START_MARGIN_PX = 64; // each side, at the animation's start
      photoScaleStart = Math.max(1.05, (window.innerWidth - PHOTO_START_MARGIN_PX * 2) / rect.width);
      photoSlideDistance = window.innerHeight * 0.4;
      stackGapStart = cssClamp(64, 8, 160);
      stackGapEnd = cssClamp(-40, -3, -16);
    }
    measurePhotoScale();
    let photoScaleResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(photoScaleResizeTimer);
      photoScaleResizeTimer = setTimeout(measurePhotoScale, 120);
    }, { passive: true });

    function updateIntro() {
      // VISUAL/IDENTITY's letter-scatter-pour, the photo's scale/slide
      // and the Korean row's own rise-and-fade all removed for now at
      // compact widths (request: "그아래 비쥬얼 아이덴티티 섹션의
      // 타이틀 및 애니매이션들도 일단 제거") — .brandid__intro-letter
      // and .brandid__reveal both default to opacity:0 with everything
      // else JS-driven, so style.css's max-width:1024px block forces
      // them visible directly rather than leaving this section
      // permanently blank once nothing writes their inline styles.
      if (isCompact()) return;
      const r = sec.getBoundingClientRect();
      // Anchored to when the SECTION actually starts entering the
      // viewport (r.top === innerHeight), not to a point ENTRY_SPAN_MULT
      // screens early — the earlier version reached preEntry===1 at
      // r.top===0 regardless of MULT, which meant stretching MULT past 1
      // just pushed proportionally more of the whole 0-1 timeline into
      // the screens BEFORE the section was even visible. With the pour
      // finishing by preEntry 0.5, that whole entrance was completing
      // while still off-screen below the fold, no matter how slowly
      // anyone scrolled — this is what "letters just already there, no
      // scatter visible" was actually coming from the whole time.
      const preEntry = clamp01((window.innerHeight - r.top) / (window.innerHeight * (ENTRY_SPAN_MULT - 1)));
      introLetters.forEach((span, i) => {
        const start = INTRO_POUR_START + i * introStagger;
        // Back to ONE shared progress for opacity and motion — this was
        // never actually broken (confirmed via console: opacity/
        // transform tracked scroll correctly the whole time); splitting
        // them into separate durations changed the character of the
        // reveal (translucent-while-still-arriving, on request) rather
        // than fixing anything.
        const t = smoothstep(seg(preEntry, start, start + INTRO_POUR_DURATION));
        span.style.opacity = t.toFixed(3);
        const sx = parseFloat(span.dataset.sx), sy = parseFloat(span.dataset.sy);
        const sr = parseFloat(span.dataset.sr), sscale = parseFloat(span.dataset.sscale);
        span.style.transform = `translate(${lerp(sx, 0, t).toFixed(1)}px, ${lerp(sy, 0, t).toFixed(1)}px) rotate(${lerp(sr, 0, t).toFixed(1)}deg) scale(${lerp(sscale, 1, t).toFixed(3)})`;
      });
      // Photo: no fade (always fully opaque), no translucent-overlap
      // treatment (both removed on request) — just scales/slides from
      // bigger-and-lower into its resting card size/spot, over the
      // stretched preEntry timeline.
      if (introPhotoEl) {
        const photoT = smoothstep(seg(preEntry, PHOTO_START, PHOTO_END));
        const scale = lerp(photoScaleStart, 1, photoT);
        const ty = lerp(photoSlideDistance, 0, photoT);
        introPhotoEl.style.transform = `translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
        if (introStackEl) {
          introStackEl.style.marginTop = lerp(stackGapStart, stackGapEnd, photoT).toFixed(2) + 'px';
        }
      }
      // The Korean group (title, then each body paragraph) comes in
      // last, once the photo has essentially arrived — its own small
      // cascade rather than fading in as one flat block.
      introRowReveals.forEach((el, i) => {
        const start = 0.75 + i * 0.03;
        const t = smoothstep(seg(preEntry, start, start + 0.22));
        el.style.opacity = t.toFixed(3);
        el.style.transform = `translateY(${lerp(16, 0, t).toFixed(2)}px)`;
      });
    }

    // ---- Shape DNA: one sticky stage, four principles cross-fade in place ----
    // document, not sec — #brandIdentity is only the intro frame; Shape
    // DNA, Color Principle etc. are separate sibling <section>s, not
    // descendants of it.
    const dnaSection = document.querySelector('.brandid__dna');
    const dnaItems = Array.from(document.querySelectorAll('.brandid__dna-item'));
    const dnaVideo = document.querySelector('.brandid__dna-media-video');
    const dnaMedia = document.querySelector('.brandid__dna-media');
    const dnaIndexEl = document.querySelector('.brandid__dna-index');
    const dnaTitleEl = document.querySelector('.brandid__dna-title');
    const dnaDetailEl = document.querySelector('.brandid__dna-detail-col');
    const dnaNumReel = document.querySelector('.brandid__dna-num-reel');
    const dnaNumCells = Array.from(document.querySelectorAll('.brandid__dna-num-cell'));
    // Same small-to-full scale initBrandWall's own bg uses on entrance,
    // tuned down (Brand Wall is the hero reveal; this is a secondary
    // detail section) — .brandid__dna-media has overflow:hidden, so the
    // box itself never moves, only what's rendered inside it zooms, on
    // request ("영상은 관성 스크롤에 의해 브랜드 월처럼 자연스럽게 확대").
    const DNA_SCALE_START = .62;
    const DNA_SCALE_END = 1;
    // Top padding animates from the same value .brandid__intro's own
    // top padding resolves to (clamp(160px,22vw,360px), computed here
    // since it drives an inline style, not read from CSS) down to a
    // resting 60px (not 0) — matches the permanent 60px left/bottom
    // inset below. Back to 60 (was briefly 80), on request ("쉐입디엔에이
    // 영상 상,좌,하 여백 다시 60으로 돌리자").
    const DNA_MEDIA_PAD_REST = 60;
    function dnaPadMax() {
      return Math.min(360, Math.max(160, window.innerWidth * .22));
    }
    // SHAPE/DNA and the title each slide in from hidden behind the
    // video's left edge, opacity 0 → 1, on their OWN staggered window
    // of entryP (X and opacity only) so they don't arrive in lockstep —
    // "각기 다르게... 영상 좌측에 숨겨져 있다... 자연스럽게 나오는".
    // .brandid__dna-right's own top/left padding is a plain fixed 100px
    // (style.css) — the "starts with some margin, then resets" version
    // wasn't what was wanted; the vertical rise below is the intended
    // "더 하단에서 시작" instead. Reverted back to .15/.25 — the
    // .4/.5 pushed-later version wasn't wanted after all, on request
    // ("원래 시점으로 돌리자"); same .1 gap between the two.
    const DNA_IDX_HIDE_PX = 160;
    const DNA_IDX_SEG = [.15, .85];
    const DNA_TITLE_HIDE_PX = 160;
    const DNA_TITLE_SEG = [.25, .95];
    // Vertical rise is shared (same value, same curve — just `eased`)
    // between idx and title instead of each having its own timing —
    // the gap between them is a fixed CSS value now (.brandid__dna-group
    // gap), and if X/opacity can stagger independently while Y drifted
    // independently too, that fixed gap would visibly stretch and
    // compress as the two elements' Y positions diverged mid-animation.
    // Moving both by the identical amount keeps the gap looking
    // constant throughout, on request ("좁혀진 간격은 애니매이션
    // 시에도 유지되면서").
    const DNA_RISE_PX = 130;
    // The 4-principle block starts SMALLER than its resting scale and
    // eases UP to it — flipped from the original "starts zoomed in,
    // eases down" on request ("확대인 상태에서 원래 상태로 돌아가는데
    // 반대로"). translate(-50%,-50%) (style.css centering) is
    // re-applied here alongside the scale since this overwrites the
    // element's inline transform every frame.
    const DNA_DETAIL_SCALE_START = .7;

    // Items now all sit in the same spot (stacked in one grid cell,
    // cross-faded — see .brandid__dna-items in style.css), so there's no
    // longer a per-item scroll position to test. Active index instead
    // comes from continuous progress through the section's own runway —
    // same shape updateColor below already uses for its pinned stage.
    function updateDna() {
      if (!dnaSection || !dnaItems.length) return;
      const r = dnaSection.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const p = runway <= 0 ? 0 : clamp01(-r.top / runway);
      const idx = Math.min(dnaItems.length - 1, Math.floor(p * dnaItems.length));
      dnaItems.forEach((el, i) => el.classList.toggle('is-active', i === idx));
      // Roll the numeral drum to the active row instead of swapping the
      // text under it ("숫자 달력 피커 넘어가는 듯한 모션"). The step is
      // expressed as a percentage of the REEL's own height divided by
      // the cell count, so it stays correct without the JS needing to
      // know the cell height in px or em — the two can't drift apart.
      if (dnaNumReel && dnaNumCells.length) {
        const step = 100 / dnaNumCells.length;
        dnaNumReel.style.transform = `translateY(${(-idx * step).toFixed(4)}%)`;
        dnaNumCells.forEach((cell, i) => {
          const off = i - idx;
          cell.style.transform = `rotateX(${(off * -18).toFixed(1)}deg)`;
          cell.style.opacity = Math.max(0, 1 - Math.abs(off) * .55).toFixed(3);
        });
      }

      // Same "how far has the section's own top crossed into the
      // viewport" shape initBrandWall's own p uses — reaches 1 exactly
      // as r.top hits 0, i.e. exactly when the sticky stage pins, so the
      // zoom (and the padding collapse below) settle right as it
      // arrives rather than continuing after.
      const entryP = clamp01(1 - r.top / window.innerHeight);
      const eased = smoothstep(entryP);
      if (dnaVideo) {
        const scale = lerp(DNA_SCALE_START, DNA_SCALE_END, eased);
        dnaVideo.style.transform = `scale(${scale.toFixed(3)})`;
      }
      const padTop = lerp(dnaPadMax(), DNA_MEDIA_PAD_REST, eased).toFixed(1) + 'px';
      if (dnaMedia) dnaMedia.style.paddingTop = padTop;

      // Below 900px this whole entrance is off — .brandid__dna-detail-col
      // switches to position:static there (style.css), where this
      // function's own translate(-50%,-50%) (meant to pair with
      // position:absolute centering) would misplace a static element by
      // half its own size. Clearing the inline styles lets the mobile
      // CSS rules apply cleanly instead of fighting inline styles that
      // always win regardless of specificity.
      if (window.innerWidth > 900) {
        // Same rise value/curve for both, driven by `eased` (the FULL
        // entryP 0-1 curve) rather than either element's own X/opacity
        // segment — see the DNA_RISE_PX comment above. Only cleared to
        // '' once eased itself hits 1 (entryP=1, both elements' own
        // segments are guaranteed done too by then, since both end at
        // or before entryP=1) — clearing per-element the moment ITS OWN
        // segment finished would snap that one element's Y to 0 early
        // while the other kept animating, breaking the "gap stays
        // constant" guarantee this shared value exists for. A lingering
        // inline transform: translate(0,0) keeps the element on its own
        // composited layer, which was reading as faintly blurry text
        // once settled — clearing it once truly done fixes that too, on
        // request ("애니매이션 되고 안착됬을때 약간 흐리멍텅해보이는데").
        const rise = lerp(DNA_RISE_PX, 0, eased).toFixed(2);
        if (dnaIndexEl) {
          const t = smoothstep(seg(entryP, DNA_IDX_SEG[0], DNA_IDX_SEG[1]));
          dnaIndexEl.style.opacity = t.toFixed(3);
          dnaIndexEl.style.transform = eased >= 1
            ? ''
            : `translate(${lerp(-DNA_IDX_HIDE_PX, 0, t).toFixed(2)}px, ${rise}px)`;
        }
        if (dnaTitleEl) {
          const t = smoothstep(seg(entryP, DNA_TITLE_SEG[0], DNA_TITLE_SEG[1]));
          dnaTitleEl.style.opacity = t.toFixed(3);
          dnaTitleEl.style.transform = eased >= 1
            ? ''
            : `translate(${lerp(-DNA_TITLE_HIDE_PX, 0, t).toFixed(2)}px, ${rise}px)`;
        }
        if (dnaDetailEl) {
          const s = lerp(DNA_DETAIL_SCALE_START, 1, eased);
          dnaDetailEl.style.opacity = eased.toFixed(3);
          dnaDetailEl.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)})`;
        }
      } else {
        if (dnaIndexEl) { dnaIndexEl.style.opacity = ''; dnaIndexEl.style.transform = ''; }
        if (dnaTitleEl) { dnaTitleEl.style.opacity = ''; dnaTitleEl.style.transform = ''; }
        if (dnaDetailEl) { dnaDetailEl.style.opacity = ''; dnaDetailEl.style.transform = ''; }
      }
    }

    // ---- Color Principle: one pinned stage, three background states ----
    const colorStage = document.querySelector('.brandid__color-stage');
    const colorSticky = colorStage ? colorStage.querySelector('.brandid__color-sticky') : null;
    const colorSymbol = colorStage ? colorStage.querySelector('.brandid__color-symbol') : null;
    const colorHead = colorStage ? colorStage.querySelector('.brandid__color-head') : null;
    const colorCaption = colorStage ? colorStage.querySelector('.brandid__color-caption') : null;
    const colorFlash = colorStage ? colorStage.querySelector('.brandid__color-flash') : null;
    const colorNames = colorStage ? Array.from(colorStage.querySelectorAll('.brandid__color-name')) : [];
    // The flat opacity flash (first pass) was still just a uniform
    // fade over everything — asked for more spectacle specifically on
    // "뒤에 색상 전체 깔리는" bit, on request ("화면전환이 화려하면
    // 좋을것 같은데"). Now a RIPPLE instead: .brandid__color-flash sits
    // BEHIND the head/symbol/caption (moved first in the DOM — see
    // index.html) and reveals the incoming colour through a circular
    // clip-path that bursts outward from wherever the pinball symbol
    // actually is at the moment the transition starts, in raw pixels
    // (not clip-path's own %, which resolves against sqrt(w²+h²)/√2,
    // not a corner distance — an off-centre origin needs the true
    // farthest-corner distance to guarantee full coverage) sized to
    // clear the farthest corner from that point. The origin is
    // captured ONCE per pass and held for the whole burst — the symbol
    // keeps moving under its own physics throughout, and recomputing
    // the origin every frame would make the ripple's centre visibly
    // drag around instead of expanding from one fixed point of impact.
    // colorSticky's own flat background-color (below) stays on the
    // OUTGOING colour for the entire window instead of cross-fading —
    // the ripple is what delivers the colour now, and a simultaneous
    // background lerp underneath it would show two different in-between
    // colours at once (revealed circle vs. still-covered area). The
    // scale "kick" from the first pass stays, but on its own triangular
    // pulse now (peaks at the window's midpoint, independent of the
    // ripple's own linear/eased growth).
    const PUNCH_SCALE = .05;
    // Text recedes behind the ripple instead of just sitting flat on
    // top of it throughout, on request ("글자는 다 뒷쪽에 있는 느낌으로
    // 하고 약간의 블러처리 됬다가... 다시 자연스럽게 돌아오는걸로") —
    // both driven by the SAME punchT triangular pulse the scale kick
    // uses (0 at rest, 1 at the transition's midpoint, back to 0 once
    // settled), so head/caption blur+dim in and sharpen back out on
    // exactly the same beat as the colour change itself, not a
    // separately-timed effect.
    const TEXT_BLUR_MAX = 6; // px
    const TEXT_RECEDE_OPACITY = .5; // opacity floor at the pulse's peak
    let flashOriginA = null, flashOriginB = null;
    // Same "rise + fade in, settling exactly as the stage pins" shape
    // updateDna's title/index use — the text group used to just appear
    // already in place; this gives it a scroll-linked entrance instead,
    // on request ("컬러 프린서플 텍스트 그룹에도... 관성 스크롤에 의해
    // 자연스럽게 딸려오다 적절한 애니메이션 추가"). Only Y (not DNA's X
    // slide) — this is one centred block, not two staggered side items,
    // so a straight rise reads as "dragged up by the scroll" without
    // needing a slide direction.
    // First pass (70px / [0,.8]) read as too subtle, on request
    // ("애니매이션 느낌이 약하다 조금더 눈에 띄게") — rise doubled to
    // match DNA_RISE_PX's own 130px scale (this is a single block, not
    // DNA's two-line stagger, so it can take a slightly bigger move
    // without feeling busy), and the opacity segment narrowed to
    // [0,.55] so the fade itself finishes well before the rise/pin do —
    // text is fully legible while still visibly travelling, rather than
    // still-fading-in at the same moment it stops moving, which is what
    // read as weak.
    const COLOR_HEAD_RISE_PX = 140;
    const COLOR_HEAD_SEG = [0, .55];

    const WARM_WHITE = [247, 245, 240];
    const CHARCOAL = [24, 28, 35];
    // --signal-surface, not --signal-100 — the token this codebase
    // already uses for large colour fills (.frame--signal) rather than
    // small-text accents.
    const SIGNAL = [231, 91, 53];
    const WARM_WHITE_FG = [24, 28, 35];
    const CHARCOAL_FG = [247, 245, 240];
    const SIGNAL_FG = [247, 245, 240];

    function updateColor() {
      if (!colorStage || !colorSticky) return;
      const r = colorStage.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      // raw covers the whole stage; the first COLOR_INTRO_END of it is
      // the mark drawing itself (initColorPinball), so everything below
      // runs on the remainder remapped back to 0-1. Without this remap
      // the colour steps would already be part-way through by the time
      // the drawing finished.
      const raw = runway <= 0 ? 0 : clamp01(-r.top / runway);
      const p = clamp01((raw - COLOR_INTRO_END) / (1 - COLOR_INTRO_END));

      // bg stays on the OUTGOING flat colour through the whole
      // transition window now — the ripple below is what actually
      // delivers the colour change, not this. fg still cross-fades
      // smoothly (text needs SOME single readable colour throughout,
      // and it's a much smaller, brief concern than the background).
      // Windows widened 10%→16% of the runway each ([.35,.45]→[.32,.48],
      // [.75,.85]→[.72,.88]), on request ("지금은 너무 급박하게 바뀌는
      // 느낌인데") — more scroll distance for the same visual distance,
      // so the ripple has room to unfold instead of snapping through.
      // Warm White's hold widened .32 → .40, on request ("웜 화이트 색상
      // 보는 시간이 좀 짧은것 같아"). It only looked like the longest
      // hold on paper: it is the state the section OPENS on, so the head
      // and caption are still animating into it for the first fifth of
      // its window, and what was left once they settled was under half a
      // screen of scroll. Widening it here plus the extra runway the
      // phase gained takes the settled-and-readable stretch from
      // effectively nothing to roughly three-quarters of a screen. The
      // later windows moved too, so nothing else got shorter to pay for
      // it — every hold is longer in absolute scroll than before.
      const WW_END = .40, T1_END = .54, CH_END = .74, T2_END = .88;
      let bg, fg, activeIdx, wipeOrigin = null, wipeT = 0, incoming = null;
      if (p < WW_END) {
        bg = WARM_WHITE; fg = WARM_WHITE_FG; activeIdx = 0;
      } else if (p < T1_END) {
        const t = smoothstep(seg(p, WW_END, T1_END));
        bg = WARM_WHITE;
        fg = lerpArr(WARM_WHITE_FG, CHARCOAL_FG, t);
        activeIdx = t < .5 ? 0 : 1;
        wipeT = seg(p, WW_END, T1_END);
        incoming = CHARCOAL;
        wipeOrigin = 'A';
      } else if (p < CH_END) {
        bg = CHARCOAL; fg = CHARCOAL_FG; activeIdx = 1;
      } else if (p < T2_END) {
        const t = smoothstep(seg(p, CH_END, T2_END));
        bg = CHARCOAL;
        fg = lerpArr(CHARCOAL_FG, SIGNAL_FG, t);
        activeIdx = t < .5 ? 1 : 2;
        wipeT = seg(p, CH_END, T2_END);
        incoming = SIGNAL;
        wipeOrigin = 'B';
      } else {
        bg = SIGNAL; fg = SIGNAL_FG; activeIdx = 2;
      }
      if (wipeOrigin !== 'A') flashOriginA = null;
      if (wipeOrigin !== 'B') flashOriginB = null;

      // Triangular pulse for the scale kick only — peaks at the
      // window's midpoint, independent of the ripple's own (linear
      // then eased) growth below.
      const punchT = wipeOrigin ? 1 - Math.abs(wipeT - .5) * 2 : 0;

      colorSticky.style.backgroundColor = rgbStr(bg);
      colorSticky.style.color = rgbStr(fg);
      colorSticky.style.transform = punchT > 0 ? `scale(${(1 + punchT * PUNCH_SCALE).toFixed(4)})` : '';
      if (colorSymbol) colorSymbol.style.fill = rgbStr(fg);

      if (colorFlash) {
        if (wipeOrigin && colorSymbol) {
          let origin = wipeOrigin === 'A' ? flashOriginA : flashOriginB;
          if (!origin) {
            const stickyRect = colorSticky.getBoundingClientRect();
            const symRect = colorSymbol.getBoundingClientRect();
            origin = {
              x: symRect.left + symRect.width / 2 - stickyRect.left,
              y: symRect.top + symRect.height / 2 - stickyRect.top,
              w: stickyRect.width,
              h: stickyRect.height,
            };
            if (wipeOrigin === 'A') flashOriginA = origin; else flashOriginB = origin;
          }
          const corners = [[0, 0], [origin.w, 0], [0, origin.h], [origin.w, origin.h]];
          const maxDist = Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - origin.x, cy - origin.y)));
          // Cubic ease-out (fast burst, decelerating) read as too abrupt
          // together with the hard clip-path edge below, on request
          // ("너무 급박하게 바뀌는 느낌") — smoothstep instead eases in
          // AND out, so growth starts gently rather than snapping away
          // from a dead stop.
          const eased = smoothstep(wipeT);
          // innerR (the fully-OPAQUE radius) is tied directly to maxDist
          // — NOT to a fraction of a smaller outerR the way the first
          // gradient pass had it — specifically so it reaches maxDist,
          // covering the farthest corner, exactly at t=1. That first
          // pass had innerR trailing at ~35% of an outerR that itself
          // only just reached the corner, so at the very end of the
          // window the corners were still ~97% the OUTGOING colour —
          // and then the window closes, colorFlash resets to none, and
          // colorSticky's flat background snaps straight to the
          // INCOMING colour, so those still-unfaded corners jumped
          // instantly. That was the "끝에 갑자기 훽하고 색이 차지는"
          // this fixes: by having the fully-opaque core already cover
          // the whole visible box by t=1, there's nothing left
          // unfaded for the snap-to-flat handoff to expose.
          const innerR = eased * maxDist;
          // The fade band trails behind the opaque core at a WIDTH
          // proportional to maxDist (so it scales with viewport size
          // the same way innerR does) rather than a fraction of innerR
          // itself, which would start at a width of 0 and only widen
          // as the core grows — this keeps the soft edge a consistent,
          // visible thickness for the entire sweep, on request ("조금더
          // 스무스하면서 자연스러웟으면"). Extends past the screen once
          // innerR nears maxDist, which is fine — nothing to see there.
          const outerR = innerR + maxDist * .45;
          colorFlash.style.backgroundImage = `radial-gradient(circle at ${origin.x.toFixed(1)}px ${origin.y.toFixed(1)}px, ${rgbStr(incoming)} 0%, ${rgbStr(incoming)} ${innerR.toFixed(1)}px, transparent ${outerR.toFixed(1)}px)`;
        } else {
          colorFlash.style.backgroundImage = 'none';
        }
      }

      colorNames.forEach((el, i) => el.classList.toggle('is-active', i === activeIdx));

      // Recede + blur, shared by head and caption — opacity dips toward
      // TEXT_RECEDE_OPACITY and a blur fades in/out, both riding punchT
      // so they bottom out exactly at the transition's midpoint and are
      // fully clear again the instant it settles.
      const textBlur = punchT > .01 ? `blur(${(punchT * TEXT_BLUR_MAX).toFixed(2)}px)` : '';
      const textRecede = lerp(1, TEXT_RECEDE_OPACITY, punchT);

      if (colorHead) {
        // Was driven off the stage's own arrival (r.top crossing the
        // viewport), which now resolves to 1 long before the content is
        // meant to exist — the stage pins to run the drawing phase, and
        // the head would already be sitting there while the mark was
        // still being drawn. Driven off `raw` instead.
        // Starts just PAST the handover, not before it: an earlier
        // window had the copy arriving while the mark was still filling
        // and shrinking, so the two motions competed. The mark now
        // finishes drawing, shrinks and starts bouncing, and only then
        // does the copy come up ("심볼이 다그려지고 축소되서 핀볼화 되고
        // 나서 컬러 프린서플 내용이 자연스럽게 등장").
        const entryP = clamp01((raw - (COLOR_INTRO_END + .01)) / .10);
        const eased = smoothstep(entryP);
        const t = smoothstep(seg(entryP, COLOR_HEAD_SEG[0], COLOR_HEAD_SEG[1]));
        const rise = lerp(COLOR_HEAD_RISE_PX, 0, eased).toFixed(2);
        // Multiplied against the recede factor, not overwritten by it —
        // the entrance fade-in (0→1 once) and the per-transition recede
        // (1↔TEXT_RECEDE_OPACITY, repeating every crossover) are two
        // independent reasons this element's opacity moves, and both
        // need to hold at once rather than the later one clobbering
        // the earlier one's value.
        colorHead.style.opacity = (t * textRecede).toFixed(3);
        colorHead.style.transform = eased >= 1 ? '' : `translate(0, ${rise}px)`;
        colorHead.style.filter = textBlur;
      }
      if (colorCaption) {
        // Same gate as the head, a beat behind it, so the two arrive in
        // sequence rather than together — and both only once the mark is
        // already bouncing.
        const capT = smoothstep(clamp01((raw - (COLOR_INTRO_END + .04)) / .10));
        colorCaption.style.opacity = (capT * textRecede).toFixed(3);
        colorCaption.style.filter = textBlur;
      }
    }

    function update() {
      updateIntro();
      updateDna();
      updateColor();
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initBrandIdentity();

  /* ---------- Color Principle: symbol bounces around the stage, DVD-screensaver style ---------- */

  function initColorPinball() {
    const stage = document.querySelector('.brandid__color-stage');
    const sticky = stage ? stage.querySelector('.brandid__color-sticky') : null;
    const symbol = sticky ? sticky.querySelector('.brandid__color-symbol') : null;
    const head = sticky ? sticky.querySelector('.brandid__color-head') : null;
    const caption = sticky ? sticky.querySelector('.brandid__color-caption') : null;
    if (!stage || !sticky || !symbol || prefersReduced) return;

    // Bounces off the sticky stage's own edges AND the title/lead and
    // caption text groups (it must never overlap them), free-running
    // rather than tied to scroll, on request ("핀볼처럼 브라우저
    // 여기저기 돌아다니는 느낌으로"). Every bounce — wall or text group
    // — reflects the hit axis and then randomises the new direction
    // (jittered, not a clean mirror), speed, and spin, on request
    // ("방향도 랜덤으로... 속도 가속도도 랜덤으로" / "기울기도 랜덤으로"),
    // so it reads like an actual pinball caroming and tumbling around
    // rather than a metronomic, flat-faced DVD logo. Paused via rAF
    // start/stop whenever the stage itself isn't in view, so it isn't
    // burning frames off-screen.
    const SPEED_MIN = 90, SPEED_MAX = 220; // px/s
    const JITTER = Math.PI / 3; // ±60° added to the post-bounce heading
    // Spin speed re-randomised on every bounce alongside direction/
    // speed, on request ("기울기도 랜덤으로"), so the symbol tumbles
    // instead of just sliding around flat-faced.
    const SPIN_MIN = 40, SPIN_MAX = 260; // deg/s
    // Obstacles are inflated by this much so the symbol reads as
    // bumping off them with a little breathing room, not touching
    // pixel-for-pixel, on request ("글자 그룹에도 넘치지 않고 부딪히게").
    const OBSTACLE_PAD = 16;

    let w = 0, h = 0, symW = 0, symH = 0, x = 0, y = 0, vx = 0, vy = 0;
    let rot = 0, spin = 0, rotPad = 0;
    let obstacles = [];
    const obstacleEls = [head, caption].filter(Boolean);
    const smooth = t => t * t * (3 - 2 * t);

    // Same rotation-bleed gap the wall bounce below was already fixed
    // for (see measure()'s own comment) applies here too, on request
    // ("딱 글자 경계와 심볼 경계가 마찰하는 순간에 심볼이 글자를 넘어가는
    // 느낌은 최대한 안났으면"): resolveObstacle only reacts once the
    // symbol's UNROTATED symW/symH box actually overlaps this rect, but
    // the true rendered shape can already be up to rotPad past that at
    // a 45°-ish angle — so without it, the visible symbol can already
    // be sitting inside the text by the time collision math notices.
    // Adding rotPad to the padding here (on top of OBSTACLE_PAD's own
    // deliberate breathing room) inflates the obstacle by exactly that
    // margin, which is equivalent to inflating the symbol itself for
    // overlap purposes — the trigger now fires early enough that the
    // worst-case rotated silhouette never actually reaches the text.
    function localRect(el) {
      const r = el.getBoundingClientRect();
      const sr = sticky.getBoundingClientRect();
      // The sticky itself gets a scale() during colour transitions, so
      // its rendered rect and its layout box (clientWidth/Height, which
      // w/h and therefore x/y are in) disagree by that factor. Dividing
      // it back out keeps obstacle coordinates in the same space the
      // physics run in — without this the obstacles drift by a few px
      // exactly when a transition is punching, which is the worst
      // possible moment to be wrong about where the text is.
      const sx = sr.width / (sticky.clientWidth || 1);
      const sy = sr.height / (sticky.clientHeight || 1);
      // The head ANIMATES INTO PLACE (a translateY that decays to 0 as
      // it rises), so its rect right now is not where it will be. Union
      // the two: parse the entrance offset out of the inline transform
      // and extend the box to cover where the text is heading as well as
      // where it sits. Parsed rather than measured-without-transform so
      // this stays free of forced reflows and can run every frame.
      let ty = 0;
      const m = /translate\([^,]*,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
      if (m) ty = parseFloat(m[1]) || 0;
      const top = Math.min(r.top, r.top - ty);
      const bottom = Math.max(r.bottom, r.bottom - ty);
      const pad = OBSTACLE_PAD + rotPad;
      return {
        left: (r.left - sr.left) / sx - pad,
        top: (top - sr.top) / sy - pad,
        right: (r.right - sr.left) / sx + pad,
        bottom: (bottom - sr.top) / sy + pad,
      };
    }

    function measure() {
      w = sticky.clientWidth;
      h = sticky.clientHeight;
      // getBoundingClientRect() here would return the ROTATED paint box,
      // which changes every frame as `rot` spins — measuring it once and
      // treating that as fixed is what let the symbol clip, on request
      // ("핀볼처럼 움직이는 심볼 상단부 잘리는 부분 없이"). getComputedStyle
      // width/height is the un-rotated layout box instead (transforms
      // never affect it), so symW/symH here are the symbol's TRUE,
      // constant size — deliberately NOT inflated (an earlier version of
      // this fix inflated symW/symH by ×√2 and left the lower bound at
      // 0, which still let x/y rest at 0 — still unsafe, since rotation
      // happens around the shape's own centre, not the inflated box's,
      // so even sitting at the "top-left" position the corners already
      // swing up to (√2-1)/2 of a side-length above/left of it at worst
      // angle. That's rotPad below: the actual fix is a MARGIN inset
      // from every wall, not a bigger box). rotPad is exactly that
      // margin — (√2-1)/2 of the symbol's own side, the most any corner
      // can swing past its resting edge at the worst-case 45°-ish
      // rotation — added to every boundary check in step()/reset()/
      // onResize() below so the true rotated silhouette can never cross
      // a wall no matter the current spin.
      const symCs = getComputedStyle(symbol);
      const base = Math.max(parseFloat(symCs.width), parseFloat(symCs.height));
      symW = symH = base;
      rotPad = base * (Math.SQRT2 - 1) / 2;
      obstacles = obstacleEls.map(localRect);
    }

    function randomSpeed() {
      return SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    }

    function randomSpin() {
      const s = SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN);
      return Math.random() < .5 ? -s : s;
    }

    // Reflects whichever axis was hit, then jitters the resulting
    // heading and picks a fresh random speed — the sign of the
    // reflected axis is preserved through the jitter so it can't
    // rotate straight back into the surface it just left. Spin gets a
    // fresh random speed/direction on every bounce too.
    function randomizeAfterBounce(axis, sign) {
      const speed = randomSpeed();
      const angle = Math.atan2(vy, vx) + (Math.random() - .5) * JITTER;
      let nvx = Math.cos(angle) * speed;
      let nvy = Math.sin(angle) * speed;
      if (axis === 'x' && Math.sign(nvx || sign) !== sign) nvx = -nvx;
      if (axis === 'y' && Math.sign(nvy || sign) !== sign) nvy = -nvy;
      vx = nvx;
      vy = nvy;
      spin = randomSpin();
    }

    function overlapsAnyObstacle(px, py) {
      return obstacles.some(o => px < o.right && px + symW > o.left && py < o.bottom && py + symH > o.top);
    }

    // Nearest clear spot to the centre of the screen. Dead centre is
    // where the lead text sits, so it searches outward in rings and
    // takes the first position that is both inside the walls and off
    // every obstacle — closest-to-centre wins rather than jumping
    // somewhere arbitrary ("그게 보고 있는곳에서 핀볼화").
    function pickSpot() {
      const cx = (w - symW) / 2, cy = (h - symH) / 2;
      const maxR = Math.max(w, h);
      const stepR = Math.max(12, symH * .35);
      const inBounds = (qx, qy) => qx >= rotPad && qy >= rotPad &&
        qx <= w - symW - rotPad && qy <= h - symH - rotPad;
      if (inBounds(cx, cy) && !overlapsAnyObstacle(cx, cy)) return { x: cx, y: cy };
      for (let r = stepR; r <= maxR; r += stepR) {
        for (let a = 0; a < 12; a++) {
          const th = (a / 12) * Math.PI * 2;
          const qx = cx + Math.cos(th) * r, qy = cy + Math.sin(th) * r;
          if (inBounds(qx, qy) && !overlapsAnyObstacle(qx, qy)) return { x: qx, y: qy };
        }
      }
      return {
        x: Math.min(Math.max(cx, rotPad), Math.max(rotPad, w - symW - rotPad)),
        y: Math.min(Math.max(cy, rotPad), Math.max(rotPad, h - symH - rotPad))
      };
    }

    function reset() {
      measure();
      const spot = pickSpot();
      x = spot.x;
      y = spot.y;
      // Remembered as the handover point: the drawing phase shrinks the
      // seal onto exactly this spot, so swapping the two elements is
      // invisible.
      handoffX = spot.x;
      handoffY = spot.y;
      const angle = Math.random() * Math.PI * 2;
      const speed = randomSpeed();
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      // Matches whatever angle the mark is carrying, so a reset mid-way
      // through the section doesn't spin it upright under the user.
      rot = carryRot;
      spin = randomSpin();
      symbol.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      measureSeal();
    }

    // Standard AABB resolve: push the symbol back out along whichever
    // axis has the smaller overlap, and report that axis/sign so the
    // caller can reflect the matching velocity component.
    function resolveObstacle(o) {
      const overlapLeft = (x + symW) - o.left;
      const overlapRight = o.right - x;
      const overlapTop = (y + symH) - o.top;
      const overlapBottom = o.bottom - y;
      if (overlapLeft <= 0 || overlapRight <= 0 || overlapTop <= 0 || overlapBottom <= 0) return;
      const minX = Math.min(overlapLeft, overlapRight);
      const minY = Math.min(overlapTop, overlapBottom);
      if (minX < minY) {
        if (overlapLeft < overlapRight) { x = o.left - symW; randomizeAfterBounce('x', -1); }
        else { x = o.right; randomizeAfterBounce('x', 1); }
      } else {
        if (overlapTop < overlapBottom) { y = o.top - symH; randomizeAfterBounce('y', -1); }
        else { y = o.bottom; randomizeAfterBounce('y', 1); }
      }
    }

    let running = false;
    let rafId = null;
    let last = null;

    function step(ts) {
      if (!running) return;
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, .05);
      last = ts;

      // Re-measured EVERY frame, not once at reset. The text groups move
      // (they animate into place), reflow (fonts, resize), and change
      // size between colour steps, and a cached rect from page load
      // stopped describing them the moment any of that happened — which
      // is how the symbol could end up sitting on the copy. Three
      // getBoundingClientRect reads per frame is cheap next to being
      // wrong about where the text is ("절대 컬러프린서플 텍스트 및 기타
      // 텍스트에 심볼이 겹치거나 넘치지 않게").
      obstacles = obstacleEls.map(localRect);

      x += vx * dt;
      y += vy * dt;
      rot += spin * dt;
      // Bounced rotPad in from every wall, not at the wall itself — see
      // measure()'s comment for why the plain [0, w-symW] range still
      // let the rotated silhouette poke through at rot≈45°/135°/etc.
      if (x <= rotPad) { x = rotPad; randomizeAfterBounce('x', 1); }
      else if (x >= w - symW - rotPad) { x = w - symW - rotPad; randomizeAfterBounce('x', -1); }
      if (y <= rotPad) { y = rotPad; randomizeAfterBounce('y', 1); }
      else if (y >= h - symH - rotPad) { y = h - symH - rotPad; randomizeAfterBounce('y', -1); }

      obstacles.forEach(resolveObstacle);

      symbol.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      rafId = requestAnimationFrame(step);
    }

    function start() {
      if (running) return;
      running = true;
      last = null;
      rafId = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    /* ---- Phase one: the mark draws itself under the wheel ----
       This stage opens with the symbol being drawn rather than with the
       colour content, and only hands over to the physics below once the
       outline has closed, filled and shrunk to pinball size — all inside
       this same pinned sticky, so nothing about the viewport moves
       between the drawing and the bouncing ("심볼이 휠에 그려지는
       섹션자리에서 [컬러 프린서플이] 등장"). */
    const seal = sticky.querySelector('.brandid__color-seal');
    const sealFill = seal ? seal.querySelector('.cs-fill') : null;
    const sealOutlineG = seal ? seal.querySelector('.cs-outline') : null;
    const sealSegs = seal ? Array.from(seal.querySelectorAll('.cs-outline path')) : [];

    // Sub-windows, as fractions of the whole stage (so they sit inside
    // COLOR_INTRO_END). The draw is deliberately un-eased as a whole —
    // wheel distance maps straight to stroke length so the line tracks
    // the wheel; only each individual stroke is smoothed.
    // Fractions OF THIS PHASE, not fixed offsets from its start. Bare
    // literals inverted once already when the split moved (DRAW0 ended
    // up past DRAW1, so the mark skipped its drawing and just appeared
    // filled), and fixed offsets have the same failure a step later —
    // they overrun the end of the phase as soon as it gets shorter.
    // Proportions survive both.
    const SEAL_SPAN = COLOR_INTRO_END - BLUEPRINT_END;
    const at = f => BLUEPRINT_END + SEAL_SPAN * f;
    const DRAW0 = at(.10), DRAW1 = at(.62);
    const FILL0 = at(.62), FILL1 = at(.82); // colour once the outline closes
    const SHRINK0 = at(.78), SHRINK1 = COLOR_INTRO_END; // shrinks as that lands
    const SEAL_CURVE_MULT = 1.35;

    let sealTotal = 0;
    const sealPlan = sealSegs.map(s => {
      const len = s.getTotalLength();
      const weight = len * (s.dataset.curve ? SEAL_CURVE_MULT : 1);
      sealTotal += weight;
      return { seg: s, len, weight };
    });
    let sealAcc = 0;
    sealPlan.forEach(s => {
      s.start = sealAcc / sealTotal;
      sealAcc += s.weight;
      s.end = sealAcc / sealTotal;
      s.span = Math.max(1e-4, s.end - s.start);
      s.seg.style.strokeDasharray = String(s.len);
      s.seg.style.strokeDashoffset = String(s.len);
    });

    // The mark must end at EXACTLY the pinball's size, and land on
    // exactly the spot the pinball will occupy, or the handover shows.
    // Scale is matched on px-per-user-unit rather than box width: the
    // two svgs frame the same 70.87-unit mark but this one carries 2
    // units of viewBox padding for the stroke, so equating box widths
    // would leave it ~5% small.
    let sealEndScale = .5;
    let handoffX = 0, handoffY = 0;
    function measureSeal() {
      if (!seal) return;
      const sVB = seal.viewBox.baseVal, pVB = symbol.viewBox.baseVal;
      const sW = parseFloat(getComputedStyle(seal).width);
      const pW = parseFloat(getComputedStyle(symbol).width);
      if (sW > 0 && pW > 0 && sVB.width > 0 && pVB.width > 0) {
        sealEndScale = (pW / pVB.width) / (sW / sVB.width);
      }
    }

    let handedOver = false;
    // The angle the mark carries through a handover, in EITHER direction.
    // Scrolling back up used to snap it bolt upright the instant the
    // pinball became the seal again ("갑자기 훽하고 정면으로 돌아가서
    // 어색한데"), because the seal was always drawn at 0°. Now the
    // pinball's live angle is handed to the seal, which unwinds it to 0
    // over the same scroll the mark uses to grow back — so it rotates
    // home instead of cutting there. Handing forward passes the angle
    // back the other way, so a scroll-up-then-down never snaps either.
    let carryRot = 0;
    let shrinkArmed = false;
    function updateSeal() {
      if (!seal) return;
      const r = stage.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const raw = runway <= 0 ? 0 : Math.max(0, Math.min(1, -r.top / runway));
      const drawP = Math.max(0, Math.min(1, (raw - DRAW0) / (DRAW1 - DRAW0)));
      const fillP = smooth(Math.max(0, Math.min(1, (raw - FILL0) / (FILL1 - FILL0))));
      const shrinkT = smooth(Math.max(0, Math.min(1, (raw - SHRINK0) / (SHRINK1 - SHRINK0))));

      sealPlan.forEach(s => {
        const t = Math.max(0, Math.min(1, (drawP - s.start) / s.span));
        s.seg.style.strokeDashoffset = (s.len * (1 - smooth(t))).toFixed(2);
      });
      if (sealFill) sealFill.style.opacity = fillP.toFixed(3);
      if (sealOutlineG) sealOutlineG.style.opacity = (1 - fillP).toFixed(3);

      // Re-pick the landing spot the moment the shrink starts, against
      // obstacles measured right then. Chosen at page load it could be
      // stale by now — the copy has moved and resized since — and a
      // stale target means the mark lands on text and gets shoved off it
      // on the first physics frame.
      if (shrinkT > 0 && !shrinkArmed) {
        shrinkArmed = true;
        measure();
        const spot = pickSpot();
        handoffX = spot.x;
        handoffY = spot.y;
      } else if (shrinkT <= 0) {
        shrinkArmed = false;
      }

      // The handover is resolved BEFORE the transform is written, not
      // after. Written first, the swap frame still drew the seal from
      // the PREVIOUS carryRot/handoff — one frame bolt upright at the
      // old spot before the new values took effect, which is precisely
      // the jump this is meant to remove.
      const done = raw >= COLOR_INTRO_END;
      if (done !== handedOver) {
        handedOver = done;
        seal.style.opacity = done ? '0' : '1';
        symbol.style.opacity = done ? '1' : '0';
        if (done) {
          // Forward: the pinball picks up exactly where the seal is —
          // same spot, same angle (carryRot, which is 0 on a first pass).
          x = handoffX; y = handoffY; rot = carryRot;
        } else {
          // Back: the seal takes over exactly where the pinball is, and
          // inherits its angle so it can unwind rather than snap.
          // Normalised to (-180,180] so it turns the short way home.
          handoffX = x; handoffY = y;
          carryRot = ((rot % 360) + 540) % 360 - 180;
        }
      }

      // Shrinks toward pinball size while drifting from dead centre onto
      // the exact spot the pinball will start from, so the swap between
      // the two elements happens at identical size AND position. The
      // rotation unwinds over the same window, so it also happens at an
      // identical angle.
      const sc = 1 + (sealEndScale - 1) * shrinkT;
      const cx = (w - symW) / 2, cy = (h - symH) / 2;
      const dx = (handoffX - cx) * shrinkT, dy = (handoffY - cy) * shrinkT;
      const rz = carryRot * shrinkT;
      seal.style.transform =
        `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) ` +
        `rotate(${rz.toFixed(2)}deg) scale(${sc.toFixed(4)})`;

      return done;
    }

    function checkVisibility() {
      const r = stage.getBoundingClientRect();
      // Physics only once the stage is pinned AND the drawing phase has
      // handed over. Before that the seal is what's on screen, and a
      // pinball caroming around underneath it would be both invisible
      // and out of position by the time it was revealed.
      const tallEnough = r.height >= window.innerHeight;
      const pinned = tallEnough
        ? (r.top <= 0 && r.bottom >= window.innerHeight)
        : (r.top < window.innerHeight && r.bottom > 0);
      const ready = updateSeal();
      if (pinned && ready) start(); else stop();
    }

    function onResize() {
      const wasRunning = running;
      if (wasRunning) stop();
      measure();
      measureSeal();
      // Before the handover the spawn point is also the seal's landing
      // point, and both depend on layout — recompute rather than clamp,
      // or the mark would shrink onto a spot the pinball no longer uses.
      if (!handedOver) { reset(); checkVisibility(); return; }
      x = Math.min(Math.max(x, rotPad), Math.max(rotPad, w - symW - rotPad));
      y = Math.min(Math.max(y, rotPad), Math.max(rotPad, h - symH - rotPad));
      // Text groups reflow with the viewport too — the clamped-back-
      // into-bounds spot could now sit on top of one.
      if (overlapsAnyObstacle(x, y)) reset();
      else symbol.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      // Re-derive running/stopped from the CURRENT actual visibility
      // afterward, instead of trusting the wasRunning flag captured
      // above to still be correct — on request ("애니메이션
      // 적용안됬다 그냥 제자리에 가만있네"): the old `if (wasRunning)
      // start()` trusted that flag blindly, and if it ever desynced
      // from reality (this firing interleaved with a scroll-driven
      // checkVisibility call, for instance) the symbol could end up
      // stuck with running left false even while the stage was on
      // screen — nothing left to ever call start() again after that.
      // checkVisibility() re-checks geometry fresh every time instead
      // of trusting stale state.
      checkVisibility();
    }

    reset();
    checkVisibility();
    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    // measure() reads the text groups' CURRENT getBoundingClientRect()
    // as the obstacles to bounce off — if a web font (Outfit/IBM Plex
    // Mono) is still loading when reset() first runs, that read
    // reflects the FALLBACK font's metrics, and the obstacle rects go
    // stale the moment the real font swaps in and reflows the text.
    // Nothing re-measures after that until the next resize, so the
    // symbol could keep bouncing off boundaries that no longer match
    // where the text actually is — intermittent by nature (depends on
    // font load timing/cache state), which matches what was reported
    // ("잘되다가 한번씩 새로고침... 글자 넘어가는 현상"). onResize()
    // already does exactly the right recovery (re-measure, clamp back
    // into bounds, reset if the clamped spot now overlaps), so this
    // just calls it again once fonts are confirmed settled — same
    // pattern alignIntroWord() already uses for the same class of bug.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize);
    }
    // Still happening occasionally after the fix above, on request
    // ("새로고침하면 핀볼 여기도 글자 한번씩 또 넘치거나 하네") — a second,
    // belt-and-suspenders re-measure a moment after load catches
    // whatever fonts.ready's resolution doesn't fully cover (some
    // browsers resolve it a beat before the affected text has actually
    // reflowed at its final metrics).
    setTimeout(onResize, 600);
  }

  initColorPinball();

  /* ---------- Symbol Construction: title/text slide in, logos rise one by one ---------- */

  function initSymbolConstruction() {
    const sec = document.querySelector('.brandid__construction');
    const title = sec ? sec.querySelector('.brandid__construction-index') : null;
    const text = sec ? sec.querySelector('.brandid__construction-text') : null;
    const items = sec ? Array.from(sec.querySelectorAll('.brandid__sizes-item')) : [];
    if (!sec || prefersReduced) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);
    const seg = (t, a, b) => clamp01((t - a) / (b - a));

    // Title/text ride the section's own entrance — same "how far has
    // the top crossed into the viewport" shape Brand Wall's own p
    // uses, on request ("이 섹션도 관성 스크롤에 의해 자연스럽게
    // 딸려오고"). Text starts a beat after the title (.15-1 window, not
    // 0-1) so the two don't arrive in lockstep.
    const TITLE_HIDE_PX = 260;
    const TEXT_RISE_PX = 48;
    const TEXT_SEG = [.15, 1];

    // Each logo row reveals off its OWN position crossing into the
    // viewport, not a shared progress value — scrolling further down
    // naturally brings each one in turn instead of all firing together,
    // on request ("심볼들은 차례 차례로 스크롤 할때마다 위로 스르륵
    // 등장"). Span of .4 (not instant) is what makes each one read as a
    // gentle rise rather than a snap-in.
    const ITEM_RISE_PX = 40;
    const ITEM_SPAN = .4;
    const LOOP_SPAN = .45;
    const LOOP_GAP = 0; // flush to the viewport's lower edge, no inset
    // Was 220 — measured live, this section's own 6 items are short
    // enough that `desired` is ALREADY past `maxTop` by the instant the
    // clip finishes entering (t reaches 1), so the fade used to start
    // immediately with zero time spent actually parked at full opacity —
    // read as the clip (and the equalizer's paper-color override tied to
    // its visibility) vanishing right after the second logo instead of
    // staying through the rest of the list, on request ("로고 두번째쯤
    // 까진 페이퍼색으로 나오다가 그아래로 조금만 스크롤하면 사라지는
    // 느낌"). Widened so the exit reads as a slow release over real
    // scroll distance rather than an near-instant cutoff.
    const LOOP_EXIT_PX = 600;
    // Entrance and exit are exact mirrors of the same diagonal move, on
    // request ("우측 하단에서 좌측 대각선 방향으로 커지는 느낌으로
    // 등장하고 사라질땐 반대로") — starts small and offset toward its
    // own bottom-right corner, grows to full size while sliding up-left
    // into its rest spot as it arrives, then the exit runs that exact
    // motion backward: shrinking while sliding back down-right as it
    // fades, rather than the earlier "grows bigger, zooms toward the
    // corner" exit.
    const LOOP_OFFSET_DX = 70;
    const LOOP_OFFSET_DY = 90;
    const LOOP_OFFSET_SCALE = .35;
    const loopWrap = sec.querySelector('.brandid__sizes-loop');
    const loopVideo = sec.querySelector('.brandid__sizes-loop-video');
    // The items' offsetParent — .brandid__sizes is the position:relative
    // box, NOT the section, so offsetTop below has to be read against
    // this one or the pin lands a whole section's padding out.
    const sizesBox = sec.querySelector('.brandid__sizes');

    let ticking = false;

    function update() {
      ticking = false;
      const r = sec.getBoundingClientRect();
      const p = clamp01(1 - r.top / window.innerHeight);
      const eased = smoothstep(p);

      // Cleared to '' once fully settled (eased>=1) rather than left at
      // translate(0,0) — a lingering inline transform keeps the
      // element on its own composited layer, which reads as faintly
      // blurry text once at rest (same fix as Shape DNA's own word/
      // title entrance).
      if (title) {
        title.style.opacity = eased.toFixed(3);
        title.style.transform = eased >= 1 ? '' : `translateX(${lerp(-TITLE_HIDE_PX, 0, eased).toFixed(2)}px)`;
      }
      if (text) {
        const t = smoothstep(seg(p, TEXT_SEG[0], TEXT_SEG[1]));
        text.style.opacity = t.toFixed(3);
        text.style.transform = t >= 1 ? '' : `translateY(${lerp(TEXT_RISE_PX, 0, t).toFixed(2)}px)`;
      }

      items.forEach(item => {
        const ir = item.getBoundingClientRect();
        const ip = clamp01(1 - ir.top / window.innerHeight);
        const t = smoothstep(seg(ip, 0, ITEM_SPAN));
        item.style.opacity = t.toFixed(3);
        item.style.transform = t >= 1 ? '' : `translateY(${lerp(ITEM_RISE_PX, 0, t).toFixed(2)}px)`;
      });

      // The loop clip rides in on the SECOND logo's own arrival, using
      // that logo's scroll position rather than its own — once the clip
      // is pinned it stops moving relative to the viewport, so it could
      // never trigger an entrance off itself.
      if (loopVideo && loopWrap && sizesBox && items.length > 1) {
        const second = items[1];
        const last = items[items.length - 1];
        const lr = second.getBoundingClientRect();
        const lp = clamp01(1 - lr.top / window.innerHeight);
        const t = smoothstep(seg(lp, 0, LOOP_SPAN));

        // Hand-rolled pinning. `top` is whatever keeps the clip's lower
        // edge LOOP_GAP above the viewport's, expressed in the block's
        // own coordinates, then clamped at both ends: it cannot start
        // above the second logo (where it enters) and cannot travel past
        // the last logo's bottom (where it parks, on request "로고
        // 맨마지막에서 스티키"). Between those it simply tracks the
        // viewport, which is what reads as stuck.
        const vidH = loopVideo.getBoundingClientRect().height;
        if (vidH > 0) {
          const boxTop = sizesBox.getBoundingClientRect().top;
          // The ::before backdrop (style.css) bleeds this many px past
          // the video's own bottom edge — "flush to the viewport" has
          // to mean THAT edge, not just the video's, or the backdrop
          // hangs off the bottom of the screen instead of sitting flush
          // in the corner, on request ("영상 클립 우측하단에 아래
          // 여백까지 포함된 사이즈로 붙여주고"). Read from the live
          // computed style rather than duplicating that clamp() value
          // here, so this stays correct if it's ever changed.
          const bleedBottom = Math.abs(parseFloat(getComputedStyle(loopWrap, '::before').bottom)) || 0;
          const desired = (window.innerHeight - LOOP_GAP - vidH - bleedBottom) - boxTop;
          const minTop = second.offsetTop;
          const maxTop = last.offsetTop + last.offsetHeight - vidH;
          const top = Math.max(minTop, Math.min(maxTop, desired));
          loopWrap.style.top = `${top.toFixed(1)}px`;

          // Fades out as it parks. Once `desired` runs past maxTop the
          // clip has stopped tracking the viewport and is just scrolling
          // away like any other content, which read as it being dropped;
          // this turns that release into an exit. Measured in pixels of
          // overshoot past the park point, so it fades at the same rate
          // whatever the viewport height.
          const overshoot = desired - maxTop;
          const out = clamp01(overshoot / LOOP_EXIT_PX);
          // Entrance eases linearly off t (already smoothstepped above);
          // exit is squared, so it starts almost imperceptibly and
          // gathers pace — a linear ramp there reads as a push rather
          // than a rush. The two never overlap (t reaches 1 before out
          // leaves 0), so summing dx/dy and multiplying the two scale
          // factors both collapse to whichever phase is actually active.
          const enter = t >= 1 ? 0 : (1 - t);
          const exit = out * out;
          const dx = LOOP_OFFSET_DX * (enter + exit);
          const dy = LOOP_OFFSET_DY * (enter + exit);
          const scale = (1 - LOOP_OFFSET_SCALE * enter) * (1 - LOOP_OFFSET_SCALE * exit);
          // On loopWrap, not loopVideo — its ::before backdrop (see
          // style.css) needs to fade/scale in exact lockstep with the
          // video, and a transform/opacity on the wrapper already
          // carries pseudo-element children along for free.
          loopWrap.style.opacity = (t * (1 - out)).toFixed(3);
          loopWrap.style.transform = (dx === 0 && dy === 0 && scale === 1)
            ? ''
            : `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
        }
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initSymbolConstruction();

  /* ---------- Symbol Construction blueprint: pen-tool draw-in ---------- */

  // Set by initBlueprintDraw, driven by initBlueprintTransition. The two
  // are split only because the timeline construction below is long; the
  // drawing itself no longer runs on its own clock or its own scroll
  // listener — it is scrubbed from the shared stage's progress.
  let scrubDiagram = null;
  let scrubGrid = null;

  function initBlueprintDraw() {
    const section = document.querySelector('.brandid__blueprint');
    const segs = section ? Array.from(section.querySelectorAll('.bp-outline path')) : [];
    // Lines AND circles — every child of the guide group, whatever shape.
    const gridLines = section ? Array.from(section.querySelectorAll('.bp-grid > *')) : [];
    const anchors = section ? Array.from(section.querySelectorAll('.bp-anchors rect')) : [];
    const handleLines = section ? Array.from(section.querySelectorAll('.bp-handles line')) : [];
    const controlCircles = section ? Array.from(section.querySelectorAll('.bp-controls circle')) : [];
    if (!section || !segs.length) return;

    // Reduced motion: skip straight to the finished drawing — no dash
    // animation, no staggered pop-ins (the CSS reduced-motion block
    // already turns off every transition involved; this just makes
    // sure the segments' own dash values don't leave them permanently
    // invisible with no animation to reveal them).
    if (prefersReduced) {
      section.classList.add('is-drawing');
      segs.forEach(seg => { seg.style.strokeDasharray = 'none'; seg.style.strokeDashoffset = '0'; });
      const handleLines0 = Array.from(section.querySelectorAll('.bp-handles line'));
      handleLines0.forEach(line => { line.style.strokeDasharray = 'none'; line.style.strokeDashoffset = '0'; });
      return;
    }

    // "점 딱 찍고 획 하나하나 그려지는" — a point lands, THEN the stroke
    // to the next point draws, not one continuous line for the whole
    // outline. Built as a per-segment timeline: each of the 18
    // anchor-to-anchor spans gets its own getTotalLength() (real
    // geometry, safe to read immediately — no layout/font dependency),
    // its own draw duration proportional to that length (so an 11px
    // straight edge doesn't take as long as a 25px curve), and a
    // DOT_HOLD pause before it starts, standing in for the beat where
    // the pen has just placed a point. transition-delay/-duration are
    // set here in JS rather than hand-guessed in HTML precisely
    // because they depend on each segment's real measured length.
    // DOT_HOLD (a real pause between every segment) was what actually
    // read as "으으으으으" — 18 explicit stop-start beats in a row —
    // rather than "----------", one continuous flowing line, on
    // request ("한리듬처럼 자연스럽게 이어지길"). Removed: each segment
    // now starts THE INSTANT the previous one finishes (delay = the
    // running total, no added gap), so the stroke never actually stops
    // moving — only its SPEED varies (curves slower, short edges
    // capped at MIN_SEG_MS so they don't blur past instantly). Anchors
    // still land at exactly that same instant (unchanged below) — but
    // that turned out to remove the causality too, on request ("테두리가
    // 그려지고 앵커가 그냥 뒤에 나타나는 느낌... 앵커 찍고 다음 앵커
    // 찍고 주욱 그려지는 과정을 보여주고 싶은건데"): the anchor's own
    // pop animation (260ms) was slower than many segments' draw time
    // (90ms floor), so by the time a dot finished landing the NEXT
    // segment — started the same instant, zero gap — had often already
    // finished too, and the next anchor was popping on top of it. Lines
    // visibly raced ahead of the dots that were supposed to be
    // producing them. ANCHOR_LEAD below is a small (not the old
    // 90-130ms) gap that lets each dot actually finish landing before
    // its outgoing stroke starts, and the pop itself (CSS, further
    // down) is now much quicker for the same reason — short enough
    // that "dot, THEN line" still reads as one continuous rhythm, not
    // a stutter.
    // Whole sequence slowed down, on request ("조금 더 천천히 그려지는
    // 느낌이 좋겠사") — ANCHOR_LEAD/MIN_SEG_MS/MS_PER_UNIT all raised
    // together so the relative rhythm (dot lands comfortably before
    // its stroke, curves still linger longer than straight edges)
    // stays the same shape, just stretched out.
    // Local, like every other init in this file — the scrub below is the
    // first thing in this function to need them.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);

    // Guide grid, drawn before the mark. Each line takes an equal slice
    // and they OVERLAP: a line starts well before its predecessor has
    // finished, so several are extending at once.
    // .55 originally, then .82 to stop seventeen lines reading as a
    // rattle rather than as drawing ("다다닥 나타는 느낌이 아니고 주욱
    // 선을 긋는 듯한"). Now that the grid is just four lines, that much
    // overlap would start all of them almost together and there would be
    // no stroke order left to see — pulled back to .45, which keeps
    // about two in flight at once and gives each roughly a third of the
    // phase (~280px of scroll) to travel its own length.
    const GRID_OVERLAP = .45;
    if (gridLines.length) {
      // Each guide's DURATION is proportional to its own length, not an
      // equal share. The circles are ~2.4x the length of a straight
      // guide, and on equal shares the pen would visibly whip round them
      // to keep up — length-weighting keeps one drawing speed across the
      // whole set, which is the point of the long-stroke pacing.
      const lens = gridLines.map(el => el.getTotalLength());
      const exceptLast = lens.slice(0, -1).reduce((a, b) => a + b, 0);
      const k = 1 / ((1 - GRID_OVERLAP) * exceptLast + lens[lens.length - 1]);
      let cursor = 0;
      const gridPlan = gridLines.map((line, i) => {
        const len = lens[i];
        line.style.strokeDasharray = String(len);
        line.style.strokeDashoffset = String(len);
        const span = k * len;
        const start = cursor;
        cursor += span * (1 - GRID_OVERLAP);
        return { line, len, start, span };
      });
      scrubGrid = function (q) {
        const now = clamp01(q);
        gridPlan.forEach(g => {
          const e = smoothstep(clamp01((now - g.start) / g.span));
          g.line.style.strokeDashoffset = (g.len * (1 - e)).toFixed(2);
        });
      };
      scrubGrid(0);
    }

    const ANCHOR_LEAD = 55;
    const MIN_SEG_MS = 130; // floor so the shortest edges don't draw instantly
    const MS_PER_UNIT = 8; // draw speed, ms per unit of path length — higher = slower strokes
    // Curves given a bit more time than their raw length alone would
    // earn — the rounding itself needs enough duration on screen to
    // actually read as a curve forming rather than rushing through at
    // the same pace as a straight edge, on request ("라운드쪽 앵커
    // 찍고 라운드 곡선이 형성되는 느낌 잘 표현").
    const CURVE_DURATION_MULT = 1.4;

    // The timeline below is still built in MILLISECONDS, but nothing
    // plays it as a clock any more: it is normalised at the end and
    // scrubbed by scroll position instead ("심볼이랑 워드마크 섹션
    // 자동으로 그려지는 부분도 휠에 반응해서 동작하자"). Keeping the ms
    // arithmetic is deliberate — the relative rhythm between strokes,
    // anchors, handles and control points was tuned in these units over
    // many passes, and expressing the same numbers as fractions of a
    // total preserves that rhythm exactly while changing only what
    // advances it.
    let t = 0;
    const segPlan = segs.map((seg, i) => {
      const len = seg.getTotalLength();
      seg.style.strokeDasharray = String(len);
      seg.style.strokeDashoffset = String(len);
      const delay = i === 0 ? 0 : t + ANCHOR_LEAD;
      const mult = seg.dataset.curve ? CURVE_DURATION_MULT : 1;
      const duration = Math.max(MIN_SEG_MS, len * MS_PER_UNIT * mult);
      t = delay + duration;
      return { seg, len, start: delay, end: t };
    });
    const segEnd = segPlan.map(s => s.end);

    // Anchor 0 is the very first point, on screen before anything
    // draws. Anchor i (i>0) lands the instant segment (i-1) — the
    // stroke arriving AT it — finishes.
    const ANCHOR_POP_MS = 90;
    const anchorPlan = anchors.map((a, i) => ({ el: a, at: i === 0 ? 0 : segEnd[i - 1] }));
    // Handles now DRAG OUT (their own stroke-dashoffset draw, like the
    // segments) instead of just fading into place, on request ("여기
    // gif 움직임 보고 이런 느낌 나게는 안되는가?" — Illustrator's own pen
    // tool: a handle bar extends out from an anchor as it's set, not
    // just appears). Each curve has two — in index.html's own DOM
    // order, the FIRST .bp-handles line tagged with a given data-seg
    // is always that curve's START-anchor handle, the SECOND its
    // END-anchor handle, matching how they were authored — so they can
    // be told apart by position within the filtered pair, not another
    // attribute. Measured the same way the outline segments are: real
    // getTotalLength(), not a guessed pixel length.
    handleLines.forEach(line => {
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
    });
    const HANDLE_MS = 190; // raised alongside the other pacing constants above
    const handlePlan = [];
    const controlPlan = [];
    segs.forEach((seg, i) => {
      if (!seg.dataset.curve) return;
      const segStart = i === 0 ? 0 : segEnd[i - 1];
      const segFinish = segEnd[i];
      const [startHandle, endHandle] = handleLines.filter(l => Number(l.dataset.seg) === i);
      const [startControl, endControl] = controlCircles.filter(c => Number(c.dataset.seg) === i);

      // Start handle: drags out to its control point in the window
      // ending right when this curve begins drawing — set just before
      // the pen sweeps the curve, same as in Illustrator.
      const startDelay = Math.max(0, segStart - HANDLE_MS);
      if (startHandle) handlePlan.push({ el: startHandle, start: startDelay, end: startDelay + HANDLE_MS });
      if (startControl) controlPlan.push({ el: startControl, at: startDelay + HANDLE_MS });

      // End handle: drags out right as the curve finishes and its own
      // anchor lands (that anchor's incoming handle isn't "set" until
      // the point itself is placed).
      if (endHandle) handlePlan.push({ el: endHandle, start: segFinish, end: segFinish + HANDLE_MS });
      if (endControl) controlPlan.push({ el: endControl, at: segFinish + HANDLE_MS });
    });

    // Everything above, normalised: TOTAL is the last moment anything
    // moves, so a scroll progress of 0-1 maps onto the whole sequence.
    const TOTAL = Math.max(
      segEnd[segEnd.length - 1] || 1,
      ...controlPlan.map(c => c.at + ANCHOR_POP_MS),
      ...anchorPlan.map(a => a.at + ANCHOR_POP_MS)
    );
    const ANCHOR_SCALE = .28, CONTROL_SCALE = .22;

    // Called every frame from initBlueprintTransition with this panel's
    // own slice of scroll progress. Writes every value directly — no CSS
    // transitions are involved any more (see style.css), because a
    // transition would put lag between the wheel and the stroke.
    scrubDiagram = function (q) {
      const now = clamp01(q) * TOTAL;
      segPlan.forEach(s => {
        const e = smoothstep(clamp01((now - s.start) / Math.max(1, s.end - s.start)));
        s.seg.style.strokeDashoffset = (s.len * (1 - e)).toFixed(2);
      });
      anchorPlan.forEach(a => {
        const e = smoothstep(clamp01((now - a.at) / ANCHOR_POP_MS));
        a.el.style.opacity = e.toFixed(3);
        a.el.style.transform = `scale(${(e * ANCHOR_SCALE).toFixed(3)})`;
      });
      handlePlan.forEach(hp => {
        const len = parseFloat(hp.el.style.strokeDasharray) || 0;
        const e = smoothstep(clamp01((now - hp.start) / Math.max(1, hp.end - hp.start)));
        hp.el.style.strokeDashoffset = (len * (1 - e)).toFixed(2);
      });
      controlPlan.forEach(cp => {
        const e = smoothstep(clamp01((now - cp.at) / ANCHOR_POP_MS));
        cp.el.style.opacity = e.toFixed(3);
        cp.el.style.transform = `scale(${(e * CONTROL_SCALE).toFixed(3)})`;
      });
    };
    scrubDiagram(0);
  }


  initBlueprintDraw();

  /* ---------- Blueprint pinned stage: Symbol ⇄ Wordmark screen transition ---------- */
  // Cross-fades .brandid__blueprint-panel--diagram → --wordmark as the
  // user scrolls through .brandid__blueprint-stage's pinned runway, on
  // request ("같은 섹션에서 화면 전환으로 이 내용이 나오면 좋겠고").
  // Continuous and scroll-scrubbed — opacity/transform are set directly
  // from scroll progress every tick, the same approach Color
  // Principle's own screen transition uses (updateColor above), rather
  // than a fixed-duration CSS transition that can drift out of sync
  // with how fast the user is actually scrolling.
  function initBlueprintTransition() {
    const stage = document.querySelector('.brandid__blueprint-stage');
    const diagramPanel = document.querySelector('.brandid__blueprint-panel--diagram');
    const wordmarkPanel = document.querySelector('.brandid__blueprint-panel--wordmark');
    if (!stage || !diagramPanel || !wordmarkPanel) return;

    // Reduced motion: the CSS reduced-motion block already switches
    // .brandid__blueprint-stage back to plain stacked flow with both
    // panels forced visible — nothing for this scroll-driven crossfade
    // to do.
    if (prefersReduced) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);
    // Transition happens in the middle third of the stage's scroll
    // runway — diagram fully visible before it, wordmark fully visible
    // after, so both states get a comfortable dwell rather than the
    // swap happening the instant the stage starts pinning.
    //
    // The two panels used to share ONE progress value, i.e. a plain
    // simultaneous crossfade. Scrolled slowly that parks both text
    // blocks on screen at half opacity each for a long beat, and since
    // the two panels are densest in the same place — the lower half is
    // body copy and a three-up list on both — the outgoing one reads as
    // a ghost of the incoming one ("휠 천천히 하면 아래 잔상이 남는데").
    // Two fixes, both as suggested. The windows are now OFFSET, so the
    // diagram is most of the way out before the wordmark is meaningfully
    // in; and whatever overlap remains is blurred hard enough that
    // neither layer resolves as readable copy through the other, so it
    // reads as depth of field rather than doubled text.
    // They still overlap on purpose — separating them completely just
    // trades the ghost for a beat of empty paper.
    // Three states now, so the windows below are re-spread over a longer
    // runway (the stage grew 220svh → 340svh). Same offset-crossfade
    // shape at each handover: the outgoing panel is most of the way gone
    // before the incoming one is meaningfully there, and the overlap
    // that remains is blurred rather than left as legible double copy.
    // The diagram panel is now a sequence rather than a static split.
    // It opens with the mark alone and CENTRED, draws its grid, then
    // draws the mark, and only once that is finished does it slide over
    // to its column and let the copy arrive beside it. Previously the
    // copy sat there fully formed from the first frame while the left
    // half was still empty, which is what read as unbalanced
    // ("우측 컨텐츠는 이미 다떠잇는데 심볼이 안그려지니 왼쪽이 비어보이는").
    // The guides are NOT driven off this stage's own progress. They start
    // while it is still approaching — from the moment the symbol
    // section's last logo clears the top of the screen — so the lower
    // half of the screen already has something being drawn in it instead
    // of arriving blank ("미리 어느정도 스크롤 할때 그려져서 아래 화면이
    // 빈 공간이 아니게... 마지막 로고가 안보이는 시점부터"). See the
    // gridT calculation in update(); GRID_AFTER_PIN_VH is how much of the
    // drawing is left to do once the stage has pinned.
    const GRID_AFTER_PIN_VH = .45;
    const lastSizeLogo = document.querySelector('.brandid__sizes-item:last-child');
    const DIA_DRAW0 = .12, DIA_DRAW1 = .42; // the mark draws on them
    const MOVE0 = .46, MOVE1 = .61;    // then it slides to its column
    const GRID_FADE0 = .48, GRID_FADE1 = .62; // guides retire as it goes
    // The copy deliberately starts AFTER most of the slide. Driven off
    // the slide itself, it began fading up while the mark was still
    // travelling across the space it was about to occupy, so the two
    // overlapped mid-move ("심볼이 왼쪽으로 이동될때 심볼 컨텐츠 그룹이랑
    // 겹침 현상 없게"). By .58 the mark is within ~36px of its resting
    // place — inside the column gap, so it never reaches the copy.
    const TEXT0 = .58, TEXT1 = .74;
    const OUT0 = .78, OUT1 = .90;      // diagram fades out
    const IN0 = .82, IN1 = .94;        // wordmark fades in
    const WM_DRAW0 = .84, WM_DRAW1 = 1;
    // The catch at the top. Everything above runs on `p`, which used to
    // hit 1 exactly where the wordmark starts blurring out again — so
    // the one frame where the mark is fully drawn, fully faded up and
    // completely unblurred lasted a single scroll position, and the
    // wheel carried straight through it ("가장 선명해지는 구간에서
    // 휠하면 바로 안넘어가고 살짝 걸려서"). Finishing `p` this much
    // earlier leaves that finished state standing untouched until the
    // exit begins at BLUEPRINT_END: 48svh of scroll, roughly three
    // wheel notches, with nothing moving. The stage was lengthened by
    // exactly this amount (style.css), so the run-up to it is unchanged
    // rather than compressed to make room.
    const WM_HOLD = .0553;
    const PANEL_END = BLUEPRINT_END - WM_HOLD;
    const MAX_BLUR = 6;
    // Quantised to half-pixels: a full-screen blur re-rasterises when
    // its radius changes, and slow scrolling would otherwise demand a
    // fresh one every frame for differences too small to see.
    const blurPx = a => `blur(${(Math.round(a * MAX_BLUR * 2) / 2).toFixed(1)}px)`;

    // Wordmark draws itself in as lines rather than simply appearing
    // filled, on request ("라인만 그려지는 느낌으로 구현하고 색상은
    // 채우지 말고"). Same stroke-dashoffset technique the symbol
    // diagram's own segments use, but one path per LETTER instead of
    // one per anchor-to-anchor span — the letterforms' curves aren't
    // hand-traced into anchors here (no anchor markers to sync to), so
    // there's nothing to gain from splitting them further. Each
    // letter's duration comes from its own measured length, so the
    // wide O doesn't finish at the same moment as the narrow I.
    const wordmarkSvg = wordmarkPanel.querySelector('.brandid__blueprint-wordmark-svg');
    const wordmarkPaths = Array.from(wordmarkPanel.querySelectorAll('.wm-outline path'));
    const WM_STAGGER_MS = 170; // letter-to-letter offset — a left-to-right wave
    const WM_MS_PER_UNIT = 5;
    const WM_MIN_MS = 620;

    // The paths carry vector-effect: non-scaling-stroke (css) so the
    // line holds one constant weight at every viewport size. That
    // changes the units stroke-dasharray is resolved in — Chrome reads
    // it as SCREEN pixels once non-scaling-stroke is on, while
    // getTotalLength() keeps reporting USER units. Setting the raw
    // user-unit length is what left the finished mark full of gaps
    // ("워드마크 그려지다 마는데"): a dash ~6x shorter than the path it
    // was meant to cover simply tiles. Converting through the svg's own
    // user-unit → pixel scale is the fix, and the conversion has to be
    // redone whenever that scale changes, hence measureWordmark() being
    // wired to resize below rather than run once.
    // Durations deliberately stay on the RAW user-unit length: pacing is
    // a property of the letterform's geometry, and shouldn't speed up
    // just because the mark is being drawn wider.
    // Same normalise-and-scrub treatment the symbol diagram gets: the
    // per-letter stagger and length-proportional durations below are the
    // tuned rhythm, expressed as fractions of a total rather than as a
    // clock, so scroll position drives them ("워드마크 섹션 자동으로
    // 그려지는 부분도 휠에 반응해서").
    let wmPlan = [];
    let wmTotal = 1;
    function measureWordmark() {
      const vb = wordmarkSvg.viewBox.baseVal;
      // Computed width, not getBoundingClientRect(): the panel carries a
      // scale() transform through the crossfade, and that would
      // otherwise fold itself into this measurement.
      const scale = vb.width ? parseFloat(getComputedStyle(wordmarkSvg).width) / vb.width : 1;
      wmTotal = 1;
      wmPlan = wordmarkPaths.map((p, i) => {
        const userLen = p.getTotalLength();
        const screenLen = userLen * scale;
        p.style.strokeDasharray = String(screenLen);
        const start = i * WM_STAGGER_MS;
        const end = start + Math.max(WM_MIN_MS, userLen * WM_MS_PER_UNIT);
        if (end > wmTotal) wmTotal = end;
        return { el: p, len: screenLen, start, end };
      });
    }
    measureWordmark();

    function scrubWordmark(q) {
      const now = clamp01(q) * wmTotal;
      wmPlan.forEach(s => {
        const e = smoothstep(clamp01((now - s.start) / Math.max(1, s.end - s.start)));
        s.el.style.strokeDashoffset = (s.len * (1 - e)).toFixed(2);
      });
    }


    // Content rides the scroll in rather than simply being there when
    // the panel is ("관성 스크롤에 의해 딸려오면서 자연스러운 애니매이션
    // 효과들"). Each element gets its own slice of the driving progress
    // so they arrive in sequence — label, then the sentence, then the
    // body, then the list items one after another — instead of the
    // whole block moving as one slab.
    const segOf = (t, a, b) => clamp01((t - a) / (b - a));
    const RISE_PX = 52;
    const stack = (panel, extraStagger) => [
      { el: panel.querySelector('.brandid__blueprint-index'), a: 0, b: .5 },
      { el: panel.querySelector('.brandid__lead'), a: .1, b: .6 },
      { el: panel.querySelector('.brandid__body'), a: .2, b: .7 },
      ...Array.from(panel.querySelectorAll('.brandid__blueprint-principle'))
        .map((el, i) => ({ el, a: .3 + i * extraStagger, b: .8 + i * extraStagger }))
    ].filter(x => x.el);
    const diagramStack = stack(diagramPanel, .07);
    const wordmarkStack = stack(wordmarkPanel, .06);

    // How far the mark has to travel to sit dead centre of the panel
    // instead of in its own column. Measured with any existing transform
    // cleared first, so this is the LAYOUT offset and re-measuring never
    // compounds what a previous frame already applied.
    const diagramRow = diagramPanel.querySelector('.brandid__blueprint-row');
    const diagramVisual = diagramPanel.querySelector('.brandid__blueprint-visual');
    const diagramGrid = diagramPanel.querySelector('.bp-grid');
    let diagramShift = 0;
    function measureDiagramShift() {
      if (!diagramRow || !diagramVisual) return;
      const prev = diagramVisual.style.transform;
      diagramVisual.style.transform = 'none';
      const rr = diagramRow.getBoundingClientRect();
      const vr = diagramVisual.getBoundingClientRect();
      diagramShift = (rr.left + rr.width / 2) - (vr.left + vr.width / 2);
      diagramVisual.style.transform = prev;
    }
    measureDiagramShift();

    function riseIn(list, p, fade) {
      list.forEach(({ el, a, b }) => {
        const t = smoothstep(segOf(p, a, Math.min(1, b)));
        if (fade) el.style.opacity = t.toFixed(3);
        // Cleared once settled: a lingering inline transform keeps the
        // element on its own composited layer, which reads as faintly
        // blurry text at rest (the same fix Shape DNA's own entrance
        // and initSymbolConstruction already carry).
        el.style.transform = t >= 1 ? '' : `translateY(${((1 - t) * RISE_PX).toFixed(2)}px)`;
      });
    }

    function update() {
      const r = stage.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const raw = runway <= 0 ? 0 : clamp01(-r.top / runway);
      // These two panels own only the first BLUEPRINT_END of the shared
      // stage; remapped to 0-1 so the windows below keep the same
      // proportions they had when this was its own section. It finishes
      // at PANEL_END, not BLUEPRINT_END — the gap between the two is the
      // hold, where p is pinned at 1 and nothing moves.
      const p = clamp01(raw / PANEL_END);
      const outT = smoothstep(clamp01((p - OUT0) / (OUT1 - OUT0)));
      const inT = smoothstep(clamp01((p - IN0) / (IN1 - IN0)));
      // The wordmark now has somewhere to go: it clears out as the
      // redraw phase begins, in raw terms rather than remapped ones.
      const wOutT = smoothstep(clamp01((raw - BLUEPRINT_END) / .05));

      // The copy beside the diagram arrives once the mark has vacated
      // its half — it has nothing to say until the thing it annotates
      // exists and has moved aside for it.
      const moveT = smoothstep(clamp01((p - MOVE0) / (MOVE1 - MOVE0)));
      if (diagramVisual) {
        const shift = diagramShift * (1 - moveT);
        diagramVisual.style.transform = moveT >= 1 ? '' : `translateX(${shift.toFixed(1)}px)`;
      }
      if (diagramGrid) {
        // The guides have done their job once the mark is drawn and on
        // its way over; they retire rather than sitting under the copy.
        const gf = smoothstep(clamp01((p - GRID_FADE0) / (GRID_FADE1 - GRID_FADE0)));
        diagramGrid.style.opacity = (1 - gf).toFixed(3);
      }
      riseIn(diagramStack, smoothstep(clamp01((p - TEXT0) / (TEXT1 - TEXT0))), true);
      // Wordmark side rides its own arrival instead. No opacity here —
      // the panel is already fading itself in, and compounding the two
      // would leave the copy washed out through the whole handover.
      riseIn(wordmarkStack, inT, false);

      diagramPanel.style.opacity = (1 - outT).toFixed(3);
      diagramPanel.style.transform = outT <= 0 ? '' : `scale(${(1 + outT * .04).toFixed(3)})`;
      // Blur only while the layer is actually both visible AND mid-fade.
      // The epsilon matters: the two windows overlap, so each panel
      // spends a stretch at an opacity that rounds to zero while its
      // progress value is still fractionally off the end of its range —
      // without it, that stretch pays for a full-screen blur on
      // something nobody can see.
      diagramPanel.style.filter = (outT <= 0 || outT >= .99) ? '' : blurPx(outT);
      diagramPanel.style.pointerEvents = outT > .5 ? 'none' : '';

      const wVis = inT * (1 - wOutT);
      const wBlurAmt = Math.max(1 - inT, wOutT);
      wordmarkPanel.style.opacity = wVis.toFixed(3);
      wordmarkPanel.style.transform = (inT >= 1 && wOutT <= 0)
        ? ''
        : `scale(${(.94 + inT * .06 + wOutT * .04).toFixed(3)})`;
      wordmarkPanel.style.filter = (wVis <= .01 || wBlurAmt <= .01) ? '' : blurPx(wBlurAmt);
      wordmarkPanel.style.pointerEvents = wVis > .5 ? '' : 'none';

      // Both drawings are scrubbed from this same progress now. The
      // diagram gets the run-up before its own crossfade starts; the
      // wordmark's begins as its panel fades up, so the lines are
      // already forming as it arrives.
      if (scrubGrid) {
        let gridT;
        if (lastSizeLogo) {
          // lb is the last logo's bottom in viewport coords: 0 exactly as
          // it clears the top of the screen, negative after. The offset
          // between it and this stage's top is a fixed layout distance,
          // so measuring it live needs no cached document positions and
          // survives reflow.
          const lb = lastSizeLogo.getBoundingClientRect().bottom;
          const preRoll = Math.max(1, r.top - lb);
          gridT = clamp01(-lb / (preRoll + window.innerHeight * GRID_AFTER_PIN_VH));
        } else {
          gridT = clamp01(p / .22);
        }
        scrubGrid(gridT);
      }
      if (scrubDiagram) scrubDiagram(clamp01((p - DIA_DRAW0) / (DIA_DRAW1 - DIA_DRAW0)));
      scrubWordmark(clamp01((p - WM_DRAW0) / (WM_DRAW1 - WM_DRAW0)));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }

    // Resize needs more than a re-run of update(): the wordmark's
    // dash lengths are in screen pixels (see measureWordmark), so the
    // conversion factor they were built from has just changed.
    function onResize() {
      measureWordmark();
      measureDiagramShift();
      update();
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
  }

  initBlueprintTransition();

  /* ---------- Inertial smooth scrolling ---------- */

  function initSmoothScroll() {
    // Honour the OS setting: eased scrolling is exactly the kind of
    // motion people disable it for.
    if (prefersReduced || typeof window.Lenis !== 'function') return;
    // Coarse pointers already have native inertia; layering Lenis on
    // top of it fights the platform.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const lenis = new window.Lenis({
      duration: 1.15,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function frame(time) {
      lenis.raf(time);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Lenis moves the real window scroll, so the reveal, approach and
    // media watchers keep working off ordinary scroll events.
    window.__piltongLenis = lenis;
  }

  initSmoothScroll();

  /* ---------- Color Principle: magnetic pull into place after Symbol & Wordmark ---------- */

  function initColorSnap() {
    const stage = document.getElementById('colorPrinciple');
    if (!stage || prefersReduced) return;

    // Only within this band of .brandid__color-stage's own top crossing
    // the viewport top do we pull — far outside it, normal scroll (and
    // Shape DNA/Color Principle's own pinned mechanics elsewhere) stays
    // completely untouched.
    const PULL_BAND_PX = 220;
    const SNAP_EPSILON = 1.5;
    let pulling = false;
    let idleTimer = null;

    function trySnap() {
      const lenis = window.__piltongLenis;
      // No Lenis (reduced motion/coarse pointer/script failed) — an
      // un-eased jump would read as an even harder cut than doing
      // nothing, so this only ever acts when Lenis is actually driving
      // the scroll.
      if (!lenis || pulling) return;
      const top = stage.getBoundingClientRect().top;
      if (Math.abs(top) <= SNAP_EPSILON || Math.abs(top) > PULL_BAND_PX) return;
      pulling = true;
      const target = window.scrollY + top;
      lenis.scrollTo(target, {
        duration: 1.1,
        easing: t => 1 - Math.pow(1 - t, 3),
        onComplete: () => { pulling = false; },
      });
    }

    function onScroll() {
      if (pulling) return;
      clearTimeout(idleTimer);
      // Fires once the wheel/trackpad has actually stopped, not mid-
      // gesture — pulling while the user is still actively scrolling is
      // what read as fighting them ("툭 하고 넘어가는") rather than a
      // magnet catching a slow-moving piece.
      idleTimer = setTimeout(trySnap, 140);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  initColorSnap();

  /* ---------- Color Story: three photos cross-fade with a curtain wipe, one pinned stage ---------- */

  function initColorStory() {
    const sec = document.querySelector('.brandid__colorstory');
    const panels = sec ? Array.from(sec.querySelectorAll('.brandid__colorstory-panel')) : [];
    const curtainLeft = sec ? sec.querySelector('.brandid__colorstory-curtain--left') : null;
    const curtainRight = sec ? sec.querySelector('.brandid__colorstory-curtain--right') : null;
    if (!sec || !panels.length) return;

    // Each panel's own brand colour — used for the curtain (see
    // below) so it reads as "the next colour arriving," not a fixed
    // ink flap, on request ("다음색이 좌우에서 나와서 열리면서").
    const PANEL_COLORS = ['var(--paper)', 'var(--ink)', 'var(--signal-surface)'];
    // The flap is banded into value steps of that colour rather than
    // filled flat with it, on request ("커튼 색깔 기준 명도별로 차이둬서
    // 컬러칩의 명도단계처럼"). Hard stops, so each band is a swatch with
    // a clean edge — a ramp would read as a gradient, not a chip set.
    const CURTAIN_STEPS = 5;
    // One step of the ladder, in oklab lightness. Absolute, so the rungs
    // are the same perceptual distance apart whichever colour is on the
    // curtain — the first attempt mixed toward white/black by a
    // percentage instead, and measured, Paper's five bands came out at
    // L 0.980 / 0.975 / 0.966 / 0.805 / 0.66: two rungs almost touching
    // at the light end and a cliff at the dark one, because a near-white
    // colour has nowhere left to go toward white.
    const CURTAIN_STEP_L = .085;
    // Which is also why the ladder runs one way only, away from whatever
    // end its own colour already sits at. A ladder centred on the colour
    // would clamp flat for Paper going up and for Ink going down.
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
    sec.appendChild(probe);

    // oklab L of a resolved rgb() string.
    function lightnessOf(rgbStr) {
      const [r, g, b] = rgbStr.match(/[\d.]+/g).slice(0, 3)
        .map(Number).map(v => v / 255)
        .map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
      const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
      const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
      const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
      return .2104542553 * l + .7936177850 * m - .0040720468 * s;
    }

    // Bands are hard-stopped, so each is a swatch with a clean edge — a
    // ramp would read as a gradient, not a chip set. The panel's true
    // colour is the band at the LEADING edge (where the two flaps meet),
    // with the ladder trailing back toward the screen edge, so the
    // colour itself is what sweeps in and the steps follow it.
    // Each rung is still a color-mix toward white or black, but the
    // PERCENTAGE is solved for the lightness we want rather than being
    // the step itself. oklab mixing is linear in L, so hitting a target
    // is exact: toward black L = base*(1-p), toward white
    // L = base + p*(1-base). Relative colour syntax would have said this
    // more directly, but oklch(from var(--x) L c h) came back with the
    // origin's chroma dropped to 0 here — measured, Signal Orange's
    // rungs rendered as greys.
    function curtainRamp(color, dir) {
      probe.style.color = color;
      const base = lightnessOf(getComputedStyle(probe).color);
      const away = base > .5 ? -1 : 1;
      const stops = [];
      for (let i = CURTAIN_STEPS - 1; i >= 0; i--) {
        const target = Math.min(.97, Math.max(.06, base + away * i * CURTAIN_STEP_L));
        let band = color;
        if (i > 0) {
          const p = away < 0
            ? (1 - target / base) * 100
            : ((target - base) / (1 - base)) * 100;
          band = `color-mix(in oklab, ${color}, ${away < 0 ? 'black' : 'white'} ${p.toFixed(2)}%)`;
        }
        const idx = CURTAIN_STEPS - 1 - i;
        stops.push(`${band} ${(idx / CURTAIN_STEPS * 100).toFixed(2)}%`);
        stops.push(`${band} ${((idx + 1) / CURTAIN_STEPS * 100).toFixed(2)}%`);
      }
      return `linear-gradient(${dir}, ${stops.join(', ')})`;
    }
    // Drives the fixed equalizer/hero-logo's own contrast switch (see
    // initContrastSwitchers) via a dynamically-updated data-eq-bg on
    // the section, on request ("두번째 필통 잉크색일땐 페이퍼색으로
    // 이퀄라이저도 같이"). Can't rely on elementFromPoint sampling an
    // actual background-color here the way plain sections do — the
    // three panels are stacked position:absolute over the exact same
    // area, so whichever is LAST in the DOM wins hit-testing
    // regardless of which one is actually opaque right now, and none
    // of them carry a real CSS background-color anyway (it's an <img>).
    // signal-surface (#E75B35) computes to a relative luminance of
    // ~0.24 — under the 0.5 threshold used elsewhere, i.e. "dark" by
    // the numbers. Overridden to 'light' anyway (ink instead of paper)
    // on request ("컬러스토리 섹션 3번째에는 이퀄라이저랑 왼쪽 상단
    // 로고 잉크색이어야 할듯") — the raw luminance formula doesn't
    // capture that this particular orange reads bright/legible enough
    // for ink to still show up clearly against it.
    const PANEL_MOODS = ['light', 'dark', 'light'];

    // Corrective indent so the small English label's own glyph-left
    // lines up with the Korean lead line's, on request ("타이틀 위의
    // 영문은 들여쓰기 해서 타이틀 앞라인과 시각적으로 비슷하게").
    // Measured per panel (each clamp()'s resolved font-size, and each
    // lead's first character, differ) rather than guessed as one
    // fixed px value — same Range-based technique used for Symbol
    // Construction's own title alignment earlier.
    // Measured glyph-left alignment read as flush already (0px
    // correction), but still visually short of the lead line's own
    // start — on request ("영문은 조금 더 들여써서 타이틀 앞라인에
    // 맞추자"). EXTRA_INDENT is the further nudge on top of whatever
    // the measurement itself finds. Was 8 — nudged back slightly on
    // request ("붉은 영문 미세하게 왼쪽으로 옮겨서 앞라인 다시
    // 맞춰보자"), sitting a touch closer to the lead line's own edge.
    const ENG_EXTRA_INDENT = 3;

    function alignEngLabels() {
      panels.forEach(panel => {
        const eng = panel.querySelector('.brandid__colorstory-eng');
        const lead = panel.querySelector('.brandid__colorstory-lead');
        if (!eng || !lead) return;
        eng.style.marginLeft = '0px';
        const engRange = document.createRange();
        engRange.selectNodeContents(eng);
        const engRects = engRange.getClientRects();
        const leadRange = document.createRange();
        leadRange.selectNodeContents(lead);
        const leadRects = leadRange.getClientRects();
        if (!engRects.length || !leadRects.length) return;
        const delta = leadRects[0].left - engRects[0].left + ENG_EXTRA_INDENT;
        eng.style.marginLeft = `${delta.toFixed(1)}px`;
      });
    }

    alignEngLabels();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignEngLabels);
    window.addEventListener('resize', alignEngLabels, { passive: true });

    if (prefersReduced) {
      // First panel stays put (CSS default), nothing else to drive.
      return;
    }
    // Checked before attaching the scroll listener below, not live
    // inside update() — see the matching comment in initVisionWipe for
    // why (reported scroll jank on real compact-viewport devices).
    if (isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const smoothstep = t => t * t * (3 - 2 * t);

    const N = panels.length;
    // Width (in vp units) of the curtain's close-then-reopen window,
    // centred on each panel boundary (vp = 0.5, 1.5, ...). Was .46 of a
    // 220svh runway; the runway is 300svh now (style.css) and this was
    // re-cut to .333 so the transition keeps the same ~50svh of scroll
    // it always had rather than stretching with the section.
    const CURTAIN_SPAN = .333;
    // How much of a panel's own vp territory (±0.5 around its index)
    // its text takes to fade/rise fully in once active — on request
    // ("휠에 의해 내용이 자연스러운 애니메이션으로 등장"). The image's
    // own scroll-tied movement is gone (on request, "이미지가 움직이는
    // 효과는 없는게 낫겠다") — panels now hard-cut in behind the
    // curtain instead of crossfading, so nothing underneath is ever
    // visible overlapping the outgoing panel ("아래 그림이 겹쳐 보이지
    // 않고").
    const COPY_FADE = .35;
    // ...and how much of it the copy spends fully arrived, motionless.
    // Without this the copy hit opacity 1 at a single scroll position —
    // the exact centre of its panel — so there was nothing to rest on
    // between one transition finishing and the next starting, on request
    // ("각각 홀딩이 조금씩 있어야할것 같고"). Inside this radius the
    // panel, its copy and the curtain are all at their end states, so
    // the whole screen is still: 0.4 vp units either side of centre,
    // which the 300svh runway makes ~60svh of scroll per panel.
    const COPY_HOLD = .2;
    // Runway added OUTSIDE the first and last panel's centres, in the
    // same vp units. Without it those two only ever get the inward half
    // of their hold — the scroll runs out at vp 0 and vp N-1 — so the
    // middle panel rested twice as long as its neighbours. Matching
    // COPY_HOLD makes all three equal.
    const VP_PAD = COPY_HOLD;
    // What the panel underneath does while the curtain sweeps over it,
    // on request ("커튼에 의해 닫혀질때 안쪽은... 조금더 자연스럽게").
    // Dim plus a light defocus, both tied to the same close amount:
    // the panel reads as receding behind the curtain rather than being
    // covered by a flat shape sliding over a photo that stays lit and
    // sharp underneath. Dim carries most of the work — it is what a
    // closing curtain actually does — with the blur only softening the
    // detail so the eye stops reading the photo before it disappears.
    const PANEL_DIM = .3;
    const PANEL_BLUR = 5;
    // Half-pixel steps: a blur re-rasterises whenever its radius
    // changes, and slow scrolling would otherwise ask for a fresh one
    // every frame over differences too small to see. Same treatment the
    // blueprint panels' own crossfade blur gets.
    const panelFilter = t => t <= .01
      ? ''
      : `brightness(${(1 - PANEL_DIM * t).toFixed(3)}) blur(${(Math.round(t * PANEL_BLUR * 2) / 2).toFixed(1)}px)`;

    let ticking = false;

    function update() {
      ticking = false;
      const r = sec.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const p = runway <= 0 ? 0 : clamp01(-r.top / runway);
      // Clamped at both ends, so the pad at each is scroll that passes
      // with vp parked on the first/last panel — the hold, not a gap.
      const vp = Math.max(0, Math.min(N - 1, p * (N - 1 + 2 * VP_PAD) - VP_PAD));
      const activeIndex = Math.max(0, Math.min(N - 1, Math.round(vp)));
      sec.dataset.eqBg = PANEL_MOODS[activeIndex];

      // How far the curtain is closed, 0 at rest and 1 with the two
      // flaps meeting. Worked out before the panels are drawn because
      // the panel underneath reacts to it — see panelFilter.
      let closeAmt = 0;
      for (let b = 1; b < N; b++) {
        const boundary = b - .5;
        const local = seg(vp, boundary - CURTAIN_SPAN / 2, boundary + CURTAIN_SPAN / 2);
        if (local > 0 && local < 1) {
          closeAmt = local <= .5 ? local / .5 : 1 - (local - .5) / .5;
          break;
        }
      }
      const smoothClose = smoothstep(closeAmt);
      const activeFilter = panelFilter(smoothClose);

      panels.forEach((panel, i) => {
        const isActive = i === activeIndex;
        panel.style.opacity = isActive ? '1' : '0';
        // Only the visible one pays for the filter; the rest are at
        // opacity 0 and would be rasterising a blur nobody sees.
        const wanted = isActive ? activeFilter : '';
        if (panel.style.filter !== wanted) panel.style.filter = wanted;

        const copy = panel.querySelector('.brandid__colorstory-copy');
        if (!copy) return;
        if (!isActive) {
          copy.style.opacity = '0';
          copy.style.transform = 'translateY(24px)';
          return;
        }
        const dist = Math.abs(vp - i);
        // Flat-topped: 1 anywhere within COPY_HOLD of the panel's own
        // centre, easing off to 0 by COPY_FADE.
        const copyP = smoothstep(clamp01((COPY_FADE - dist) / (COPY_FADE - COPY_HOLD)));
        copy.style.opacity = copyP.toFixed(3);
        copy.style.transform = copyP >= 1 ? '' : `translateY(${(24 * (1 - copyP)).toFixed(2)}px)`;
      });

      // Curtain: closes fully (both flaps meeting at the centre) then
      // reopens to its own side, over a window straddling each panel
      // boundary — on request ("휠로 다음... 화면 전환효과... 커튼").
      // Only one boundary can ever be active at once (N-1 of them,
      // each CURTAIN_SPAN wide, spaced 1 vp unit apart — they can't
      // overlap unless CURTAIN_SPAN > 1). Coloured to the panel it's
      // heading toward (same activeIndex the panels above just used),
      // so the colour flips exactly when the image does — both at
      // full closure, both hidden. closeAmt itself is worked out above,
      // where the panel's own dim needs it.
      const curtainColor = PANEL_COLORS[activeIndex];
      // Rebuilt only when the colour actually changes — the string is
      // long and this runs every scroll tick, and re-setting an
      // identical background-image still costs a style recalc.
      if (curtainLeft) {
        if (curtainLeft.dataset.rampFor !== curtainColor) {
          curtainLeft.style.backgroundImage = curtainRamp(curtainColor, 'to right');
          curtainLeft.dataset.rampFor = curtainColor;
        }
        curtainLeft.style.transform = `translateX(${lerp(-100, 0, smoothClose).toFixed(2)}%)`;
      }
      if (curtainRight) {
        if (curtainRight.dataset.rampFor !== curtainColor) {
          curtainRight.style.backgroundImage = curtainRamp(curtainColor, 'to left');
          curtainRight.dataset.rampFor = curtainColor;
        }
        curtainRight.style.transform = `translateX(${lerp(100, 0, smoothClose).toFixed(2)}%)`;
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initColorStory();

  /* ---------- Closing: cap the video so title+video always fit and centre within the viewport ---------- */

  function initClosingFit() {
    const section = document.querySelector('.brandid__closing');
    const line = document.querySelector('.brandid__closing-line');
    const video = document.querySelector('.brandid__closing-loop');
    if (!section || !line || !video) return;
    // Reused across every fit() call to measure the ticker window's
    // required height (see below) — one canvas for the page's lifetime
    // rather than one per resize.
    const measureCtx = document.createElement('canvas').getContext('2d');

    // Sizes the video, and gives the two text blocks that same width so
    // the title's left edge and the sub-copy's right edge land on the
    // footage's own edges.
    //
    // Width only. A height term lived here while the section was a
    // pinned stage — the footage took whatever the sticky had left after
    // its bands and the text — and went out with the pin. The query
    // below returns null now and the block that used it is inert, kept
    // so re-adding the wrapper in index.html brings the sizing back with
    // it. Measuring the text stack is only safe because floorW
    // guarantees neither block ever re-wraps; without that this chased
    // itself down to a 93px video under a 10-line title at 1280x720.
    const sticky = document.querySelector('.brandid__closing-sticky');
    const copy = document.querySelector('.brandid__closing-copy');
    const body = document.querySelector('.brandid__closing-body');
    const titleBlock = copy || line;
    // One entry, not two: the sub-copy is a child of the title's row now,
    // so measuring it separately would count it twice and — worse — read
    // a natural width that ignores the gap it sits behind.
    const outside = [titleBlock].filter(Boolean);
    const wrap = document.querySelector('.brandid__closing-loop-wrap');
    const FALLBACK_RATIO = 1284 / 716;
    const MAX_W = 1400;
    // The title stops widening here even when the footage keeps going,
    // on request ("영상을 맥스위드 1400으로... 상단 타이틀 위치는 지금
    // 그대로"). Below 1200 the two share a width and the title's left
    // edge sits on the footage's, exactly as before; past it the footage
    // grows out to both sides and the title stays where it was. The
    // sub-copy is NOT capped — it keeps following the right edge out
    // ("본문은 영상 길이 따라 우측 끝으로").
    const TITLE_MAX_W = 1200;

    // Everything below constrains the WRAPPER'S WIDTH, never the
    // video's height. Capping height instead left the wrapper at its
    // full 1200px while the picture — object-fit:contain by default on
    // a video — letterboxed inside it, so the ink backdrop (the
    // wrapper's ::before, which spans the wrapper) stuck out either
    // side of the footage: measured 663px of bare ink beside a 536px
    // picture. Setting the width keeps backdrop and picture the same
    // size at every viewport.

    // The widest line a block already contains, with its own <br>s
    // honoured — i.e. the narrowest it can be told to be without any
    // line re-wrapping. Read from max-content rather than assumed, so it
    // tracks the responsive font sizes and any later copy edit.
    function naturalWidth(el) {
      const prevMax = el.style.maxWidth, prevW = el.style.width;
      el.style.maxWidth = 'none';
      el.style.width = 'max-content';
      const w = el.getBoundingClientRect().width;
      el.style.maxWidth = prevMax;
      el.style.width = prevW;
      return w;
    }

    function fit() {
      if (!wrap) return;
      const ratio = (video.videoWidth && video.videoHeight)
        ? video.videoWidth / video.videoHeight
        : FALLBACK_RATIO;
      wrap.style.maxWidth = '';
      outside.forEach(el => { el.style.maxWidth = ''; });
      const sectionCS = getComputedStyle(section);
      const contentW = section.clientWidth
        - (parseFloat(sectionCS.paddingLeft) || 0) - (parseFloat(sectionCS.paddingRight) || 0);
      // Floor: the widest line either block already has. The blocks are
      // capped to the video's width, so anything narrower than this
      // re-wraps them — and re-wrapping is what the old leftover-height
      // version then fed back into the video's size. Read live rather
      // than hardcoded so it follows the responsive type and any copy
      // edit.
      const floorW = Math.min(contentW, MAX_W, Math.max(...outside.map(naturalWidth)));
      // The copy row — title and sub-copy together — stops at
      // TITLE_MAX_W while the footage carries on widening past it. Both
      // ends of the row therefore sit on that 1200 column: the title's
      // first character on its left edge, the sub-copy's last on its
      // right.
      const applyW = px => {
        titleBlock.style.maxWidth = `${Math.min(px, TITLE_MAX_W).toFixed(1)}px`;
      };

      let w = Math.max(floorW, Math.min(MAX_W, contentW));
      applyW(w);

      // Now the height, measured once against the real wrapped text. The
      // sticky box is exactly one viewport tall; take its bands and the
      // text stack out of that and whatever is left is the footage's to
      // fill. Below floorW it stops giving ground — a narrower video
      // would re-wrap the copy, and then the arithmetic above would no
      // longer hold.
      if (sticky) {
        const stickyCS = getComputedStyle(sticky);
        const stack = outside.reduce((sum, el) => {
          const cs = getComputedStyle(el);
          return sum + el.getBoundingClientRect().height
            + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
        }, 0);
        const availH = sticky.clientHeight
          - (parseFloat(stickyCS.paddingTop) || 0)
          - (parseFloat(stickyCS.paddingBottom) || 0)
          - stack;
        if (availH > 0 && w / ratio > availH) {
          w = Math.max(floorW, availH * ratio);
          applyW(w);
        }
      }
      wrap.style.maxWidth = `${w.toFixed(1)}px`;

      // ---- Wordmark under the footage, on h_logo.svg's own terms ----
      // That file IS the brand's vertical lockup, so its geometry is the
      // spec rather than something to eyeball. Measured off its paths:
      // the wordmark is 2.219x the symbol's width, and the space between
      // them is 0.377x that same width.
      //
      // Both are relative to the SYMBOL, so the symbol as the footage
      // actually renders it has to be measured too. From a per-frame
      // luminance bounding box over ten frames: it holds 0.567 of the
      // frame's height throughout (the mark is square, so that is its
      // width face-on — the width alone swings 0.11-0.30 as it turns)
      // and its lower edge sits at 0.7775 down the frame, i.e. already
      // 0.22 of the frame's height clear of the bottom edge.
      //
      // That last number is why the gap gets a multiplier: laid out at
      // exactly 0.377, the wordmark's top would land 6px ABOVE the
      // footage's bottom edge, inside the fade. GAP_EASE pushes it clear
      // and answers "너무 가까이는 말고" at the same time.
      //
      // This sets the BAND's depth only. Where the mark sits inside it
      // is a separate question, answered by MARK_FOOT below: it hangs on
      // the block's bottom edge with nothing under it, on request ("기존
      // 높이는 유지되어야지! 워드마크만 그 높이기준 하단에 여백없이
      // 붙길"). An earlier pass shrank the band to suit the mark's new
      // position instead — that lost 46px of the block's height, which
      // was the part that mattered.
      const LOCKUP_W_OVER_SYMBOL = 2.219;
      const LOCKUP_GAP_OVER_SYMBOL = .377;
      // The mark's viewBox in index.html — was 229.55/30.66, grew to
      // 229.55/32 to stop a bad uniform per-letter offset from clipping
      // (see the comment there), then measured again once the offsets
      // were corrected to their real per-letter values: every letter's
      // rendered bottom lands at 50.76 in viewBox units regardless, so
      // 32's own bottom (52.10) was 1.34 units of pure dead air under the
      // ink — the mark's own box (bottom:0 against the plate) was flush,
      // but the glyphs inside it weren't, reading as a residual sliver of
      // background left under the wordmark ("워드마크아래로 검은영역이
      // 남아보이잖아"). 30.86 clears the ink by 0.1 and no more.
      const MARK_ASPECT = 229.55 / 30.86;
      const SYMBOL_H_FRAC = .567;
      const SYMBOL_TOP_FRAC = .2105;
      const SYMBOL_BOTTOM_FRAC = .7775;
      // Trimmed off the footage's height ("영상 상하 높이 조금씩
      // 줄여보자"). object-fit:cover means the picture keeps its scale
      // and loses the edges, so the symbol comes out the same size in a
      // tighter frame — which is the point, that frame carried a lot of
      // empty room above and below it. The two ends are separate because
      // the bottom was taken further on its own ("영상 하단을 조금더
      // 줄이자"); object-position below splits the overflow between them
      // in the same proportion.
      // Note for anyone changing these: the band colours in style.css
      // are sampled AT these crop lines, not at the footage's own edges,
      // so moving either one means re-sampling its colour or the seam
      // steps. The symbol spans 0.21-0.78 of the frame, which is the
      // hard limit on both.
      // Only CROP_TOP shortens the block. The band below is derived from
      // the symbol's distance to the mark, so anything taken off the
      // BOTTOM is handed straight back as colour and the height doesn't
      // move; taking it off the top moves the symbol itself up, and the
      // mark follows.
      const CROP_TOP = .10;
      const CROP_BOTTOM = .13;
      // The picture is narrower than the block it sits in, on request
      // ("영상 심볼이 지금보다 조금 작아보이게... 영상 좌우도 투명
      // 그라데이션 처리하면 가능하려나"). Cropping can't shrink the
      // symbol — cover scales the picture to fill the width either way —
      // so the width itself has to come down, and the side fades are
      // what let it end without an edge. Everything downstream is
      // measured off the narrowed picture, so the wordmark comes down
      // with it and keeps its lockup ratio ("그조정된만큼 아래 워드마크도
      // 조금 따라서 비율조정").
      const VIDEO_INSET = .12;
      // How far in from the picture's own left/right the side fades
      // reach. The symbol occupies the middle 0.35-0.65 of the frame, so
      // there is a lot of room; generous is better here because the
      // picture's side columns run up to 14 RGB darker than the band
      // behind them (measured), and a wide ramp is what keeps that from
      // reading as an edge. Was .12 — widened further on request
      // ("영상 그라데이션 된 부분이 배경색이랑 이질감 차이가 너무
      // 나서 티가 너무 나는데"): direct pixel sampling of the actual
      // footage showed the measured colours already match the backdrop
      // closely at every point checked (crop-line colours are identical
      // to --loop-ceiling/--loop-floor; the old mask boundary reads
      // within a few RGB of the gradient at that height), so the seam
      // isn't a wrong colour — it's the ~12%-wide ramp still being too
      // narrow to hide the video's own natural variation. Still well
      // inside the symbol's own 0.35-0.65 span, so nothing gets clipped.
      const FADE_SIDE = .18;
      // The feather at each end never reaches the symbol. It used to be
      // a flat 13%/34% of the box, which was fine at the original size
      // and stopped being fine as the crop tightened: at 18%/21% the
      // symbol's top sat 5% down a box whose fade ran to 13%, so it was
      // drawn at 38% opacity and read as sliced ("영상 상단 그라데이션
      // 때문인지 심볼 윗부분이 좀 잘려보이네"). Deriving each fade from
      // the clearance actually available makes that impossible to
      // reintroduce by cropping — the fade shrinks with the room.
      const FADE_MAX = .10;
      const FADE_OF_CLEARANCE = .7;
      // Cropping the footage alone changes nothing you can see: the band
      // below is derived from the SYMBOL's distance to the mark, so every
      // pixel taken off the picture is handed straight back as colour and
      // the block's height doesn't move ("표안나네"). The gap itself is
      // the only thing that shortens it. 1.0 puts it exactly on
      // h_logo.svg's own 0.377 — the reference, and a place to stop —
      // where 1.35 had been holding it 35% wider than the lockup.
      const GAP_EASE = 1.0;
      // Colour left under the mark. Zero: the mark sits ON the block's
      // bottom edge. h_logo.svg does the same — its artwork stops on the
      // wordmark's own baseline with nothing below it.
      const MARK_FOOT = 0;
      // Optical nudge, on request ("로고 약간 1~2정도 아래로 더", then
      // "영상 하단에서 3픽셀정도 떨어져보이는데 그이상 내려서", then
      // "현재도 워드마크 배경이랑 안이어져 보인다 아래로 5~6정도
      // 내려보자", then still not enough a third time — "워드마크
      // 아래로 내려서 배경과 이어지게 다시 조정"). Added to the band
      // rather than to the mark's own offset: pushing the mark down past
      // the block's edge would put its last rows on --paper, where a
      // paper-coloured wordmark simply disappears. Deepening the band
      // instead moves it down relative to the footage while keeping
      // every pixel of it on the dark surface.
      // Was 12, then 20 ("still not enough") — both increases landed as
      // only half their intended shift, because inkBottom (below) fed
      // MARK_DROP into the same centring average that sets the plate's
      // own sticky position, so raising it also nudged the plate itself
      // up by half the amount, cancelling half the move (see inkBottom's
      // own comment). Fixed now, so this step (was 20) should land in
      // full ("약간 더 내려가야 이어져보일것 같아").
      const MARK_DROP = 30;

      // videoW is the picture's own width — the block's, less the side
      // insets. fullH is the height it WOULD have uncropped at that
      // width; every fraction measured off the frame is relative to
      // that, since cover-cropping moves the edges without rescaling.
      const videoW = w * (1 - 2 * VIDEO_INSET);
      const fullH = videoW / ratio;
      const boxH = fullH * (1 - CROP_TOP - CROP_BOTTOM);
      // Where the symbol's own edges land inside the visible box, as
      // fractions of it — the room each feather has to stay out of.
      const symTopClear = ((SYMBOL_TOP_FRAC - CROP_TOP) * fullH) / boxH;
      const symBottomClear = (boxH - (SYMBOL_BOTTOM_FRAC - CROP_TOP) * fullH) / boxH;
      const fadeTop = Math.max(0, Math.min(FADE_MAX, symTopClear * FADE_OF_CLEARANCE));
      const fadeBottom = Math.max(0, Math.min(FADE_MAX, symBottomClear * FADE_OF_CLEARANCE));
      wrap.style.setProperty('--loop-mask-top', `${(fadeTop * 100).toFixed(2)}%`);
      wrap.style.setProperty('--loop-mask-bottom', `${((1 - fadeBottom) * 100).toFixed(2)}%`);
      const symbol = SYMBOL_H_FRAC * fullH;
      const markW = LOCKUP_W_OVER_SYMBOL * symbol;
      const markH = markW / MARK_ASPECT;
      // Gap measured from the SYMBOL's lower edge, then converted to a
      // gap below the footage's own edge by taking off the empty frame
      // still between the two — which CROP_BOTTOM has just cut into, so
      // the band takes up the difference and the symbol keeps its lockup
      // distance from the mark.
      const gapBelowVideo = Math.max(
        0,
        LOCKUP_GAP_OVER_SYMBOL * GAP_EASE * symbol
          - (1 - SYMBOL_BOTTOM_FRAC - CROP_BOTTOM) * fullH);
      wrap.style.setProperty('--loop-video-w', `${videoW.toFixed(1)}px`);
      wrap.style.setProperty('--loop-video-h', `${boxH.toFixed(1)}px`);
      wrap.style.setProperty('--loop-mask-left', `${(FADE_SIDE * 100).toFixed(2)}%`);
      wrap.style.setProperty('--loop-mask-right', `${((1 - FADE_SIDE) * 100).toFixed(2)}%`);
      // Splits the cover overflow between the two ends in the same ratio
      // the crops were asked for. `center` would always halve it.
      wrap.style.setProperty(
        '--loop-video-pos',
        `${(CROP_TOP / (CROP_TOP + CROP_BOTTOM) * 100).toFixed(2)}%`);
      // ONE gap, not two. The doubling here is left over from when the
      // mark was centred in the band and needed air on both sides; it
      // has hung on the bottom edge since, so the second gap was just
      // padding the space above it — measured, that pushed the symbol-
      // to-mark distance to 0.79 of the symbol's width against the
      // lockup's 0.509, and it grew every time the footage was cropped.
      wrap.style.setProperty('--loop-band-bottom', `${(markH + gapBelowVideo + MARK_DROP).toFixed(1)}px`);
      wrap.style.setProperty('--loop-mark-w', `${markW.toFixed(1)}px`);
      wrap.style.setProperty('--loop-mark-foot', `${MARK_FOOT}px`);
      // The ticker window's own height. It used to just be the
      // wordmark's height, since the slot's height was never set and
      // auto-resolved from its one in-flow child — which was the mark.
      // That works for the mark but not for APPLICATIONS: it's set at
      // OUR PHILOSOPHY's own size on request ("아워필라서피 영문 폰트
      // 사이즈... 의미한거고"), which is a much bigger font than a
      // 90px-tall window has ascent+descent room for, and the top and
      // bottom of the letters were being clipped by the very slot meant
      // to frame them ("어플리케이션 타이틀 위아래도 잘려보임").
      // Measured off the incoming word's own computed font rather than
      // guessed, so the window is exactly as tall as that font ever
      // needs regardless of viewport — the mark's height only sets a
      // floor, never a ceiling, on how tall the window can be.
      //
      // The font's own ascent+descent is the text's outer edge, not a
      // safety margin around it — sized to exactly that, the ink still
      // grazes the window (measured 0.08px of clearance, i.e. none). A
      // fifth again on top gives it real air on both sides instead of
      // just clearing by construction.
      const WINDOW_HEADROOM = 1.2;
      const next = document.querySelector('.brandid__closing-next');
      let windowH = markH;
      let textH = markH;
      if (next) {
        const ncs = getComputedStyle(next);
        measureCtx.font = `${ncs.fontStyle} ${ncs.fontWeight} ${ncs.fontSize} ${ncs.fontFamily}`;
        const m = measureCtx.measureText('APPLICATIONS');
        textH = (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0);
        windowH = Math.max(markH, textH * WINDOW_HEADROOM);
      }
      wrap.style.setProperty('--loop-mark-window-h', `${windowH.toFixed(1)}px`);
      // APPLICATIONS centres in the FULL window (flex align-items:
      // center), but the wordmark it swaps with sits flush to the
      // window's own BOTTOM instead (.brandid__closing-mark's own
      // bottom:-1.5px) — and the window is taller than the mark
      // (WINDOW_HEADROOM, sized for APPLICATIONS' own bigger font), so
      // the two references don't land on the same spot. Measured: with
      // the mark's own centre as ground truth, APPLICATIONS' flex-
      // centred ink came out ~29px higher, reading as pushed toward the
      // top once the two are meant to be the same held, centred title
      // ("워드마크는 중앙에 시각적으로 보정됬는데 어플리케이션 타이틀은
      // 약간 위로 치우쳐보인다"). Half the window/mark height
      // difference is what closes that gap — pushes APPLICATIONS down
      // just enough that its own centre lands where the mark's does.
      const idealOffset = (windowH - markH) / 2;
      wrap.style.setProperty('--next-optical-offset', `${idealOffset.toFixed(1)}px`);
      // Capping the offset instead (tried first) still read as "약간
      // 위쪽에 치우쳐" — a partial fix rather than a real one, since
      // giving APPLICATIONS the FULL offset needs more room at the
      // bottom than the slot's clip-path (style.css) allowed. That clip
      // was tuned tight (-1.5px) specifically for the MARK's own
      // overshoot trick, but widening it doesn't cost the mark
      // anything — its own ink never reaches the extra room, so nothing
      // about how it renders changes. --slot-clip-bottom is that
      // widened margin: however much APPLICATIONS' full offset actually
      // needs, with a few px to spare, replacing the old fixed -1.5px
      // (which only the mark actually required) so the ideal offset
      // above no longer has anywhere to be capped against.
      const SLOT_CLIP_MARGIN = 1.5;
      const slotClipBottom = Math.max(SLOT_CLIP_MARGIN, idealOffset - (windowH - textH) / 2 + SLOT_CLIP_MARGIN);
      wrap.style.setProperty('--slot-clip-bottom', `${slotClipBottom.toFixed(1)}px`);

      // Where the plate pins during the handover to Applications. Set
      // here rather than in CSS because it depends on everything above.
      //
      // Pinned on its BOX now, not its ink — the box itself is what
      // holds dead centre on the browser the instant it catches
      // ("플레이트 박스 자체는 중앙에 홀딩"), background and corner
      // ticks included, with nothing faked. The top band is empty
      // colour and the bottom edge is the wordmark, so with the box
      // centred the symbol+mark pair reads a bit LOW at rest — that gap
      // is closed afterward by initClosingHandoff, which lifts just the
      // video+mark bundle (not the box, not the background) up onto
      // their own ink-centred spot over the same window the backdrop
      // spreads in ("영상 + 워드마크만... 베이스라인에 맞게끔").
      //
      // A version of this was tried the other way round — pin on the
      // ink centre (this comment used to explain exactly that) and fake
      // a box-centred LOOK with a counter-transform on the content
      // alone. It didn't work: the background and corner ticks are
      // attached to the box's own real position, which was still
      // ink-centred the whole time, so nothing about the plate as a
      // whole ever actually held on the screen's true middle — only the
      // small video+mark portion faked it, and everything else read as
      // off-centre regardless ("전체 플레이트 자체가... 정중앙에서
      // 홀딩 먼저 되고"). Pinning on the box for real, and lifting the
      // content afterward instead of before, is what that needed.
      //
      // Doesn't reintroduce the per-frame-movement judder a straight
      // lift-while-pinned once caused ("영상이 달달거리는") — the box's
      // own sticky top here is set ONCE, at fit time, and never touched
      // again; only the content's transform animates, and only across
      // the same already-scripted spread window, not on an otherwise-
      // still element.
      const bandTopPx = parseFloat(getComputedStyle(wrap).paddingTop) || 0;
      const bandBottomPx = markH + gapBelowVideo + MARK_DROP;
      const plateH = bandTopPx + boxH + bandBottomPx;
      // ::before's own flat ceiling/floor zones (style.css) used to sit
      // at fixed pixel/percentage stops in the UNSCALED gradient — fine
      // at rest, but the handover's spread scales that whole gradient
      // up around its centre, which drags those flat zones outward
      // faster than the video itself moves (the video, and this dimming
      // layer with it, don't scale — see .brandid__closing-loop-wrap
      // ::after). At the video's own real, fixed bottom edge, the
      // backdrop's colour measurably drifted from pure floor (scale 1)
      // toward a ceiling-mixed tone (28% off by scale 3), on request
      // ("확대된 배경색은 방사형 가장자리랑 똑같은 색으로"). These two
      // publish each flat zone's distance from the plate's own centre,
      // in px — style.css divides them by --plate-spread-y (shrinking
      // the unscaled distance so the transform's own scale multiplies
      // it back to the original) so the zone's rendered (post-scale)
      // position stays anchored at the same real screen distance from
      // centre regardless of how far the backdrop has spread.
      wrap.style.setProperty('--loop-ceiling-offset', `${(plateH / 2 - bandTopPx).toFixed(1)}px`);
      wrap.style.setProperty('--loop-floor-offset', `${(plateH / 2 - bandBottomPx).toFixed(1)}px`);
      const inkTop = bandTopPx + (SYMBOL_TOP_FRAC - CROP_TOP) * fullH;
      // Was `plateH - MARK_FOOT`, i.e. including MARK_DROP — which meant
      // every increase to that optical nudge (asked for four times over,
      // each time reading as "still hasn't moved") shifted inkCentre
      // down, which shifted stickyTop (below) up by HALF the same
      // amount to keep this centred on screen. The video moved up by
      // that half, the mark moved down by the other half — the GAP
      // between them did grow by the full nudge, but the mark's own
      // on-screen position only ever moved by half of it, which is why
      // repeated increases kept reading as barely anything happened.
      // Excluding MARK_DROP here means growing it no longer shifts the
      // centring point at all — the plate (and the video) stays exactly
      // where it was, and the mark alone moves down by the full amount.
      const inkBottom = plateH - MARK_DROP - MARK_FOOT;   // the wordmark's own baseline, nudge excluded
      const inkCentre = (inkTop + inkBottom) / 2;
      // The plate's REAL pin — its own box, centred on the browser.
      // Never so far up that the picture's own top leaves the screen —
      // the empty band above it is all that may be cut.
      const stickyTopBox = Math.max(-bandTopPx, (window.innerHeight - plateH) / 2);
      wrap.style.setProperty('--plate-sticky-top', `${stickyTopBox.toFixed(1)}px`);
      // Where the box WOULD have to pin for the ink to read centred
      // instead — no longer published as the real sticky top, but still
      // the reference frame every downstream measurement below
      // (markCentre, toCentre, the Applications pull) already assumes,
      // since all of them describe the plate once it has FINISHED
      // settling, i.e. once the content-lift below has fully resolved
      // and the two are visually equivalent again.
      const stickyTopInk = Math.max(-bandTopPx, window.innerHeight / 2 - inkCentre);
      // The lift itself: how far the video+mark bundle (not the box, not
      // the background) has to travel, negative being up, to go from
      // sitting wherever the now box-centred layout puts them to that
      // same ink-centred spot. initClosingHandoff eases this in from 0
      // as the backdrop's own spread plays out — see .brandid__closing-
      // loop/-slot and .brandid__closing-loop-wrap::after in style.css
      // for where it's applied, and the note above --plate-sticky-top
      // for why pinning on the box and lifting the content afterward,
      // not the other way round, is what actually holds the whole plate
      // centred at rest.
      const contentLiftTarget = stickyTopInk - stickyTopBox;
      wrap.style.setProperty('--plate-content-lift-target', `${contentLiftTarget.toFixed(1)}px`);
      // --plate-content-lift itself is NOT set here — found the actual
      // cause of the refresh-position bug (all the timing fixes above
      // were chasing a symptom): this function and initClosingHandoff's
      // own update() were BOTH writing that property, this one always
      // resetting it to '0px' (the rest state) on every fit() re-run,
      // the other writing the correct scroll-driven value. Whichever
      // ran LAST won, with no guaranteed order between them — if fit()
      // re-ran (fonts/video loadedmetadata) AFTER initClosingHandoff
      // had already applied the right value, it silently stomped it
      // back to 0px, and nothing forced initClosingHandoff to run again
      // afterward. Measured directly: measure() had already run 25
      // times against the correct restored scrollY, yet
      // --plate-content-lift stayed stuck at 0px regardless — the
      // retries were never the problem. Leaving this property entirely
      // to initClosingHandoff (CSS's own var(--plate-content-lift, 0px)
      // fallback covers the instant before its first update() runs)
      // removes the second writer outright.
      // How far the wordmark has to travel to sit on the screen's own
      // centre once the footage above it is gone. It starts on the
      // plate's bottom edge, so this is the distance from that to the
      // middle — published here because only this function knows both.
      const vh = window.innerHeight;
      // Not dead-centre — mathematically exact centring here reads as
      // sitting slightly LOW, the empty band above it looking wider than
      // the one below, on request ("위쪽 여백이 넓어보이고 아래가
      // 좁아보이는 느낌"). A few percent of viewport height higher
      // corrects it; the same fraction is used for
      // .brandid__colorstory-card's own centring in style.css, since the
      // user flagged it as the identical optical issue there.
      const OPTICAL_CENTRE_FRAC = .465;
      const markCentre = stickyTopInk + plateH - MARK_FOOT - markH / 2;
      const toCentre = Math.max(0, markCentre - vh * OPTICAL_CENTRE_FRAC);
      wrap.style.setProperty('--mark-to-centre', `${toCentre.toFixed(1)}px`);
      // Where the mark's own centre ends up INSIDE the plate once that
      // move is done — the handover needs it to work out where the mark
      // is on screen after the pin releases and the plate scrolls away
      // on its own. Nothing else knows both the plate's height and the
      // distance the mark travelled inside it.
      wrap.style.setProperty(
        '--mark-centre-in-plate',
        `${(plateH - MARK_FOOT - markH / 2 - toCentre).toFixed(1)}px`);

      // How far the Applications section is pulled up under the plate.
      //
      // Without this it starts at the plate's own bottom edge, which is
      // where the wordmark used to stand — but the wordmark has since
      // walked up to the middle of the screen, so what sits between the
      // held title and the first line of copy is the whole distance it
      // travelled plus the plate's own foot. Measured 500-odd px of
      // nothing at 1440x900, which is the void the pull closes ("저위
      // 어플리케이션 타이틀과 아래 텍스트 구룹 중앙에 텅빈 영역을 대폭
      // 줄이고 싶단 얘기야").
      //
      // Solved rather than guessed: put the section's top exactly one
      // gap below the bottom of the title as it is being held. Negative
      // only — it may close the void, never open one.
      //
      // .10 read as too tight once it was actually closed ("지금은 너무
      // 좁아졌다 지금보단 조금 넉넉히") — the title needs air under it
      // even at its closest, not to sit flush on the next line.
      const GAP = vh * .28;
      const pull = Math.min(0, (vh / 2 + markH / 2 + GAP) - (stickyTopInk + plateH));
      document.documentElement.style.setProperty('--apps-pull', `${pull.toFixed(1)}px`);

      // The ticker's incoming word is sized entirely in CSS now, from
      // the same clamp OUR PHILOSOPHY uses. Nothing to measure here: the
      // slot clips vertically only, so the word being wider than the
      // wordmark it replaces costs nothing.
    }

    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    // The width depends on the footage's own ratio, which isn't known
    // until its metadata lands — the first fit() uses a fallback.
    if (video.readyState < 1) video.addEventListener('loadedmetadata', fit, { once: true });
    window.addEventListener('resize', fit, { passive: true });
  }

  initClosingFit();

  /* ---------- Closing: rides in on scroll, video settles open at the footage's own pace ---------- */

  function initClosingEntrance() {
    const section = document.querySelector('.brandid__closing');
    const line = document.querySelector('.brandid__closing-line');
    // The wrap, not the video itself — its ::before ink backdrop (see
    // style.css) needs to scale/fade in lockstep with the video, on
    // request ("뒤에 배경까지 한몸으로 동작해야지"), and a transform/
    // opacity on the wrapper already carries a pseudo-element child
    // along for free (same fix already applied to .brandid__sizes-loop
    // for the same reason).
    const wrap = document.querySelector('.brandid__closing-loop-wrap');
    if (!section || !line || !wrap || prefersReduced) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);
    // The footage this reveals was measured rather than guessed, on
    // request ("영상 속도 분위기 보고 영상 나타나는 모션 다시 적절하게
    // 바꿔줘"): 20.0s, no cuts anywhere (frame-to-frame difference at
    // 0.83s spacing stays in a 5.8-12.0 band out of 255 — a cut would
    // spike it many times higher), only 1.1% of pixel value changing
    // per 80ms, and a mean luminance of 49/255 holding within +-6 for
    // the entire run. In short: dark, slow, continuous, no accents.
    //
    // What used to sit in front of that was an easeOutElastic springing
    // up from 3% scale with a 10 degree rotation kick — a +21%
    // overshoot, an undershoot, then a settle. Against footage with no
    // accent of its own, the arrival was doing all the talking and
    // reading louder than what it introduced. Replaced with the
    // opposite: a long ease-in-out that starts and ends at zero
    // velocity, so there is no snap at either end and nothing overshoots
    // — the panel drifts up to size at about the pace the footage
    // itself moves.
    const smootherstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);

    const TITLE_RISE_PX = 56;
    const BODY_RISE_PX = 34;
    // Drift shared by all three, on top of whatever each is doing on its
    // own: the group is carried up as a unit while the section swings
    // into view, so it reads as the whole thing running in on the
    // scroll's momentum rather than three parts fading in place, on
    // request ("이 섹션 돌입 시 관성 스크롤에 의해 자연스럽게 달려오고").
    // Deliberately smaller than either rise above — it's the undertow,
    // not the motion itself.
    const DRIFT_PX = 52;
    const body = document.querySelector('.brandid__closing-body');
    // Was .03 — the footage started as a speck and flew at the viewer.
    // Starting near full size makes the arrival a settle rather than a
    // launch: 6% of growth spread over the whole window is a drift you
    // read as weight, not as a zoom. The rotation kick that rode the old
    // spring is gone outright; nothing in 20s of footage tilts.
    const VIDEO_START_SCALE = .94;
    // A touch of its own rise, under the shared drift — the panel comes
    // up into place rather than expanding on the spot.
    const VIDEO_RISE_PX = 30;

    let ticking = false;

    // ---- Approach-based timing, for the PINNED variant only. One
    // progress value off the section's top edge crossing the screen,
    // which is exactly the scroll before a sticky inner would pin —
    // every entrance therefore completes at the instant the hold
    // begins. Per-block timing (live, below) cannot do that: pinned, a
    // block stops moving relative to the viewport, so progress read
    // from where it sits freezes part-way and never finishes. Restore
    // this together with the sticky wrapper and its CSS. ----
    // const WIN = { drift: [.05, .85], title: [.12, .50], video: [.24, .58], body: [.40, .55] };
    // const a = clamp01((window.innerHeight - section.getBoundingClientRect().top) / window.innerHeight);
    // const win = k => smootherstep(clamp01((a - WIN[k][0]) / WIN[k][1]));

    // Where each block's entrance FINISHES, as a fraction of the
    // viewport height. Not fixed constants: this is the last section on
    // the page, so scrolling stops with its bottom on the screen's
    // bottom and every block has a highest point it can ever reach. Ask
    // for a finish above that point and the entrance simply never
    // completes — measured the sub-copy stuck at 71% opacity, mid-rise,
    // at the very bottom of the page. So each desired finish is pulled
    // down to just past the block's own resting position when it has to
    // be. Re-derived on resize, since every term is viewport-relative.
    // The plate is sticky (it pins for the Applications handover), and
    // offsetTop on a sticky element reports its CURRENT offset rather
    // than its static one — so it can't be asked directly. The runway
    // that follows it is a plain element, so its offsetTop is the
    // plate's static bottom.
    const runway = document.querySelector('.brandid__closing-runway');
    // Cached, not read per frame. These are layout reads, and doing them
    // inside a scroll handler that also writes styles forces a
    // synchronous layout every frame — with the handover's own handler
    // on the same element that became read-write-read thrash, which is
    // what made the footage judder.
    const tops = new Map();
    function measureTops() {
      tops.clear();
      [line, body, wrap].forEach(el => {
        if (!el) return;
        tops.set(el, (el === wrap && runway) ? runway.offsetTop - wrap.offsetHeight : el.offsetTop);
      });
    }
    const staticTopOf = el => tops.has(el) ? tops.get(el) : el.offsetTop;

    let endTitle = .58, endVideo = .34, endBody = .62;
    function measureEnds() {
      const vh = window.innerHeight;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
      const restTop = section.getBoundingClientRect().top + window.scrollY - maxScroll;
      const endOf = (desired, el, from) => {
        const rest = (restTop + staticTopOf(el)) / vh;
        return Math.max(rest, Math.min(from - .04, Math.max(desired, rest + .04)));
      };
      endTitle = endOf(.58, line, 1);
      endVideo = endOf(.34, wrap, .96);
      if (body) endBody = endOf(.62, body, 1);
    }

    // Each block is timed off ITS OWN position on screen. The section is
    // well over a viewport tall (the generous bands in style.css), so a
    // single section-relative progress would have the sub-copy finish
    // while it was still hundreds of pixels below the fold — the same
    // complaint the video's window was widened for once ("영상이
    // 다보이기도전에 모션이 끝나서 육안적으로 확인이 안되"). Anchoring
    // per block means every entrance plays where it can be seen, and the
    // stagger falls out of the layout for free: title, then video, then
    // sub-copy, in the order they come up the screen.
    //
    // Positions come from offsetTop (layout, transform-blind) added to
    // the section's own rect — NOT from each element's own rect. Reading
    // a rect we then translate would feed the write back into the read
    // and oscillate.
    function update() {
      ticking = false;
      const vh = window.innerHeight;
      const sTop = section.getBoundingClientRect().top;
      const topOf = el => sTop + staticTopOf(el);
      const enterP = (el, from, to) => clamp01((from * vh - topOf(el)) / ((from - to) * vh));

      // Shared undertow — all three carried up as one under their own
      // entrances, so the group reads as arriving rather than assembling.
      const drift = DRIFT_PX * (1 - smoothstep(clamp01((vh - sTop) / (vh * .9))));

      const titleEased = smootherstep(enterP(line, 1, endTitle));
      const titleY = drift + TITLE_RISE_PX * (1 - titleEased);
      line.style.opacity = titleEased.toFixed(3);
      // Cleared rather than left at translateY(0) once settled — a
      // zero-valued transform still holds the element on its own
      // composited layer, which softens text edges (same fix as
      // .hero-in.is-in).
      line.style.transform = titleY < .05 ? '' : `translateY(${titleY.toFixed(2)}px)`;

      const p = smootherstep(enterP(wrap, .96, endVideo));
      const scale = VIDEO_START_SCALE + (1 - VIDEO_START_SCALE) * p;
      const videoY = drift + VIDEO_RISE_PX * (1 - p);
      // Was p*4 — full opacity a quarter of the way in, which under the
      // old spring hid the fade behind the bounce. With nothing bouncing
      // there is nothing to hide behind, so the fade IS the arrival and
      // runs across most of the window instead.
      wrap.style.opacity = clamp01(p * 1.45).toFixed(3);
      wrap.style.transform = (p >= 1 && videoY < .05)
        ? ''
        : `translateY(${videoY.toFixed(2)}px) scale(${scale.toFixed(4)})`;

      // Rises a shorter distance than the title, so the two read as one
      // arrival rather than two blocks moving in lockstep.
      if (body) {
        const bodyEased = smootherstep(enterP(body, 1, endBody));
        const bodyY = drift + BODY_RISE_PX * (1 - bodyEased);
        body.style.opacity = bodyEased.toFixed(3);
        body.style.transform = bodyY < .05 ? '' : `translateY(${bodyY.toFixed(2)}px)`;
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    function remeasure() { measureTops(); measureEnds(); update(); }

    remeasure();
    // The block positions these windows are derived from only settle
    // once the fonts and the footage's own aspect ratio are in — the
    // same triggers initClosingFit re-runs on.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    window.addEventListener('load', remeasure);
    const entranceVideo = document.querySelector('.brandid__closing-loop');
    if (entranceVideo && entranceVideo.readyState < 1) {
      entranceVideo.addEventListener('loadedmetadata', remeasure, { once: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    // Same gap as initClosingHandoff had (see its own notes): this
    // reads positions (topOf/staticTopOf, via measureTops) that depend
    // on the layout of everything ABOVE this section, not just this
    // component's own geometry, and its `p` (entrance progress) can
    // land short of 1 on a refresh if any of that hasn't settled yet —
    // which leaves scale()/translateY() short of their resting values
    // too, not just a position offset. That reads as the whole plate
    // sitting low AND slightly soft (a non-1 scale forces the browser
    // to resample everything inside it), on request after a
    // side-by-side comparison ("오른쪽이 새로고침했을때 상태인데 차이가
    // 느껴져?" — lower, and visibly less crisp). Same fixes as
    // initClosingHandoff: retry on a timer, and catch any other image
    // on the page finishing decode late and reflowing this section's
    // own position out from under the cached numbers.
    window.addEventListener('pageshow', remeasure);
    [50, 150, 350, 700, 1200].forEach(ms => setTimeout(remeasure, ms));
    Array.from(document.images).forEach(img => {
      if (!img.complete) img.addEventListener('load', remeasure, { once: true });
    });
  }

  initClosingEntrance();

  /* ---------- Closing → Applications: the plate hands the page over ---------- */

  // The page doesn't cut to the next section, it changes surface under
  // the reader. The plate pins mid-screen, --paper floods to the plate's
  // own floor colour, the plate's edges dissolve into that flood, the
  // footage fades, and what's left is the wordmark alone on full-bleed
  // ink — which is the ground Applications already starts on, so there
  // is no seam to cross. Scroll-scrubbed and reversible like every other
  // transition on this page.
  function initClosingHandoff() {
    const section = document.querySelector('.brandid__closing');
    const wrap = document.querySelector('.brandid__closing-loop-wrap');
    const line = document.querySelector('.brandid__closing-line');
    const body = document.querySelector('.brandid__closing-body');
    const video = document.querySelector('.brandid__closing-loop');
    const slot = document.querySelector('.brandid__closing-slot');
    const ticks = Array.from(document.querySelectorAll('.brandid__closing-tick'));
    const runway = document.querySelector('.brandid__closing-runway');
    const apps = document.querySelector('.apps');
    const ground = document.querySelector('.apps__ground');
    if (!section || !wrap || !apps) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);
    const win = (t, a, b) => smoothstep(clamp01((t - a) / (b - a)));

    const root = getComputedStyle(document.documentElement);
    const readVar = n => root.getPropertyValue(n).trim();
    const parseColor = str => {
      const m = str.trim();
      if (m.startsWith('#')) {
        const h = m.slice(1);
        const parts = h.length === 3
          ? h.split('').map(c => c + c)
          : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
        return parts.map(x => parseInt(x, 16)).concat(1);
      }
      const n = (m.match(/-?[\d.]+/g) || []).map(Number);
      return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1];
    };
    const mix = (a, b, t) => {
      const c = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
      const al = a[3] + (b[3] - a[3]) * t;
      return al >= .999 ? `rgb(${c.join(',')})` : `rgba(${c.join(',')},${al.toFixed(3)})`;
    };

    const PAPER = parseColor(readVar('--paper'));
    const PAPER_70 = parseColor(readVar('--paper-70'));
    const INK = parseColor(readVar('--ink'));
    const INK_70 = parseColor(readVar('--ink-70'));
    const GROUND = parseColor(readVar('--handoff-flood'));
    // The plate's upper tone, before the dissolve flattens it downward.
    const CEILING = parseColor(getComputedStyle(wrap).getPropertyValue('--loop-ceiling'));
    const FLOOR = parseColor(getComputedStyle(wrap).getPropertyValue('--loop-floor'));

    // Beats, as fractions of the runway. They overlap on purpose —
    // each one starts before the last has finished, so the handover
    // reads as a single move rather than four.
    // The gesture the whole handover now hangs on: the four corner ticks
    // are pulled out past the screen's edges and the plate's surface
    // stretches after them, so the colour reads as being drawn outward
    // rather than the page simply changing underneath ("모서리의 선을
    // 양사방으로 잡아 당기면서 자연스럽게 색상이 이어지게 확장되는").
    // The lines keep their own length through all of it ("선이
    // 확장되기보단 그위치 그대로") — what expands is the surface, and
    // each line is carried outward by exactly the amount its own corner
    // of that surface travels. So the corner reference never shifts and
    // the four marks stay attached to it the whole way out.
    const SPREAD = [.04, .26];
    // The section's own background follows BEHIND the spread rather than
    // leading it. Flooding first would darken the page before the
    // surface got there, and the expansion would have nothing to expand
    // over — dark on dark. By the time this runs the spread has already
    // covered the viewport, so it is invisible; it exists so the section
    // is still dark when the pin releases and the plate leaves.
    const FLOOD = [.22, .38];
    // Was [.22,.44] — overlapped the tail of SPREAD ([.04,.26]) by 4
    // points, so the plate's ceiling colour (mix(CEILING,FLOOR,dissolve))
    // was already ~10% of the way toward FLOOR by the moment the spread
    // itself finished growing — the surface's colour had visibly shifted
    // by the time it was done expanding, on request ("확대됬을때
    // 확대되기전이랑 배경색이 조금 차이가 나는것 같은데 확대 되기 전에
    // 배경색 그대로 유지해서"). Starting it exactly where SPREAD ends
    // (matching FOOTAGE_OUT, which already does this) means the colour
    // is untouched for the entire zoom and only begins changing once
    // it's finished.
    const DISSOLVE = [.26, .44];
    // The footage goes FIRST, while it is still standing on the surface
    // its edge fades were matched to. The other order was the bug: with
    // the surface dissolving at 50-66% the picture was still 78% opaque
    // over it, so its four feathers were fading toward a colour that
    // had left — and against bg.png, which is far darker, that showed up
    // as a rectangular halo where the video's edges were ("영상 상하좌우
    // 그라데이션때문에 배경이 진해지면서 그 경계가 표시가 많이 나는데").
    // Nothing fades over a mismatched ground now.
    const FOOTAGE_OUT = [.26, .42];
    // The lift. Runs under the flood and finishes before the footage
    // starts fading, so the plate is already sitting on its ink centre
    // by the time there is nothing left but the wordmark.
    // The plate's own dark surface clears BEFORE the new ground arrives,
    // so nothing of the old backdrop is left sitting on bg.png. Safe to
    // go early: the page behind it is already flooded to the same
    // colour, so there is nothing to see in between.
    const PLATE_BG_OUT = [.42, .51];
    // bg.png comes up under it — the plate's surface sits ABOVE this
    // layer, so the image is hidden until the surface starts leaving and
    // the two read as one cross-fade, on request ("워드마크가 중앙으로
    // 옮겨갈즈음 bg.png 이 배경을 전체적으로 깔아서").
    // Was its own [.40,.52] window — a shorter span than FOOTAGE_OUT's
    // .16, so bg.png rose faster than the footage fell. Matched to
    // FOOTAGE_OUT directly (same span, same start) so the ground comes in
    // at exactly the footage's own fade-out rate ("영상이 사라질때도
    // 방사형이랑 같은속도로") — it stays invisible regardless, hidden
    // under the still-opaque plate until PLATE_BG_OUT clears at .42.
    const GROUND_IN = FOOTAGE_OUT;
    // With the footage gone, the wordmark walks up off the plate's
    // bottom edge to the middle of the screen ("영상 심볼이 사라지고
    // 아래에 있던 워드마크가 브라우저 기준 중앙으로 자연스럽게 이동").
    const MARK_TO_CENTRE = [.42, .56];
    // Then everything stops, .56 to .66 ("여기서 약간 홀딩됬다가").
    // The roll itself: was a continuous scroll-tied range ([.66,.76],
    // later narrowed to [.66,.70]) — at a slow scroll it just tracked
    // that dial slowly, sitting part-rolled with both lines visibly
    // overlapping for as long as the reader stayed in the window, on
    // request ("뉴스티커 휠 천천히 하면 여전히 한번에 안넘아가고
    // 잔상남아"). A single threshold now (see .is-ticked below) — once
    // scroll crosses it, however fast or slow that crossing was, the
    // CSS transition on .brandid__closing-mark/-next (style.css) carries
    // the roll to completion over its own fixed duration.
    const TICKER_AT = .68;
    // ...and then it stops AGAIN, .76 to 1, so the new title gets its own
    // beat to be read — and it is during that beat that the Applications
    // copy rises into place behind it from the bottom of the screen,
    // which is what the pull in initClosingFit is for ("여기도 잠시
    // 홀딩되고 아래 내용이 딸려오면").
    //
    // The mark's exit is NOT a beat. It used to be — a transform that
    // carried it on up to 14% of the screen while the plate stayed
    // pinned — and that was the source of the void: the title climbed
    // 320px while the section under it did not move at all, so by the
    // time it faded there was half a screen of empty ground between the
    // two. Now the runway simply ends here, the pin releases, and the
    // plate scrolls away carrying the title with it — with the
    // Applications content one gap behind, travelling at exactly the
    // same speed ("워드마크는 자연스럽게 위로 딸려 올라가면서 브라우저
    // 상단근처에서 자연스럽게 사라지고"). Only the fade is still driven,
    // and off where the mark actually is on screen rather than off a
    // progress value that has already run out.
    const FADE_FROM = .34, FADE_TO = .13;
    //
    // There is deliberately no motion in any of this. A lift used to run
    // here, raising the plate onto its ink centre while pinned — and a
    // pinned element is otherwise perfectly still, so even a rounded
    // one-pixel-per-six-scroll-pixels step read as shake, and the
    // unrounded version resampled the footage every frame instead. The
    // plate now simply pins on its ink centre to begin with
    // (initClosingFit), which is where the lift was taking it anyway.
    // Every write below is guarded against its own last value. Nothing
    // here changes on most frames — the flood settles at 45%, the
    // dissolve at 65% — and re-setting an identical background-color or
    // custom property still costs a style recalc on an element this big.
    const last = {};
    const put = (key, value, apply) => {
      if (last[key] === value) return;
      last[key] = value;
      apply(value);
    };

    // Geometry, measured once per layout rather than per frame. Reading
    // offsetTop/offsetHeight/getComputedStyle inside the scroll handler
    // forces a synchronous layout every frame, and with two scroll
    // handlers on this element both reading and writing it turns into
    // read-write-read thrash — which is what the footage was juddering
    // on ("영상이 달달거리는 느낌").
    let runPx = 0, plateStaticTop = 0, stickyTop = 0, markCentreInPlate = 0, contentLiftTarget = 0;
    // How far the spread has to go, worked out from where the plate sits
    // once pinned rather than guessed: what it takes for the surface to
    // reach every edge of the screen, plus a margin so it never lands
    // exactly on one.
    let spreadX = 1, spreadY = 1;
    function measure() {
      runPx = runway ? runway.offsetHeight : 0;
      // For a sticky element offsetTop reports its CURRENT offset,
      // displacement included — measured 1327 against a static 337. The
      // runway is a plain element, so its own offsetTop is the plate's
      // static bottom.
      plateStaticTop = runway ? runway.offsetTop - wrap.offsetHeight : wrap.offsetTop;
      const wcs = getComputedStyle(wrap);
      stickyTop = parseFloat(wcs.top) || 0;
      // Published by initClosingFit — where the mark's own centre sits
      // inside the plate once it has walked up to the middle. Added to
      // the plate's top on screen it gives the mark's position, which is
      // what drives the fade after the pin lets go.
      markCentreInPlate = parseFloat(wcs.getPropertyValue('--mark-centre-in-plate')) || 0;
      // Published by initClosingFit — the video+mark bundle's own travel
      // from the box-centred layout position to the ink-centred one,
      // eased in below over the same window the backdrop spreads in.
      contentLiftTarget = parseFloat(wcs.getPropertyValue('--plate-content-lift-target')) || 0;

      const vw = window.innerWidth, vh = window.innerHeight;
      const pw = wrap.offsetWidth, ph = wrap.offsetHeight;
      if (!pw || !ph) return;
      const centreY = stickyTop + ph / 2;
      const MARGIN = 1.06;
      spreadX = Math.max(1, (vw / pw) * MARGIN);
      spreadY = Math.max(1, (2 * Math.max(centreY, vh - centreY) / ph) * MARGIN);
    }

    let ticking = false;

    function update() {
      ticking = false;
      if (runPx <= 0) return;

      // Zero at the moment the plate pins, one when the runway is spent.
      // Off the section's own rect — not the plate's, which stops moving
      // once pinned and would freeze the progress with it.
      const raw = (stickyTop - plateStaticTop) - section.getBoundingClientRect().top;
      const t = clamp01(raw / runPx);

      const flood = win(t, FLOOD[0], FLOOD[1]);
      const dissolve = win(t, DISSOLVE[0], DISSOLVE[1]);
      const out = win(t, FOOTAGE_OUT[0], FOOTAGE_OUT[1]);
      const spread = win(t, SPREAD[0], SPREAD[1]);
      const sx = 1 + (spreadX - 1) * spread;
      const sy = 1 + (spreadY - 1) * spread;

      put('spreadX', sx.toFixed(4), v => { wrap.style.setProperty('--plate-spread-x', v); });
      put('spreadY', sy.toFixed(4), v => { wrap.style.setProperty('--plate-spread-y', v); });
      // How far each corner of the SURFACE has travelled from where it
      // started. The ticks are carried by exactly this, so they stay on
      // their own corner instead of being left behind by it — the
      // surface scales about its centre, so a corner moves by half the
      // extra width and half the extra height.
      put('cornerDx', `${((sx - 1) * wrap.offsetWidth / 2).toFixed(1)}px`,
        v => { wrap.style.setProperty('--corner-dx', v); });
      put('cornerDy', `${((sy - 1) * wrap.offsetHeight / 2).toFixed(1)}px`,
        v => { wrap.style.setProperty('--corner-dy', v); });
      // The ticks retract into their own corner over the SAME window
      // they ride outward in — 1 at rest (full length), 0 once the
      // spread completes (fully drawn in), reversing cleanly on the way
      // back up since it's driven by the same scroll-tied `spread`
      // ("배경이 확장되는 구간에... 감춰지는... 배경이 줄어들면 다시
      // 뻗어나오고").
      put('tickRetract', (1 - spread).toFixed(4),
        v => { wrap.style.setProperty('--tick-retract', v); });
      // The video+mark bundle settles from its box-centred rest position
      // up onto the ink-centred spot over the SAME spread window — see
      // the note by --plate-content-lift-target in initClosingFit for
      // why the box itself pins for real instead of this being faked
      // with a counter-offset the other way round.
      put('contentLift', `${(contentLiftTarget * spread).toFixed(1)}px`,
        v => { wrap.style.setProperty('--plate-content-lift', v); });

      put('bg', mix(PAPER, GROUND, flood), v => { section.style.backgroundColor = v; });
      // The copy has to invert with the ground or it goes invisible
      // halfway through — each is set directly because .brandid__body
      // carries its own colour and would ignore an inherited one.
      if (line) put('line', mix(INK, PAPER, flood), v => { line.style.color = v; });
      if (body) put('body', mix(INK_70, PAPER_70, flood), v => { body.style.color = v; });
      // They leave with the surface they belong to, not with the flood —
      // they ARE the gesture now, so fading them while they were still
      // being pulled would have cut it in half.
      put('ticks', (1 - win(t, PLATE_BG_OUT[0], PLATE_BG_OUT[1])).toFixed(3), v => {
        ticks.forEach(el => { el.style.opacity = v; });
      });
      // Plate flattens to one tone — its top edge is the only part still
      // reading as an edge once the page around it is the floor colour.
      put('ceiling', mix(CEILING, FLOOR, dissolve), v => {
        wrap.style.setProperty('--loop-ceiling', v);
      });
      // Also drives the video's own dim overlay (::after, style.css) —
      // it's a separate pseudo-element, not a child of <video>, so it
      // doesn't inherit the footage's own opacity automatically; without
      // this it would stay fully visible even after the footage had
      // faded out, on request ("영상이 사라지면 당연히 이것들도 같이
      // 사라지는거고 한몸처럼 움직이게").
      if (video) put('footage', (1 - out).toFixed(3), v => {
        video.style.opacity = v;
        wrap.style.setProperty('--footage-dim', v);
      });
      const plateGone = win(t, PLATE_BG_OUT[0], PLATE_BG_OUT[1]);
      put('plateBg', (1 - plateGone).toFixed(3),
        v => { wrap.style.setProperty('--plate-bg-opacity', v); });
      // Up to the middle, and held there. Nothing carries it further —
      // past this the pin releases and the plate takes it up on its own.
      put('markRise',
        `calc(var(--mark-to-centre, 0px) * ${win(t, MARK_TO_CENTRE[0], MARK_TO_CENTRE[1]).toFixed(4)})`,
        v => { wrap.style.setProperty('--mark-rise', v); });
      // ...so the fade is read off where it actually is. Once the runway
      // is spent the plate is displaced no further, and every pixel of
      // scroll past that point moves it — and the mark with it — up the
      // screen one for one.
      const vh = window.innerHeight;
      // stickyTop is the box's own pin now, not the mark's resting
      // frame — contentLiftTarget is what closes that gap (fully
      // resolved by here; the spread it eases in over finishes long
      // before the dock ever starts).
      const markY = stickyTop + contentLiftTarget - Math.max(0, raw - runPx) + markCentreInPlate;
      put('markFade',
        clamp01((markY - FADE_TO * vh) / ((FADE_FROM - FADE_TO) * vh)).toFixed(3),
        v => { wrap.style.setProperty('--mark-fade', v); });
      if (slot) put('ticker', t >= TICKER_AT, v => { slot.classList.toggle('is-ticked', v); });
      if (ground) put('ground', win(t, GROUND_IN[0], GROUND_IN[1]).toFixed(3),
        v => { ground.style.opacity = v; });

      // Lets the fixed header logo and equalizer flip to paper while the
      // section is dark, using the same override the other dark stages
      // set (see initContrastSwitchers).
      const dark = flood > .5 ? 'dark' : '';
      if (section.dataset.eqBg !== dark) {
        if (dark) section.dataset.eqBg = dark;
        else delete section.dataset.eqBg;
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    function remeasure() { measure(); update(); }

    remeasure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    window.addEventListener('load', remeasure);
    if (video && video.readyState < 1) video.addEventListener('loadedmetadata', remeasure, { once: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    // Covers back/forward-cache restores, which don't re-run this
    // script at all — 'pageshow' fires again on both a fresh load and
    // a bfcache restore, unlike 'load' (bfcache) or DOMContentLoaded.
    window.addEventListener('pageshow', remeasure);
    // None of the above reliably catches a reload's own scroll-
    // restoration, which doesn't fire a 'scroll' event — tried chaining
    // a rAF pair onto each readiness signal (previous commit), but that
    // still assumed restoration happens BEFORE those signals resolve,
    // which isn't a real guarantee either way (e.g. once fonts are
    // browser-cached, fonts.ready can resolve near-instantly on a
    // reload, well before restoration). No single event marks "the
    // browser is done moving the page," so this just retries
    // remeasure() a few times over the first second and a half instead
    // of trying to out-guess the ordering — cheap (a few reads plus
    // the put() guards below skip any write that hasn't actually
    // changed) and self-correcting regardless of which trigger the
    // browser's own restoration happens to land relative to. On
    // request after the wordmark (mid-scroll, so any scroll self-heals
    // it) still visibly settling late while a HELD state like
    // APPLICATIONS' ticker hold — nothing left to scroll into — just
    // sat wrong ("어플리케이션은 어느정도 홀딩되다보니 그상태에서
    // 새로고침하면 아래로 내려와 치우쳐보이는게 조금 거슬리네").
    [50, 150, 350, 700, 1200].forEach(ms => setTimeout(remeasure, ms));
    // Still not it, per further testing — the wrong position held
    // through scrolling UP, only correcting once scroll passed BACK
    // OVER the spread window and returned ("위로 스크롤 하면 그
    // 치우친게 유지됬다가... 플레이트 확장 시점을 지나게 위로 올라갔다가
    // 다시 내려오면 의도했던 위치로"). That's not a readiness-timing
    // symptom — plateStaticTop/runPx (measure(), below) come from
    // runway.offsetTop, which depends on the layout of EVERYTHING
    // above this section, not just this section's own geometry. Any of
    // the many other <img>s on the page finishing decode AFTER this
    // component's own measure() runs reflows everything below it,
    // silently invalidating the cached plateStaticTop/runPx — nothing
    // above was listening for that at all, so scrolling back down only
    // "looked like" a fix insofar as it happened to land after that
    // reflow had already settled. Listening to every image directly
    // (not just the footage) closes that gap regardless of how long
    // any one of them takes.
    Array.from(document.images).forEach(img => {
      if (!img.complete) img.addEventListener('load', remeasure, { once: true });
    });
  }

  initClosingHandoff();

  /* ---------- Applications: the intro rises on the ground it was handed ---------- */

  function initApplicationsEntrance() {
    const sec = document.querySelector('.apps');
    const intro = sec ? sec.querySelector('.apps__intro') : null;
    // isCompact() checked before attaching listeners, not live inside
    // update() — see the matching comment in initVisionWipe for why
    // (reported scroll jank on real compact-viewport devices).
    if (!sec || !intro || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smootherstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);
    const RISE_PX = 44;

    let ticking = false;
    function update() {
      ticking = false;
      const vh = window.innerHeight;
      const top = sec.getBoundingClientRect().top;
      const p = smootherstep(clamp01((vh - top) / (vh * .55)));
      intro.style.opacity = p.toFixed(3);
      intro.style.transform = p >= 1 ? '' : `translateY(${(RISE_PX * (1 - p)).toFixed(2)}px)`;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  initApplicationsEntrance();

  /* ---------- Applications: bg.png settles to solid Paper while the intro group holds ---------- */

  function initApplicationsGroundFade() {
    const sec = document.querySelector('.apps');
    const ground = document.querySelector('.apps__ground');
    const intro = document.querySelector('.apps__intro');
    const runway = document.querySelector('.apps__runway');
    const lead = document.querySelector('.apps__lead');
    const body = document.querySelector('.apps__body');
    // isCompact() checked before attaching listeners, not live inside
    // update() — see the matching comment in initVisionWipe for why
    // (reported scroll jank on real compact-viewport devices).
    if (!sec || !ground || !intro || !runway || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smootherstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);

    const parseColor = str => {
      const m = str.trim();
      if (m.startsWith('#')) {
        const h = m.slice(1);
        const parts = h.length === 3
          ? h.split('').map(c => c + c)
          : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
        return parts.map(x => parseInt(x, 16)).concat(1);
      }
      const n = (m.match(/-?[\d.]+/g) || []).map(Number);
      return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1];
    };
    const mix = (a, b, t) => {
      const c = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
      const al = a[3] + (b[3] - a[3]) * t;
      return al >= .999 ? `rgb(${c.join(',')})` : `rgba(${c.join(',')},${al.toFixed(3)})`;
    };

    const root = getComputedStyle(document.documentElement);
    const readVar = n => root.getPropertyValue(n).trim();
    const APPS_FILL = parseColor(readVar('--apps-fill'));
    const PAPER = parseColor(readVar('--paper'));
    const PAPER_70 = parseColor(readVar('--paper-70'));
    const INK = parseColor(readVar('--ink'));
    const INK_70 = parseColor(readVar('--ink-70'));

    // The hold itself IS the transition's window — the runway is empty
    // scroll that exists only so .apps__intro (sticky) reads as pinned
    // in place while it passes beneath. Riding the same distance means
    // the swap finishes exactly as the hold ends, with nothing left to
    // cut over abruptly when the showcase content arrives next
    // ("타이틀... 그룹이 상단에 홀딩될때 자연스럽게... 전환").
    //
    // Kept section-relative throughout, not converted to document/
    // scrollY coordinates — .apps has its own position:relative, so
    // runway.offsetTop (and everything derived from it) is already
    // relative to .apps, not the page. Measured: 237px, against an
    // actual document position of ~31773px — using that against
    // window.scrollY directly made pinStart land near 0, so the whole
    // crossfade fired at the top of the page instead of at the hold.
    // section.getBoundingClientRect().top, read live every frame, is
    // what closes the gap between the two coordinate spaces — same
    // fix already in place for the closing plate's own runway
    // (initClosingHandoff, initClosingEntrance).
    let pinOffset = 0, runPx = 0, preroll = 0;
    function measure() {
      const introTopPx = parseFloat(getComputedStyle(intro).top) || 0;
      // Runway is a plain flow element, so its own offsetTop is reliable
      // (relative to .apps) even while intro above it is sticky-
      // displaced.
      const introStaticTop = runway.offsetTop - intro.offsetHeight;
      pinOffset = introTopPx - introStaticTop;
      runPx = runway.offsetHeight;
      // How far before the pin itself the crossfade starts — the hold
      // is still the finish line (unchanged), but starting exactly at
      // t=0 there read as an abrupt cut right as the title caught,
      // rather than something already underway by the time it settles
      // ("홀딩 되기 전부터 자연스럽게... 전환"). Scaled off the
      // viewport, like the intro's own rise/fade window
      // (initApplicationsEntrance's vh*.55), so the two motions read as
      // one approach rather than two unrelated triggers.
      preroll = window.innerHeight * .6;
    }

    let ticking = false;
    function update() {
      ticking = false;
      if (runPx <= 0) return;
      const raw = pinOffset - sec.getBoundingClientRect().top;
      const t = smootherstep(clamp01((raw + preroll) / (runPx + preroll)));
      // Only touches the ground once the hold has actually begun — at
      // t=0 it would otherwise force opacity to 1 on every page load,
      // stomping the separate fade-IN initClosingHandoff drives during
      // the handover itself (which runs long before the hold begins).
      if (t > 0) ground.style.opacity = (1 - t).toFixed(3);
      sec.style.backgroundColor = mix(APPS_FILL, PAPER, t);
      // The copy has to invert with the ground or it goes invisible
      // against Paper — same reasoning as the closing section's own
      // flood (initClosingHandoff).
      if (lead) lead.style.color = mix(PAPER, INK, t);
      if (body) body.style.color = mix(PAPER_70, INK_70, t);

      // The dock: once the hold is spent (raw past runPx), the title is
      // carried up by exactly the scroll past that point instead of
      // being left to CSS's own sticky release. Tried leaving it to the
      // browser first — position:sticky DOES release on its own once
      // its containing block runs out, but it releases by tracking that
      // container's OWN trailing edge, not the title's true static
      // position, and the runway sitting between the two turned that
      // into a permanent, unpredictable offset (measured 44px short of
      // .apps__showcase's own margin-top, not 0 — see the note on
      // .apps__intro in style.css). Translating it explicitly, 1px per
      // 1px of scroll past the hold, reproduces the same "unstuck, now
      // scrolling normally" motion but starting from an exact, known
      // point, so the showcase's margin-top is the whole story: nothing
      // to compensate for ("여백 80~100정도 두고... 자석처럼
      // 도킹되듯이"). Continuous at the seam — at raw===runPx this is
      // translateY(0), exactly where CSS sticky already had it pinned.
      const excess = Math.max(0, raw - runPx);
      intro.style.transform = excess > 0 ? `translateY(${(-excess).toFixed(1)}px)` : '';
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    function remeasure() { measure(); update(); }

    remeasure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    window.addEventListener('load', remeasure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
  }

  initApplicationsGroundFade();

  /* ---------- Applications: hide any not-yet-added photo in the stack ---------- */

  // .apps__photo/.apps__gallery-img slots are written out ~30 numbers
  // ahead (m_1.jpg … m_30.jpg, see index.html) so dropping the next
  // file straight into images/ makes it appear with no HTML changes —
  // on request ("이미지도 순서대로 m_1.jpg m_2.jpg 이미지폴더에 넣으면
  // 자동으로 나오게"). Whichever numbers don't exist yet 404; this
  // hides those specific elements (display:none removes them from
  // flow entirely, so no broken-image icon and no stray gap from an
  // empty slot's own margin/gap) rather than leaving them visible.
  function initApplicationsPhotoStack() {
    const solos = Array.from(document.querySelectorAll('.apps__photo'));
    const galleries = Array.from(document.querySelectorAll('.apps__gallery'));

    const isBroken = img => img.complete && img.naturalWidth === 0;

    solos.forEach(img => {
      if (isBroken(img)) { img.style.display = 'none'; return; }
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    });

    // Photos land one at a time in order, so a pair's second half is
    // routinely just not-there-yet rather than a permanent gap
    // ("m_5.jpg 안나오는데" — only m_5 existed, m_6 didn't, and the
    // first version of this hid the whole row until BOTH arrived).
    // Whichever side HAS a real image now shows immediately at full
    // width (see .apps__gallery--left-only/--right-only in
    // style.css); only hide the row outright once neither side has
    // anything.
    galleries.forEach(gallery => {
      const [left, right] = gallery.querySelectorAll('.apps__gallery-img');
      const update = () => {
        const leftOk = !isBroken(left);
        const rightOk = !isBroken(right);
        gallery.classList.toggle('apps__gallery--left-only', leftOk && !rightOk);
        gallery.classList.toggle('apps__gallery--right-only', rightOk && !leftOk);
        gallery.style.display = (leftOk || rightOk) ? '' : 'none';
      };
      left.addEventListener('error', update, { once: true });
      right.addEventListener('error', update, { once: true });
      update();
    });
  }

  initApplicationsPhotoStack();

  // The ground used to pan through its own length here — the image is
  // 1800x2601, far taller than any viewport once it covers the width, so
  // it travelled upward through a fixed window as you scrolled. Removed
  // on request ("배경 이동은 없애자"): it is a plain fixed cover
  // background now, still from the moment it appears.

  /* ---------- Background music: equalizer bars double as the play/pause toggle ---------- */

  function initMusicToggle() {
    const btn = document.getElementById('musicToggle');
    const audio = document.getElementById('bgMusic');
    if (!btn || !audio) return;

    // Modest by default — this is ambient backing, not the main event.
    audio.volume = .45;

    const bars = Array.from(btn.querySelectorAll('.music-toggle__bar'));
    const BAR_MIN = 4, BAR_MAX = 16;
    const STEP_MIN_MS = 150, STEP_MAX_MS = 400;

    // Reverted the Web Audio AnalyserNode version (real frequency-band
    // analysis per bar) back to this plain random-per-bar timer — after
    // three separate reports that the button felt unresponsive
    // ("이퀄라이저 눌러도 반응이 없네", repeated), on top of it being
    // hard to fully verify in this sandbox (file:// vs the dev server,
    // AudioContext/autoplay-policy edge cases). This version has no
    // Web Audio graph at all — just a CSS transition — so there's
    // nothing left that can silently fail while playback carries on
    // with zero visible feedback. Each bar picks its own random height
    // at its own random interval — not a shared CSS @keyframes loop,
    // which kept every bar at the exact same height at any given
    // instant, on request ("막대길이가 똑같아지면 어떡해... 이전처럼
    // 랜덤으로"). The CSS `transition: height` already on
    // .music-toggle__bar is what turns each of these into a glide
    // instead of a snap.
    function randomizeBar(bar) {
      const h = BAR_MIN + Math.random() * (BAR_MAX - BAR_MIN);
      bar.style.height = `${h.toFixed(1)}px`;
      bar._eqTimer = setTimeout(() => randomizeBar(bar), STEP_MIN_MS + Math.random() * (STEP_MAX_MS - STEP_MIN_MS));
    }

    function stopBars() {
      bars.forEach(bar => {
        clearTimeout(bar._eqTimer);
        bar.style.height = '';
      });
    }

    function setPlayingUI(isPlaying) {
      btn.classList.toggle('is-playing', isPlaying);
      btn.setAttribute('aria-pressed', String(isPlaying));
      btn.setAttribute('aria-label', isPlaying ? '배경음 정지' : '배경음 재생');
      if (isPlaying && !prefersReduced) {
        bars.forEach(randomizeBar);
      } else {
        stopBars();
      }
    }

    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-playing')) {
        audio.pause();
      } else {
        // play() returns a promise that rejects if the browser blocks
        // it — this is always a direct click response so autoplay
        // policy shouldn't be an issue, but a swallowed rejection here
        // is safer than an uncaught one either way.
        audio.play().catch(() => {});
      }
    });

    // Driven off the audio element's own events (not the click
    // handler directly) so the bars/aria stay in sync no matter what
    // paused/resumed it — a browser media-key press, another tab's
    // audio taking focus, etc. — not just this button's own click.
    audio.addEventListener('pause', () => setPlayingUI(false));
    audio.addEventListener('play', () => setPlayingUI(true));
  }

  initMusicToggle();

  /* ---------- Shared: any fixed UI element auto-switches ink/paper to match what's behind it ---------- */

  // Used by both the music-toggle equalizer and the hero wordmark
  // (once it's acting as a persistent nav mark), on request ("여기도
  // 이퀄라이저랑 색상 패턴 똑같이 적용") — one shared implementation
  // rather than two copies drifting apart.
  function initContrastSwitchers() {
    // Each target carries its own scope key now — the loop clip's dark
    // override (data-eq-bg-scope="equalizer" below) only applies to the
    // equalizer; the hero logo sits top-left, nowhere near where that
    // clip actually renders bottom-right, and reading it as "paper" too
    // was wrong there, on request ("영상클립 스티키 될때 이퀄라이저는
    // 지금이 맞지만 왼쪽 상단 로고는 예외처리해서 잉크색으로"). An
    // override with no data-eq-bg-scope at all (Vision Wipe, Our
    // Approach, Brand Wall, Color Story) still applies to every target,
    // same as before — only this one clip is now restricted.
    const targets = [
      { el: document.getElementById('musicToggle'), scope: 'equalizer' },
      { el: document.getElementById('heroLogo'), scope: 'logo' }
    ].filter(t => t.el);
    if (!targets.length) return;

    // Same relative-luminance approach already used elsewhere in this
    // file (the Color Principle title contrast check).
    function relLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c /= 255;
        return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
      });
      return .2126 * rs + .7152 * gs + .0722 * bs;
    }

    function parseRgb(str) {
      const m = str && str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }

    // Walks up from whatever's actually rendered at the point checked,
    // looking FIRST for an explicit data-eq-bg override — several
    // sections (Vision Wipe, Our Approach, Brand Wall, the Symbol
    // Construction loop clip) paint their real mood through a
    // background IMAGE or VIDEO or an ink backdrop that only exists as
    // a ::before pseudo-element, none of which show up as a plain
    // background-color a luminance sample could read, on request
    // ("비전에서는 페이퍼색이어야... 잉크색이네" / "아워어프로치도...
    // 잉크색이 나아보여" / "브랜드월... 배경이 검기때문에 페이퍼색" /
    // "우측 영상 클립 스티키될때에는 페이퍼색"). Only falls back to
    // sampling an actual background-color where no section has opted
    // into an explicit override.
    // scope-specific key (data-eq-bg-equalizer / data-eq-bg-logo) wins
    // over the shared data-eq-bg when both are present — needed for
    // Brand Wall, where the video shrinks around one shared centre but
    // the two targets sit at different margins from their own corner
    // (equalizer: 9px: hero logo: 20-28px), so they don't actually
    // uncover at the same scale value. Checking only the equalizer's
    // own coverage and applying that single result to both had the
    // logo reading the wrong colour (and therefore low-contrast/
    // "greyish") for part of the approach, on request ("여전히...
    // 브랜드월에서 왼쪽 상단 로고 회색으로 보여").
    function isLightAt(el, scope) {
      let node = el;
      const scopedKey = scope ? 'eqBg' + scope[0].toUpperCase() + scope.slice(1) : null;
      while (node && node !== document.documentElement) {
        if (node.dataset) {
          if (scopedKey && node.dataset[scopedKey]) return node.dataset[scopedKey] === 'light';
          if (node.dataset.eqBg) return node.dataset.eqBg === 'light';
        }
        node = node.parentElement;
      }
      node = el;
      while (node && node !== document.documentElement) {
        const rgb = parseRgb(getComputedStyle(node).backgroundColor);
        if (rgb && rgb.a > 0) return relLuminance(rgb.r, rgb.g, rgb.b) > .5;
        node = node.parentElement;
      }
      return false; // falls back to --ink (the hero's own colour) — i.e. "dark", paper bars/mark
    }

    // The Symbol Construction loop clip is deliberately
    // pointer-events:none (it's decorative, must not intercept
    // clicks) — but elementFromPoint's hit-testing follows the exact
    // same rules as real pointer events, so it SKIPS pointer-events:
    // none elements entirely and returns whatever is underneath
    // instead (verified directly: it resolved to .brandid__sizes, the
    // plain paper section behind it). isLightAt's data-eq-bg walk
    // would then never see the clip's own override at all.
    //
    // No longer a geometric point-in-rect check against the caller's
    // own position — while the clip is animating in/out (scale,
    // translate) it doesn't always cover the equalizer's exact pixel
    // even though it's clearly still on screen, which read as the
    // colour flipping mid-transition, on request ("영상클립 스티키시
    // 이퀄라이저 페이퍼색으로 계속 유지되어야 하는데 도중에 바꾸는...
    // 사라지기전까진 페이퍼색 유지되는게 관건"). Now it's just "is
    // this overlay meaningfully visible ANYWHERE" — unconditional for
    // as long as it has any real opacity, regardless of where on
    // screen it currently sits.
    function activeOverlayOverride(scope) {
      const overlays = document.querySelectorAll('[data-eq-bg]');
      for (const el of overlays) {
        if (getComputedStyle(el).pointerEvents !== 'none') continue;
        if (parseFloat(getComputedStyle(el).opacity) <= .05) continue;
        const restrictTo = el.dataset.eqBgScope;
        if (restrictTo && restrictTo !== scope) continue;
        return el.dataset.eqBg === 'light';
      }
      return null;
    }

    let ticking = false;

    function update() {
      ticking = false;
      targets.forEach(({ el, scope }) => {
        const overlay = activeOverlayOverride(scope);
        if (overlay !== null) {
          el.classList.toggle('is-on-light', overlay);
          return;
        }

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // elementFromPoint would just return EL itself at its own
        // centre — hide it for the one synchronous hit-test, same
        // frame, so it can't paint in between.
        el.style.visibility = 'hidden';
        const hit = document.elementFromPoint(x, y);
        el.style.visibility = '';
        if (!hit) return;
        el.classList.toggle('is-on-light', isLightAt(hit, scope));
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  initContrastSwitchers();

  /* ---------- Hero wordmark: slides away on scroll-down, back on scroll-up, glides home on click ---------- */

  // Clarified this is the HERO'S OWN wordmark acting as a persistent
  // nav element, not a separate mark — on request ("좌측 하단의
  // 심볼이 아니라 히어로섹션의 워드마크 그거 얘기한거고"). It's
  // already position:fixed (style.css) at the same top-left spot it
  // always occupied, so this only adds the scroll-direction slide and
  // the click-to-home behaviour on top of the existing entrance.
  function initHeroLogoNav() {
    const btn = document.getElementById('heroLogo');
    if (!btn) return;

    // .hero (the button's own parent section) has position:relative +
    // z-index:1 (style.css, .hero-bleed > section) for legitimate
    // reasons — layering its own content above .hero-bleed__bg. But
    // that ALSO means it establishes a stacking context, and a
    // position:fixed descendant only escapes for LAYOUT — its PAINT
    // ORDER is still confined inside its nearest stacking-context
    // ancestor. So once .is-nav-fixed switches the button to fixed, it
    // was still being compared against other sections at .hero's own
    // z-index:1, not the true page root — and any LATER section whose
    // own content also reaches z-index:1 (e.g. #ourApproach's
    // .acycle__list) wins that tie by DOM order, painting over the
    // "fixed" button and swallowing its clicks, on request ("아워어프로치
    // 에서 위로 스크롤시 상단 로고 나타나는데 이때 링크가 안되네").
    // Confirmed directly: elementFromPoint at the button's own screen
    // position returned .acycle__step, not the button or its svg.
    // Fixed by actually MOVING the button out to <body> (a true root
    // sibling, no trapping ancestor) whenever it's in nav-fixed mode,
    // and moving it back to its original spot in .hero when back
    // inside the hero — restoring it in place is what lets it act as
    // ordinary hero content again (see the position:absolute base
    // state, style.css) rather than a portal element left permanently
    // detached.
    const heroHomeParent = btn.parentElement;
    const heroHomeNextSibling = btn.nextSibling;
    let isPortaled = false;
    function setPortaled(on) {
      if (on === isPortaled) return;
      isPortaled = on;
      if (on) {
        document.body.appendChild(btn);
      } else if (heroHomeNextSibling) {
        heroHomeParent.insertBefore(btn, heroHomeNextSibling);
      } else {
        heroHomeParent.appendChild(btn);
      }
    }

    // Was -140% of the mark's OWN 16px height (~-22px) — the button
    // also sits top:20-28px down from the viewport itself, so translating
    // by only ~22px still left it within a few px of the top edge
    // instead of actually leaving the screen, which is why it kept
    // reading as stuck there while scrolling down even after the
    // STAY_PUT threshold fix below, on request ("여전히 상단에
    // 걸려버린다 체크해서 수정해줘"). A flat px offset large enough to
    // clear top + height + a margin actually sends it off-screen.
    const HIDE_Y = -120; // px

    // Stays put no matter which way the page scrolls for as long as the
    // reader is still inside the hero itself — direction-based hide/show
    // starts from the very next section (02 Our Philosophy, the
    // .statement section right after Hero), not later. Was wired to
    // #ourApproach (05 Our Approach) instead — mixed up which section
    // "아워필라서피" (Our Philosophy) actually names, on request
    // ("왜 아워 어프로치 부터... 사라지지? 히어로섹션을 빼고는
    // 아워필라서피부터 똑같이 적용되어야 할것 같아"). Measured against
    // #ourPhilosophy's own document position rather than a fixed
    // viewport-height guess, so it tracks the real section boundary if
    // the hero ever changes height.
    const nextSection = document.getElementById('ourPhilosophy');
    let stayPutBelow = window.innerHeight * .5;
    function measureStayPutBelow() {
      if (nextSection) {
        stayPutBelow = window.scrollY + nextSection.getBoundingClientRect().top;
      }
    }
    measureStayPutBelow();

    // Shape DNA's own left column is a sticky, pinned viewport-height
    // stage for its whole (220vh+) runway — the mark would otherwise
    // sit on top of that video the entire time it's playing, on request
    // ("쉐입 디엔에이에 좌측 영상이 보일땐 왼쪽 상단로고 잠시 숨기자").
    // "visible" here just means the section's own scroll range is
    // currently pinning its sticky stage across the viewport.
    const shapeDna = document.getElementById('shapeDna');

    // Crossing the hero seam does two instantaneous things at once: it
    // swaps position absolute ⇄ fixed, and it moves the node between
    // .hero and <body>. The position swap is a jump by definition (the
    // mark's absolute home is ~26px down the HERO, which by then is a
    // screenful above the viewport), and re-inserting the node cancels
    // whatever transition was in flight — so scrolling back up, the mark
    // was visible one frame and simply gone the next
    // ("경계에서 잠시 나왔다가... 너무 훽하고 들어가서"). Fading it down
    // across the swap gives the seam somewhere to hide: nothing is on
    // screen at the moment the jump happens.
    const SEAM_FADE_MS = 240;
    let seamBusy = false;
    let seamTimer = null;
    function crossSeam(toFixed, hiddenNow) {
      clearTimeout(seamTimer);
      seamBusy = true;
      btn.style.transition = `opacity ${SEAM_FADE_MS}ms linear`;
      btn.style.opacity = '0';
      seamTimer = setTimeout(() => {
        // Transition off for the swap itself — the jump must not animate,
        // or the mark slides in from wherever it used to be.
        btn.style.transition = 'none';
        btn.classList.toggle('is-nav-fixed', toFixed);
        setPortaled(toFixed);
        btn.style.transform = toFixed ? (hiddenNow ? `translateY(${HIDE_Y}px)` : '') : '';
        void btn.getBoundingClientRect(); // commit before transitions return
        btn.style.transition = '';
        btn.style.opacity = '';
        seamBusy = false;
      }, SEAM_FADE_MS);
    }

    let lastY = window.scrollY;
    let wasPastHero = lastY >= stayPutBelow;
    // Starts hidden the instant it's already past the hero (e.g. a
    // reload landed mid-page) — the only way IN to nav-fixed territory
    // is by scrolling down out of the hero, so hidden is the correct
    // default there too.
    let hidden = wasPastHero;
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY;
      const scrollingUp = y < lastY - 1;
      const scrollingDown = y > lastY + 1;
      const pastHero = y >= stayPutBelow;
      const modeChanged = pastHero !== wasPastHero;
      if (pastHero && !wasPastHero) {
        // Just crossed the boundary this frame. Crossing only ever
        // happens by scrolling down (scrolling up crosses the same
        // line the other way, pastHero true→false) — but on a slow/
        // gradual scroll the per-frame delta can land under the 1px
        // scrollingDown threshold on the exact frame the boundary is
        // crossed, on request ("전환되면서 로고가 잠시 나왔다가
        // 사라지는 느낌"). Forcing hidden=true HERE, in the same call
        // that flips is-nav-fixed, means there's never a frame where
        // it's fixed (visible at its resting spot) before the
        // direction check catches up.
        hidden = true;
      } else if (pastHero) {
        if (scrollingDown) hidden = true;
        else if (scrollingUp) hidden = false;
        // else: no clear direction this frame — keep whatever hidden
        // already was, rather than defaulting either way.
      }
      wasPastHero = pastHero;
      // .is-nav-fixed (style.css) is what actually switches position
      // absolute→fixed — inside the hero it's plain hero content
      // (scrolls away with the page on its own, no transform needed);
      // only once pinned does the hide-on-down/show-on-up transform
      // below apply at all. setPortaled moves it out of .hero's own
      // stacking context at the same time (see the comment above) —
      // must happen alongside is-nav-fixed, not the CSS class alone,
      // or the escape from .hero's z-index:1 never actually happens.
      if (modeChanged) {
        // The seam owns the swap AND the transform for this crossing —
        // see crossSeam. Writing them here as well would apply the new
        // mode a frame early, which is the pop this exists to remove.
        crossSeam(pastHero, hidden);
      } else if (!seamBusy) {
        btn.classList.toggle('is-nav-fixed', pastHero);
        setPortaled(pastHero);
        btn.style.transform = pastHero ? (hidden ? `translateY(${HIDE_Y}px)` : '') : '';
      }
      lastY = y;

      // Skipped mid-seam: this also writes style.opacity, and clobbering
      // the fade halfway would put the swap back on screen.
      if (shapeDna && !seamBusy) {
        const dr = shapeDna.getBoundingClientRect();
        const dnaVisible = dr.top <= 0 && dr.bottom > 0;
        btn.style.opacity = dnaVisible ? '0' : '';
        btn.style.pointerEvents = dnaVisible ? 'none' : '';
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    function onResize() {
      measureStayPutBelow();
      onScroll();
    }

    // "스르르륵 올라가는" — Lenis's own eased scrollTo where available
    // (the same instance every other smooth-scroll interaction on this
    // page already uses), a plain native smooth-scroll otherwise.
    btn.addEventListener('click', () => {
      if (window.__piltongLenis) {
        window.__piltongLenis.scrollTo(0, { duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // Applies the class/portal/transform state immediately rather than
    // waiting for the first scroll — otherwise a reload that lands
    // already scrolled past the hero would render the button in its
    // stale default (in-hero, non-portaled) position until the reader
    // scrolls at all.
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
  }

  initHeroLogoNav();

  /* ---------- Hero scroll cue: horizontally centred over the equalizer ---------- */

  // On request ("이퀄라이저 가로 기준 중앙에 오는 위치로 바꾸자") —
  // was matched to the equalizer's own right EDGE before; this instead
  // centres the whole cue (label + line) over the equalizer's own
  // horizontal centre. Measured rather than a fixed offset, since the
  // cue's own width depends on the label's rendered glyph width.
  function initScrollCueAlign() {
    const cue = document.querySelector('.scroll-cue');
    const music = document.getElementById('musicToggle');
    if (!cue || !music) return;

    function align() {
      cue.style.marginRight = '0px';
      const cueRect = cue.getBoundingClientRect();
      const musicRect = music.getBoundingClientRect();
      const cueCenter = cueRect.left + cueRect.width / 2;
      const musicCenter = musicRect.left + musicRect.width / 2;
      // Positive delta means the cue's centre sits too far right —
      // margin-right pushes it left within .frame__meta's own
      // justify-content:flex-end.
      const delta = cueCenter - musicCenter;
      cue.style.marginRight = `${delta.toFixed(1)}px`;
    }

    align();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
    window.addEventListener('resize', align, { passive: true });
  }

  initScrollCueAlign();
})();

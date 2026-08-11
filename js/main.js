(() => {
  'use strict';

  const body = document.body;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Function, not a cached const, since viewport width can change mid-session.
  const isCompact = () => window.innerWidth <= 1023;

  // Shape DNA's title sits at a fixed padding-top while its 4-principle
  // block centres on the sticky's full height (style.css) — below this
  // height the two collide. Matches the CSS's own
  // `(max-height: 780px)` addition to the same compact block.
  const DNA_SHORT_H = 780;
  const isDnaCompact = () => isCompact() || window.innerHeight <= DNA_SHORT_H;
  // The symbol diagram's copy column is the tallest content the merged
  // blueprint/color-principle sticky ever centres (~880px at its widest
  // wrap); below this height it clips against the sticky's overflow:hidden.
  const BLUEPRINT_SHORT_H = 920;
  const isBlueprintCompact = () => isCompact() || window.innerHeight <= BLUEPRINT_SHORT_H;
  // Color Story's swatch card is absolutely positioned at a fixed vertical
  // fraction of the sticky (top: 48.25%) rather than truly centred — below
  // this height its top edge clips against the sticky's overflow:hidden
  // before its bottom edge would.
  const COLORSTORY_SHORT_H = 620;
  const isColorStoryCompact = () => isCompact() || window.innerHeight <= COLORSTORY_SHORT_H;
  // The marquee's two stacked text rows (font-size clamps up to 300px each,
  // reached at 2560px width) are the tallest content Why Piltong's two
  // sticky stages ever hold — 600px combined at that width; below this
  // height they clip against the marquee sticky's own overflow:hidden.
  const WHYP_SHORT_H = 650;
  const isWhypCompact = () => isCompact() || window.innerHeight <= WHYP_SHORT_H;
  // .vwipe__word's own zoom is designed to fill/exceed the viewport at any
  // aspect ratio (--vwipe-base already folds in a 24vh term for this) — the
  // real fit constraint is .vwipe__vision's statement cards, only ~215px
  // tall even at their widest. Generous margin since the zoom's JS-driven
  // scale can't be observed directly here.
  const VWIPE_SHORT_H = 400;
  const isVwipeCompact = () => isCompact() || window.innerHeight <= VWIPE_SHORT_H;

  // isCompact() branches (and CSS's max-width:1025px rules) evaluate once at
  // setup, not live on every scroll tick — checking live caused scroll jank.
  // Resizing across the breakpoint mid-session reloads the page instead of
  // re-running each init live. Debounced so a mid-drag resize reloads once
  // it settles, not on every intermediate frame. isDnaCompact()/
  // isBlueprintCompact()/isColorStoryCompact()/isWhypCompact()/
  // isVwipeCompact() get the same treatment, since their height term gates
  // setup-time branches (initBlueprintTransition, initColorStory,
  // initWhyPiltong, initVisionWipe, etc.) just like isCompact() does.
  let lastIsCompact = isCompact();
  let lastIsDnaCompact = isDnaCompact();
  let lastIsBlueprintCompact = isBlueprintCompact();
  let lastIsColorStoryCompact = isColorStoryCompact();
  let lastIsWhypCompact = isWhypCompact();
  let lastIsVwipeCompact = isVwipeCompact();
  let resizeReloadTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeReloadTimer);
    resizeReloadTimer = setTimeout(() => {
      if (isCompact() !== lastIsCompact ||
          isDnaCompact() !== lastIsDnaCompact ||
          isBlueprintCompact() !== lastIsBlueprintCompact ||
          isColorStoryCompact() !== lastIsColorStoryCompact ||
          isWhypCompact() !== lastIsWhypCompact ||
          isVwipeCompact() !== lastIsVwipeCompact) location.reload();
    }, 200);
  }, { passive: true });

  // .brandid__blueprint-stage and .brandid__color-stage are ONE element
  // carrying both class names — the diagram, wordmark, redraw, and Color
  // Principle all run inside a single pinned sticky.
  // These two fractions split that stage's runway into phases. Shared at
  // this scope because three functions must agree on them —
  // initBlueprintTransition (panels), initColorPinball (redraw +
  // handover), and updateColor inside initBrandIdentity (colour steps) —
  // each remaps the raw progress into its own 0-1.
  const BLUEPRINT_END = .4804;  // diagram + wordmark, hold included
  const COLOR_INTRO_END = .6505; // ...then the redraw, then Color Principle

  /* ---------- Custom cursor: a point, plus a scribbled line trailing it ---------- */

  function initCustomCursor() {
    if (prefersReduced) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    // Two elements (dot + tail), not one stretched pill, so the point and
    // stroke stay visually distinct. DOM/SVG, not canvas — a canvas trail's
    // fade leaves faint residue on dark backgrounds; here the tail is
    // redrawn from scratch every frame instead.
    const dot = document.createElement('div');
    dot.className = 'custom-cursor-dot';
    body.appendChild(dot);

    // No viewBox — SVG coordinates map 1:1 to clientX/clientY.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const tailSvg = document.createElementNS(SVG_NS, 'svg');
    tailSvg.setAttribute('class', 'custom-cursor-line');
    // <path>, not <polygon> — straight polygon edges showed faceted corners
    // on tight turns. smoothOutline draws quadratic curves through the same
    // points instead.
    const tailPath = document.createElementNS(SVG_NS, 'path');
    tailSvg.appendChild(tailPath);
    body.appendChild(tailSvg);

    // x/y ease toward tx/ty (the raw pointer target) with a slight lag,
    // which is what gives the tail a path to trail.
    let x = 0, y = 0;
    let tx = 0, ty = 0;
    let started = false;
    // Trail = last TRAIL_LEN eased positions (oldest first), a real
    // recorded path rather than a synthetic curve — so actual zigzags
    // render instead of a fixed smooth bow.
    const TRAIL_LEN = 16;
    let trail = [];

    function setActive(on) {
      dot.classList.toggle('is-active', on);
      tailSvg.classList.toggle('is-active', on);
    }

    // Mirrors the selector list from CSS's cursor:none rule, so new
    // interactive elements don't need updating in two places.
    const HOVER_SELECTOR = 'a, button, [role="button"], input, textarea, select, label';

    function onMove(e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!started) {
        // Snap on first move instead of visibly easing in from 0,0.
        x = tx; y = ty;
        started = true;
        setActive(true);
      }
      // dot/tail have pointer-events:none, so e.target is always the real
      // element underneath — no elementFromPoint call needed.
      const hovering = !!(e.target && e.target.closest && e.target.closest(HOVER_SELECTOR));
      dot.classList.toggle('is-hover', hovering);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', () => setActive(false));
    document.addEventListener('mouseenter', () => {
      if (started) setActive(true);
    });

    // Midpoint smoothing: each curve's control point is the actual recorded
    // point, ending at the midpoint to the next point instead of that point
    // itself — this removes the corner at every vertex except the first and
    // last (kept exact so the tail starts/ends precisely on the dot).
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

      // translate(-50%, -50%) last centers the dot on (x, y) rather than
      // anchoring its top-left corner there.
      dot.style.transform =
        `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;

      trail.push({ x, y });
      if (trail.length > TRAIL_LEN) trail.shift();

      const TAIL_W = 1.2;
      const n = trail.length;
      if (n < 2) {
        tailPath.setAttribute('d', '');
      } else {
        const left = [], right = [];
        for (let i = 0; i < n; i++) {
          const pt = trail[i];
          // Tangent uses neighboring points (not just the next one), so
          // each segment's offset follows the path's local direction
          // instead of one shared angle for the whole ribbon.
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

    // Not scoped to `.hero` — #heroLogo (the "mark" step) can be reparented
    // out of .hero to <body> by the time this timer fires (see
    // initHeroLogoNav's setPortaled), and a scoped selector would then find
    // nothing, leaving it stuck at opacity:0 since this reveal never re-runs.
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
    // The steps' own horizontal scroll container at compact widths — element
    // scroll doesn't bubble to a window 'scroll' event, so it needs its own
    // listener and a horizontal centre test instead of the vertical one below.
    const stepsWrap = sec.querySelector('.acycle__steps');
    if (!steps.length || !grounds.length) return;

    // --acycle-parallax (read by .acycle__ground's transform, see style.css)
    // drifts the pinned ground a little further than the content, so it
    // doesn't read as static against Lenis's inertial scroll elsewhere on
    // the page. Ground is oversized/clipped so the drift never uncovers an edge.
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

    // Compact/horizontal: whichever step's own horizontal centre sits
    // closest to the container's centre is active; no parallax.
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
    // Background-follows-content (initApproachActive) stays on at compact
    // widths since it works the same under touch as wheel. This blur-clear
    // /fade-in on the copy is scroll-driven text motion instead, which is
    // in scope for the standing "no text animation" rule, so it alone skips.
    if (prefersReduced || isCompact()) return;
    const sec = document.getElementById('ourApproach');
    if (!sec) return;
    // Only the intro title and the first step (Essential); the other three
    // steps each get their own reveal (see initApproachReveals below).
    const firstStep = sec.querySelector('.acycle__step');
    const targets = [
      sec.querySelector('.acycle__intro-title'),
      firstStep && firstStep.querySelector('.acycle__word'),
      firstStep && firstStep.querySelector('.acycle__copy'),
    ].filter(Boolean);
    if (!targets.length) return;

    const MAX_BLUR = 10; // px, fully fogged at the bottom of the viewport

    // Continuous and scroll-position-driven, not a one-shot class toggle, so
    // clarity always matches scroll position instead of a flag that can fire
    // early and go stale.
    function update() {
      targets.forEach(el => {
        const top = el.getBoundingClientRect().top;
        // 0 at the bottom edge of the viewport, 1 once risen 65% up the screen.
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
    // Same reasoning as initApproachTextFog above: text motion skips at
    // compact widths, background switch doesn't.
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

    // Last step (Sustainable) gets a smaller span than the rest: with
    // nothing after it, the page runs out of scroll before its copy ever
    // rises far enough to satisfy the same .65 the others use, so it was
    // stalling at partial opacity forever.
    const COPY_SPANS = [.65, .65, .65, .25];
    const COPY_RISE = 36; // px
    const copies = steps.map(s => s.querySelector('.acycle__copy')).filter(Boolean);

    // Splits a word into one span per letter (same technique as
    // initPhilosophyScatter) — transforms are purely visual, so the word's
    // own letter-spacing still governs where each letter rests.
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

    // Narrows the gap after any "a" that isn't the word's first letter
    // (Appropriate's first letter is also an "A" and keeps normal spacing).
    // Letter-spacing on a single-letter span only adds trailing space after
    // that letter.
    function tightenLaterA(letters) {
      letters.forEach(({ span }, i) => {
        if (i === 0) return;
        if (span.textContent.toLowerCase() === 'a') span.style.letterSpacing = '-.15em';
      });
    }

    // Each letter starts scattered at a position/rotation from a
    // deterministic sine sequence keyed by index (not Math.random()), so it
    // plays out the same way on every load.
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

    // Letters start scattered left/right, alternating, and slide together.
    const integratedWord = steps[2] && steps[2].querySelector('.acycle__word');
    const integratedLetters = integratedWord ? splitLetters(integratedWord).map((span, i) => ({
      span,
      sx: (i % 2 === 0 ? -1 : 1) * (48 + (i % 3) * 14),
    })) : [];
    tightenLaterA(integratedLetters);

    // Letters rise in a staggered wave, each a little further behind its
    // neighbour, rather than snapping in as a block.
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
        // .55 (not a higher span) finishes with real margin before the
        // page's max scroll, since there's no scroll room after the last
        // step for a value near 1 to actually resolve — once base>=1, every
        // letter is forced to the same resting values below.
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

    // Appropriate and Sustainable's left-aligned copy indents to line up
    // under the word's 4th letter. A sibling's transform doesn't affect
    // another letter's layout position, so only the target letter's own
    // transform needs clearing before measuring (and restoring after) —
    // it normally sits mid-animation, not at its resting position.
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

    // CSS sets where the photo rests (.statement__figure's margin-top). This
    // only adds a temporary offset on top of that rest position, easing in
    // then drifting slightly further as the section passes.
    //
    // Must not be applied to .statement__figure — it carries .reveal, and an
    // inline transform would fight that entrance.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const lerp = (a, b, t) => a + (b - a) * t;

    // Both as a fraction of the frame's own height, so they scale with
    // however large the 60vw photo happens to be.
    const ENTRY_RISE = 0.16; // how far below rest it starts — "positioned at the bottom"
    const SETTLE_RISE = 0.03; // a small continued rise once past centre, so it keeps a little life

    let ticking = false;
    // The transform is on the element being measured, so its own offset is
    // inside every rect read back. Subtracting `applied` recovers the actual
    // laid-out position — without this the output feeds its own input and
    // the motion compounds instead of tracking scroll.
    let applied = 0;

    function update() {
      ticking = false;
      const r = media.getBoundingClientRect();
      const top = r.top - applied;
      // -1 a screen below the fold, 0 crossing the middle, +1 a screen above.
      const span = window.innerHeight + r.height;
      const raw = ((window.innerHeight - top) / span) * 2 - 1;
      const p = Math.max(-1, Math.min(1, raw));

      // Squared easing on both legs so it reads as settling, not sliding at
      // a constant rate.
      const entry = seg(p, -1, 0); const entryEased = entry * entry;
      const past = seg(p, 0, 1); const pastEased = past * past;
      const down = lerp(ENTRY_RISE, 0, entryEased);
      const extraRise = lerp(0, SETTLE_RISE, pastEased);
      const y = (down - extraRise) * r.height;

      applied = y;
      media.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    }

    // rAF rather than the timeout the other watchers use — this one moves
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

  /* ---------- Statement: compact-only layout.
     Copy's left edge tracks the video's right edge + gap, not PHILO/SOPHY's
     left edge. Title is pulled left via transform so PHILO/SOPHY's line
     lands on the same edge as the copy, measured as a delta off PHILO's
     current untransformed position (same approach as alignIntroWord).
     Switches to a stacked .is-copy-below layout (video shrinks to a fixed,
     centered 280px; copy sits below) when the copy would wrap past the
     video's bottom edge — driven by actual wrapped content height each
     resize, not a fixed breakpoint.
     .statement__stage's height is set explicitly since .statement__body is
     position:absolute and doesn't contribute to flow height. ---------- */
  function initStatementCopyAlign() {
    const stage = document.querySelector('.statement__stage');
    const copy = document.querySelector('.statement__body');
    const big = document.querySelector('.statement__big');
    const lines = [...document.querySelectorAll('.statement__line')];
    const philo = lines[1];
    const fig = document.querySelector('.statement__figure');
    if (!stage || !copy || !big || !philo || !fig || lines.length < 2) return;
    const GAP = 44;
    const BELOW_OVERLAP = -14;
    const TITLE_GAP = 32;

    function resetToBeside() {
      stage.classList.remove('is-copy-below');
      lines.forEach(l => { l.style.display = ''; });
      big.style.position = '';
      big.style.left = '';
      big.style.top = '';
      copy.style.top = '';
    }

    function align() {
      if (!isCompact()) {
        resetToBeside();
        copy.style.left = '';
        big.style.transform = '';
        fig.style.marginTop = '';
        fig.style.width = '';
        fig.style.maxWidth = '';
        fig.style.marginLeft = '';
        fig.style.marginRight = '';
        stage.style.minHeight = '';
        return;
      }
      // Reset to "beside" layout before measuring, or a call that landed in
      // "below" mode last time would measure its own below-mode state.
      resetToBeside();
      big.style.transform = '';
      fig.style.width = '';
      fig.style.maxWidth = '';
      fig.style.marginLeft = '';
      fig.style.marginRight = '';
      const stageRect = stage.getBoundingClientRect();
      const philoRect = philo.getBoundingClientRect();
      const philoMid = (philoRect.top + philoRect.height / 2) - stageRect.top;
      fig.style.marginTop = Math.max(0, philoMid).toFixed(1) + 'px';
      // offsetTop/offsetHeight, not getBoundingClientRect() — the figure
      // carries .reveal's scroll-triggered translateY, which this can run
      // (on load, on fonts.ready) before that transform settles to identity.
      // offset* reflects layout position only, unaffected by the transform.
      const figRect = fig.getBoundingClientRect();
      const figBottom = fig.offsetTop + fig.offsetHeight;
      const besideLeft = (figRect.right - stageRect.left) + GAP;
      copy.style.left = besideLeft.toFixed(1) + 'px';
      const besideBottom = copy.getBoundingClientRect().bottom - stageRect.top;

      if (besideBottom <= figBottom) {
        // ---- Beside layout stands. ----
        const philoLeft = philoRect.left - stageRect.left;
        big.style.transform = `translateX(${(besideLeft - philoLeft).toFixed(1)}px)`;
        stage.style.minHeight = Math.max(figBottom, besideBottom).toFixed(1) + 'px';
        return;
      }

      // ---- Switch to the stacked "below" layout. ----
      // Line display is CSS's job now (.statement__stage.is-copy-below
      // .statement__line rules) — not set here, so it isn't overwritten by
      // an inline style beating that CSS out.
      stage.classList.add('is-copy-below');
      big.style.position = 'absolute';
      big.style.left = '50%';
      big.style.top = '0px';
      big.style.transform = 'translateX(-50%)';
      // Re-measured, not the stageRect captured above — adding is-copy-below
      // just changed .statement's own padding-top (see the :has() rule in
      // style.css), shifting stage's viewport position.
      const stageRectBelow = stage.getBoundingClientRect();
      const titleBottom = big.getBoundingClientRect().bottom - stageRectBelow.top;
      fig.style.width = '280px';
      fig.style.maxWidth = '280px';
      fig.style.marginLeft = 'auto';
      fig.style.marginRight = 'auto';
      fig.style.marginTop = (titleBottom + TITLE_GAP).toFixed(1) + 'px';
      const figBottomBelow = fig.offsetTop + fig.offsetHeight;
      // fig.offsetLeft (video is centered, not flush left) plus TITLE_GAP,
      // so the copy's left inset echoes the gap already above the video.
      copy.style.left = (fig.offsetLeft + TITLE_GAP) + 'px';
      copy.style.top = (figBottomBelow + BELOW_OVERLAP).toFixed(1) + 'px';
      const copyBottomBelow = copy.getBoundingClientRect().bottom - stageRectBelow.top;
      stage.style.minHeight = Math.max(figBottomBelow, copyBottomBelow).toFixed(1) + 'px';
    }

    align();
    window.addEventListener('resize', align, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(align);
    }
  }

  initStatementCopyAlign();

  /* ---------- Statement: OUR / PHILO / SOPHY spills in letter by letter ---------- */

  function initPhilosophyScatter() {
    const word = document.getElementById('philosophyWord');
    if (!word) return;
    const lines = Array.from(word.querySelectorAll('.statement__line'));
    if (!lines.length) return;
    const koreans = Array.from(
      document.querySelectorAll('.statement__korean-in')
    );

    // Reduced motion: leave words static/visible, no DOM rebuild. Korean
    // paragraphs default to opacity:0 in CSS, so they still need is-in
    // added here even when the English split is skipped, or they'd stay
    // permanently invisible.
    if (prefersReduced || isCompact()) {
      koreans.forEach(el => el.classList.add('is-in'));
      return;
    }

    // Rebuilds each line's text as individual letter spans, each carrying a
    // scattered starting transform (--sx/--sy/--sr/--sscale) so the word
    // assembles itself one letter at a time.
    //
    // Every letter shares one direction (up-right, from the hero's
    // lower-right corner); only magnitude/rotation vary per letter via sine
    // waves keyed to index (not Math.random()), so a reload always pours
    // the same way.
    //
    // Sized off the viewport, not a fixed px figure, so distance travelled
    // reads the same proportionally on phone and desktop.
    const baseDX = window.innerWidth * 0.30;
    const baseDY = window.innerHeight * 0.30;
    // OUR/PHILO/SOPHY sit at different indents, so a single shared --sx
    // pushed letters near the right edge past the viewport (measured
    // scrollWidth overflow of 300px+). Each letter is measured after being
    // appended with no offset, and its own sx clamped to the room actually
    // left before the edge.
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
      // .75-1.15x of the base distance, spread without cancelling direction.
      const mag = 0.75 + Math.abs(Math.sin(a * 0.6)) * 0.4;
      const desiredSx = baseDX * mag;
      const maxSx = Math.max(0, window.innerWidth - SAFE_MARGIN - rect.right);
      const sx = Math.min(desiredSx, maxSx);
      const sy = -baseDY * (0.8 + Math.abs(Math.cos(a * 0.8)) * 0.4);
      // Base (32) > amplitude (26) so rotation stays mostly one sign, with
      // occasional odd-letter reversal.
      const sr = 32 + Math.sin(a) * 26;
      const sscale = 0.5 + Math.abs(Math.sin(a * 0.6)) * 0.25;
      span.style.setProperty('--sx', sx.toFixed(1) + 'px');
      span.style.setProperty('--sy', sy.toFixed(1) + 'px');
      span.style.setProperty('--sr', sr.toFixed(1) + 'deg');
      span.style.setProperty('--sscale', sscale.toFixed(2));
      count++;
    });

    // Two-way, not one-shot: scrolling back up past the section resets
    // letters to scattered start so scrolling down pours them in again. The
    // two thresholds are deliberately different (enter at 85% down the
    // viewport, exit only once fully below) so the pour doesn't re-trigger
    // on small scroll wobble at the boundary.
    // POUR_STAGGER_MS/POUR_DURATION_MS must match .scatter-letter's CSS —
    // no single shared source, keep in sync by hand if either changes.
    const POUR_STAGGER_MS = 62;
    const POUR_DURATION_MS = 1300;
    const POUR_TOTAL_MS = (letters.length - 1) * POUR_STAGGER_MS + POUR_DURATION_MS;
    // Korean starts once most (70%) of the English pour has visibly
    // settled, rather than waiting for the very last letter.
    const KOREAN_START_FRACTION = .7;
    const KOREAN_GAP_MS = 50;
    const KOREAN_STAGGER_MS = 150;
    let shown = false;
    // Tracks the delayed-Korean-reveal timeouts so reset() can cancel them
    // — otherwise scrolling away before they fire would still reveal them
    // later, on a section that has already reset.
    let laterTimers = [];

    function pour() {
      shown = true;
      letters.forEach((span, i) => {
        span.style.transitionDelay = `${i * POUR_STAGGER_MS}ms`;
        span.classList.add('is-in');
      });
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
      // No delay on the way out — vanish promptly, don't replay the settle
      // animation backwards.
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
    // isCompact() is checked here too, not just relied on implicitly: even
    // though pinState() would naturally report unpinned once .statement__col
    // isn't sticky (getComputedStyle(col).top is NaN on a static element),
    // line 1 would still get its initial measure()+render(0) — the pre-press
    // right-aligned entrance position — and that never self-corrects since
    // setTarget(0) is a no-op when target is already 0.
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

    // .statement__tilt carries the tilt, not #statementMedia — that inner
    // element already has its own JS-driven parallax transform
    // (initStatementParallax), which a per-frame tilt write would clobber.
    // Not .statement__figure either — that element's overflow:hidden acts
    // as a clip mask around the tilt, which only works if figure itself
    // never rotates.
    //
    // Everything below is driven off one shared `current` value (0 =
    // released, 1 = pressed) inside a single render(p) call, not a CSS
    // transition on either side — a 3D rotateY's on-screen motion under
    // perspective isn't linear with angle the way 2D margin/left is, so two
    // separately-timed transitions would drift out of step.
    //
    // Rest values are measured from computed style, not hardcoded, so this
    // stays correct if the CSS clamp()s/offsets above change.
    let restLine2 = 0, restLine3 = 0, restDetail = 0, restBodyLeft = 0, pressedBodyLeft = 0, line1PressShift = 0;
    // One-way latch: line 1 reads right-aligned only before it has ever
    // pinned; once pinned, every release afterward leaves it flush left.
    let line1Locked = false;
    // render() writes these same properties as inline styles, so measure()
    // clears the inline override before reading, or a later call (on
    // resize) would read back its own previous value instead of the true
    // CSS rest position.
    function measure() {
      if (line2) { line2.style.marginLeft = ''; restLine2 = parseFloat(getComputedStyle(line2).marginLeft) || 0; }
      if (line3) { line3.style.marginLeft = ''; restLine3 = parseFloat(getComputedStyle(line3).marginLeft) || 0; }
      if (detail) { detail.style.marginLeft = ''; restDetail = parseFloat(getComputedStyle(detail).marginLeft) || 0; }
      if (line1 && lead) {
        // A Range over everything but the trailing period gives that
        // character's real ink edge — the period sits noticeably further
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
        // Reads .statement__big's computed margin-left (which already
        // resolves to the pressed target) instead of the custom property
        // directly — getPropertyValue on a custom property returns its
        // literal authored text (e.g. "clamp(20px, 2.6vw, 48px)"), not the
        // resolved px number.
        const big = document.querySelector('.statement__big');
        pressedBodyLeft = big ? (parseFloat(getComputedStyle(big).marginLeft) || 0) : 0;
      }
    }

    function render(p) {
      tilt.style.transformOrigin = '0% 10%';
      tilt.style.transform = `perspective(1000px) rotateY(${(9 * p).toFixed(3)}deg)`;
      // Blur proportional to p softens the rotated layer's own diagonal
      // top/bottom edges (a staircase artifact a clip mask can't crop,
      // since it's inside the box, not overflowing it).
      tilt.style.filter = p > .001 ? `blur(${(p * .6).toFixed(2)}px)` : 'none';
      if (line2) line2.style.marginLeft = `${(restLine2 * (1 - p)).toFixed(2)}px`;
      if (line3) line3.style.marginLeft = `${(restLine3 * (1 - p)).toFixed(2)}px`;
      if (detail) detail.style.marginLeft = `${(restDetail * (1 - p)).toFixed(2)}px`;
      if (body) body.style.left = `${(restBodyLeft + (pressedBodyLeft - restBodyLeft) * p).toFixed(2)}px`;
      // Opposite direction AND a one-way latch, unlike everything else
      // once line1Locked (set in step() below), line 1 stays flush left
      // through every release/re-approach rather than reverting.
      if (line1) {
        const line1P = line1Locked ? 1 : p;
        line1.style.transform = `translateX(${(line1PressShift * (1 - line1P)).toFixed(2)}px)`;
      }
    }

    // A stuck sticky element's rect.top holds exactly at its CSS `top` for
    // as long as it's pinned, so "currently pinned" is just "close to that
    // value right now", checked continuously.
    //
    // stickyTopPx is read fresh every call, not cached — .statement__col's
    // `top` is 10vh-based, so it changes whenever viewport height does
    // (e.g. toggling fullscreen).
    let current = 0;
    let target = 0;
    let rafId = null;
    const DURATION = 550; // ms for a full 0->1 (or 1->0) sweep

    // Reports pinned state plus which side of the pin point (top >
    // stickyTopPx = still approaching; top < stickyTopPx = already
    // released) — update() below needs this distinction, not just a bare
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
        // Locks only once the pin animation actually finishes (target ===
        // 1), not merely when requested.
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
      // Only resets the latch when genuinely before the pin point (not yet
      // pinned) — a release that continues forward, past the pin point,
      // leaves it untouched on purpose.
      if (state.before && line1Locked) {
        line1Locked = false;
        // setTarget below only re-renders when `target` changes, and target
        // is already 0 here either way — an explicit render is needed or
        // the DOM would keep showing flush left until some later change.
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
    // Checked before setup/listener attachment, not live inside update() —
    // a scroll listener that only ever bails still costs a rAF callback and
    // a full getBoundingClientRect/update pass every scroll tick, which
    // compounds across every section's listener into janky scrolling.
    if (isVwipeCompact()) return;
    const vsteps = Array.from(sec.querySelectorAll('.vwipe__vstep'));
    // The released statement column, faded out below as VISION grows in, so
    // it doesn't sit fully opaque over the blank paper while the word is
    // still small.
    const statementCol = document.querySelector('.statement__col');

    // Reduced motion still needs the ground to change, or section 03
    // arrives on a photograph the page never introduced. Settles on the
    // last vision statement (CSS default) since there's no scroll motion
    // here to reach the other two.
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
    // Captured once, before the per-frame writes below touch
    // word.style.fontSize — reading it live later would feed the fade
    // calculation whatever size the word is mid-zoom instead of its true
    // peak, breaking pOverflow.
    const basePeakFontPx = parseFloat(getComputedStyle(word).fontSize) || 0;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    // Progress across one leg of the sequence, clamped at both ends.
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const lerp = (a, b, t) => a + (b - a) * t;
    // HOLD+FADE reach past half the 1.0 spacing between steps — both
    // partially visible and blurred at once is what reads as a double
    // exposure rather than a plain sequential fade.
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
      // EARLY_START pulls the sequence's start point down the page — p
      // starts advancing while the section is still this far below the
      // viewport top, instead of only once fully pinned. Endpoint (p=1) is
      // untouched since span grows by the same amount.
      const EARLY_START = window.innerHeight * 0.45;
      const span = runway + EARLY_START;
      const p = span <= 0 ? 0 : clamp01((EARLY_START - r.top) / span);
      // The section's raw 0-1 progress covers two phases: the zoom and the
      // vision cycle that follows. zoomP reproduces p's behaviour within
      // the first zoomFraction of scroll, clamped to 1 for the remainder.
      const zoomP = clamp01(p / zoomFraction);

      // ENTRY_END splits the zoom into two legs, both over zoomP's [0,1]
      // range: before it, the word grows from 0 to .86 of peak (hidden at
      // the section's bottom); after it, the .86->peak zoom, fade-out, and
      // ground transition follow the same .82/.68/.86/.10/.40 breakpoints,
      // meeting the first leg at exactly .86 with no seam jump.
      const ENTRY_END = .12;
      // Faded out over the same window VISION grows through, so the two
      // overlap instead of one sitting static while the other is still tiny.
      if (statementCol) {
        statementCol.style.opacity = (1 - seg(zoomP, 0, ENTRY_END)).toFixed(3);
      }
      // 55, not 30: the word is centred via flex at 50%, so a 30svh offset
      // only pushes its centre to 80% down the viewport. 55 puts it at
      // 105%, genuinely below the browser's bottom edge at the very start.
      const y = lerp(55, 0, seg(zoomP, 0, ENTRY_END));
      // Squared so it creeps then rushes, rather than a mechanical linear
      // push. Used for both legs so growth character doesn't change at the seam.
      const entryEased = seg(zoomP, 0, ENTRY_END) ** 2;
      const z = seg(zoomP, ENTRY_END, .82);
      const eased = z * z;
      const effectiveSize = zoomP < ENTRY_END
        ? lerp(0, .86, entryEased)
        : lerp(.86, peak, eased);
      // Applied to font-size directly, not transform:scale() — scaling a
      // huge pre-rasterised layer down is the extreme-minification case
      // GPUs blur; setting font-size rasterises fresh glyphs at every size.
      const s = effectiveSize / peak;
      // Fade-out point solved from the word's own geometry: finds the scale
      // at which the word's ink first reaches the viewport height (starts
      // clipping top/bottom) and maps it back to a p via the zoom's easing.
      // INK_RATIO: line-height:1 makes the box exactly fontSize tall, but
      // "VISION" in Outfit only paints .708 of that (measured). Falls back
      // to fading at peak (p=.82) if it never grows taller than the
      // viewport (portrait/narrow screens).
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
      // initContrastSwitchers) in step with the same crossfade the ground
      // uses, rather than a static flag flipping the instant the section's
      // DOM bounds are entered.
      sec.dataset.eqBg = toOpacity > .5 ? 'dark' : 'light';

      // Phase 2: three vision statements cross-blur in the same centred
      // spot the word just vacated — but only once it has actually vacated
      // it. wordGoneAt maps pOverflow+FADE_SPAN back to the section's raw p.
      //
      // cycleP must stay UNCLAMPED for computing distance (dist), so it
      // keeps growing negative the earlier p is, correctly pushing step 0's
      // distance past HOLD+FADE. Clamping cycleP before use pins vp at 0
      // for the whole zoom phase, which puts step 0's distance at 0 too
      // early and bleeds it into visibility while the word is still fully
      // opaque. enterGate clamps only what gets multiplied into vp, gating
      // step 0 alone — steps 1/2 don't need it since their distance from
      // vp=0 is already past HOLD+FADE on its own.
      const wordGoneAt = clamp01(pOverflow + FADE_SPAN) * zoomFraction;
      const cycleP = (p - wordGoneAt) / Math.max(0.0001, 1 - wordGoneAt);
      // Quick ramp, not a hard switch, so step 0 fades in over a short span
      // instead of popping in or bleeding back into the still-visible word.
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
    // Two adjacent steps' presence windows overlap whenever combined reach
    // (HOLD+FADE, doubled) exceeds their 1.0 spacing — 2*(.16+.5) = 1.32
    // here, deliberately: that overlap (both partially visible/blurred at
    // once) produces a double-exposure "ghost" moment instead of a plain
    // sequential fade.
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
    // wrong for compact: the marquee is a plain CSS animation and reads
    // fine keeping its motion on touch, only the two scroll-driven pins
    // (marquee mark rise, copy cross-fade) need to go. .whyp--compact
    // leaves the row animations untouched, unpins both stages into normal
    // flow, and exposes .whyp__media in place instead of leaving it parked
    // 90vh below the fold at its pre-scroll rest position.
    if (isWhypCompact()) {
      sec.classList.add('whyp--compact');
      if (mediaVideo) mediaVideo.play().catch(() => {});
      return;
    }

    // No JS-driven animation-delay reassignment on the marquee — doing that
    // to an already-running CSS animation can make a browser visibly
    // re-trigger or jump it. Left as a plain CSS `animation: ... infinite`
    // (whypMarqueeL/R in style.css) instead.

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const seg = (t, a, b) => clamp01((t - a) / (b - a));

    // The mark's rise/scale-in window as a fraction of the marquee stage's
    // runway, taking up most of it for a slow, deliberate rise. Because
    // seg()/smoothstep() are pure functions of current scroll position
    // (not time, not direction), scrolling back up reverses at the same pace.
    const MEDIA_START = .1;
    const MEDIA_END = .8;
    const MAX_MARQUEE_BLUR = 14;
    // No scripted exit — video stays fully risen for the rest of the
    // runway after MEDIA_END, and the section's sticky pin releases
    // naturally once its bottom scrolls past.
    // Smoothstep (3t^2 - 2t^3), not the raw linear seg() value, eases in
    // from a standing start and out at the end instead of constant speed.
    const smoothstep = t => t * t * (3 - 2 * t);

    // Non-keyword beats use blur/opacity cross-blur; the keywords beat uses
    // a separate sequenced scatter/gather entrance that never used blur.
    const HOLD = .18;
    const FADE = .55;
    const MAX_COPY_BLUR = 16;
    // Keywords' HOLD/HALF split: each beat holds fully clear for HOLD units
    // either side of its slot, and the remaining gap to its neighbour
    // splits in half between exiting/entering.
    const KW_HOLD = .18;
    const KW_HALF = (1 - 2 * KW_HOLD) / 2;
    // A neighbouring beat's HOLD+FADE reach (.18+.55=.73) runs past where
    // the keywords beat starts revealing on its side (KW_HOLD+KW_HALF=.5),
    // so both would be live and legible at once. Only the two beats
    // adjacent to keywords get this narrower fade.
    const FADE_NEAR_KEYWORDS = (KW_HOLD + KW_HALF) - HOLD;
    const keywordsIndex = steps.findIndex(s => s.classList.contains('whyp__keywords'));
    // .whyp__copy-bg's fade-out: held through every beat, out over the
    // last 12% so it's gone before the section releases into Brand wall.
    const BG_WHY_OUT = .88;

    // Four scatter vectors for the keyword beat, scaled off viewport (not
    // fixed px), large enough to start past the viewport edge for an
    // actual burst-into-frame arrival rather than a gather from off-centre.
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
        const mediaP = smoothstep(seg(p, MEDIA_START, MEDIA_END));
        if (media) {
          // translateY only, no opacity fade — it's fully hidden below the
          // viewport at rest (matching 90vh in style.css), so the rise
          // alone reveals it.
          media.style.transform = `translate(-50%, -50%) translateY(${lerp(90, 0, mediaP).toFixed(2)}vh)`;
        }
        const blur = (mediaP * MAX_MARQUEE_BLUR).toFixed(2);
        if (solidRow) solidRow.style.filter = `blur(${blur}px)`;
        if (outlineRow) outlineRow.style.filter = `blur(${blur}px)`;

        // videoPlaying guards against calling play()/pause() every scroll
        // frame — harmless but wasteful, and repeated play() calls can log
        // "interrupted by a new load request" warnings.
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
          // preEntry covers the section's scroll-up arrival: 0 when it
          // first touches the viewport bottom edge, 1 when its top reaches
          // the viewport top (where pRaw picks up and the pin engages).
          // Fading in against this, not pRaw, makes the backdrop feel
          // already-arriving instead of popping in once fully pinned.
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
            // No clip-path frame — it would clip to this element's own
            // box, chopping off the scattered words as they move past its
            // edges. Opacity + blur (same MAX_COPY_BLUR as other beats)
            // show/hide it; the scatter transform is the entrance itself.
            step.style.opacity = reveal.toFixed(3);
            step.style.filter = `blur(${((1 - reveal) * MAX_COPY_BLUR).toFixed(2)}px)`;
            step.style.clipPath = 'none';
            // Reuses `reveal` for the gather too, so words arrive exactly
            // as their beat becomes legible.
            keywords.forEach((kw, k) => {
              const off = KEYWORD_OFFSETS[k % KEYWORD_OFFSETS.length];
              const spread = 1 - reveal;
              const tx = off.x * window.innerWidth * spread;
              const ty = off.y * window.innerHeight * spread;
              const rot = off.r * spread;
              kw.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
            });
          } else {
            // Narrower fade for beats adjacent to the keywords step (see
            // FADE_NEAR_KEYWORDS) so it's fully gone by the point keywords
            // starts revealing, instead of faintly visible during the scatter.
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
    // Checked independently below, each against the video's actual
    // rendered box — they sit at different margins from their own corner
    // (equalizer: 9px; hero logo: 20-28px), so a single shared
    // covered/uncovered value doesn't hold for both at once.
    const eqTarget = document.getElementById('musicToggle');
    const navLogoTarget = document.getElementById('heroLogo');
    // isCompact() reuses the same reduced-motion fallback below (style.css)
    // — both want the identical end state (glyphs fully in, bg at rest
    // scale, solid fill behind it since nothing scrolls it to cover the
    // section).
    if (!sec || !bg || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);

    // p: 0 when the section's top first touches the viewport bottom edge,
    // 1 once it reaches the top.
    const RISE_START = 8;  // vh below rest, at p = 0
    const RISE_END = -2;   // vh past rest, at p = 1 — slight overshoot so
                            // it's still gently drifting as scroll runs out.
    const SCALE_START = .45;  // small, at p = 0
    const SCALE_END = 1;      // full size, at p = 1

    // Left late: smoothstep(.7) is already .784 of the way from
    // SCALE_START to SCALE_END, so the background reads as "mostly
    // arrived" before the logo starts.
    const LOGO_IN = .7;
    // Staggered starts (7 * .02 = .14 of runway) each spanning .16 — glyph
    // 0 finishes at .7+.16=.86, glyph 7 finishes exactly at p=1. Driven
    // directly by p, not a class-toggled keyframe animation, so scrolling
    // back up is exactly this same formula at a lower p.
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
      sec.style.setProperty('--brandwall-scrim', '1');
      glyphs.forEach(g => {
        const gi = parseFloat(g.style.getPropertyValue('--i')) || 0;
        const start = LOGO_IN + gi * LOGO_STAGGER;
        const ge = smoothstep(clamp01((p - start) / LOGO_SPAN));
        g.style.opacity = ge.toFixed(3);
        g.style.transform = `translateY(${lerp(9, 0, ge).toFixed(2)}px)`;
      });

      // Checked against the video's actual rendered box (not a guessed
      // scale threshold), and separately per target (data-eq-bg-equalizer /
      // data-eq-bg-logo) — the equalizer and hero logo uncover at different
      // points since they sit at different margins from their own corner.
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
    // BRAND/IDENTITY's per-letter scatter-pour entrance — same feel as
    // OUR PHILOSOPHY's initPhilosophyScatter, but driven continuously off
    // preEntry instead of a scroll-threshold + CSS transition, so it stays
    // reversible by construction.
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
            // Already its own span (the T kerning span) — keep it, just
            // add the scatter class.
            node.classList.add('brandid__intro-letter');
            rebuilt.push(node);
          }
        });
        line.replaceChildren(...rebuilt);
        introLetters.push(...rebuilt);
      });
      // E, N, the second T, and Y paint in front of the photo instead of
      // behind it, unlike the rest of IDENTITY ("D" included).
      introIdentityLine = lines[1];
      if (introIdentityLine) {
        [2, 3, 6, 7].forEach(i => { // E(2), N(3), kern-T(6), Y(7)
          const el = introIdentityLine.children[i];
          if (el) el.classList.add('brandid__intro-letter--front');
        });
      }
    })();
    // Scatter vectors depend on viewport size and each letter's rendered
    // rect, so this is split out from DOM setup to re-run on resize (same
    // debounced pattern as alignIntroWord/measurePhotoScale below).
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
        // IDENTITY starts below its resting spot and rises into place;
        // VISUAL keeps the original up-and-right tumble (negative sy).
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

    // VISUAL/IDENTITY's horizontal placement measured off real rendered
    // rects, not a fixed px offset — the word's font-size is a vw-based
    // clamp, so a tuned-at-one-width offset drifts at any other width.
    function alignIntroWord() {
      const identityLine = sec.querySelector('.brandid__intro-index-line--identity');
      const brandLine = sec.querySelector('.brandid__intro-index-line--brand');
      const photoEl = sec.querySelector('.brandid__intro-photo');
      if (!identityLine || !brandLine || !photoEl) return;
      // This alignment only means anything against the desktop layout.
      // updateIntro already skips the rest of this section's motion at
      // compact widths, but this one isn't scroll-driven (it's a
      // load/resize measurement) so it needs its own gate. Clearing back
      // to '' lets the CSS margin-left: 0 default hold instead.
      if (isCompact()) {
        identityLine.style.marginLeft = '';
        brandLine.style.marginLeft = '';
        return;
      }
      const dEl = identityLine.children[1]; // I(0) D(1)
      const eEl = identityLine.children[2]; // E(2)
      const vEl = brandLine.children[0]; // V(0)
      if (!dEl || !eEl || !vEl) return;

      // D/E/V and the photo all carry their own JS-driven transforms
      // (scatter-pour, scale/slide), which getBoundingClientRect measures
      // straight through — neutralised for this one pass and restored
      // after, so this only ever reads true, untransformed layout positions.
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

      // VISUAL: re-measured after the identity shift above, since moving
      // IDENTITY also moves where "E" sits.
      const eRect = eEl.getBoundingClientRect();
      const vRect = vEl.getBoundingClientRect();
      const brandML = parseFloat(getComputedStyle(brandLine).marginLeft) || 0;
      brandLine.style.marginLeft = (brandML + (eRect.left - vRect.left)).toFixed(1) + 'px';

      affected.forEach((el, i) => { el.style.transform = savedTransforms[i]; });
    }
    alignIntroWord();
    // If the Outfit webfont hasn't finished loading yet, this first call
    // measures against the fallback stack's glyph widths. document.fonts
    // .ready re-measures once the real font is in and "D"/"E"/"V" resize.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { alignIntroWord(); });
    }
    let alignIntroWordResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(alignIntroWordResizeTimer);
      alignIntroWordResizeTimer = setTimeout(alignIntroWord, 120);
    }, { passive: true });

    // ENTRY_SPAN_MULT stretches preEntry's denominator past a flat one
    // screen; everything below (letters, photo, row) is a window within
    // this same extended 0-1 preEntry, no pinning.
    const ENTRY_SPAN_MULT = 2.6;
    const INTRO_POUR_START = 0, INTRO_POUR_END = .5, INTRO_POUR_DURATION = .22;
    const introStagger = introLetters.length > 1
      ? (INTRO_POUR_END - INTRO_POUR_START - INTRO_POUR_DURATION) / (introLetters.length - 1)
      : 0;

    const introRowReveals = Array.from(sec.querySelectorAll('.brandid__intro-row .brandid__reveal'));
    const introPhotoEl = sec.querySelector('.brandid__intro-photo');
    const introStackEl = sec.querySelector('.brandid__intro-stack');
    // Timed to finish (photoT reaching 1) while .brandid__intro-head is
    // still on screen, so the stack-gap close that rides on photoT isn't
    // finishing entirely off-screen.
    const PHOTO_START = 0.48, PHOTO_END = 0.70;
    // How much bigger than resting width, and how much further down than
    // resting spot, the photo starts — measured off real viewport/element
    // size. Re-measured on resize below.
    let photoScaleStart = 1;
    let photoSlideDistance = 0;
    // The wide gap under the title (.brandid__intro-stack in style.css) is
    // only the starting point; it closes to the old tucked-under overlap
    // as the photo shrinks into place. Mirrors that CSS rule's clamp() by
    // hand (not getComputedStyle) so start/end track viewport width the
    // same way the CSS default does.
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
      // rect.width (resting, max-width:1200px) is already close to
      // innerWidth on narrower desktop widths, so a fixed side margin alone
      // can undershoot it and invert the animation (start smaller than
      // rest). The 1.05 floor guarantees a start always a little bigger
      // than rest.
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
      // .brandid__intro-letter and .brandid__reveal both default to
      // opacity:0 with everything else JS-driven, so at compact widths
      // (where this is skipped) style.css's max-width:1024px block forces
      // them visible directly, or this section would stay permanently blank.
      if (isCompact()) return;
      const r = sec.getBoundingClientRect();
      // Anchored to when the section actually starts entering the viewport
      // (r.top === innerHeight), not a point ENTRY_SPAN_MULT screens early
      // — otherwise stretching MULT past 1 pushes proportionally more of
      // the 0-1 timeline into screens before the section is even visible.
      const preEntry = clamp01((window.innerHeight - r.top) / (window.innerHeight * (ENTRY_SPAN_MULT - 1)));
      introLetters.forEach((span, i) => {
        const start = INTRO_POUR_START + i * introStagger;
        const t = smoothstep(seg(preEntry, start, start + INTRO_POUR_DURATION));
        span.style.opacity = t.toFixed(3);
        const sx = parseFloat(span.dataset.sx), sy = parseFloat(span.dataset.sy);
        const sr = parseFloat(span.dataset.sr), sscale = parseFloat(span.dataset.sscale);
        span.style.transform = `translate(${lerp(sx, 0, t).toFixed(1)}px, ${lerp(sy, 0, t).toFixed(1)}px) rotate(${lerp(sr, 0, t).toFixed(1)}deg) scale(${lerp(sscale, 1, t).toFixed(3)})`;
      });
      // Photo: no fade, just scales/slides from bigger-and-lower into its
      // resting card size/spot, over the stretched preEntry timeline.
      if (introPhotoEl) {
        const photoT = smoothstep(seg(preEntry, PHOTO_START, PHOTO_END));
        const scale = lerp(photoScaleStart, 1, photoT);
        const ty = lerp(photoSlideDistance, 0, photoT);
        introPhotoEl.style.transform = `translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
        if (introStackEl) {
          introStackEl.style.marginTop = lerp(stackGapStart, stackGapEnd, photoT).toFixed(2) + 'px';
        }
      }
      // Korean group (title, then each body paragraph) comes in last, once
      // the photo has essentially arrived, as a small cascade.
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
    // Same small-to-full scale initBrandWall's bg uses on entrance, tuned
    // down since this is a secondary detail section. .brandid__dna-media
    // has overflow:hidden, so the box itself never moves, only what's
    // rendered inside it zooms.
    const DNA_SCALE_START = .62;
    const DNA_SCALE_END = 1;
    // 1 (not DNA_SCALE_START) is the compact/idle default — compact never
    // runs the zoom at all.
    let dnaVideoScale = 1;
    // Top padding animates from the same value .brandid__intro's own top
    // padding resolves to (computed here since it drives an inline style,
    // not read from CSS) down to a resting 60px, matching the permanent
    // 60px left/bottom inset below.
    const DNA_MEDIA_PAD_REST = 60;
    function dnaPadMax() {
      return Math.min(360, Math.max(160, window.innerWidth * .22));
    }
    // SHAPE/DNA and the title each slide in from hidden behind the video's
    // left edge, opacity 0 → 1, on their own staggered window of entryP (X
    // and opacity only) so they don't arrive in lockstep.
    // .brandid__dna-right's own top/left padding is a plain fixed 100px
    // (style.css); the vertical rise below is separate from that.
    const DNA_IDX_HIDE_PX = 160;
    const DNA_IDX_SEG = [.15, .85];
    const DNA_TITLE_HIDE_PX = 160;
    const DNA_TITLE_SEG = [.25, .95];
    // Vertical rise is shared (same value, same curve) between idx and
    // title instead of each having its own timing — the gap between them
    // is a fixed CSS value, and if Y drifted independently while X/opacity
    // staggered, that fixed gap would visibly stretch and compress as the
    // two elements' Y positions diverged mid-animation.
    const DNA_RISE_PX = 130;
    // The 4-principle block starts smaller than its resting scale and
    // eases up to it. translate(-50%,-50%) (style.css centering) is
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
      // The whole sticky/cross-fade/entrance system below doesn't apply at
      // this width (or below DNA_SHORT_H) — .brandid__dna-sticky unpins to
      // normal flow and .brandid__dna-items becomes a horizontal
      // touch-scroll row instead (style.css). Clearing inline styles (not
      // just skipping the write) matters because a leftover value from
      // before the viewport crossed the breakpoint would otherwise keep
      // overriding the new CSS indefinitely.
      if (isDnaCompact()) {
        dnaVideoScale = 1;
        if (dnaMedia) dnaMedia.style.paddingTop = '';
        if (dnaVideo) dnaVideo.style.transform = '';
        if (dnaIndexEl) { dnaIndexEl.style.opacity = ''; dnaIndexEl.style.transform = ''; }
        if (dnaTitleEl) { dnaTitleEl.style.opacity = ''; dnaTitleEl.style.transform = ''; }
        if (dnaDetailEl) { dnaDetailEl.style.opacity = ''; dnaDetailEl.style.transform = ''; }
        return;
      }
      const r = dnaSection.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      const p = runway <= 0 ? 0 : clamp01(-r.top / runway);
      const idx = Math.min(dnaItems.length - 1, Math.floor(p * dnaItems.length));
      dnaItems.forEach((el, i) => el.classList.toggle('is-active', i === idx));
      // Roll the numeral drum to the active row instead of swapping the
      // text under it. The step is expressed as a percentage of the reel's
      // own height divided by the cell count, so it stays correct without
      // the JS needing to know the cell height in px or em.
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
        dnaVideoScale = lerp(DNA_SCALE_START, DNA_SCALE_END, eased);
        dnaVideo.style.transform = `scale(${dnaVideoScale.toFixed(3)})`;
      }
      const padTop = lerp(dnaPadMax(), DNA_MEDIA_PAD_REST, eased).toFixed(1) + 'px';
      if (dnaMedia) dnaMedia.style.paddingTop = padTop;

      // Same rise value/curve for both, driven by `eased` (the full entryP
      // 0-1 curve) rather than either element's own segment, so the "gap
      // stays constant" guarantee holds. Only cleared to '' once eased
      // hits 1 — a lingering inline transform: translate(0,0) keeps the
      // element on its own composited layer, reading as faintly blurry
      // text once settled.
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
    }

    // ---- Color Principle: one pinned stage, three background states ----
    const colorStage = document.querySelector('.brandid__color-stage');
    const colorSticky = colorStage ? colorStage.querySelector('.brandid__color-sticky') : null;
    const colorSymbol = colorStage ? colorStage.querySelector('.brandid__color-symbol') : null;
    const colorHead = colorStage ? colorStage.querySelector('.brandid__color-head') : null;
    const colorCaption = colorStage ? colorStage.querySelector('.brandid__color-caption') : null;
    const colorFlash = colorStage ? colorStage.querySelector('.brandid__color-flash') : null;
    const colorNames = colorStage ? Array.from(colorStage.querySelectorAll('.brandid__color-name')) : [];

    // Title, then a wrapper around just the 3 cards, with .hscroll-dots
    // landing after it — makes every part of the group a real descendant
    // of the one overflow-x:auto box, so native touch/wheel scroll works
    // directly; position:sticky (style.css) keeps title and dots visually
    // pinned to the left edge while only the cards move underneath, the
    // same mechanism a sticky first table column uses.
    if (isBlueprintCompact() && colorCaption && colorHead && colorNames.length) {
      // cards-row holds the 3 colour cards stacked (grid, style.css) so
      // they cross-fade in place instead of sliding.
      const cardsRow = document.createElement('div');
      cardsRow.className = 'brandid__color-cards-row';
      colorCaption.insertBefore(cardsRow, colorNames[0]);
      colorNames.forEach(el => cardsRow.appendChild(el));
      colorCaption.insertBefore(colorHead, cardsRow);
      // Dots created here, not the generic initHorizontalScrollDots (which
      // assumes the wrap IS the scroll container and finds the active card
      // by geometry — neither holds here). updateColorHeadSync drives their
      // colour + active state instead.
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'hscroll-dots';
      dotsWrap.setAttribute('aria-hidden', 'true');
      colorNames.forEach(() => {
        const d = document.createElement('span');
        d.className = 'hscroll-dot';
        dotsWrap.appendChild(d);
      });
      cardsRow.insertAdjacentElement('afterend', dotsWrap);
      // The swipe sizer: the only thing wider than the scrollport, giving
      // the caption its horizontal scroll distance. Visible content stays
      // pinned (position:sticky) while this scrolls underneath, so a swipe
      // scrolls the sizer and updateColorHeadSync turns that into a
      // cross-fade — no visible slide.
      const sizer = document.createElement('div');
      sizer.className = 'brandid__color-swipe-sizer';
      sizer.setAttribute('aria-hidden', 'true');
      colorNames.forEach(() => sizer.appendChild(document.createElement('div')));
      colorCaption.appendChild(sizer);
    }

    // Title, the 3-card row, and .hscroll-dots read as one bound group
    // whose colour cross-fades together. Interpolates between the two
    // cards' own computed colours by scroll position (updateColorHeadSync
    // below) rather than snapping to the nearest. No CSS transition on
    // either target — the interpolation IS the fade, driven straight off
    // scroll position.
    const parseRGB = str => {
      const n = (String(str).match(/[\d.]+/g) || []).map(Number);
      return [n[0] || 0, n[1] || 0, n[2] || 0];
    };
    const lerpRGB = (a, b, t) => {
      const c = i => Math.round(a[i] + (b[i] - a[i]) * t);
      return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
    };
    // The 3 colour states + their contrasting text, read once from the CSS
    // custom properties, since the cards themselves carry no background —
    // the single interpolated fill lives on the scroll container. Order
    // matches .brandid__color-name[data-color] in style.css.
    const readColorVar = name => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (v.charAt(0) === '#') {
        const h = v.slice(1);
        return h.length === 3
          ? h.split('').map(c => parseInt(c + c, 16))
          : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      }
      return parseRGB(v);
    };
    const STATE_BG = [readColorVar('--paper'), readColorVar('--ink'), readColorVar('--signal-surface')];
    const STATE_FG = [readColorVar('--ink'), readColorVar('--paper'), readColorVar('--paper')];

    function updateColorHeadSync() {
      if (!isBlueprintCompact() || !colorCaption || !colorNames.length) return;
      // The swipe scrolls the hidden sizer; that scroll position gives a
      // fractional card index, and: one interpolated fill is painted on
      // the caption, the stacked card labels cross-fade their opacity, and
      // the title/dots recolour to the interpolated foreground — all in
      // lock-step with the swipe.
      const n = colorNames.length;
      const stepW = colorCaption.clientWidth ||
        (colorNames[0].getBoundingClientRect().width) || 1;
      const raw = Math.max(0, Math.min(n - 1, colorCaption.scrollLeft / stepW));
      const i0 = Math.floor(raw);
      const i1 = Math.min(n - 1, i0 + 1);
      const t = raw - i0;
      const bg = lerpRGB(STATE_BG[i0], STATE_BG[i1], t);
      const fg = lerpRGB(STATE_FG[i0], STATE_FG[i1], t);
      colorCaption.style.backgroundColor = bg;
      if (colorHead) colorHead.style.color = fg;
      colorNames.forEach((el, i) => {
        el.style.color = fg;
        el.style.opacity = Math.max(0, 1 - Math.abs(raw - i)).toFixed(3);
      });
      const dots = colorCaption.querySelector('.hscroll-dots');
      if (dots) {
        dots.style.color = fg;
        const active = Math.round(raw);
        dots.querySelectorAll('.hscroll-dot').forEach((d, i) =>
          d.classList.toggle('is-active', i === active));
      }
    }
    if (isBlueprintCompact()) {
      updateColorHeadSync();
      if (colorCaption) colorCaption.addEventListener('scroll', updateColorHeadSync, { passive: true });
      window.addEventListener('resize', updateColorHeadSync, { passive: true });
    }

    // Ripple: .brandid__color-flash sits behind the head/symbol/caption
    // (moved first in the DOM) and reveals the incoming colour through a
    // circular clip-path that bursts outward from the pinball symbol's
    // position at transition start, in raw pixels (not clip-path %, which
    // resolves against sqrt(w²+h²)/√2, not a corner distance), sized to
    // clear the farthest corner from that point. The origin is captured
    // once per pass and held for the whole burst — the symbol keeps moving
    // under its own physics, and recomputing the origin every frame would
    // make the ripple's centre visibly drag around.
    // colorSticky's flat background-color stays on the outgoing colour for
    // the entire window instead of cross-fading, since the ripple is what
    // delivers the colour — a simultaneous background lerp underneath it
    // would show two different in-between colours at once.
    const PUNCH_SCALE = .05;
    // Text recedes behind the ripple, driven by the same punchT triangular
    // pulse the scale kick uses (0 at rest, 1 at the transition's midpoint,
    // back to 0 once settled).
    const TEXT_BLUR_MAX = 6; // px
    const TEXT_RECEDE_OPACITY = .5; // opacity floor at the pulse's peak
    let flashOriginA = null, flashOriginB = null;
    // Same "rise + fade in, settling exactly as the stage pins" shape
    // updateDna's title/index use. Only Y (not DNA's X slide) — this is
    // one centred block, not two staggered side items.
    const COLOR_HEAD_RISE_PX = 140;
    const COLOR_HEAD_SEG = [0, .55];

    const WARM_WHITE = [247, 245, 240];
    const CHARCOAL = [24, 28, 35];
    // --signal-surface, the token this codebase uses for large colour
    // fills (.frame--signal), not small-text accents.
    const SIGNAL = [231, 91, 53];
    const WARM_WHITE_FG = [24, 28, 35];
    const CHARCOAL_FG = [247, 245, 240];
    const SIGNAL_FG = [247, 245, 240];

    function updateColor() {
      if (!colorStage || !colorSticky) return;
      // Colour Principle becomes a horizontal touch-scroll row of
      // flat-coloured cards at this width (style.css) — each card carries
      // its own background colour in CSS, so none of the shared sticky's
      // JS-driven cross-fade/ripple/entrance below applies.
      if (isBlueprintCompact()) {
        colorSticky.style.backgroundColor = '';
        colorSticky.style.color = '';
        colorSticky.style.transform = '';
        if (colorSymbol) colorSymbol.style.fill = '';
        if (colorFlash) colorFlash.style.backgroundImage = 'none';
        if (colorHead) { colorHead.style.opacity = ''; colorHead.style.transform = ''; colorHead.style.filter = ''; }
        if (colorCaption) colorCaption.style.filter = '';
        colorNames.forEach(el => el.classList.remove('is-active'));
        return;
      }
      const r = colorStage.getBoundingClientRect();
      const runway = r.height - window.innerHeight;
      // raw covers the whole stage; the first COLOR_INTRO_END of it is
      // the mark drawing itself (initColorPinball), so everything below
      // runs on the remainder remapped back to 0-1. Without this remap
      // the colour steps would already be part-way through by the time
      // the drawing finished.
      const raw = runway <= 0 ? 0 : clamp01(-r.top / runway);
      const p = clamp01((raw - COLOR_INTRO_END) / (1 - COLOR_INTRO_END));

      // bg stays on the outgoing flat colour through the whole transition
      // window — the ripple below is what actually delivers the colour
      // change. fg still cross-fades smoothly, since text needs some
      // single readable colour throughout.
      // Warm White's hold is widest: it's the state the section opens on,
      // so the head and caption are still animating into it for the first
      // fifth of its window, leaving less settled-and-readable scroll than
      // the raw window size suggests.
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
          // smoothstep, not cubic ease-out, so growth eases in and out
          // instead of snapping away from a dead stop.
          const eased = smoothstep(wipeT);
          // innerR (fully-opaque radius) is tied directly to maxDist, not a
          // fraction of a smaller outerR, so it covers the farthest corner
          // exactly at t=1 — otherwise corners are still fading when the
          // window closes and colorSticky snaps to the incoming colour,
          // which reads as a sudden jump.
          const innerR = eased * maxDist;
          // Fade band width is proportional to maxDist (scales with
          // viewport size), not a fraction of innerR, which would start at
          // 0 width. Extends past the screen near t=1, which is fine.
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
        // Driven off `raw`, not the stage's own arrival (r.top crossing the
        // viewport) — that resolves to 1 while the mark is still drawing,
        // during the pin. Starts just past the handover so the mark
        // finishes drawing and shrinking before the copy comes up.
        const entryP = clamp01((raw - (COLOR_INTRO_END + .01)) / .10);
        const eased = smoothstep(entryP);
        const t = smoothstep(seg(entryP, COLOR_HEAD_SEG[0], COLOR_HEAD_SEG[1]));
        const rise = lerp(COLOR_HEAD_RISE_PX, 0, eased).toFixed(2);
        // Multiplied against the recede factor, not overwritten — entrance
        // fade-in and per-transition recede are independent and both need
        // to hold at once.
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
    // Both the mark-redraw-and-fill phase and the pinball physics below
    // are removed outright at this width — style.css hides
    // .brandid__color-seal/-symbol, so there's nothing left to drive.
    if (!stage || !sticky || !symbol || prefersReduced || isBlueprintCompact()) return;

    // Bounces off the sticky stage's edges and the title/lead/caption text
    // groups (must never overlap them), free-running rather than tied to
    // scroll. Every bounce reflects the hit axis then randomises the new
    // direction (jittered, not a clean mirror), speed, and spin, so it
    // reads like an actual pinball rather than a flat DVD logo. Paused via
    // rAF start/stop when the stage isn't in view.
    const SPEED_MIN = 90, SPEED_MAX = 220; // px/s
    const JITTER = Math.PI / 3; // ±60° added to the post-bounce heading
    const SPIN_MIN = 40, SPIN_MAX = 260; // deg/s
    // Obstacles are inflated so the symbol bumps off them with breathing
    // room, not touching pixel-for-pixel.
    const OBSTACLE_PAD = 16;

    let w = 0, h = 0, symW = 0, symH = 0, x = 0, y = 0, vx = 0, vy = 0;
    let rot = 0, spin = 0, rotPad = 0;
    let obstacles = [];
    const obstacleEls = [head, caption].filter(Boolean);
    const smooth = t => t * t * (3 - 2 * t);

    // Same rotation-bleed gap the wall bounce is fixed for (see measure())
    // applies here too: resolveObstacle only reacts once the symbol's
    // unrotated symW/symH box overlaps this rect, but the true rendered
    // shape can be up to rotPad past that at a 45°-ish angle. Adding rotPad
    // to the padding here inflates the obstacle by that margin, so the
    // trigger fires early enough that the worst-case rotated silhouette
    // never reaches the text.
    function localRect(el) {
      const r = el.getBoundingClientRect();
      const sr = sticky.getBoundingClientRect();
      // The sticky gets a scale() during colour transitions, so its
      // rendered rect and layout box (clientWidth/Height, which w/h and
      // x/y are in) disagree by that factor — dividing it back out keeps
      // obstacle coordinates in the same space the physics run in.
      const sx = sr.width / (sticky.clientWidth || 1);
      const sy = sr.height / (sticky.clientHeight || 1);
      // The head animates into place (a translateY decaying to 0), so its
      // rect right now isn't where it will be. Union the two: parse the
      // entrance offset out of the inline transform and extend the box to
      // cover where the text is heading as well as where it sits.
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
      // getBoundingClientRect() here would return the rotated paint box,
      // which changes every frame as `rot` spins. getComputedStyle
      // width/height is the un-rotated layout box instead (transforms
      // never affect it), so symW/symH are the symbol's true, constant
      // size. rotPad — (√2-1)/2 of the symbol's own side, the most any
      // corner can swing past its resting edge at the worst-case 45°-ish
      // rotation — is added as a margin inset from every wall in
      // step()/reset()/onResize() below, so the true rotated silhouette
      // can never cross a wall regardless of current spin.
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

    // Nearest clear spot to the centre of the screen. Dead centre is where
    // the lead text sits, so it searches outward in rings and takes the
    // first position that is both inside the walls and off every obstacle.
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

      // Re-measured every frame, not once at reset — the text groups
      // animate into place, reflow, and change size between colour steps,
      // so a cached rect goes stale the moment any of that happens.
      obstacles = obstacleEls.map(localRect);

      x += vx * dt;
      y += vy * dt;
      rot += spin * dt;
      // Bounced rotPad in from every wall, not at the wall itself — see
      // measure()'s comment.
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
       This stage opens with the symbol being drawn rather than the colour
       content, and only hands over to the physics below once the outline
       has closed, filled and shrunk to pinball size — all inside this same
       pinned sticky, so nothing about the viewport moves between the
       drawing and the bouncing. */
    const seal = sticky.querySelector('.brandid__color-seal');
    const sealFill = seal ? seal.querySelector('.cs-fill') : null;
    const sealOutlineG = seal ? seal.querySelector('.cs-outline') : null;
    const sealSegs = seal ? Array.from(seal.querySelectorAll('.cs-outline path')) : [];

    // Sub-windows, as fractions of the whole stage (so they sit inside
    // COLOR_INTRO_END). The draw is deliberately un-eased as a whole —
    // wheel distance maps straight to stroke length so the line tracks the
    // wheel; only each individual stroke is smoothed.
    // Fractions of this phase, not fixed offsets from its start, so they
    // stay valid if BLUEPRINT_END/COLOR_INTRO_END ever change.
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
    // The angle the mark carries through a handover, in either direction:
    // the pinball's live angle is handed to the seal, which unwinds it to 0
    // over the same scroll the mark uses to grow back, so it rotates home
    // instead of snapping to the seal's fixed 0° draw angle.
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
      // Re-derives running/stopped from current actual visibility, rather
      // than trusting the wasRunning flag captured above — if it ever
      // desyncs from reality, the symbol could get stuck with running left
      // false even while the stage is on screen.
      checkVisibility();
    }

    reset();
    checkVisibility();
    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    // measure() reads the text groups' current getBoundingClientRect() as
    // obstacles — if a webfont is still loading when reset() first runs,
    // that reflects the fallback font's metrics and goes stale once the
    // real font swaps in and reflows the text. onResize() already does the
    // right recovery, so this just calls it again once fonts settle (same
    // pattern alignIntroWord() uses).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize);
    }
    // Belt-and-suspenders re-measure a moment after load, since some
    // browsers resolve fonts.ready before the affected text has actually
    // reflowed at its final metrics.
    setTimeout(onResize, 600);
  }

  initColorPinball();

  /* ---------- Symbol Construction: title/text slide in, logos rise one by one ---------- */

  function initSymbolConstruction() {
    const sec = document.querySelector('.brandid__construction');
    const title = sec ? sec.querySelector('.brandid__construction-index') : null;
    const text = sec ? sec.querySelector('.brandid__construction-text') : null;
    const items = sec ? Array.from(sec.querySelectorAll('.brandid__sizes-item')) : [];
    // Title/text/each logo's rise-fade, and the loop video's ride-along,
    // all skip past this width — none of .brandid__construction-index/
    // -text/.brandid__sizes-item carry opacity:0 in CSS (only
    // .brandid__sizes-loop does), so with update() never called, they
    // simply render at their natural resting state.
    if (!sec || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);
    const seg = (t, a, b) => clamp01((t - a) / (b - a));

    // Title/text ride the section's own entrance — same "how far has the
    // top crossed into the viewport" shape Brand Wall's own p uses. Text
    // starts a beat after the title (.15-1 window, not 0-1) so the two
    // don't arrive in lockstep.
    const TITLE_HIDE_PX = 260;
    const TEXT_RISE_PX = 48;
    const TEXT_SEG = [.15, 1];

    // Each logo row reveals off its own position crossing into the
    // viewport, not a shared progress value, so scrolling further down
    // naturally brings each one in turn. Span of .4 (not instant) reads as
    // a gentle rise rather than a snap-in.
    const ITEM_RISE_PX = 40;
    const ITEM_SPAN = .4;
    const LOOP_SPAN = .45;
    const LOOP_GAP = 0; // flush to the viewport's lower edge, no inset
    // This section's items are short enough that `desired` is already past
    // `maxTop` by the instant the clip finishes entering, so a small value
    // here left zero time parked at full opacity before the fade started.
    // Widened so the exit reads as a slow release over real scroll
    // distance rather than a near-instant cutoff.
    const LOOP_EXIT_PX = 600;
    // Entrance and exit are exact mirrors of the same diagonal move: starts
    // small and offset toward its own bottom-right corner, grows to full
    // size while sliding up-left into rest as it arrives, then the exit
    // runs that motion backward.
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

        // Hand-rolled pinning. `top` keeps the clip's lower edge LOOP_GAP
        // above the viewport's, clamped so it cannot start above the
        // second logo (where it enters) and cannot travel past the last
        // logo's bottom (where it parks). Between those it simply tracks
        // the viewport, which reads as stuck.
        const vidH = loopVideo.getBoundingClientRect().height;
        if (vidH > 0) {
          const boxTop = sizesBox.getBoundingClientRect().top;
          // The ::before backdrop (style.css) bleeds past the video's own
          // bottom edge, so "flush to viewport" has to account for that
          // edge too. Read from live computed style, not a duplicated
          // constant, so this stays correct if the CSS clamp() changes.
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

    // Reduced motion: skip straight to the finished drawing — the CSS
    // reduced-motion block turns off every transition, but the segments'
    // own dash values still need clearing or nothing reveals them.
    // isCompact() shares this same fallback: a static, fully-drawn mark
    // rather than a smaller wheel-scrubbed draw.
    if (prefersReduced || isBlueprintCompact()) {
      section.classList.add('is-drawing');
      segs.forEach(seg => { seg.style.strokeDasharray = 'none'; seg.style.strokeDashoffset = '0'; });
      const handleLines0 = Array.from(section.querySelectorAll('.bp-handles line'));
      handleLines0.forEach(line => { line.style.strokeDasharray = 'none'; line.style.strokeDashoffset = '0'; });
      return;
    }

    // A point lands, then the stroke to the next point draws — not one
    // continuous line. Built as a per-segment timeline: each of the 18
    // anchor-to-anchor spans gets its own getTotalLength() and a draw
    // duration proportional to that length. Each segment starts the
    // instant the previous one finishes (delay = running total, no added
    // gap), so the stroke never stops moving — only its speed varies
    // (curves slower, short edges capped at MIN_SEG_MS). ANCHOR_LEAD is a
    // small gap that lets each anchor's pop animation actually finish
    // landing before its outgoing stroke starts — without it, a stroke
    // that starts the same instant an anchor lands can outrun a still-
    // animating pop, since pop duration and segment draw time aren't
    // otherwise related.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);

    // Guide grid, drawn before the mark. Each line takes an equal slice and
    // they overlap: a line starts well before its predecessor has
    // finished. .45 keeps about two in flight at once across this grid's
    // four lines.
    const GRID_OVERLAP = .45;
    if (gridLines.length) {
      // Each guide's duration is proportional to its own length, not an
      // equal share — the circles are ~2.4x the length of a straight
      // guide, and equal shares would make the pen visibly whip around
      // them to keep up.
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
    // Curves given more time than raw length alone would earn, so the
    // rounding reads as a curve forming rather than rushing through at the
    // same pace as a straight edge.
    const CURVE_DURATION_MULT = 1.4;

    // The timeline below is built in milliseconds but nothing plays it as
    // a clock — it's normalised at the end and scrubbed by scroll position
    // instead. Keeping the ms arithmetic preserves the tuned relative
    // rhythm between strokes/anchors/handles/control points while changing
    // only what advances it.
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
    // Handles drag out (their own stroke-dashoffset draw, like the
    // segments) rather than just fading into place — like Illustrator's
    // pen tool, where a handle bar extends out from an anchor as it's set.
    // Each curve has two — in index.html's DOM order, the first
    // .bp-handles line tagged with a given data-seg is always that curve's
    // start-anchor handle, the second its end-anchor handle, so they can
    // be told apart by position within the filtered pair.
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
  // Cross-fades .brandid__blueprint-panel--diagram → --wordmark as the user
  // scrolls through .brandid__blueprint-stage's pinned runway. Continuous
  // and scroll-scrubbed — opacity/transform set directly from scroll
  // progress every tick (same approach as Color Principle's updateColor),
  // rather than a fixed-duration CSS transition that can drift out of sync.
  function initBlueprintTransition() {
    const stage = document.querySelector('.brandid__blueprint-stage');
    const diagramPanel = document.querySelector('.brandid__blueprint-panel--diagram');
    const wordmarkPanel = document.querySelector('.brandid__blueprint-panel--wordmark');
    if (!stage || !diagramPanel || !wordmarkPanel) return;

    // Reduced motion / isBlueprintCompact(): the shared CSS block already
    // switches .brandid__blueprint-stage back to plain stacked flow with
    // both panels forced visible — nothing for this scroll-driven
    // crossfade to do.
    if (prefersReduced || isBlueprintCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);
    // Transition happens in the middle third of the stage's scroll runway
    // — diagram fully visible before it, wordmark fully visible after.
    //
    // Each handover's windows are offset (not one shared progress value),
    // so the outgoing panel is most of the way gone before the incoming
    // one is meaningfully there; the overlap that remains is blurred hard
    // enough that neither layer resolves as readable copy through the
    // other, reading as depth of field rather than doubled text. They
    // still overlap on purpose — separating completely just trades the
    // ghosting for a beat of empty paper.
    //
    // The diagram panel is a sequence, not a static split: it opens with
    // the mark alone and centred, draws its grid, then the mark, and only
    // once finished does it slide to its column for the copy to arrive
    // beside it.
    // The guides are not driven off this stage's own progress — they start
    // while it's still approaching, from the moment the symbol section's
    // last logo clears the top of the screen, so the lower half already
    // has something being drawn instead of arriving blank. See the gridT
    // calculation in update(); GRID_AFTER_PIN_VH is how much drawing is
    // left once the stage has pinned.
    const GRID_AFTER_PIN_VH = .45;
    const lastSizeLogo = document.querySelector('.brandid__sizes-item:last-child');
    const DIA_DRAW0 = .12, DIA_DRAW1 = .42; // the mark draws on them
    const MOVE0 = .46, MOVE1 = .61;    // then it slides to its column
    const GRID_FADE0 = .48, GRID_FADE1 = .62; // guides retire as it goes
    // The copy deliberately starts after most of the slide — by .58 the
    // mark is within ~36px of its resting place (inside the column gap),
    // so it never reaches the copy while travelling.
    const TEXT0 = .58, TEXT1 = .74;
    const OUT0 = .78, OUT1 = .90;      // diagram fades out
    const IN0 = .82, IN1 = .94;        // wordmark fades in
    const WM_DRAW0 = .84, WM_DRAW1 = 1;
    // `p` finishes this much before BLUEPRINT_END so the fully-drawn,
    // fully-faded-up, unblurred wordmark holds for a real stretch of
    // scroll (48svh, roughly three wheel notches) instead of lasting a
    // single scroll position before the exit begins.
    const WM_HOLD = .0553;
    const PANEL_END = BLUEPRINT_END - WM_HOLD;
    const MAX_BLUR = 6;
    // Quantised to half-pixels: a full-screen blur re-rasterises when
    // its radius changes, and slow scrolling would otherwise demand a
    // fresh one every frame for differences too small to see.
    const blurPx = a => `blur(${(Math.round(a * MAX_BLUR * 2) / 2).toFixed(1)}px)`;

    // Wordmark draws itself in as lines, same stroke-dashoffset technique
    // the symbol diagram's segments use, but one path per letter instead
    // of per anchor-to-anchor span. Each letter's duration comes from its
    // own measured length, so the wide O doesn't finish with the narrow I.
    const wordmarkSvg = wordmarkPanel.querySelector('.brandid__blueprint-wordmark-svg');
    const wordmarkPaths = Array.from(wordmarkPanel.querySelectorAll('.wm-outline path'));
    const WM_STAGGER_MS = 170; // letter-to-letter offset — a left-to-right wave
    const WM_MS_PER_UNIT = 5;
    const WM_MIN_MS = 620;

    // The paths carry vector-effect: non-scaling-stroke so the line holds
    // one constant weight at every viewport size. That changes the units
    // stroke-dasharray resolves in — Chrome reads it as screen pixels once
    // non-scaling-stroke is on, while getTotalLength() keeps reporting
    // user units. Setting the raw user-unit length leaves the mark full of
    // gaps (a dash ~6x shorter than the path it covers simply tiles).
    // Converting through the svg's user-unit → pixel scale is the fix, and
    // it has to be redone whenever that scale changes, hence
    // measureWordmark() being wired to resize below.
    // Durations deliberately stay on the raw user-unit length: pacing is a
    // property of the letterform's geometry, not the drawn width.
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


    // Content rides the scroll in rather than simply appearing. Each
    // element gets its own slice of the driving progress so they arrive in
    // sequence — label, sentence, body, then list items — instead of the
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
    // Vertical counterpart to diagramShift — ~0 in the normal row layout
    // (row and mark already share a centre), non-zero only in the tall-ratio
    // stacked layout (style.css: min-width:1024px and max-aspect-ratio:5/3).
    let diagramShiftY = 0;
    function measureDiagramShift() {
      if (!diagramRow || !diagramVisual) return;
      const prev = diagramVisual.style.transform;
      diagramVisual.style.transform = 'none';
      const rr = diagramRow.getBoundingClientRect();
      const vr = diagramVisual.getBoundingClientRect();
      diagramShift = (rr.left + rr.width / 2) - (vr.left + vr.width / 2);
      diagramShiftY = (rr.top + rr.height / 2) - (vr.top + vr.height / 2);
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
        const shiftY = diagramShiftY * (1 - moveT);
        diagramVisual.style.transform = moveT >= 1 ? '' : `translateX(${shift.toFixed(1)}px) translateY(${shiftY.toFixed(1)}px)`;
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
    // Gated outright, not relying only on Lenis skipping coarse pointers —
    // a narrow desktop/DevTools window with a real mouse is isBlueprintCompact()
    // AND fine-pointer at once, where Lenis stays active and this could
    // still fire.
    if (!stage || prefersReduced || isBlueprintCompact()) return;

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
      // Fires once the wheel/trackpad has actually stopped, not mid-gesture
      // — pulling while still scrolling reads as fighting the user rather
      // than a magnet catching a slow-moving piece.
      idleTimer = setTimeout(trySnap, 140);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  initColorSnap();

  /* ---------- Horizontal scroll-snap rows: plain mouse-wheel fallback ----------
     A plain vertical mouse wheel/trackpad scroll over a horizontal-only
     overflow:auto box does nothing in most browsers (no gesture to
     translate) — a genuine touchscreen provides horizontal drag/swipe
     natively, but desktop/DevTools testing has no such gesture. This maps
     vertical wheel delta to scrollLeft instead, only when the gesture is
     more vertical than horizontal (a real horizontal trackpad swipe still
     scrolls natively), and only at isCompact() widths, where these rows
     exist at all. */
  function enableWheelHorizontalScroll(el) {
    if (!el) return;
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Only steal the gesture while the row still has somewhere to go in
      // that direction — otherwise every vertical scroll over the row
      // (trackpad/mouse wheel) got swallowed permanently, even once the
      // row was already at its first/last card, which read as "page won't
      // scroll" while the pointer sat over one of these rows.
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  /* Loop the carousels: resting on the last card, a forward swipe wraps
     back to the first (and vice versa). Touch only — a wheel/trackpad at
     the boundary still lets the page scroll past the section (see
     enableWheelHorizontalScroll above). Keyed on where the swipe started,
     not where it ended, so a normal forward swipe that merely reaches the
     last card doesn't bounce straight back. */
  function enableLoopWrap(el) {
    if (!el) return;
    const THRESH = 40; // px of horizontal travel to count as a swipe
    let sx = 0, sy = 0, sLeft = 0, single = false;
    el.addEventListener('touchstart', (e) => {
      single = e.touches.length === 1;
      if (!single) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      sLeft = el.scrollLeft;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!single) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < THRESH || Math.abs(dx) <= Math.abs(dy)) return;
      const maxLeft = el.scrollWidth - el.clientWidth;
      if (maxLeft <= 0) return;
      // Round the start position to its nearest card index rather than
      // testing an exact-pixel boundary — a flick to the last card often
      // settles a few px short of the true max, so an exact-pixel check
      // would miss the very next swipe and only catch the one after.
      const stepW = el.clientWidth || 1;
      const lastIdx = Math.round(maxLeft / stepW);
      const startIdx = Math.round(sLeft / stepW);
      if (startIdx >= lastIdx && dx < 0) el.scrollTo({ left: 0, behavior: 'smooth' });
      else if (startIdx <= 0 && dx > 0) el.scrollTo({ left: maxLeft, behavior: 'smooth' });
    }, { passive: true });
  }

  [
    { sel: '.acycle__steps', when: isCompact },
    { sel: '.vwipe__vision', when: isVwipeCompact },
    { sel: '.whyp__copy-sticky', when: isWhypCompact },
    { sel: '.brandid__dna-items', when: isDnaCompact },
    { sel: '.brandid__color-caption', when: isBlueprintCompact },
  ].forEach(({ sel, when }) => {
    if (!when()) return;
    const el = document.querySelector(sel);
    enableWheelHorizontalScroll(el);
    enableLoopWrap(el);
  });

  /* ---------- Color Story: three photos cross-fade with a curtain wipe, one pinned stage ---------- */

  function initColorStory() {
    const sec = document.querySelector('.brandid__colorstory');
    const panels = sec ? Array.from(sec.querySelectorAll('.brandid__colorstory-panel')) : [];
    const curtainLeft = sec ? sec.querySelector('.brandid__colorstory-curtain--left') : null;
    const curtainRight = sec ? sec.querySelector('.brandid__colorstory-curtain--right') : null;
    if (!sec || !panels.length) return;

    // Each panel's own brand colour, used for the curtain so it reads as
    // "the next colour arriving," not a fixed ink flap.
    const PANEL_COLORS = ['var(--paper)', 'var(--ink)', 'var(--signal-surface)'];
    // The flap is banded into value steps of that colour rather than
    // filled flat — hard stops, so each band is a swatch with a clean
    // edge, not a gradient.
    const CURTAIN_STEPS = 5;
    // One step of the ladder, in oklab lightness. Absolute (not a mix
    // percentage), so rungs are the same perceptual distance apart
    // whichever colour is on the curtain — mixing toward white/black by a
    // fixed percentage instead measured Paper's five bands at L 0.980 /
    // 0.975 / 0.966 / 0.805 / 0.66, nearly touching at the light end since
    // a near-white colour has nowhere left to go toward white.
    const CURTAIN_STEP_L = .085;
    // The ladder runs one way only, away from whatever end its own colour
    // already sits at — centring it on the colour would clamp flat for
    // Paper going up and Ink going down.
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

    // The panel's true colour is the band at the leading edge (where the
    // two flaps meet), with the ladder trailing back toward the screen
    // edge, so the colour itself sweeps in and the steps follow it.
    // Each rung is a color-mix toward white or black, with the percentage
    // solved for the target lightness (oklab mixing is linear in L, so
    // this is exact). Relative colour syntax (oklch(from var(--x) L c h))
    // would say this more directly, but measured, it dropped the origin's
    // chroma to 0 here — Signal Orange's rungs rendered as greys.
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
    // Drives the fixed equalizer/hero-logo's contrast switch (see
    // initContrastSwitchers) via a dynamically-updated data-eq-bg on the
    // section. Can't rely on elementFromPoint sampling an actual
    // background-color here — the three panels are stacked
    // position:absolute over the same area, so whichever is last in the
    // DOM wins hit-testing regardless of which is actually opaque, and
    // none carry a real CSS background-color (they're <img>s).
    // signal-surface (#E75B35) computes to a relative luminance of ~0.24
    // (under the 0.5 threshold, i.e. "dark" by the numbers), but is
    // overridden to 'light' (ink instead of paper) since the raw
    // luminance formula doesn't capture that this orange reads bright
    // enough for ink to still show up clearly against it.
    const PANEL_MOODS = ['light', 'dark', 'light'];

    // Corrective indent so the small English label's glyph-left lines up
    // with the Korean lead line's. Measured per panel (font-size and lead
    // character differ) rather than guessed as one fixed px value — same
    // Range-based technique as Symbol Construction's title alignment.
    // EXTRA_INDENT is a further nudge on top of whatever the measurement
    // finds, since the measured glyph-left alignment alone still read
    // visually short of the lead line's start.
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
    if (isColorStoryCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const smoothstep = t => t * t * (3 - 2 * t);

    const N = panels.length;
    // Width (in vp units) of the curtain's close-then-reopen window,
    // centred on each panel boundary. Keeps the transition at the same
    // ~50svh of scroll regardless of the section's total runway.
    const CURTAIN_SPAN = .333;
    // How much of a panel's own vp territory (±0.5 around its index) its
    // text takes to fade/rise fully in once active. Panels hard-cut in
    // behind the curtain instead of crossfading, so nothing underneath is
    // ever visible overlapping the outgoing panel.
    const COPY_FADE = .35;
    // How much of that territory the copy spends fully arrived, motionless
    // — inside this radius the panel, copy and curtain are all at their
    // end states, giving each transition somewhere to rest before the
    // next starts.
    const COPY_HOLD = .2;
    // Runway added outside the first and last panel's centres, in the same
    // vp units. Without it those two only get the inward half of their
    // hold, so the middle panel would rest twice as long as its neighbours.
    const VP_PAD = COPY_HOLD;
    // What the panel underneath does while the curtain sweeps over it: dim
    // plus a light defocus, both tied to the same close amount, so it
    // reads as receding behind the curtain rather than a flat shape
    // sliding over a photo that stays lit and sharp underneath.
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

      // Curtain: closes fully (both flaps meeting at centre) then reopens,
      // over a window straddling each panel boundary. Only one boundary
      // can be active at once (they can't overlap unless CURTAIN_SPAN > 1).
      // Coloured to the panel it's heading toward (same activeIndex above),
      // so colour and image flip at the same instant, both at full closure.
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
    // isCompact() bail: without it, the full desktop scroll-scrubbed
    // handover ran unchanged on mobile, fighting .frame's own
    // min-height:100svh sizing instead of settling into content-driven flow.
    if (!section || !line || !video || isCompact()) return;
    // Reused across every fit() call to measure the ticker window's
    // required height (see below) — one canvas for the page's lifetime
    // rather than one per resize.
    const measureCtx = document.createElement('canvas').getContext('2d');

    // Sizes the video, and gives the two text blocks that same width so
    // the title's left edge and the sub-copy's right edge land on the
    // footage's own edges.
    //
    // Width only — a height term lived here while the section was a
    // pinned stage and went out with the pin. .brandid__closing-sticky
    // doesn't currently exist in index.html (see the HTML comment there on
    // how to restore it), so `sticky` below is null and that height block
    // is presently inert. Measuring the text stack is only safe because
    // floorW guarantees neither block ever re-wraps.
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
    // The title stops widening here even when the footage keeps going.
    // Below 1200 the two share a width and the title's left edge sits on
    // the footage's; past it the footage grows out to both sides and the
    // title stays put. The sub-copy is not capped — it keeps following the
    // right edge out.
    const TITLE_MAX_W = 1200;

    // Everything below constrains the wrapper's width, never the video's
    // height — capping height instead leaves the wrapper at full width
    // while object-fit:contain letterboxes the picture inside it, so the
    // ink backdrop (the wrapper's ::before) sticks out either side of the
    // footage. Setting width keeps backdrop and picture the same size.

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
      // h_logo.svg is the brand's vertical lockup, so its geometry is the
      // spec: the wordmark is 2.219x the symbol's width, and the space
      // between them is 0.377x that same width.
      //
      // Both are relative to the symbol as the footage renders it, measured
      // from a per-frame luminance bounding box over ten frames: it holds
      // 0.567 of the frame's height throughout, and its lower edge sits at
      // 0.7775 down the frame.
      //
      // GAP_EASE exists because laid out at exactly 0.377, the wordmark's
      // top would land 6px above the footage's bottom edge, inside the fade.
      //
      // This sets the band's depth only; where the mark sits inside it is
      // MARK_FOOT below.
      const LOCKUP_W_OVER_SYMBOL = 2.219;
      const LOCKUP_GAP_OVER_SYMBOL = .377;
      // The mark's viewBox in index.html: every letter's rendered bottom
      // lands at 50.76 in viewBox units regardless of the box height, so
      // 30.86 clears the ink by 0.1 and no more (a taller box leaves dead
      // air under the ink, reading as leftover background under the wordmark).
      const MARK_ASPECT = 229.55 / 30.86;
      const SYMBOL_H_FRAC = .567;
      const SYMBOL_TOP_FRAC = .2105;
      const SYMBOL_BOTTOM_FRAC = .7775;
      // Trimmed off the footage's height. object-fit:cover keeps the
      // picture's scale and loses the edges, so the symbol comes out the
      // same size in a tighter frame. The two ends are separate since the
      // bottom was cropped further on its own; object-position below splits
      // the overflow between them in the same proportion.
      // Note for anyone changing these: the band colours in style.css are
      // sampled at these crop lines, not the footage's own edges, so moving
      // either one means re-sampling its colour or the seam steps. The
      // symbol spans 0.21-0.78 of the frame — the hard limit on both.
      // Only CROP_TOP shortens the block. The band below is derived from
      // the symbol's distance to the mark, so anything taken off the bottom
      // is handed straight back as colour and the height doesn't move;
      // taking it off the top moves the symbol itself up, and the mark follows.
      const CROP_TOP = .10;
      const CROP_BOTTOM = .13;
      // The picture is narrower than the block it sits in. Cropping can't
      // shrink the symbol (cover scales the picture to fill the width
      // either way), so width itself has to come down, and the side fades
      // let it end without a hard edge. Everything downstream is measured
      // off the narrowed picture, so the wordmark comes down with it and
      // keeps its lockup ratio.
      const VIDEO_INSET = .12;
      // How far in from the picture's own left/right the side fades reach.
      // The symbol occupies the middle 0.35-0.65 of the frame, so there's
      // room to be generous — the picture's side columns run up to 14 RGB
      // darker than the band behind them (measured), and a wide ramp keeps
      // that from reading as an edge.
      const FADE_SIDE = .18;
      // The feather at each end never reaches the symbol — deriving each
      // fade from the clearance actually available (rather than a flat
      // fraction of the box) makes it impossible for the fade to encroach
      // on the symbol as the crop tightens.
      const FADE_MAX = .10;
      const FADE_OF_CLEARANCE = .7;
      // Cropping the footage alone changes nothing visible: the band below
      // is derived from the symbol's distance to the mark, so every pixel
      // taken off the picture is handed back as colour and the block's
      // height doesn't move. The gap itself is the only thing that shortens
      // it. 1.0 puts it exactly on h_logo.svg's own 0.377 reference.
      const GAP_EASE = 1.0;
      // Colour left under the mark. Zero: the mark sits on the block's
      // bottom edge, same as h_logo.svg's own artwork stopping on the
      // wordmark's baseline with nothing below it.
      const MARK_FOOT = 0;
      // Optical nudge. Added to the band rather than the mark's own offset:
      // pushing the mark down past the block's edge would put its last rows
      // on --paper, where a paper-coloured wordmark disappears. Deepening
      // the band instead moves it down relative to the footage while
      // keeping every pixel on the dark surface.
      // inkBottom (below) feeds MARK_DROP into the same centring average
      // that sets the plate's sticky position, so raising MARK_DROP without
      // excluding it there would also nudge the plate up by half the
      // amount, cancelling half the intended move — see inkBottom's comment.
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
      wrap.style.setProperty('--loop-band-bottom', `${(markH + gapBelowVideo + MARK_DROP).toFixed(1)}px`);
      wrap.style.setProperty('--loop-mark-w', `${markW.toFixed(1)}px`);
      wrap.style.setProperty('--loop-mark-foot', `${MARK_FOOT}px`);
      // The ticker window's height must fit APPLICATIONS too, not just the
      // wordmark — it's a much bigger font than the mark's own height has
      // ascent+descent room for. Measured off the incoming word's own
      // computed font, so the window is exactly as tall as that font ever
      // needs; the mark's height only sets a floor, never a ceiling.
      //
      // The font's ascent+descent is the text's outer edge, not a safety
      // margin around it — sized to exactly that, the ink still grazes the
      // window (measured ~0px clearance). A fifth again on top gives real
      // air on both sides.
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
      // APPLICATIONS centres in the full window, but the wordmark it swaps
      // with sits flush to the window's bottom instead — and the window is
      // taller than the mark (WINDOW_HEADROOM), so the two references don't
      // land on the same spot. Half the window/mark height difference
      // closes that gap, pushing APPLICATIONS down so its centre lands
      // where the mark's does.
      const idealOffset = (windowH - markH) / 2;
      wrap.style.setProperty('--next-optical-offset', `${idealOffset.toFixed(1)}px`);
      // Giving APPLICATIONS the full offset needs more room at the bottom
      // than the slot's clip-path (style.css) allowed, which was tuned
      // tight for the mark's own overshoot trick. --slot-clip-bottom is
      // that widened margin, sized to whatever APPLICATIONS' full offset
      // actually needs, so idealOffset above has nowhere left to be capped.
      const SLOT_CLIP_MARGIN = 1.5;
      const slotClipBottom = Math.max(SLOT_CLIP_MARGIN, idealOffset - (windowH - textH) / 2 + SLOT_CLIP_MARGIN);
      wrap.style.setProperty('--slot-clip-bottom', `${slotClipBottom.toFixed(1)}px`);

      // Where the plate pins during the handover to Applications. Set
      // here rather than in CSS because it depends on everything above.
      //
      // Pinned on its box now, not its ink — the box itself holds dead
      // centre on the browser the instant it catches, background and
      // corner ticks included, with nothing faked. The top band is empty
      // colour and the bottom edge is the wordmark, so with the box
      // centred the symbol+mark pair reads a bit low at rest — that gap is
      // closed afterward by initClosingHandoff, which lifts just the
      // video+mark bundle (not the box, not the background) up onto their
      // own ink-centred spot over the same window the backdrop spreads in.
      //
      // Pinning on the ink centre instead and faking a box-centred look
      // with a counter-transform on the content doesn't work: the
      // background and corner ticks are attached to the box's own real
      // position, so the plate as a whole never actually holds the
      // screen's true middle — only the small video+mark portion fakes it.
      //
      // Doesn't reintroduce per-frame-movement judder: the box's sticky top
      // here is set once, at fit time, and never touched again; only the
      // content's transform animates, across the already-scripted spread
      // window, not on an otherwise-still element.
      const bandTopPx = parseFloat(getComputedStyle(wrap).paddingTop) || 0;
      const bandBottomPx = markH + gapBelowVideo + MARK_DROP;
      const plateH = bandTopPx + boxH + bandBottomPx;
      // ::before's flat ceiling/floor zones (style.css) sit at fixed
      // stops in the unscaled gradient, but the handover's spread scales
      // that gradient around its centre, dragging those zones outward
      // faster than the video itself moves (the video doesn't scale). These
      // two publish each flat zone's distance from the plate's centre, in
      // px; style.css divides them by --plate-spread-y so the zone's
      // rendered position stays anchored at the same real screen distance
      // from centre regardless of spread.
      wrap.style.setProperty('--loop-ceiling-offset', `${(plateH / 2 - bandTopPx).toFixed(1)}px`);
      wrap.style.setProperty('--loop-floor-offset', `${(plateH / 2 - bandBottomPx).toFixed(1)}px`);
      const inkTop = bandTopPx + (SYMBOL_TOP_FRAC - CROP_TOP) * fullH;
      // MARK_DROP is excluded here (not `plateH - MARK_FOOT`) so growing it
      // only moves the mark, not the centring point — including it would
      // shift inkCentre, which shifts stickyTop (below) by half the same
      // amount to keep this centred, splitting the nudge in half instead of
      // applying it in full.
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
      // --plate-content-lift is deliberately not set here — this function
      // and initClosingHandoff's own update() both wrote that property,
      // with no guaranteed order, and this one always reset it to '0px' on
      // every fit() re-run, silently stomping the correct scroll-driven
      // value if fit() ran after it. Leaving this property entirely to
      // initClosingHandoff (CSS's var(--plate-content-lift, 0px) fallback
      // covers the instant before its first update()) removes the second
      // writer outright.
      // How far the wordmark has to travel to sit on the screen's centre
      // once the footage above it is gone. It starts on the plate's bottom
      // edge, so this is the distance from that to the middle.
      const vh = window.innerHeight;
      // Not dead-centre — mathematically exact centring here reads as
      // sitting slightly low, the empty band above looking wider than the
      // one below. A few percent of viewport height higher corrects it;
      // the same fraction is used for .brandid__colorstory-card's centring
      // in style.css for the identical optical issue.
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
      // Without this it starts at the plate's bottom edge — where the
      // wordmark used to stand before walking up to screen centre — leaving
      // the whole distance it travelled, plus the plate's foot, as empty
      // space (measured 500-odd px at 1440x900).
      //
      // Solved rather than guessed: put the section's top exactly one gap
      // below the bottom of the held title. Negative only — it may close
      // the void, never open one. The title needs air under it even at its
      // closest, not to sit flush on the next line.
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
    // The wrap, not the video itself — its ::before ink backdrop needs to
    // scale/fade in lockstep with the video, and a transform/opacity on
    // the wrapper carries a pseudo-element child along for free (same
    // fix as .brandid__sizes-loop).
    const wrap = document.querySelector('.brandid__closing-loop-wrap');
    if (!section || !line || !wrap || prefersReduced || isCompact()) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    const smoothstep = t => t * t * (3 - 2 * t);
    // The footage this reveals was measured, not guessed: 20.0s, no cuts
    // anywhere, only 1.1% of pixel value changing per 80ms, and mean
    // luminance holding within ±6 for the entire run — dark, slow,
    // continuous, no accents. A long ease-in-out that starts and ends at
    // zero velocity matches that: no snap at either end and nothing
    // overshoots, so the panel drifts up to size at about the pace the
    // footage itself moves.
    const smootherstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);

    const TITLE_RISE_PX = 56;
    const BODY_RISE_PX = 34;
    // Drift shared by all three, on top of whatever each does on its own:
    // the group is carried up as a unit while the section swings into
    // view, reading as one thing running in on scroll momentum rather than
    // three parts fading in place. Deliberately smaller than either rise
    // above — it's the undertow, not the motion itself.
    const DRIFT_PX = 52;
    const body = document.querySelector('.brandid__closing-body');
    // Starting near full size makes the arrival a settle rather than a
    // launch: 6% of growth spread over the whole window reads as a drift
    // with weight, not a zoom.
    const VIDEO_START_SCALE = .94;
    // A touch of its own rise, under the shared drift — the panel comes
    // up into place rather than expanding on the spot.
    const VIDEO_RISE_PX = 30;

    let ticking = false;

    // Where each block's entrance finishes, as a fraction of viewport
    // height — not fixed constants, since this is the last section on the
    // page: scrolling stops with its bottom on the screen's bottom, so
    // each desired finish is pulled down to just past the block's resting
    // position when a higher finish could never be reached.
    // The plate is sticky (pins for the Applications handover), and
    // offsetTop on a sticky element reports its current offset rather than
    // its static one, so it can't be asked directly. The runway that
    // follows it is a plain element, so its offsetTop is the plate's
    // static bottom.
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

    // Each block is timed off its own position on screen — the section is
    // well over a viewport tall, so a single section-relative progress
    // would have the sub-copy finish while still hundreds of pixels below
    // the fold. Anchoring per block means every entrance plays where it
    // can be seen, and the stagger falls out of the layout for free.
    //
    // Positions come from offsetTop (layout, transform-blind) added to
    // the section's own rect — not from each element's own rect. Reading
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
    // Same gap as initClosingHandoff (see its own notes): positions here
    // depend on the layout of everything above this section, and `p`
    // (entrance progress) can land short of 1 on a refresh if any of that
    // hasn't settled yet — leaving scale()/translateY() short of their
    // resting values too, reading as the plate sitting low and slightly
    // soft. Retry on a timer, and catch any image finishing decode late.
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
    if (!section || !wrap || !apps || isCompact()) return;

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

    // Beats, as fractions of the runway. They overlap on purpose — each
    // one starts before the last has finished, so the handover reads as a
    // single move rather than four.
    // The gesture the handover hangs on: the four corner ticks are pulled
    // out past the screen's edges and the plate's surface stretches after
    // them, so the colour reads as being drawn outward. The lines keep
    // their own length throughout — what expands is the surface, and each
    // line is carried outward by exactly the amount its own corner travels,
    // so the corner reference never shifts.
    const SPREAD = [.04, .26];
    // The section's background follows behind the spread, not leading it —
    // flooding first would darken the page before the surface got there,
    // dark on dark with nothing to expand over. By the time this runs the
    // spread has already covered the viewport, so it's invisible; it
    // exists so the section is still dark when the pin releases.
    const FLOOD = [.22, .38];
    // Starts exactly where SPREAD ends (matching FOOTAGE_OUT), so the
    // plate's ceiling colour is untouched for the entire zoom and only
    // begins changing once it's finished — overlapping SPREAD's tail would
    // shift the surface's colour visibly while it's still expanding.
    const DISSOLVE = [.26, .44];
    // The footage goes first, while still standing on the surface its edge
    // fades were matched to. The other order was a bug: with the surface
    // dissolving before the footage, its feathers faded toward a colour
    // that had already left, showing a rectangular halo against bg.png
    // (far darker) where the video's edges were.
    const FOOTAGE_OUT = [.26, .42];
    // Runs under the flood and finishes before the footage starts fading,
    // so the plate is already on its ink centre once nothing but the
    // wordmark is left. The plate's dark surface clears before the new
    // ground arrives — safe to go early since the page behind it is
    // already flooded to the same colour.
    const PLATE_BG_OUT = [.42, .51];
    // bg.png comes up under the plate's surface, hidden until the surface
    // starts leaving. Matched to FOOTAGE_OUT (same span, same start) so the
    // ground comes in at the footage's own fade-out rate — it stays
    // invisible regardless, hidden under the still-opaque plate until
    // PLATE_BG_OUT clears at .42.
    const GROUND_IN = FOOTAGE_OUT;
    // With the footage gone, the wordmark walks up off the plate's bottom
    // edge to the middle of the screen.
    const MARK_TO_CENTRE = [.42, .56];
    // Then everything holds, .56 to .66. The roll uses a single threshold
    // (see .is-ticked below), not a continuous scroll-tied range — once
    // scroll crosses it, however fast or slow, the CSS transition on
    // .brandid__closing-mark/-next carries the roll to completion over its
    // own fixed duration, rather than sitting part-rolled with both lines
    // visibly overlapping at a slow scroll.
    const TICKER_AT = .68;
    // ...and holds again, .76 to 1, so the new title gets its own beat to
    // be read while the Applications copy rises into place behind it (the
    // pull in initClosingFit).
    //
    // The mark's exit is not a beat — it used to carry the title up to 14%
    // of the screen while the plate stayed pinned, which is what created a
    // void: the title climbed 320px while the section under it didn't
    // move, leaving half a screen of empty ground by the time it faded.
    // Now the runway simply ends here, the pin releases, and the plate
    // scrolls away carrying the title with it, the Applications content one
    // gap behind at the same speed. Only the fade is still driven, off
    // where the mark actually is on screen rather than a spent progress value.
    const FADE_FROM = .34, FADE_TO = .13;
    //
    // Deliberately no motion in any of this — a lift used to run here
    // while the plate stayed pinned (otherwise perfectly still), and even
    // a rounded sub-pixel step read as shake, while the unrounded version
    // resampled the footage every frame. The plate now simply pins on its
    // ink centre to begin with (initClosingFit).
    // Every write below is guarded against its own last value — nothing
    // here changes on most frames, and re-setting an identical
    // background-color or custom property still costs a style recalc on an
    // element this big.
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
    // read-write-read thrash, which is what made the footage judder.
    let runPx = 0, plateStaticTop = 0, stickyTop = 0, markCentreInPlate = 0, contentLiftTarget = 0;
    // How far the spread has to go, worked out from where the plate sits
    // once pinned rather than guessed: what it takes for the surface to
    // reach every edge of the screen, plus a margin so it never lands
    // exactly on one.
    let spreadX = 1, spreadY = 1;
    function measure() {
      runPx = runway ? runway.offsetHeight : 0;
      // For a sticky element offsetTop reports its current offset,
      // displacement included. The runway is a plain element, so its own
      // offsetTop is the plate's static bottom.
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
      // The ticks retract into their own corner over the same window they
      // ride outward in — 1 at rest (full length), 0 once spread completes
      // — reversing cleanly on the way back up since it's driven by the
      // same scroll-tied `spread`.
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
      // Also drives the video's dim overlay (::after) — a separate
      // pseudo-element, not a child of <video>, so it doesn't inherit the
      // footage's opacity automatically.
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
    // None of the above reliably catches a reload's own scroll-restoration,
    // which doesn't fire a 'scroll' event, and no single event marks "the
    // browser is done moving the page" — a reload can resolve fonts.ready
    // near-instantly, well before restoration finishes. So this just
    // retries remeasure() a few times over the first second and a half
    // instead of trying to out-guess the ordering — cheap (the put()
    // guards skip any write that hasn't changed) and self-correcting
    // regardless of trigger order.
    [50, 150, 350, 700, 1200].forEach(ms => setTimeout(remeasure, ms));
    // plateStaticTop/runPx (measure(), below) come from runway.offsetTop,
    // which depends on the layout of everything above this section. Any
    // other <img> on the page finishing decode after this component's own
    // measure() runs reflows everything below it, silently invalidating
    // the cached values. Listening to every image directly (not just the
    // footage) closes that gap regardless of how long any one takes.
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

    // The hold itself is the transition's window — the runway is empty
    // scroll that exists only so .apps__intro (sticky) reads as pinned in
    // place while it passes beneath. Riding the same distance means the
    // swap finishes exactly as the hold ends.
    //
    // Kept section-relative throughout, not converted to document/scrollY
    // coordinates — .apps has its own position:relative, so
    // runway.offsetTop is already relative to .apps, not the page. Using
    // it against window.scrollY directly would fire the whole crossfade at
    // the top of the page instead of at the hold.
    // section.getBoundingClientRect().top, read live every frame, closes
    // the gap between the two coordinate spaces (same fix as
    // initClosingHandoff/initClosingEntrance's runway).
    let pinOffset = 0, runPx = 0, preroll = 0;
    function measure() {
      const introTopPx = parseFloat(getComputedStyle(intro).top) || 0;
      // Runway is a plain flow element, so its own offsetTop is reliable
      // (relative to .apps) even while intro above it is sticky-
      // displaced.
      const introStaticTop = runway.offsetTop - intro.offsetHeight;
      pinOffset = introTopPx - introStaticTop;
      runPx = runway.offsetHeight;
      // How far before the pin the crossfade starts — starting exactly at
      // t=0 read as an abrupt cut right as the title caught. Scaled off
      // viewport, like initApplicationsEntrance's vh*.55, so the two
      // motions read as one approach.
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
      // carried up by exactly the scroll past that point instead of being
      // left to CSS's own sticky release. position:sticky does release on
      // its own once its containing block runs out, but it releases by
      // tracking that container's trailing edge, not the title's true
      // static position, leaving a permanent, unpredictable offset
      // (measured 44px short of .apps__showcase's margin-top, not 0).
      // Translating explicitly, 1px per 1px of scroll past the hold,
      // starts from an exact known point instead. Continuous at the seam —
      // at raw===runPx this is translateY(0), exactly where CSS sticky
      // already had it pinned.
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
  // ahead (m_1.jpg … m_30.jpg, see index.html) so dropping the next file
  // straight into images/ makes it appear with no HTML changes. Whichever
  // numbers don't exist yet 404; this hides those elements (display:none
  // removes them from flow, so no broken-image icon or stray gap) rather
  // than leaving them visible.
  function initApplicationsPhotoStack() {
    const solos = Array.from(document.querySelectorAll('.apps__photo'));
    const galleries = Array.from(document.querySelectorAll('.apps__gallery'));

    const isBroken = img => img.complete && img.naturalWidth === 0;

    solos.forEach(img => {
      if (isBroken(img)) { img.style.display = 'none'; return; }
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    });

    // Photos land one at a time in order, so a pair's second half is
    // routinely just not-there-yet rather than a permanent gap. Whichever
    // side has a real image shows immediately at full width (see
    // .apps__gallery--left-only/--right-only in style.css); only hide the
    // row outright once neither side has anything.
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

  /* ---------- Horizontal touch-scroll rows: progress dots ----------
     One reusable implementation for every horizontal scroll-snap row in
     this project: each gets a small dot per card, injected after it,
     toggling .is-active by the same "closest to the row's own centre" test
     used elsewhere for the active card (initApproachActive's
     updateHorizontal, updateColorHeadSync, etc). */
  function initHorizontalScrollDots() {
    const ROWS = [
      { wrap: '.acycle__steps', item: '.acycle__step', when: isCompact },
      { wrap: '.vwipe__vision', item: '.vwipe__vstep', when: isVwipeCompact },
      { wrap: '.whyp__copy-sticky', item: '.whyp__step', when: isWhypCompact },
      { wrap: '.brandid__dna-items', item: '.brandid__dna-item', when: isDnaCompact },
      // Color Principle's dots are created + driven in initBrandIdentity
      // (updateColorHeadSync) instead — its cards are stacked cross-fade
      // layers, not sliding items, so this generic "active = card nearest
      // the wrap's centre" test can't tell them apart, and the caption
      // (not the cards-row wrap) is the actual scroll container.
    ];
    ROWS.forEach(({ wrap, item, when }) => {
      if (!when()) return;
      const el = document.querySelector(wrap);
      if (!el) return;
      const items = Array.from(el.querySelectorAll(item));
      if (items.length < 2) return;
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'hscroll-dots';
      dotsWrap.setAttribute('aria-hidden', 'true');
      const dots = items.map(() => {
        const d = document.createElement('span');
        d.className = 'hscroll-dot';
        dotsWrap.appendChild(d);
        return d;
      });
      el.insertAdjacentElement('afterend', dotsWrap);

      function update() {
        const wrapRect = el.getBoundingClientRect();
        const center = wrapRect.left + wrapRect.width / 2;
        let idx = 0, best = Infinity;
        items.forEach((it, i) => {
          const r = it.getBoundingClientRect();
          const dist = Math.abs((r.left + r.width / 2) - center);
          if (dist < best) { best = dist; idx = i; }
        });
        dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
      }
      update();
      el.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
    });
  }

  initHorizontalScrollDots();

  // .hscroll-dots for Color Principle didn't exist yet when
  // updateColorHeadSync (initBrandIdentity, above) first ran at page
  // load, so the dots never got their initial colour sync — it's scoped
  // to that function's own closure and can't be called directly from
  // here, so re-firing its existing 'scroll' listener does the same job.
  // Dots are a real descendant of .brandid__color-caption now (moved
  // into .brandid__color-cards-row's own position, immediately after
  // it), so no separate touch-forwarding wiring is needed here either —
  // native scroll already covers them.
  if (isBlueprintCompact()) {
    const colorCaptionEl = document.querySelector('.brandid__color-caption');
    if (colorCaptionEl) colorCaptionEl.dispatchEvent(new Event('scroll'));
  }

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

    // Plain random-per-bar timer, not a Web Audio AnalyserNode — no audio
    // graph to silently fail while playback carries on with zero visible
    // feedback. Each bar picks its own random height at its own random
    // interval, not a shared CSS @keyframes loop (which kept every bar at
    // the same height at any instant). The CSS `transition: height`
    // already on .music-toggle__bar turns each into a glide, not a snap.
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

  // Used by both the music-toggle equalizer and the hero wordmark (once
  // it's acting as a persistent nav mark) — one shared implementation
  // rather than two copies drifting apart.
  function initContrastSwitchers() {
    // Each target carries its own scope key — an override can restrict
    // itself to one target (e.g. the loop clip's dark override only
    // applies to the equalizer, not the hero logo which sits far from
    // where that clip renders) via data-eq-bg-<scope>, while an override
    // with no scope (Vision Wipe, Our Approach, Brand Wall, Color Story)
    // still applies to every target.
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
    // looking first for an explicit data-eq-bg override — several sections
    // paint their real mood through a background image/video or a
    // ::before ink backdrop, none of which show up as a plain
    // background-color a luminance sample could read. Only falls back to
    // sampling an actual background-color where no section has opted into
    // an explicit override.
    // A scope-specific key (data-eq-bg-equalizer / data-eq-bg-logo) wins
    // over the shared data-eq-bg when both are present — needed for Brand
    // Wall, where the video shrinks around one shared centre but the two
    // targets sit at different margins from their own corner, so they
    // don't uncover at the same scale value.
    // Samples actual pixels under the point for images, since a flat
    // background-color can't capture a photo's local brightness. Applies to
    // any <img>, not scoped to Applications' own images specifically.
    const imageSampleCache = new WeakMap();
    function sampleImageLuminance(img, clientX, clientY) {
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
      // object-fit:cover crops the natural bitmap to fill the box; account for that when mapping to natural-pixel coords.
      let nx, ny;
      if (getComputedStyle(img).objectFit === 'cover') {
        const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const dispW = img.naturalWidth * scale, dispH = img.naturalHeight * scale;
        const offX = (dispW - rect.width) / 2, offY = (dispH - rect.height) / 2;
        nx = (relX * rect.width + offX) / scale;
        ny = (relY * rect.height + offY) / scale;
      } else {
        nx = relX * img.naturalWidth;
        ny = relY * img.naturalHeight;
      }
      const SAMPLE = 24; // small patch, not one pixel — smooths over noise/compression right under the point
      const sx = Math.max(0, Math.min(img.naturalWidth - SAMPLE, nx - SAMPLE / 2));
      const sy = Math.max(0, Math.min(img.naturalHeight - SAMPLE, ny - SAMPLE / 2));
      const sw = Math.min(SAMPLE, img.naturalWidth - sx);
      const sh = Math.min(SAMPLE, img.naturalHeight - sy);
      if (sw <= 0 || sh <= 0) return null;
      // Canvas is cached per image and reused, since this runs on every scroll-driven update().
      let entry = imageSampleCache.get(img);
      if (!entry) {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        entry = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
        imageSampleCache.set(img, entry);
      }
      try {
        entry.ctx.clearRect(0, 0, SAMPLE, SAMPLE);
        entry.ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const data = entry.ctx.getImageData(0, 0, sw, sh).data;
        let sum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += relLuminance(data[i], data[i + 1], data[i + 2]);
          count++;
        }
        return count ? sum / count : null;
      } catch (e) {
        // Cross-origin/tainted canvas or a decode failure — fall through
        // to the background-colour check below rather than throwing.
        return null;
      }
    }

    function isLightAt(el, scope, x, y) {
      let node = el;
      const scopedKey = scope ? 'eqBg' + scope[0].toUpperCase() + scope.slice(1) : null;
      while (node && node !== document.documentElement) {
        if (node.dataset) {
          if (scopedKey && node.dataset[scopedKey]) return node.dataset[scopedKey] === 'light';
          if (node.dataset.eqBg) return node.dataset.eqBg === 'light';
        }
        node = node.parentElement;
      }
      if (el.tagName === 'IMG') {
        const sampled = sampleImageLuminance(el, x, y);
        if (sampled !== null) return sampled > .5;
      }
      node = el;
      while (node && node !== document.documentElement) {
        const rgb = parseRgb(getComputedStyle(node).backgroundColor);
        if (rgb && rgb.a > 0) return relLuminance(rgb.r, rgb.g, rgb.b) > .5;
        node = node.parentElement;
      }
      return false; // falls back to --ink (the hero's own colour) — i.e. "dark", paper bars/mark
    }

    // The Symbol Construction loop clip is deliberately pointer-events:none
    // (decorative, must not intercept clicks), but elementFromPoint's
    // hit-testing follows the same rules as real pointer events, so it
    // skips pointer-events:none elements entirely and returns whatever is
    // underneath instead — isLightAt's data-eq-bg walk would never see the
    // clip's own override at all this way.
    //
    // Not a geometric point-in-rect check against the caller's position —
    // while the clip is animating (scale, translate) it doesn't always
    // cover the equalizer's exact pixel even though it's clearly still on
    // screen, which read as colour flipping mid-transition. Instead it's
    // just "is this overlay meaningfully visible anywhere," unconditional
    // for as long as it has any real opacity.
    function activeOverlayOverride(scope) {
      const overlays = document.querySelectorAll('[data-eq-bg]');
      for (const el of overlays) {
        // Excludes geo-marked zones (handled by geometricOverlayOverride below) —
        // otherwise they'd apply everywhere since they're always present in the DOM.
        if (el.dataset.eqBgGeo !== undefined) continue;
        if (getComputedStyle(el).pointerEvents !== 'none') continue;
        if (parseFloat(getComputedStyle(el).opacity) <= .05) continue;
        const restrictTo = el.dataset.eqBgScope;
        if (restrictTo && restrictTo !== scope) continue;
        return el.dataset.eqBg === 'light';
      }
      return null;
    }

    // For static pointer-events:none zones that elementFromPoint can't hit-test;
    // checked by actual screen position, unlike activeOverlayOverride above.
    function geometricOverlayOverride(scope, x, y) {
      const overlays = document.querySelectorAll('[data-eq-bg][data-eq-bg-geo]');
      for (const el of overlays) {
        const restrictTo = el.dataset.eqBgScope;
        if (restrictTo && restrictTo !== scope) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return el.dataset.eqBg === 'light';
        }
      }
      return null;
    }

    let ticking = false;

    function update() {
      ticking = false;
      targets.forEach(({ el, scope }) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const geoOverlay = geometricOverlayOverride(scope, x, y);
        if (geoOverlay !== null) {
          el.classList.toggle('is-on-light', geoOverlay);
          return;
        }

        const overlay = activeOverlayOverride(scope);
        if (overlay !== null) {
          el.classList.toggle('is-on-light', overlay);
          return;
        }

        // elementFromPoint would just return EL itself at its own
        // centre — hide it for the one synchronous hit-test, same
        // frame, so it can't paint in between.
        el.style.visibility = 'hidden';
        const hit = document.elementFromPoint(x, y);
        el.style.visibility = '';
        if (!hit) return;
        el.classList.toggle('is-on-light', isLightAt(hit, scope, x, y));
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

  // This is the hero's own wordmark acting as a persistent nav element,
  // not a separate mark. It's already position:fixed (style.css) at the
  // same top-left spot it always occupied, so this only adds the
  // scroll-direction slide and the click-to-home behaviour on top of the
  // existing entrance.
  function initHeroLogoNav() {
    const btn = document.getElementById('heroLogo');
    if (!btn) return;

    // .hero has position:relative + z-index:1 to layer its content above
    // .hero-bleed__bg, but that also establishes a stacking context — a
    // position:fixed descendant only escapes it for layout, not paint
    // order. Once .is-nav-fixed switches the button to fixed, it was still
    // compared against other sections at .hero's own z-index:1, not the
    // true page root, so any later section whose content also reaches
    // z-index:1 could win that tie by DOM order and swallow its clicks
    // (confirmed: elementFromPoint at the button's screen position
    // returned .acycle__step, not the button). Fixed by actually moving
    // the button out to <body> whenever it's in nav-fixed mode, and back
    // to its original spot in .hero when inside the hero again.
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

    // The button sits top:20-28px down from the viewport, so the offset
    // must clear top + height + a margin to actually send it off-screen —
    // a translate sized only to the mark's own height leaves it a few px
    // from the top edge, still visibly "stuck" while scrolling down.
    const HIDE_Y = -120; // px

    // Stays put no matter which way the page scrolls for as long as the
    // reader is inside the hero — direction-based hide/show starts from
    // the next section (Our Philosophy). Measured against #ourPhilosophy's
    // own document position rather than a fixed viewport-height guess, so
    // it tracks the real section boundary if the hero ever changes height.
    const nextSection = document.getElementById('ourPhilosophy');
    let stayPutBelow = window.innerHeight * .5;
    function measureStayPutBelow() {
      if (nextSection) {
        stayPutBelow = window.scrollY + nextSection.getBoundingClientRect().top;
      }
    }
    measureStayPutBelow();

    // Shape DNA's left column is a sticky, pinned viewport-height stage for
    // its whole runway — the mark would otherwise sit on top of that video
    // the entire time it's playing. "visible" here just means the
    // section's scroll range is currently pinning its sticky stage across
    // the viewport.
    const shapeDna = document.getElementById('shapeDna');

    // Crossing the hero seam does two instantaneous things at once: it
    // swaps position absolute ⇄ fixed, and moves the node between .hero
    // and <body>. The position swap is a jump by definition (the mark's
    // absolute home is a screenful above the viewport by then), and
    // re-inserting the node cancels whatever transition was in flight — so
    // scrolling back up, the mark was visible one frame and simply gone
    // the next. Fading it down across the swap gives the seam somewhere to
    // hide: nothing is on screen at the moment the jump happens.
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
        // Just crossed the boundary this frame. On a slow/gradual scroll
        // the per-frame delta can land under the 1px scrollingDown
        // threshold on the exact frame the boundary is crossed. Forcing
        // hidden=true here, in the same call that flips is-nav-fixed,
        // means there's never a frame where it's fixed (visible at its
        // resting spot) before the direction check catches up.
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

    // Lenis's own eased scrollTo where available (the same instance every
    // other smooth-scroll interaction on this page uses), plain native
    // smooth-scroll otherwise.
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

  // Centres the whole cue (label + line) over the equalizer's horizontal
  // centre. Measured rather than a fixed offset, since the cue's own width
  // depends on the label's rendered glyph width.
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

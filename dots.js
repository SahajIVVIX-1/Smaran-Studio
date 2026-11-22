/*
 * A small version of the Smaran dots: three strokes in a 64×64 box that dance as dots and morph
 * into shapes (the S mark, a bell, a check, a heart, a clock). Every stroke is resampled to the
 * same number of points, so any shape can flow into any other point by point.
 *
 * Use: <svg data-dots="smark,dance,bell" data-hold="2.6"></svg>
 */
(function () {
  const N = 40;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const COLORS = {
    primary: 'var(--logo-primary)',
    accent: 'var(--logo-accent)',
    accent2: 'var(--logo-accent-2)',
    alert: 'var(--logo-alert)',
    success: 'var(--logo-success)',
    error: 'var(--logo-error)',
  };

  function resample(poly) {
    const cum = [0];
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[cum.length - 1];
    if (!total) return Array.from({ length: N }, () => poly[0]);
    const out = [];
    let seg = 1;
    for (let k = 0; k < N; k++) {
      const d = (total * k) / (N - 1);
      while (seg < poly.length - 1 && cum[seg] < d) seg++;
      const a = poly[seg - 1];
      const b = poly[seg];
      const len = cum[seg] - cum[seg - 1];
      const u = len > 0 ? (d - cum[seg - 1]) / len : 0;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  }

  function arc(cx, cy, r, a0, a1, steps = 48) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  }

  const stroke = (poly, color, width = 5) => ({ pts: resample(poly), color, width });
  const dot = (x, y, color, width = 10) => ({
    pts: Array.from({ length: N }, () => [x, y]),
    color,
    width,
  });

  function rotate(s, cx, cy, deg) {
    const a = deg * DEG;
    const c = Math.cos(a);
    const n = Math.sin(a);
    return {
      ...s,
      pts: s.pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * n, cy + (x - cx) * n + (y - cy) * c]),
    };
  }
  function scale(s, k) {
    return { ...s, pts: s.pts.map(([x, y]) => [32 + (x - 32) * k, 32 + (y - 32) * k]) };
  }

  const SCENES = {
    // The Smaran mark: two arcs make the S, a dot sits at its shoulder.
    smark: (t) =>
      [
        stroke(arc(32, 22, 10, -30, -270), 'primary'),
        stroke(arc(32, 42, 10, -90, 150), 'primary'),
        dot(32 + 25 * Math.cos(-45 * DEG), 32 + 25 * Math.sin(-45 * DEG), 'accent'),
      ].map((s) => scale(s, 1 + 0.025 * Math.sin((TAU * t) / 3))),
    // Three dots chasing each other round a circle.
    dance: (t) =>
      ['primary', 'accent', 'accent2'].map((color, i) => {
        const a = t * 2.1 + (i * TAU) / 3;
        const r = 13 + 3 * Math.sin(t * 2.6);
        return dot(32 + r * Math.cos(a), 32 + r * Math.sin(a) * 0.9, color);
      }),
    // A ringing bell.
    bell: (t) => {
      const swing = 12 * Math.sin(t * 7) * Math.max(0, Math.sin((t * TAU) / 2.4));
      const body = stroke(
        [[15, 45], [20, 40], [20, 29], ...arc(32, 29, 12, 180, 360), [44, 29], [44, 40], [49, 45], [15, 45]],
        'primary',
      );
      return [
        rotate(body, 32, 14, swing),
        rotate(dot(32, 51, 'alert', 7), 32, 14, swing * 1.4),
        dot(32, 14, 'primary', 5),
      ];
    },
    // Done.
    check: () => [
      stroke([[16, 33], [27, 44], [48, 21]], 'success', 6),
      dot(27, 44, 'success', 0),
      dot(48, 21, 'success', 0),
    ],
    // A beating heart.
    heart: (t) => {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU;
        pts.push([
          32 + 1.15 * 16 * Math.sin(a) ** 3,
          31 - 1.15 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)),
        ]);
      }
      const beat = 1 + 0.06 * Math.max(0, Math.sin(t * 6)) ** 4;
      return [
        scale(stroke(pts, 'error'), beat),
        dot(32, 32, 'error', 0),
        dot(32, 32, 'error', 0),
      ];
    },
    // A clock with moving hands.
    clock: (t) => [
      stroke(arc(32, 32, 19, -90, 270, 64), 'primary'),
      stroke([[32, 32], [32 + 9 * Math.cos(t * 0.6 - 1.2), 32 + 9 * Math.sin(t * 0.6 - 1.2)]], 'accent', 5),
      stroke([[32, 32], [32 + 14 * Math.cos(t * 3 - 1.6), 32 + 14 * Math.sin(t * 3 - 1.6)]], 'accent2', 4),
    ],
  };

  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const lerp = (a, b, u) => a + (b - a) * u;

  function mix(from, to, u) {
    return from.map((f, i) => {
      const g = to[i];
      return {
        pts: f.pts.map((p, k) => [lerp(p[0], g.pts[k][0], u), lerp(p[1], g.pts[k][1], u)]),
        width: lerp(f.width, g.width, u),
        color: u < 0.5 ? f.color : g.color,
      };
    });
  }

  const d = (pts) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');

  function mount(svg) {
    const names = (svg.dataset.dots || 'smark').split(',').filter((n) => SCENES[n]);
    if (!names.length) names.push('smark');
    const hold = Number(svg.dataset.hold || 2.6);
    const morph = 0.9;
    svg.setAttribute('viewBox', '-4 -4 72 72');
    svg.setAttribute('aria-hidden', 'true');
    const paths = [0, 1, 2].map(() => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      return p;
    });
    const draw = (frame) =>
      frame.forEach((s, i) => {
        paths[i].setAttribute('d', d(s.pts));
        paths[i].setAttribute('stroke-width', Math.max(0, s.width).toFixed(2));
        paths[i].setAttribute('stroke', COLORS[s.color]);
        paths[i].style.opacity = s.width < 0.4 ? '0' : '1';
      });

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (still.matches) {
      draw(SCENES[names[0]](0));
      return;
    }
    const start = performance.now();
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(svg);
    function tick(now) {
      if (visible) {
        const t = (now - start) / 1000;
        const lap = hold + morph;
        const idx = Math.floor(t / lap);
        const into = t - idx * lap;
        const cur = SCENES[names[idx % names.length]];
        if (into < hold || names.length === 1) draw(cur(t));
        else {
          const next = SCENES[names[(idx + 1) % names.length]];
          draw(mix(cur(t), next(t), ease((into - hold) / morph)));
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  document.querySelectorAll('svg[data-dots]').forEach(mount);
  window.SmaranDots = { mount };
})();

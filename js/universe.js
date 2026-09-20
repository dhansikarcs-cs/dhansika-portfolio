(function () {
  'use strict';

  /* ===================================================================
     UNIVERSE â€” one persistent field of particles.  Every particle holds
     a home in each scene, and each scene is a living scenery of light:
     a turning galaxy Â· outward ripples of calm Â· falling rain Â·
     a quiet starfield Â· a woven lattice Â· a constellation Â· a rising
     swell Â· wandering script Â· a deep swirl Â· a ledger of points Â·
     concentric bands Â· a drifting constellation.  The same particles
     flow from scene to scene, so scrolling reshapes the sky; the scene
     you're reading is told by colour, not by a symbol.  Only the scene
     you're on is alive: its ripples breathe, its stars twinkle, its
     drops fall, and the whole field keeps drifting so nothing ever
     stands still.  Honors reduced motion.  Everything seeded â€”
     identical every load.
     =================================================================== */

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.getElementById('universe');
  if (reduced || !cv) return;

  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, CX = 0, CY = 0;

  var mouse = { x: -1e4, y: -1e4, on: false };
  var phase = 0, startT = 0, lastT = 0, raf = null, flash = 0, cursorBurst = 1;

  var THEMES = {
    archive:  { c: [233, 154, 63] },
    identity: { c: [198, 138, 52] },
    sentinel: { c: [92, 215, 178] },
    research: { c: [232, 174, 110] },
    projects: { c: [122, 178, 225] },
    systems:  { c: [138, 208, 194] },
    skills:   { c: [180, 137, 222] },
    beyond:   { c: [222, 136, 168] },
    writing:  { c: [216, 201, 165] },
    think:    { c: [168, 184, 197] },
    creds:    { c: [222, 201, 170] },
    now:      { c: [233, 154, 63] },
    about:    { c: [214, 224, 228] },
    connect:  { c: [240, 178, 108] }
  };
  var CANON = ['archive', 'identity', 'sentinel', 'research', 'projects', 'systems',
               'skills', 'beyond', 'writing', 'think', 'creds', 'now', 'about', 'connect'];

  var scenes = null;          /* keys present on this page, in DOM order */
  var elts = [];              /* section elements, same order */
  var mids = [];              /* section vertical midpoints */
  var sp = 0, targetSP = 0;   /* continuous scroll position in scene space */
  var flowVel = 0, lastVc = -1;   /* smoothed scroll velocity, drives particle flow speed */

  var particles = [];         /* the persistent field */
  var N = 0;
  var guidesAll = [];         /* per-scene guide geometry */
  var homesAll = [];          /* per-scene home positions */

  var curCol = THEMES.archive.c.slice();

  var rnd = seeded(1);
  var glowSprite = null;

  var FX = {};                /* per-scene living state */
  var lastDom = -1;

  /* ---------------- deterministic randomness ---------------- */

  function hashStr(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }
  function seeded(h) {
    var s = h >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function eio(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function cstr(c, a) {
    return 'rgba(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ',' + a + ')';
  }
  function Pk() { return Math.min(W, H); }

  /* ---------------- shared scene geometry helpers ---------------- */

  function treePts(cx, cy, base) {
    var segs = [], tips = [], nodes = [];
    (function br(x, y, ang, len, depth) {
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      segs.push({ x1: x, y1: y, x2: x2, y2: y2, d: depth });
      if (depth >= 4 || len < 12) { tips.push({ x: x2, y: y2, a: ang }); return; }
      nodes.push({ x: x2, y: y2 });
      br(x2, y2, ang - 0.30, len * 0.72, depth + 1);
      br(x2, y2, ang + 0.30, len * 0.72, depth + 1);
      if (depth > 2) br(x2, y2, ang, len * 0.72, depth + 1);
    })(cx, cy + 46, -Math.PI / 2, base, 0);
    return { segs: segs, tips: tips, nodes: nodes };
  }

  function netNodes() {
    var L = [4, 5, 4, 2], xs = [-0.19, -0.07, 0.07, 0.19], nodes = [];
    for (var l = 0; l < L.length; l++) {
      for (var i = 0; i < L[l]; i++) {
        var fy = L[l] === 1 ? 0 : (i - (L[l] - 1) / 2) / ((L[l] - 1) / 2);
        nodes.push({ l: l, i: i, x: CX + xs[l] * Pk(), y: CY + fy * Pk() * 0.14 });
      }
    }
    var edges = [];
    for (var a = 0; a < nodes.length; a++) for (var b2 = 0; b2 < nodes.length; b2++) {
      if (nodes[b2].l === nodes[a].l + 1) edges.push([a, b2]);
    }
    return { nodes: nodes, edges: edges };
  }

  function setPt(v, k) { return { x: CX + v[0] * Pk(), y: CY + v[1] * Pk(), i: k }; }

  /* ---------------- scene home builders ---------------- */

  function ellPer(ax, by) { return Math.PI * (3 * (ax + by) - Math.sqrt((3 * ax + by) * (ax + 3 * by))); }

  function ellHome(m, t) {
    var a = (m.a0 || 0) + (m.sp || 0.1) * t;
    var xx = Math.cos(a) * m.rx, yy = Math.sin(a) * m.ry;
    var cr = Math.cos(m.rot || 0), sr = Math.sin(m.rot || 0);
    return { x: (m.cx || CX) + xx * cr - yy * sr, y: (m.cy || CY) + xx * sr + yy * cr };
  }

  function rotAbout(x, y, cx, cy, th) {
    var co = Math.cos(th), si = Math.sin(th), dx = x - cx, dy = y - cy;
    return { ox: cx + dx * co - dy * si, oy: cy + dx * si + dy * co };
  }

  /* Field homes sample the scene's guide glyph, so the particles literally
     form the icon while its strokes glow behind them.  A shared halo ring is
     always reserved so the whole field keeps flowing on one continuous orbit. */
  function homes_for(key, N) {
    var g = GUIDE[key] ? GUIDE[key]() : { lines: [], arcs: [], ells: [], dots: [] };
    var AMB = Math.max(4, Math.floor(N * 0.15));   /* shared ambient halo */
    var GN = N - AMB;
    var segs = [], dts = [], i;
    for (i = 0; i < g.lines.length; i++) {
      var ln = g.lines[i];
      segs.push({ x1: ln.x1, y1: ln.y1, dlx: ln.x2 - ln.x1, dly: ln.y2 - ln.y1,
                  len: Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1), p: 'L', sg: ln.sg });
    }
    for (i = 0; i < g.arcs.length; i++) {
      var ar = g.arcs[i], a0 = ar.a0 || 0;
      var sw = (ar.a1 !== undefined ? ar.a1 : a0 + Math.PI * 2) - a0;
      segs.push({ cx: ar.cx || CX, cy: ar.cy || CY, r: ar.r, yt: ar.yt || 1, a0: a0, sw: sw,
                  len: Math.abs(sw) * ar.r, p: 'A' });
    }
    for (i = 0; i < g.ells.length; i++) {
      var el = g.ells[i];
      segs.push({ cx: el.cx || CX, cy: el.cy || CY, rx: el.rx, ry: el.ry, rot: el.rot || 0,
                  len: ellPer(el.rx, el.ry), p: 'E' });
    }
    for (i = 0; i < g.dots.length; i++) dts.push(g.dots[i]);

    var out = [];
    var A = Math.min(dts.length, Math.max(2, Math.floor(GN * 0.2)));
    for (var j = 0; j < A; j++) {
      var d = dts[j];
      var m = { p: 'D', x: d.x, y: d.y, u: (j * 0.31) % 1 };
      if (d.ang !== undefined) { m.ang = d.ang; m.r0 = d.r0; m.r1 = d.r1; m.cx = d.cx; m.cy = d.cy; }
      if (d.rx !== undefined) { m.rx = d.rx; m.ry = d.ry; m.rot = d.rot; m.cx = d.cx; m.cy = d.cy; m.a0 = d.a0; m.sp = d.sp; }
      out.push({ x: d.x, y: d.y, sz: d.sz || 1.8, big: (d.sz || 1.8) >= 2.4 ? 2 : (d.sz || 1.8) > 1.6 ? 1 : 0, m: m });
    }

    var TL = 0;
    for (i = 0; i < segs.length; i++) TL += segs[i].len;
    if (TL > 0) {
      var K = GN - out.length;
      for (var k2 = 0; k2 < K; k2++) {
        var tgt = ((k2 + 0.5) / K) * TL, cum = 0, si = 0;
        while (si < segs.length - 1 && cum + segs[si].len < tgt) { cum += segs[si].len; si++; }
        var seg = segs[si];
        var u = seg.len > 0 ? (tgt - cum) / seg.len : 0;
        var px, py, mm;
        if (seg.p === 'L') {
          px = seg.x1 + seg.dlx * u; py = seg.y1 + seg.dly * u;
          mm = { p: 'L', x1: seg.x1, y1: seg.y1, dx: seg.dlx, dy: seg.dly, u: u, x: px, y: py };
          if (seg.sg) mm.sg = seg.sg;
        } else if (seg.p === 'A') {
          var aa = seg.a0 + u * seg.sw;
          px = seg.cx + Math.cos(aa) * seg.r; py = seg.cy + Math.sin(aa) * seg.r * seg.yt;
          mm = { p: 'A', cx: seg.cx, cy: seg.cy, r: seg.r, yt: seg.yt, a0: seg.a0, sw: seg.sw, u: u, x: px, y: py };
        } else {
          var ae = u * Math.PI * 2;
          var xx = Math.cos(ae) * seg.rx, yy = Math.sin(ae) * seg.ry;
          var cr = Math.cos(seg.rot), sr = Math.sin(seg.rot);
          px = seg.cx + xx * cr - yy * sr; py = seg.cy + xx * sr + yy * cr;
          mm = { p: 'E', cx: seg.cx, cy: seg.cy, rx: seg.rx, ry: seg.ry, rot: seg.rot, u: u, x: px, y: py };
        }
        out.push({ x: px, y: py, sz: seg.p === 'L' ? 0.85 : 1.05, m: mm });
      }
    }
    while (out.length < GN) out.push({ x: CX, y: CY, sz: 0.8, m: { p: 'D', x: CX, y: CY } });

    /* shared halo ring â€” identical in every scene so the field always flows */
    var RR = Pk() * 0.175;
    for (i = 0; i < AMB; i++) {
      var ang = (i / AMB) * Math.PI * 2 + 0.35;
      out.push({ x: CX + Math.cos(ang) * RR, y: CY + Math.sin(ang) * RR, sz: 0.9, big: 0,
                 m: { p: 'A', cx: CX, cy: CY, r: RR, yt: 1, a0: ang, u: i / AMB, sw: Math.PI * 2, amb: 1,
                      x: CX + Math.cos(ang) * RR, y: CY + Math.sin(ang) * RR } });
    }
    return out;
  }

  var DSETS = [[[-0.24, -0.03], [-0.13, -0.02], [-0.02, -0.02], [0.08, -0.05], [0.12, 0.07], [-0.10, 0.10], [-0.15, -0.06]],
               [[0.17, -0.02], [0.21, 0.03], [0.16, 0.09]]];

  /* ---------------- scene guide geometry (pictures drawn in particle lines) ----------------
     Each scene is a recognizable picture â€” a tree, a person, a computer, a kernel â€”
     drawn as line-work the particles ride along.  Never solid, never scattered dots. */

  function PL(L, pts, w, a) {           /* polyline helper: turn a path into segments */
    for (var i = 0; i < pts.length - 1; i++) {
      L.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], w: w, a: a });
    }
    return L;
  }
  function ringLines(L, cx, cy, r, n, w, a) {   /* a circle drawn as short line segments */
    for (var i = 0; i < n; i++) {
      var t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
      L.push({ x1: cx + Math.cos(t0) * r, y1: cy + Math.sin(t0) * r, x2: cx + Math.cos(t1) * r, y2: cy + Math.sin(t1) * r, w: w, a: a });
    }
    return L;
  }

  function guide_tree() {          /* archive â€” a rooted tree, drawn as branching lines */
    var R = Pk(), t = treePts(CX, CY + R * 0.12, R * 0.16), L = [], D = [], i;
    for (i = 0; i < t.segs.length; i++) {
      var s = t.segs[i];
      L.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, w: 1.1 - s.d * 0.16, a: 0.55 });
    }
    for (i = 0; i < t.tips.length; i++) D.push({ x: t.tips[i].x, y: t.tips[i].y, sz: 1.5 });
    L.push({ x1: CX - R * 0.1, y1: CY + R * 0.12, x2: CX + R * 0.1, y2: CY + R * 0.12, w: 0.7, a: 0.35 });
    return { lines: L, arcs: [], ells: [], dots: D };
  }
  function guide_girl() {          /* identity â€” a teen girl, a portrait in lines */
    var R = Pk(), u = R * 0.012, L = [];
    var cyh = CY - R * 0.14;
    /* hair (long, framing the face) */
    PL(L, [[CX - u * 6, cyh - u * 6], [CX - u * 6.5, cyh + u * 4], [CX - u * 6, cyh + u * 12], [CX - u * 3.5, cyh + u * 16], [CX - u * 1.5, cyh + u * 18]], 0.9, 0.6);
    PL(L, [[CX + u * 6, cyh - u * 6], [CX + u * 6.5, cyh + u * 4], [CX + u * 6, cyh + u * 12], [CX + u * 3.5, cyh + u * 16], [CX + u * 1.5, cyh + u * 18]], 0.9, 0.6);
    PL(L, [[CX - u * 6, cyh - u * 6], [CX, cyh - u * 7], [CX + u * 6, cyh - u * 6]], 0.9, 0.55);   /* fringe/top */
    /* face oval */
    ringLines(L, CX, cyh - u * 1, u * 6, u * 8, 22, 0.9, 0.6);
    /* eyes */
    L.push({ x1: CX - u * 2.6, y1: cyh + u * 1, x2: CX - u * 1.4, y2: cyh + u * 1, w: 0.6, a: 0.6 });
    L.push({ x1: CX + u * 1.4, y1: cyh + u * 1, x2: CX + u * 2.6, y2: cyh + u * 1, w: 0.6, a: 0.6 });
    /* nose + smile */
    PL(L, [[CX, cyh + u * 2.6], [CX - u * 0.2, cyh + u * 3.4]], 0.5, 0.4);
    PL(L, [[CX - u * 1.6, cyh + u * 3.6], [CX - u * 0.6, cyh + u * 4.4], [CX + u * 0.6, cyh + u * 4.4], [CX + u * 1.6, cyh + u * 3.6]], 0.6, 0.5);
    /* neck + shoulders */
    L.push({ x1: CX, y1: cyh + u * 8, x2: CX, y2: cyh + u * 11, w: 0.7, a: 0.5 });
    PL(L, [[CX - u * 7, cyh + u * 12], [CX - u * 4.5, cyh + u * 10.5], [CX + u * 4.5, cyh + u * 10.5], [CX + u * 7, cyh + u * 12]], 0.9, 0.6);
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_computer() {      /* sentinel â€” a computer on a desk, watching */
    var R = Pk(), u = R * 0.012, L = [], i;
    var mx = CX, my = CY - R * 0.03;
    L.push({ x1: mx - u * 11, y1: my - u * 10, x2: mx + u * 11, y2: my - u * 10, w: 0.9, a: 0.6 });
    L.push({ x1: mx + u * 11, y1: my - u * 10, x2: mx + u * 11, y2: my + u * 7, w: 0.9, a: 0.6 });
    L.push({ x1: mx + u * 11, y1: my + u * 7, x2: mx - u * 11, y2: my + u * 7, w: 0.9, a: 0.6 });
    L.push({ x1: mx - u * 11, y1: my + u * 7, x2: mx - u * 11, y2: my - u * 10, w: 0.9, a: 0.6 });
    ringLines(L, mx, my - u * 1.5, u * 9.5, u * 6, 20, 0.5, 0.3);      /* screen */
    L.push({ x1: mx - u * 12, y1: my + u * 8, x2: mx + u * 12, y2: my + u * 8, w: 0.9, a: 0.55 });   /* screen/keyboard joint */
    L.push({ x1: mx - u * 2.5, y1: my + u * 8, x2: mx - u * 2.5, y2: my + u * 14, w: 0.8, a: 0.5 });  /* stand */
    L.push({ x1: mx - u * 5, y1: my + u * 14, x2: mx + u * 1, y2: my + u * 14, w: 0.8, a: 0.5 });
    L.push({ x1: mx - u * 9, y1: my + u * 18, x2: mx + u * 9, y2: my + u * 18, w: 0.9, a: 0.55 });    /* keyboard top */
    L.push({ x1: mx - u * 9, y1: my + u * 18, x2: mx - u * 9, y2: my + u * 22, w: 0.7, a: 0.45 });
    L.push({ x1: mx + u * 9, y1: my + u * 18, x2: mx + u * 9, y2: my + u * 22, w: 0.7, a: 0.45 });
    L.push({ x1: mx - u * 2.2, y1: my - u * 8, x2: mx - u * 2.2, y2: my + u * 6, w: 0.5, a: 0.35 });  /* blinking line */
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_microscope() {    /* research â€” a microscope, the eye on detail */
    var R = Pk(), u = R * 0.012, L = [];
    L.push({ x1: CX - u * 4, y1: CY + u * 6, x2: CX + u * 4, y2: CY + u * 6, w: 0.9, a: 0.6 });         /* base */
    L.push({ x1: CX - u * 4, y1: CY + u * 6, x2: CX - u * 2.5, y2: CY - u * 3, w: 0.9, a: 0.6 });        /* arm up */
    L.push({ x1: CX - u * 2.5, y1: CY - u * 3, x2: CX + u * 2, y2: CY + u * 3, w: 0.9, a: 0.6 });         /* arm across */
    L.push({ x1: CX - u * 2.5, y1: CY - u * 3, x2: CX - u * 5.5, y2: CY - u * 5.5, w: 0.8, a: 0.5 });    /* eyepiece */
    PL(L, [[CX + u * 2, CY + u * 3], [CX + u * 4, CY + u * 3], [CX + u * 4, CY + u * 6]], 0.8, 0.5);      /* stage arm */
    L.push({ x1: CX + u * 1.5, y1: CY + u * 6, x2: CX + u * 4.5, y2: CY + u * 6, w: 0.8, a: 0.5 });      /* stage */
    L.push({ x1: CX - u * 3.5, y1: CY + u * 1.5, x2: CX - u * 3.5, y2: CY + u * 4.5, w: 0.7, a: 0.4 });  /* focus knob */
    L.push({ x1: CX - u * 4, y1: CY + u * 6, x2: CX + u * 4, y2: CY + u * 6, w: 0.9, a: 0.6 });
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_rocket() {        /* projects â€” a rocket, a launch headed up */
    var R = Pk(), u = R * 0.012, L = [];
    var x = CX, top = CY - R * 0.16, bot = CY + R * 0.1;
    /* nose cone */
    PL(L, [[x - u * 3, top - u * 4], [x, top - u * 12], [x + u * 3, top - u * 4]], 1.0, 0.6);
    /* body */
    L.push({ x1: x - u * 3, y1: top - u * 4, x2: x - u * 3, y2: bot, w: 1.0, a: 0.6 });
    L.push({ x1: x + u * 3, y1: top - u * 4, x2: x + u * 3, y2: bot, w: 1.0, a: 0.6 });
    L.push({ x1: x - u * 3, y1: bot, x2: x + u * 3, y2: bot, w: 1.0, a: 0.6 });
    L.push({ x1: x - u * 1.5, y1: top - u * 2, x2: x - u * 1.5, y2: bot - u * 4, w: 0.6, a: 0.4 });      /* window hints */
    L.push({ x1: x + u * 1.5, y1: top - u * 2, x2: x + u * 1.5, y2: bot - u * 4, w: 0.6, a: 0.4 });
    /* fins */
    PL(L, [[x - u * 3, bot - u * 2], [x - u * 7, bot + u * 2], [x - u * 3, bot]], 0.8, 0.55);
    PL(L, [[x + u * 3, bot - u * 2], [x + u * 7, bot + u * 2], [x + u * 3, bot]], 0.8, 0.55);
    /* flame */
    PL(L, [[x - u * 2, bot], [x, bot + u * 7], [x + u * 2, bot]], 0.7, 0.5);
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_kernel() {        /* systems â€” a CPU chip, the heart of the machine */
    var R = Pk(), u = R * 0.012, L = [];
    var cx = CX, cy = CY, h = u * 7;
    L.push({ x1: cx - h, y1: cy - h, x2: cx + h, y2: cy - h, w: 1.0, a: 0.65 });
    L.push({ x1: cx + h, y1: cy - h, x2: cx + h, y2: cy + h, w: 1.0, a: 0.65 });
    L.push({ x1: cx + h, y1: cy + h, x2: cx - h, y2: cy + h, w: 1.0, a: 0.65 });
    L.push({ x1: cx - h, y1: cy + h, x2: cx - h, y2: cy - h, w: 1.0, a: 0.65 });
    /* pins on all four sides */
    for (var side = 0; side < 4; side++) {
      for (var i = 0; i < 4; i++) {
        var v = -h + (i + 0.5) * h * 2 / 4;
        var ax, ay, bx, by;
        if (side === 0) { ax = cx + v; ay = cy - h - u * 2; bx = cx + v; by = cy - h; }        /* top */
        if (side === 1) { ax = cx + h + u * 2; ay = cy + v; bx = cx + h; by = cy + v; }        /* right */
        if (side === 2) { ax = cx + v; ay = cy + h + u * 2; bx = cx + v; by = cy + h; }        /* bottom */
        if (side === 3) { ax = cx - h - u * 2; ay = cy + v; bx = cx - h; by = cy + v; }        /* left */
        L.push({ x1: ax, y1: ay, x2: bx, y2: by, w: 0.5, a: 0.4 });
      }
    }
    ringLines(L, cx, cy, h * 0.55, 22, 0.6, 0.45);   /* silicon core */
    L.push({ x1: cx, y1: cy - h * 0.55, x2: cx, y2: cy + h * 0.55, w: 0.5, a: 0.35 });
    L.push({ x1: cx - h * 0.55, y1: cy, x2: cx + h * 0.55, y2: cy, w: 0.5, a: 0.35 });
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_books() {         /* skills â€” a stack of books, knowledge piled up */
    var R = Pk(), u = R * 0.012, L = [], b;
    for (b = 0; b < 4; b++) {
      var wd = u * (8 - b * 0.5), xl = CX - wd, xr = CX + wd;
      var yTop = CY + R * 0.1 - b * u * 4.5, yBot = yTop + u * 4;
      L.push({ x1: xl, y1: yTop, x2: xr, y2: yTop, w: 0.8, a: 0.55 });
      L.push({ x1: xr, y1: yTop, x2: xr, y2: yBot, w: 0.8, a: 0.55 });
      L.push({ x1: xr, y1: yBot, x2: xl, y2: yBot, w: 0.8, a: 0.3 });
    }
    L.push({ x1: CX - u * 8, y1: CY + R * 0.1, x2: CX + u * 8, y2: CY + R * 0.1, w: 0.9, a: 0.55 });
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_planet() {        /* beyond â€” a planet with a ring, out there */
    var R = Pk(), u = R * 0.012, L = [];
    var cx = CX, cy = CY, r = u * 6.5;
    ringLines(L, cx, cy, r, 24, 0.9, 0.6);
    ringLines(L, cx, cy, r, 24, 0.4, 0.15);   /* soft inner glow */
    /* ring (ellipse drawn as segments) */
    for (var i = 0; i < 26; i++) {
      var t0 = i / 26 * Math.PI * 2, t1 = (i + 1) / 26 * Math.PI * 2;
      var rr0 = u * 10, rr1 = u * 10;
      L.push({ x1: cx + Math.cos(t0) * rr0, y1: cy + Math.sin(t0) * rr0 * 0.42, x2: cx + Math.cos(t1) * rr1, y2: cy + Math.sin(t1) * rr1 * 0.42, w: 0.8, a: 0.5 });
    }
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_openbook() {      /* writing â€” an open book, pages left open */
    var R = Pk(), u = R * 0.012, L = [], i;
    var hh = u * 6, wd = u * 8;
    L.push({ x1: CX, y1: CY - hh, x2: CX, y2: CY + hh, w: 0.9, a: 0.6 });       /* spine */
    PL(L, [[CX, CY - hh], [CX - wd, CY - hh * 0.7], [CX - wd, CY + hh * 0.7], [CX, CY + hh]], 0.9, 0.6);
    PL(L, [[CX, CY - hh], [CX + wd, CY - hh * 0.7], [CX + wd, CY + hh * 0.7], [CX, CY + hh]], 0.9, 0.6);
    for (i = 0; i < 3; i++) {
      L.push({ x1: CX - wd * 0.85, y1: CY - hh * 0.15 + i * hh * 0.42, x2: CX - wd * 0.25, y2: CY - hh * 0.15 + i * hh * 0.42, w: 0.5, a: 0.3 });
      L.push({ x1: CX + wd * 0.25, y1: CY - hh * 0.15 + i * hh * 0.42, x2: CX + wd * 0.85, y2: CY - hh * 0.15 + i * hh * 0.42, w: 0.5, a: 0.3 });
    }
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_brain() {         /* think â€” a brain, two folded hemispheres */
    var R = Pk(), u = R * 0.012, L = [];
    var cx = CX, cy = CY, r = u * 7;
    ringLines(L, cx - u * 2.5, cy, r, 22, 0.9, 0.6);   /* left lobe */
    ringLines(L, cx + u * 2.5, cy, r, 22, 0.9, 0.6);   /* right lobe */
    L.push({ x1: cx - u * 3.5, y1: cy - r * 0.6, x2: cx + u * 3.5, y2: cy - r * 0.6, w: 0.8, a: 0.5 }); /* top fold */
    L.push({ x1: cx - u * 4, y1: cy, x2: cx + u * 4, y2: cy, w: 0.7, a: 0.4 });
    L.push({ x1: cx - u * 3, y1: cy + r * 0.55, x2: cx + u * 3, y2: cy + r * 0.55, w: 0.8, a: 0.5 });
    L.push({ x1: cx - u * 1.2, y1: cy - r, x2: cx - u * 1.2, y2: cy + r, w: 0.6, a: 0.4 });
    L.push({ x1: cx + u * 1.2, y1: cy - r, x2: cx + u * 1.2, y2: cy + r, w: 0.6, a: 0.4 });
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_trophy() {        /* creds â€” a trophy, an award hard-won */
    var R = Pk(), u = R * 0.012, L = [];
    var top = CY - R * 0.14, x = CX;
    PL(L, [[x - u * 5.5, top], [x - u * 6.5, top - u * 2], [x - u * 5.5, top - u * 5], [x + u * 5.5, top - u * 5], [x + u * 6.5, top - u * 2], [x + u * 5.5, top]], 1.0, 0.65);
    L.push({ x1: x - u * 5.5, y1: top, x2: x + u * 5.5, y2: top, w: 1.0, a: 0.6 });
    L.push({ x1: x - u * 5.5, y1: top, x2: x - u * 5.5, y2: top - u * 5, w: 1.0, a: 0.6 });
    L.push({ x1: x + u * 5.5, y1: top, x2: x + u * 5.5, y2: top - u * 5, w: 1.0, a: 0.6 });
    L.push({ x1: x - u * 3, y1: top + u * 1, x2: x + u * 3, y2: top + u * 1, w: 1.0, a: 0.6 });         /* cup rim */
    L.push({ x1: x - u * 3, y1: top + u * 1, x2: x - u * 3, y2: top + u * 5, w: 0.9, a: 0.6 });
    L.push({ x1: x + u * 3, y1: top + u * 1, x2: x + u * 3, y2: top + u * 5, w: 0.9, a: 0.6 });
    L.push({ x1: x - u * 3, y1: top + u * 5, x2: x + u * 3, y2: top + u * 5, w: 0.9, a: 0.6 });
    L.push({ x1: x, y1: top + u * 5, x2: x, y2: top + u * 9, w: 0.9, a: 0.6 });                          /* stem */
    L.push({ x1: x - u * 4, y1: top + u * 9, x2: x + u * 4, y2: top + u * 9, w: 0.9, a: 0.6 });          /* base */
    L.push({ x1: x - u * 2.5, y1: top + u * 9, x2: x - u * 2.5, y2: top + u * 11.5, w: 0.7, a: 0.4 });
    L.push({ x1: x + u * 2.5, y1: top + u * 9, x2: x + u * 2.5, y2: top + u * 11.5, w: 0.7, a: 0.4 });
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_calendar() {      /* now â€” a calendar, today's mark on it */
    var R = Pk(), u = R * 0.012, L = [], i, j;
    var x0 = CX - u * 8, y0 = CY - u * 9, wd = u * 16, hg = u * 18;
    L.push({ x1: x0, y1: y0, x2: x0 + wd, y2: y0, w: 0.9, a: 0.6 });
    L.push({ x1: x0 + wd, y1: y0, x2: x0 + wd, y2: y0 + hg, w: 0.9, a: 0.6 });
    L.push({ x1: x0 + wd, y1: y0 + hg, x2: x0, y2: y0 + hg, w: 0.9, a: 0.6 });
    L.push({ x1: x0, y1: y0 + hg, x2: x0, y2: y0, w: 0.9, a: 0.6 });
    L.push({ x1: x0 + u * 5, y1: y0 - u * 3, x2: x0 + u * 5, y2: y0, w: 0.6, a: 0.4 });   /* binding rings */
    L.push({ x1: x0 + u * 11, y1: y0 - u * 3, x2: x0 + u * 11, y2: y0, w: 0.6, a: 0.4 });
    L.push({ x1: x0 + u * 1, y1: y0 + u * 6, x2: x0 + u * 7, y2: y0 + u * 6, w: 0.7, a: 0.5 });   /* heading */
    for (j = 0; j < 2; j++) for (i = 0; i < 3; i++) {                                       /* grid */
      L.push({ x1: x0 + u * 2 + i * u * 5, y1: y0 + u * 9 + j * u * 4, x2: x0 + u * 6 + i * u * 5, y2: y0 + u * 9 + j * u * 4, w: 0.5, a: 0.3 });
    }
    L.push({ x1: x0 + u * 2, y1: y0 + u * 9, x2: x0 + u * 6, y2: y0 + u * 13, w: 0.5, a: 0.4 });  /* today diagonal */
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_face() {          /* about â€” a face, a soft self-portrait */
    var R = Pk(), u = R * 0.012, L = [];
    var cyh = CY - R * 0.03;
    ringLines(L, CX, cyh, u * 6, 24, 0.9, 0.6);
    L.push({ x1: CX - u * 2.4, y1: cyh + u * 1, x2: CX - u * 1.2, y2: cyh + u * 1, w: 0.6, a: 0.5 });
    L.push({ x1: CX + u * 1.2, y1: cyh + u * 1, x2: CX + u * 2.4, y2: cyh + u * 1, w: 0.6, a: 0.5 });
    PL(L, [[CX, cyh + u * 2.6], [CX, cyh + u * 3.4]], 0.5, 0.4);
    PL(L, [[CX - u * 1.5, cyh + u * 3.6], [CX, cyh + u * 4.3], [CX + u * 1.5, cyh + u * 3.6]], 0.6, 0.5);
    L.push({ x1: CX - u * 5.5, y1: cyh + u * 5.5, x2: CX + u * 5.5, y2: cyh + u * 5.5, w: 0.9, a: 0.6 });  /* shoulders */
    return { lines: L, arcs: [], ells: [], dots: [] };
  }
  function guide_people() {        /* connect â€” two people, linked by a line */
    var R = Pk(), u = R * 0.012, L = [];
    function person(x, y, s) {
      ringLines(L, x, y - u * 4 * s, u * 2.2 * s, 16, 0.8 * s, 0.6);
      L.push({ x1: x, y1: y - u * 2 * s, x2: x, y2: y + u * 1.5 * s, w: 0.7 * s, a: 0.55 });
      L.push({ x1: x - u * 2.5 * s, y1: y, x2: x - u * 4.5 * s, y2: y - u * 2 * s, w: 0.6 * s, a: 0.5 });
      L.push({ x1: x + u * 2.5 * s, y1: y, x2: x + u * 4.5 * s, y2: y - u * 2 * s, w: 0.6 * s, a: 0.5 });
      L.push({ x1: x, y1: y + u * 1.5 * s, x2: x, y2: y + u * 5 * s, w: 0.7 * s, a: 0.55 });
      L.push({ x1: x - u * 1.5 * s, y1: y + u * 5 * s, x2: x + u * 1.5 * s, y2: y + u * 5 * s, w: 0.6 * s, a: 0.45 });
    }
    person(CX - u * 7, CY + u * 2, 1);
    person(CX + u * 7, CY + u * 2, 1);
    L.push({ x1: CX - u * 5, y1: CY - u * 4, x2: CX + u * 5, y2: CY - u * 4, w: 0.9, a: 0.6 });   /* the link between them */
    return { lines: L, arcs: [], ells: [], dots: [] };
  }

  function guide_flow() {          /* the ambient field — one gentle current everywhere */
    var R = Pk(), L = [], A = [], i;
    /* a slow swirl of arcs covering the whole page, plus a few drifting streams */
    for (i = 0; i < 7; i++) {
      var r = R * (0.06 + i * 0.075);
      A.push({ cx: CX, cy: CY, r: r, yt: 0.82, a: 0.22 - i * 0.02, a0: -Math.PI * 0.25, a1: Math.PI * 1.25 });
    }
    for (i = 0; i < 5; i++) {
      var yy = CY + (i - 2) * R * 0.16;
      L.push({ x1: CX - R * 0.5, y1: yy, x2: CX + R * 0.5, y2: yy + (i % 2 ? R * 0.05 : -R * 0.05), w: 0.7, a: 0.16 });
    }
    return { lines: L, arcs: A, ells: [], dots: [] };
  }

  var GUIDE = {
    archive: guide_flow, identity: guide_flow, sentinel: guide_flow, research: guide_flow,
    projects: guide_flow, systems: guide_flow, skills: guide_flow, beyond: guide_flow,
    writing: guide_flow, think: guide_flow, creds: guide_flow, now: guide_flow,
    about: guide_flow, connect: guide_flow
  };

  /* ---------------- per-scene living motion ---------------- */
  /* mod(k, home, t, dt, lf) -> {dx, dy, glow, size} affecting the field while dominant */

  /* position along a home's stroke (line/arc/ell/dot) at phase u in 0..1 */
  function fit(m, u) {
    if (!m) return { x: 0, y: 0 };
    if (m.p === 'L') {
      var uu = u < 0 ? 0 : u > 1 ? 1 : u;
      return { x: m.x1 + m.dx * uu, y: m.y1 + m.dy * uu };
    }
    if (m.p === 'A') {
      var a2 = (m.a0 || 0) + (m.sw || Math.PI * 2) * u;
      return { x: (m.cx || CX) + Math.cos(a2) * (m.r || 0), y: (m.cy || CY) + Math.sin(a2) * (m.r || 0) * (m.yt || 1) };
    }
    if (m.p === 'E') {
      var ae = u * Math.PI * 2;
      var xx = Math.cos(ae) * m.rx, yy = Math.sin(ae) * m.ry;
      var cr = Math.cos(m.rot || 0), sr = Math.sin(m.rot || 0);
      return { x: (m.cx || CX) + xx * cr - yy * sr, y: (m.cy || CY) + xx * sr + yy * cr };
    }
    return { x: m.x, y: m.y };
  }
  /* a glow peak that moves down the stroke as time passes */
  /* a glow pulse travels the whole stroke, while each particle's body only
     slides a little along its own piece so the shape stays formed from particles */
  function ride(m, t, u, sp, amp) {
    var base = fit(m, u || 0);
    var ph = ((u || 0) + t * sp) % 1;
    var g = Math.pow(Math.max(0, 1 - Math.abs(ph - 0.5) * 4), 3) * (amp || 0.5);
    var slide = Math.sin(t * 0.9 + (u || 0) * 6.28) * 0.1;
    var s2 = clamp((u || 0) + slide, 0, 1);
    var bp = fit(m, s2);
    return { dx: bp.x - (m.x !== undefined ? m.x : base.x), dy: bp.y - (m.y !== undefined ? m.y : base.y), glow: g };
  }

  function m_archive(k, h, t, dt) {
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.7 + 0.3 * Math.sin(t * 2 + k * 3) };
    return ride(h.m, t, h.m.u, 0.5, 0.6);
  }
  function m_galaxy(k, h, t, dt) {       /* identity â€” a light rides each spiral arm */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.8 + 0.3 * Math.sin(t * 1.8) };
    return ride(h.m, t, h.m.u, 0.35, 0.5);
  }
  function m_heart(k, h, t, dt) {        /* sentinel â€” a pulse flows around the heart line */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.6 + 0.3 * Math.sin(t * 2.4) };
    return ride(h.m, t, h.m.u, 0.6, 0.8);
  }
  function m_wave(k, h, t, dt) {         /* research â€” the line of enquiry shimmers down its length */
    return ride(h.m, t, h.m.u, 0.55, 0.6);
  }
  function m_mountains(k, h, t, dt) {    /* projects â€” light runs along the ridgeline */
    return ride(h.m, t, h.m.u, 0.5, 0.4);
  }
  function m_net(k, h, t, dt) {          /* systems â€” a pulse travels across the connected lines */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.5 + 0.3 * Math.sin(t * 2 + (h.m.u || 0) * 8) };
    return ride(h.m, t, h.m.u, 0.6, 0.6);
  }
  function m_stars(k, h, t, dt) {        /* skills â€” stars twinkle, links flicker */
    if (h.m.p === 'D') return { dx: Math.sin(t * 0.7 + (h.m.u || 0) * 14) * 0.5, dy: Math.cos(t * 0.6 + (h.m.u || 0) * 12) * 0.5, glow: 0.35 + 0.25 * Math.sin(t * 1.7 + (h.m.u || 0) * 10) };
    return { dx: 0, dy: 0, glow: 0.05 * Math.sin(t * 1.3 + (h.m.u || 0) * 13) };
  }
  function m_landscape(k, h, t, dt) {    /* beyond â€” a gleam glides across the horizon */
    return ride(h.m, t, h.m.u, 0.45, 0.45);
  }
  function m_script(k, h, t, dt) {       /* writing â€” ink flows through the cursive lines */
    return ride(h.m, t, h.m.u, 0.5, 0.5);
  }
  function m_burst(k, h, t, dt) {        /* think â€” light runs out along each ray */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.8 + 0.4 * Math.sin(t * 2) };
    if (h.m.p === 'A') return ride(h.m, t, h.m.u, 0.5, 0.6);
    return ride(h.m, t, h.m.u, 0.6, 0.5);
  }
  function m_laurel(k, h, t, dt) {       /* creds â€” a shimmer runs along each leaf stem */
    return ride(h.m, t, h.m.u, 0.5, 0.5);
  }
  function m_clock(k, h, t, dt) {        /* now â€” a mark sweeps around the face */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.6 + 0.3 * Math.sin(t * 2.2) };
    if (h.m.p === 'A') return ride(h.m, t, h.m.u, 0.35, 0.6);
    return ride(h.m, t, h.m.u, 0.4, 0.4);
  }
  function m_tree(k, h, t, dt) {         /* about â€” sap-light rises through the branches */
    if (h.m.p === 'D') return { dx: Math.sin(t * 0.5 + (h.m.u || 0) * 13) * 0.6, dy: Math.cos(t * 0.4 + (h.m.u || 0) * 13) * 0.6, glow: 0.5 + 0.3 * Math.sin(t * 1.7 + (h.m.u || 0) * 9) };
    return ride(h.m, t, h.m.u, 0.4, 0.5);
  }
  function m_ripples(k, h, t, dt) {      /* connect â€” a small wave goes out ring by ring */
    if (h.m.p === 'D') return { dx: 0, dy: 0, glow: 0.6 + 0.3 * Math.sin(t * 2) };
    if (h.m.p === 'A') {
      var g = Math.pow(Math.max(0, 1 - Math.abs(((t * 0.6 + (h.m.u || 0) * 0.8) % 1) - 0.5) * 3), 3) * 0.7;
      return { dx: 0, dy: 0, glow: g };
    }
    return { dx: 0, dy: 0, glow: 0 };
  }

  /* the field flows: particles stream slowly along the current, gently faster when scrolling */
  var m_flow = function (k, h, t) {
    var m = h.m;
    var spd = 0.1 + flowVel * 0.05;
    if (m.p === 'D') return { dx: 0, dy: 0, glow: 0.5 + 0.25 * Math.sin(t * 1.6 + k * 2.1) };
    if (m.p === 'A') {
      var pa = ((m.u || 0) + t * spd) % 1;
      var bp = fit(m, pa);
      return { dx: (bp.x - m.x) * 0.4, dy: (bp.y - m.y) * 0.4, glow: 0.45 + 0.3 * Math.sin(t * 1.8 + k * 1.7) };
    }
    var pl = ((m.u || 0) + t * spd * 0.6) % 1;
    var bp2 = fit(m, pl);
    return { dx: (bp2.x - m.x) * 0.4, dy: (bp2.y - m.y) * 0.4, glow: 0.4 + 0.3 * Math.sin(t * 1.5 + k * 1.9) };
  };

  var MOD = {
    archive: m_flow, identity: m_flow, sentinel: m_flow, research: m_flow,
    projects: m_flow, systems: m_flow, skills: m_flow, beyond: m_flow,
    writing: m_flow, think: m_flow, creds: m_flow, now: m_flow,
    about: m_flow, connect: m_flow
  };

  var nop = function (k, h) { return { dx: 0, dy: 0, glow: 0 }; };

  /* FX state initialiser */
  function fxFor(key) {
    if (!FX[key]) FX[key] = { rings: [], sparks: [], shoots: [], novas: [], embers: [], sap: [], spks: [], ang: Math.random() * 6.28, timer: 2, pulse: 0 };
    return FX[key];
  }

  /* ---------------- LIVE extras (moving lines a scene owns) ---------------- */

  var LIVE = {
    skills: function (a, fxy, t, dt) {
      var f = fxFor('skills'), nn = netNodes();
      if (!f.eds) { f.eds = nn.edges; f.nodes = nn.nodes; }
      if (f.eds && Math.random() < 0.12) {
        var e = f.eds[Math.floor(Math.random() * f.eds.length)];
        f.spks.push({ ax: nn.nodes[e[0]].x, ay: nn.nodes[e[0]].y, bx: nn.nodes[e[1]].x, by: nn.nodes[e[1]].y, ph: 0, sp: 0.6 + Math.random() * 0.3 });
      }
      for (var i = f.spks.length - 1; i >= 0; i--) {
        var s = f.spks[i];
        s.ph += s.sp * dt;
        var x = s.ax + (s.bx - s.ax) * s.ph, y = s.ay + (s.by - s.ay) * s.ph;
        ctx.strokeStyle = cstr(curCol, 0.35 * a * s.ph);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(x, y); ctx.stroke();
        if (s.ph >= 1) f.spks.splice(i, 1);
      }
    }
  };

  /* ---------------- field construction ---------------- */

  function buildField() {
    var mobile = window.matchMedia('(max-width:768px)').matches;
    N = mobile ? 40 : 64;
    particles = [];
    for (var k = 0; k < N; k++) {
      particles.push({ tw: k * 2.4, tws: 1.4 + (k % 5) * 0.5, _x: 0, _y: 0, _sz: 1, _glow: 0 });
    }
    buildScenes();
  }

  function buildScenes() {
    var domEls = document.querySelectorAll('[data-universe]');
    scenes = []; elts = [];
    for (var i = 0; i < domEls.length; i++) {
      var key = domEls[i].getAttribute('data-universe');
      if (THEMES[key]) { scenes.push(key); elts.push(domEls[i]); }
    }
    if (!scenes.length) { scenes = ['archive']; elts = [document.body]; }
    homesAll = []; guidesAll = [];
    for (var s = 0; s < scenes.length; s++) {
      var key = scenes[s];
      rnd = seeded(hashStr('u:' + key));
      homesAll.push(homes_for(key, N));
      guidesAll.push((GUIDE[key])());
    }
    buildMidpoints();
    tgtFor();
  }

  function buildMidpoints() {
    mids = [];
    for (var i = 0; i < elts.length; i++) {
      var el = elts[i];
      mids.push(el.offsetTop + el.offsetHeight / 2);
    }
  }

  function dominant() { return clamp(Math.round(sp), 0, scenes.length - 1); }

  var tgtCol = THEMES.archive.c.slice();
  function tgtFor() { tgtCol = THEMES[scenes[dominant()]].c.slice(); }

  function presence(si) {
    var p = clamp(1 - Math.abs(sp - si), 0, 1);
    return p * p * (3 - 2 * p);
  }

  /* ---------------- scroll mapping ---------------- */

  function onScroll() {
    if (!mids.length) return;
    var vc = window.scrollY + window.innerHeight / 2;
    if (lastVc < 0) lastVc = vc;
    var dv = Math.abs(vc - lastVc);
    lastVc = vc;
    flowVel += (dv - flowVel) * 0.3;
    if (vc <= mids[0]) targetSP = 0;
    else if (vc >= mids[mids.length - 1]) targetSP = scenes.length - 1;
    else {
      for (var i = 0; i < mids.length - 1; i++) {
        if (vc >= mids[i] && vc < mids[i + 1]) {
          targetSP = i + (vc - mids[i]) / (mids[i + 1] - mids[i]);
          break;
        }
      }
    }
    targetSP = clamp(targetSP, 0, scenes.length - 1);
  }

  function glowCanvas(col, size) {
    var g = document.createElement('canvas');
    g.width = size; g.height = size;
    var c2 = g.getContext('2d');
    var gr = c2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, cstr(col, 0.85));
    gr.addColorStop(0.35, cstr(col, 0.22));
    gr.addColorStop(1, cstr(col, 0));
    c2.fillStyle = gr;
    c2.fillRect(0, 0, size, size);
    glowSprite = g;
  }

  /* ---------------- frame ---------------- */

  function frame(dt) {
    flowVel *= 1 - 0.9 * dt;   /* ease the flow back down once you stop scrolling */
    sp += (targetSP - sp) * clamp(0.18 + Math.abs(targetSP - sp) * 0.25, 0.18, 0.4);
    var dom = dominant();
    if (dom !== lastDom) { lastDom = dom; fxFor(scenes[dom]); tgtCol = THEMES[scenes[dom]].c.slice(); }
    curCol = mix(curCol, tgtCol, 0.05);

    var si = Math.min(Math.floor(sp), scenes.length - 1);
    var f = eio(clamp(sp - si, 0, 1));
    var next = Math.min(si + 1, scenes.length - 1);
    var pD = presence(dom);

    for (var k = 0; k < N; k++) {
      var hA = homesAll[si][k], hB = homesAll[next][k];
      var bx = hA.x + (hB.x - hA.x) * f, by = hA.y + (hB.y - hA.y) * f;
      var bsz = hA.sz + (hB.sz - hA.sz) * f;
      var big = hA.big || hB.big || 0;
      var hd = homesAll[dom][k];
      var mo = (MOD[scenes[dom]] || nop)(k, hd, phase, dt, FX);

      /* universal life â€” no particle ever sits still.  The whole field turns
         slowly about the center, breathes, and every particle holds a small
         personal orbit so it always drifts as it holds its icon's place. */
      var pR = Math.hypot(bx - CX, by - CY) * (1 + 0.06 * Math.sin(phase * 0.22 + k * 0.5));
      var pA = Math.atan2(by - CY, bx - CX) + phase * 0.05 + 0.35 * Math.sin(phase * 0.07 + k * 1.3);
      bx = CX + Math.cos(pA) * pR;
      by = CY + Math.sin(pA) * pR;
      bx += Math.sin(phase * 0.6 + k * 1.9 + Math.sin(k * 2.3)) * 0.8;
      by += Math.cos(phase * 0.55 + k * 1.3) * 0.8;

      var glow = (mo.glow || 0) * pD;
      bx += (mo.dx || 0) * 0.5;
      by += (mo.dy || 0) * 0.5;

      /* gentle pull toward the cursor — a soft current that visibly follows you */
      if (mouse.on) {
        var mdx = mouse.x - bx, mdy = mouse.y - by;
        var md = Math.hypot(mdx, mdy);
        if (md < 600 && md > 0.001) {
          var pull = (1 - md / 600) * 0.20;
          bx += mdx / md * pull * 9;
          by += mdy / md * pull * 9;
          bx += (mdy / md) * Math.sin(phase * 2 + k) * pull * 2;   /* a soft swirl beside the path */
          by -= (mdx / md) * Math.sin(phase * 2 + k) * pull * 2;
        }
      }

      var p = particles[k];
      p._x = bx; p._y = by; p._sz = bsz; p._big = big; p._glow = glow;
    }

    flash *= 1 - 2.2 * dt;
    cursorBurst *= 0.96;
    draw(dom, si, f, dt);
  }

  function draw(dom, si, f, dt) {
    ctx.clearRect(0, 0, W, H);

    /* breathing theme veil */
    var ve = 0.11 + 0.04 * Math.sin(phase * 0.4);
    var glow = ctx.createRadialGradient(W / 2, H * 0.44, 10, W / 2, H * 0.44, Math.max(W, H) * 0.62);
    glow.addColorStop(0, cstr(curCol, ve));
    glow.addColorStop(1, cstr(curCol, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';

    /* no pre-drawn picture — the particles themselves form every line */
    
    /* field particles */
    for (var pi = 0; pi < N; pi++) {
      var p = particles[pi];
      var x = p._x, y = p._y, sz = p._sz;
      var halo = 0;
      if (mouse.on) {
        var mdd = Math.hypot(x - mouse.x, y - mouse.y);
        if (mdd < 160) halo = (1 - mdd / 160) * cursorBurst;
      }
      var tw = 0.5 + 0.5 * Math.sin(phase * p.tws + p.tw);
      var a = (0.3 + (p._big ? 0.28 : 0) + p._glow * 0.4) * (0.6 + 0.4 * Math.pow(tw, 2)) + halo * 0.4;
      a = clamp(a, 0.06, 0.98);
      /* each particle wears its own shifting tint as it travels the shape */
      var wc = 0.5 + 0.5 * Math.sin(phase * p.tws * 1.4 + p.tw * 2 + x * 0.004);
      var r = curCol[0] * (0.72 + wc * 0.5) + (1 - wc) * 44;
      var gg = curCol[1] * (0.8 + (1 - wc) * 0.35) + wc * 26;
      var b = curCol[2] * (0.64 + (1 - wc) * 0.7) + (1 - wc) * 58;
      ctx.globalAlpha = a * 0.7;
      ctx.drawImage(glowSprite, x - sz * 6, y - sz * 6, sz * 12, sz * 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cstr([r, gg, b], a);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.45, sz * 0.62), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* live extras for the active scene */
    if (LIVE[scenes[dom]] && presence(dom) > 0.02) LIVE[scenes[dom]](presence(dom), null, phase, dt);

    /* per-scene FX rings/sparks/novas/embers */
    var f = FX[scenes[dom]] || {};
    for (var ri = (f.rings || []).length - 1; ri >= 0; ri--) {
      var rn = f.rings[ri];
      rn.r += rn.grow * 60 * dt; rn.alpha -= 0.5 * dt;
      if (rn.alpha <= 0.01) { f.rings.splice(ri, 1); continue; }
      ctx.strokeStyle = cstr(curCol, rn.alpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rn.x, rn.y, rn.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (var spi = (f.sparks || []).length - 1; spi >= 0; spi--) {
      var sk = f.sparks[spi];
      sk.life -= sk.decay;
      if (sk.life <= 0) { f.sparks.splice(spi, 1); continue; }
      sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.vx *= 1 - 0.8 * dt; sk.vy *= 1 - 0.8 * dt;
      ctx.globalAlpha = Math.max(0, sk.life);
      ctx.fillStyle = sk.col;
      ctx.beginPath(); ctx.arc(sk.x, sk.y, sk.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (f.novas) {
      for (var ni = 0; ni < f.novas.length; ni++) {
        var nv = f.novas[ni];
        ctx.globalAlpha = nv.life * 0.6;
        ctx.drawImage(glowSprite, nv.x - nv.sz * 7 * nv.life, nv.y - nv.sz * 7 * nv.life, nv.sz * 14 * nv.life, nv.sz * 14 * nv.life);
        ctx.globalAlpha = 1;
      }
    }
    if (f.embers) {
      for (var ei2 = 0; ei2 < f.embers.length; ei2++) {
        var eb = f.embers[ei2];
        eb.life -= dt * 0.5; eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.vx *= 1 - 0.5 * dt; eb.vy *= 1 - 0.5 * dt;
        if (eb.life <= 0) { f.embers.splice(ei2, 1); ei2--; continue; }
        ctx.globalAlpha = eb.life * 0.55;
        ctx.fillStyle = cstr(curCol, 0.8);
        ctx.beginPath(); ctx.arc(eb.x, eb.y, 0.6 + eb.life, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /* interaction: soft glow marks where you are */
    if (mouse.on && glowSprite) {
      ctx.globalAlpha = 0.16 + cursorBurst * 0.10;
      ctx.drawImage(glowSprite, mouse.x - 95, mouse.y - 95, 190, 190);
      ctx.globalAlpha = 1;
    }

    /* click feedback: flash + sparks + rings (intent, not decoration) */
    if (flash > 0.01) {
      ctx.fillStyle = cstr(curCol, Math.min(0.06, flash * 0.1));
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- API ---------------- */

  function bang(x, y, strong) {
    flash = 0.18;
    var f = FX[scenes[dominant()]];
    if (!f) return;
    f.sparks || (f.sparks = []);
    var n = strong ? 80 : 36;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (0.2 + Math.random() * 0.8) * (strong ? 300 : 220) * (0.6 + Math.random() * 0.6);
      f.sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.014 + Math.random() * 0.016, size: 1 + Math.random() * 2, col: cstr(curCol, 1) });
    }
    f.rings.push({ x: x, y: y, r: 36, alpha: 0.4, grow: 7 });
    f.rings.push({ x: x, y: y, r: 12, alpha: 0.5, grow: 9 });
  }

  function setTheme(key) {
    var idx = scenes.indexOf(key);
    if (idx < 0) return;
    targetSP = idx;
    sp = idx;
    lastDom = -1;
    tgtCol = THEMES[key].c.slice();
  }

  /* ---------------- motion loop ---------------- */

  function frameLoop(ts) {
    if (!lastT) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
    lastT = ts;
    phase = (ts - startT) / 1000;
    frame(dt);
    raf = requestAnimationFrame(frameLoop);
  }

  function start() {
    if (raf) return;
    cv.classList.add('universe-live');
    startT = performance.now();
    lastT = 0;
    raf = requestAnimationFrame(frameLoop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    W = window.innerWidth; H = window.innerHeight; CX = W / 2; CY = H / 2;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildField();
    glowCanvas(curCol, 128);
    onScroll();
  }

  /* ---------------- input ---------------- */

  window.addEventListener('pointermove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    cursorBurst = 1;
  }, { passive: true });
  window.addEventListener('pointerleave', function () { mouse.on = false; });
  window.addEventListener('pointerdown', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    bang(mouse.x, mouse.y, false);
  }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

  var lastW = window.innerWidth, lastH = window.innerHeight, rTimer = null;
  window.addEventListener('resize', function () {
    var nw = window.innerWidth, nh = window.innerHeight;
    var widthChanged = nw !== lastW, bigHeight = Math.abs(nh - lastH) > 150;
    resize();
    lastW = nw; lastH = nh;
    clearTimeout(rTimer);
    rTimer = setTimeout(function () { buildMidpoints(); onScroll(); }, 180);
  }, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ===================================================================
     PUBLIC API (tests + interactions)
     =================================================================== */
  window.__universe = {
    bang: bang,
    set: setTheme,
    theme: function () { return scenes[dominant()]; },
    probe: function () {
      var i = 0, homes = [];
      for (; i < Math.min(6, N); i++) {
        orgHome(homesAll[dominant()] && homesAll[dominant()][i], homes, i);
      }
      var live = [];
      for (i = 0; i < N; i++) live.push({ x: Math.round(particles[i]._x), y: Math.round(particles[i]._y), sz: Math.round(particles[i]._sz * 10) });
      return {
        key: scenes[dominant()], sp: +sp.toFixed(2), N: N,
        homes: homes,
        live: live,
        guides: guidesAll[dominant()] ? guidesAll[dominant()].lines.length + guidesAll[dominant()].arcs.length + guidesAll[dominant()].ells.length + (guidesAll[dominant()].dots ? guidesAll[dominant()].dots.length : 0) : 0
      };
    },
    diag: function () {
      return {
        key: scenes[dominant()], sp: sp, scenes: scenes.length, N: N,
        live: particles.filter(function (p) { return !isNaN(p._x) && !isNaN(p._y); }).length
      };
    }
  };

  function orgHome(h, arr, i) {
    if (!h) { arr.push(null); return; }
    arr.push({ x: Math.round(h.x), y: Math.round(h.y), sz: Math.round(h.sz * 10) });
  }

  resize();
  if (!document.hidden) start();
  setTimeout(buildMidpoints, 300);
  setTimeout(function () { buildMidpoints(); onScroll(); }, 900);
})();

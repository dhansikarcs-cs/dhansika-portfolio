(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var docEl = document.documentElement;

  /* ===================================================================
     BOOT — reveals, stagger, figure bars, sentinel sequence
     =================================================================== */

  function bootContent() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {

        /* ===========================================================
           REVEALS
           =========================================================== */

        var revealObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            var d = en.target.getAttribute('data-d');
            if (d) en.target.style.setProperty('--rd', parseFloat(d).toFixed(2) + 's');
            if (en.isIntersecting) en.target.classList.add('in');
            else en.target.classList.remove('in');
          });
        }, { threshold: [0, 0.08, 0.2], rootMargin: '5px 0px 5px 0px' });

        document.querySelectorAll('.reveal').forEach(function (el) {
          if (reduceMotion) { el.classList.add('in'); return; }
          revealObserver.observe(el);
        });

        /* ===========================================================
           STAGGER — indexes within their grid parent
           =========================================================== */

        document.querySelectorAll('.pannels > .reveal, .cond, .proj, .taxitem, .syscell, .panels2 > .reveal, .led__row')
          .forEach(function (el) {
            var i = Array.prototype.indexOf.call(el.parentNode.children, el);
            el.style.setProperty('--rd', (Math.min(i, 5) * 0.06).toFixed(2) + 's');
          });

        /* ===========================================================
           FIGURE BARS — delay per bar, animate via .in
           =========================================================== */

        document.querySelectorAll('.fig__col').forEach(function (col, i) {
          var bars = col.querySelectorAll('.fig__bar i');
          bars.forEach(function (b, j) {
            b.style.setProperty('--rdf', ((j * 0.15) + (i * 0.08)).toFixed(2) + 's');
          });
        });

        /* ===========================================================
           SENTINEL — boot sequence (plays on first view)
           =========================================================== */

        var boot = document.querySelector('.boot');
        if (boot) {
          if (reduceMotion) {
            boot.classList.add('playing');
          } else {
            var bootObserver = new IntersectionObserver(function (entries) {
              entries.forEach(function (en) {
                if (en.isIntersecting) {
                  boot.classList.add('playing');
                  bootObserver.unobserve(boot);
                }
              });
            }, { threshold: 0.1, rootMargin: '5px 0px 5px 0px' });
            bootObserver.observe(boot);
          }
        }

      });
    });
  }

  bootContent();

  /* ===================================================================
     INTERACTIVE REVEAL — hover reads a card, click reveals its full text
     =================================================================== */

  (function interactiveReveal() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(
      '.proj, .syscell, .cond, .taxitem, .panel2, .led__row, .sill, .pannels > .reveal, .panels2 > .reveal'
    ));

    function fright(card) {  /* pop the particle field at the card's centre */
      var u = window.__universe;
      if (!u || !u.bang) return;
      var r = card.getBoundingClientRect();
      u.bang(r.left + r.width / 2, r.top + r.height / 2, true);
    }

    function open(card, text) {
      card.classList.add('is-open');
    }
    function close(card, text) {
      card.classList.remove('is-open');
    }

    cards.forEach(function (card) {
      var text = card.querySelector('.proj__desc, .syscell p, .taxitem p, .panel2 p, .cond p, .sill__desc, .sill .tagrow, :scope > p');
      var pinned = false;

      /* hover reveals, leaving hides it again (unless you clicked to pin) */
      card.addEventListener('mouseenter', function () {
        card.classList.add('is-read');
        open(card, text);
      });
      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-read');
        if (!pinned) close(card, text);
      });
      card.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (pinned) { pinned = false; close(card, text); }
        else { pinned = true; open(card, text); fright(card); }
      });
      /* reopen an inner <a> without toggling the whole card */
      Array.prototype.forEach.call(card.querySelectorAll('a'), function (a) {
        a.addEventListener('click', function (e2) { e2.stopPropagation(); });
      });
    });

    /* whole-page hover life — every section heading wakes up under the cursor */
    Array.prototype.slice.call(document.querySelectorAll(
      '.statement, .shead__label, h2, h3, .proj__name, .syscell h4, .taxitem h3, .panel2__name'
    )).forEach(function (h) {
      h.addEventListener('mouseenter', function () { h.classList.add('is-hover'); });
      h.addEventListener('mouseleave', function () { h.classList.remove('is-hover'); });
    });
  })();

  /* ===================================================================
     WORLDS — jump navigation + progress dots
     =================================================================== */

  var worlds = Array.prototype.slice.call(document.querySelectorAll('#worlds .worlds__btn'));
  var pdots = Array.prototype.slice.call(document.querySelectorAll('#progress .pdot'));
  var jumpKeyByElId = {};

  worlds.concat(pdots).forEach(function (btn) {
    var id = btn.getAttribute('data-jump');
    var el = id === 'top' ? document.getElementById('top') : document.getElementById(id);
    if (!el) return;
    jumpKeyByElId[el.id] = id;
    btn.addEventListener('click', function () {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (!reduceMotion && window.__universe && window.__universe.bang) {
        var r = el.getBoundingClientRect();
        window.__universe.bang(r.left + r.width / 2, Math.max(r.top + 120, window.innerHeight / 2), false);
      }
    });
  });

  function markWorld(id) {
    worlds.forEach(function (b) {
      var on = b.getAttribute('data-jump') === id;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    pdots.forEach(function (d) { d.classList.toggle('is-active', d.getAttribute('data-jump') === id); });
  }

  var worldObserver = new IntersectionObserver(function (entries) {
    var best = null;
    entries.forEach(function (en) {
      if (en.isIntersecting && (!best || en.intersectionRatio > best.intersectionRatio)) {
        best = en;
      }
    });
    if (best) markWorld(jumpKeyByElId[best.target.id]);
  }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-10% 0px -10% 0px' });

  Object.keys(jumpKeyByElId).forEach(function (elId) {
    worldObserver.observe(document.getElementById(elId));
  });

  /* scroll hint */
  var hint = document.getElementById('scroll-hint');
  var hintHidden = false;
  window.addEventListener('scroll', function () {
    if (hintHidden) return;
    if (window.scrollY > 60) { hintHidden = true; hint.style.opacity = '0'; }
  }, { passive: true });

  /* ===================================================================
     PROGRESS BAR
     =================================================================== */

  var progBar = document.querySelector('.prog__bar');

  function onScroll() {
    if (!progBar) return;
    var h = docEl.scrollHeight - window.innerHeight;
    var p = h > 0 ? (window.scrollY / h) * 100 : 0;
    progBar.style.width = p + '%';
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', onScroll, { passive: true });

  /* ===================================================================
     NAV — active section
     =================================================================== */

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  var sections = navLinks
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  var navObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      navLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + en.target.id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(function (s) { navObserver.observe(s); });

  /* ===================================================================
     KNOWLEDGE GRAPH — hover/tap a node → readout of skill set
     =================================================================== */

  var kgraph = document.querySelector('.kgraph');
  if (kgraph) {
    var knodes = Array.prototype.slice.call(kgraph.querySelectorAll('[data-knode]'));
    var kedges = Array.prototype.slice.call(kgraph.querySelectorAll('[data-kedge]'));
    var detail = document.querySelector('#kgdetail');
    var dName = detail.querySelector('.kgraph__detail-name');
    var dStatus = detail.querySelector('.kgraph__detail-status');
    var dSkills = detail.querySelector('.kgraph__detail-skills');
    var dLinks = detail.querySelector('.kgraph__detail-links');
    var dId = detail.querySelector('.console__tag');
    var clearTimer = null;

    function nameOf(n) { return n.getAttribute('data-knode'); }

    function connectedOf(name) {
      var out = [];
      kedges.forEach(function (e) {
        var pair = (e.getAttribute('data-kedge') || '').split(',');
        if (pair[0] === name || pair[1] === name) {
          var other = pair[0] === name ? pair[1] : pair[0];
          if (out.indexOf(other) === -1) out.push(other);
        }
      });
      return out;
    }

    function renderReadout(node) {
      var name = nameOf(node);
      var status = (node.querySelector('.knode__st') || {}).textContent || '';
      var skills = (node.getAttribute('data-skills') || '')
        .split('|').map(function (s) { return s.trim(); }).filter(Boolean);

      dName.textContent = name;
      dStatus.textContent = status;
      dLinks.textContent = 'CONNECTED TO — ' + connectedOf(name).join('  ·  ');
      dId.textContent = name;

      dSkills.textContent = '';
      skills.forEach(function (s, i) {
        var li = document.createElement('li');
        li.textContent = s;
        li.style.setProperty('--li', (i * 0.055).toFixed(2) + 's');
        dSkills.appendChild(li);
      });
      void dSkills.offsetWidth;
      Array.prototype.forEach.call(dSkills.children, function (li) { li.classList.add('in'); });

      detail.classList.add('is-open');
    }

    function focusNode(node) {
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
      var name = nameOf(node);
      kgraph.classList.add('is-focused');
      knodes.forEach(function (n) { n.classList.toggle('is-lit', n === node); });
      kedges.forEach(function (e) {
        var pair = (e.getAttribute('data-kedge') || '').split(',');
        e.classList.toggle('is-lit', pair.indexOf(name) !== -1);
      });
      renderReadout(node);
    }

    function clearGraph() {
      kgraph.classList.remove('is-focused');
      knodes.forEach(function (n) { n.classList.remove('is-lit'); });
      kedges.forEach(function (e) { e.classList.remove('is-lit'); });
      dId.textContent = 'IDLE';
      detail.classList.remove('is-open');
    }

    function scheduleClear() {
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(clearGraph, 250);
    }

    knodes.forEach(function (n) {
      n.addEventListener('mouseenter', function () { focusNode(n); });
      n.addEventListener('mouseleave', scheduleClear);
      n.addEventListener('focus', function () { focusNode(n); });
      n.addEventListener('blur', scheduleClear);
      n.addEventListener('click', function (ev) { ev.stopPropagation(); focusNode(n); });
    });

    detail.addEventListener('mouseenter', function () {
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    });
    detail.addEventListener('mouseleave', scheduleClear);

    document.addEventListener('click', function (ev) {
      if (!kgraph.contains(ev.target) && !detail.contains(ev.target)) clearGraph();
    });
  }
})();
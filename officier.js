// ─── ESPACE OFFICIERS : ANIMATIONS ET BARRE D'OUTILS ────────────
// Chargé par les 9 pages du Menu Officier / Gérant (après auth.js).
// - Barre d'outils sous l'en-tête : les pages du Menu ouvertes au
//   rôle en cours (window.site327.getMenuPages, voir auth.js).
// - Apparition en cascade des cartes et lignes au défilement, y
//   compris celles affichées plus tard (données Firebase). Un élément
//   déjà vu n'est pas ré-animé quand la page redessine sa liste.
// Styles associés : officier.css.
(function () {
  'use strict';

  let here;
  try { here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html'); }
  catch (e) { here = location.pathname.split('/').pop() || 'index.html'; }

  // ── Barre d'outils ────────────────────────────────────────────
  const header = document.querySelector('.page-header');
  let tools = null;

  function renderTools() {
    const api = window.site327;
    const pages = api && api.getMenuPages ? api.getMenuPages() : [];
    if (!header || pages.length < 2) {
      if (tools) { tools.remove(); tools = null; }
      return;
    }
    if (!tools) {
      // <div> et non <nav> : les styles du menu du site visent tous les <nav>
      tools = document.createElement('div');
      tools.setAttribute('role', 'navigation');
      tools.className = 'of-tools';
      tools.setAttribute('aria-label', 'Outils officiers');
      header.after(tools);
    }
    const track = document.createElement('div');
    track.className = 'of-tools-track';
    let group = null;
    pages.forEach(function (p) {
      if (group !== null && p.group !== group) {
        const sep = document.createElement('span');
        sep.className = 'of-tool-sep';
        sep.setAttribute('aria-hidden', 'true');
        track.appendChild(sep);
      }
      group = p.group;
      const a = document.createElement('a');
      a.className = 'of-tool' + (p.href === here ? ' current' : '');
      a.href = p.href;
      a.title = p.desc || p.name;
      if (p.href === here) a.setAttribute('aria-current', 'page');
      const ico = document.createElement('span');
      ico.className = 'of-tool-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.textContent = p.icon;
      a.appendChild(ico);
      a.appendChild(document.createTextNode(p.name));
      track.appendChild(a);
    });
    tools.replaceChildren(track);
    // Garde l'outil de la page en cours visible dans la barre
    const current = track.querySelector('.current');
    if (current) track.scrollLeft = current.offsetLeft - (track.clientWidth - current.offsetWidth) / 2;
  }

  renderTools();
  document.addEventListener('327th-session-change', renderTools);

  // ── Apparition au défilement ──────────────────────────────────
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.querySelector('.page-body');
  if (!body || reduced || !('IntersectionObserver' in window)) return;

  const SELECTOR = [
    '.doc-card', '.report-card', '.item-card', '.bl-card', '.abs-card', '.tr-card',
    '.agenda-rules', '.agenda-day', '.blame-table-wrap',
    '.bl-row', '.abs-row', '.tr-item', '.week-section', '.reports-section'
  ].join(',');

  // Empreinte d'un élément : s'il revient identique après un rafraîchissement
  // de la liste, il s'affiche directement, sans rejouer l'animation.
  const seen = new Set();
  function signature(el) {
    return el.className + '|' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  let batch = 0;
  let batchTimer = null;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      // Décalage en cascade pour les éléments qui entrent ensemble
      el.style.setProperty('--of-delay', Math.min(batch++, 8) * 60 + 'ms');
      el.classList.add('of-in');
      clearTimeout(batchTimer);
      batchTimer = setTimeout(function () { batch = 0; }, 120);
      el.addEventListener('transitionend', function done(ev) {
        if (ev.target !== el || ev.propertyName !== 'opacity') return;
        el.removeEventListener('transitionend', done);
        el.classList.remove('of-reveal', 'of-in');
        el.style.removeProperty('--of-delay');
      });
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });

  function prepare(root) {
    const list = root.matches && root.matches(SELECTOR) ? [root] : [];
    if (root.querySelectorAll) list.push.apply(list, root.querySelectorAll(SELECTOR));
    list.forEach(function (el) {
      if (el.dataset.ofDone) return;
      el.dataset.ofDone = '1';
      // Un élément dans un autre élément animé suit son parent
      if (el.parentElement && el.parentElement.closest('.of-reveal')) return;
      const sig = signature(el);
      if (seen.has(sig)) return;
      seen.add(sig);
      el.classList.add('of-reveal');
      io.observe(el);
    });
  }

  prepare(body);
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) { if (n.nodeType === 1) prepare(n); });
    });
  }).observe(body, { childList: true, subtree: true });
})();

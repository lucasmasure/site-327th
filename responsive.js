// ─── RESPONSIVE COMMUN À TOUTES LES PAGES ───────────────────────
// - Construit le menu hamburger à partir du <nav> existant de la
//   page (index.html a déjà le sien : on n'y touche pas).
// - Anime le menu de navigation (toutes les pages) : page actuelle,
//   panneaux au survol, accordéons sur mobile.
// - Enveloppe les tableaux pour qu'ils défilent horizontalement sur
//   mobile au lieu de faire déborder la page.
// Les styles associés sont dans responsive.css.
(function () {
  'use strict';

  // ── Menu hamburger ────────────────────────────────────────────
  const nav = document.querySelector('nav');
  if (nav && !document.getElementById('navToggle')) {
    const logo = nav.querySelector('.nav-logo');

    const navLinks = document.createElement('div');
    navLinks.className = 'nav-links';
    navLinks.id = 'navLinks';
    Array.from(nav.children).forEach(function (child) {
      if (child !== logo) navLinks.appendChild(child);
    });

    const navToggle = document.createElement('button');
    navToggle.type = 'button';
    navToggle.className = 'nav-toggle';
    navToggle.id = 'navToggle';
    navToggle.setAttribute('aria-label', 'Ouvrir le menu');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.innerHTML = '<span></span><span></span><span></span>';

    nav.appendChild(navToggle);
    nav.appendChild(navLinks);

    const mobileMQ = window.matchMedia('(max-width: 1100px)');

    function closeMenu() {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    navToggle.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Sur mobile, un appui sur un lien navigue et referme le panneau
    navLinks.addEventListener('click', function (e) {
      if (mobileMQ.matches && e.target.closest('a')) closeMenu();
    });

    mobileMQ.addEventListener('change', function (mq) {
      if (!mq.matches) closeMenu();
    });
  }

  // ── Menu de navigation : design et animations ────────────────
  // Le texte des liens n'est jamais modifié : l'éditeur du site
  // (site-editor.js) retrouve chaque lien par son texte. On se
  // contente de l'envelopper dans des <span> (icône / libellé /
  // chevron) ; si l'éditeur réécrit un lien, il est ré-enveloppé.
  const navLinks = nav && nav.querySelector('.nav-links');
  if (navLinks) {
    const mobileMQ = window.matchMedia('(max-width: 1100px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let here;
    try { here = decodeURIComponent(location.pathname.split('/').pop() || 'index.html'); }
    catch (e) { here = location.pathname.split('/').pop() || 'index.html'; }

    nav.classList.add('nav-enhanced');

    function span(cls, text) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    }

    // « 📄 | Informations ⌄ » → [📄][ | ][Informations][ ⌄]
    function decorate(el) {
      if (el.hasAttribute('data-nav-ui') || el.querySelector('.nav-txt')) return;
      if (Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType !== 3; })) return;
      const m = el.textContent.match(/^([^\p{L}\p{N}]*)(.*?)(\s*⌄?\s*)$/u);
      if (!m || !m[2]) return;
      const lead = m[1].match(/^([\s​]*)([^\s​|]*)(.*)$/);
      el.textContent = '';
      if (lead[1]) el.appendChild(span('nav-sep', lead[1]));
      if (lead[2]) el.appendChild(span('nav-ico', lead[2]));
      if (lead[3]) el.appendChild(span('nav-sep', lead[3]));
      el.appendChild(span('nav-txt', m[2]));
      if (m[3]) el.appendChild(span(m[3].indexOf('⌄') !== -1 ? 'nav-chev' : 'nav-sep', m[3]));
    }

    function topItem(el) {
      while (el && el.parentElement !== navLinks) el = el.parentElement;
      return el;
    }

    // Page actuelle : lien doré + ses menus parents
    function markActive() {
      navLinks.querySelectorAll('.active, .nav-current, .nav-has-current, .nav-active').forEach(function (el) {
        el.classList.remove('active', 'nav-current', 'nav-has-current', 'nav-active');
        el.removeAttribute('aria-current');
      });
      navLinks.querySelectorAll('a[href]').forEach(function (a) {
        let file;
        try {
          const url = new URL(a.getAttribute('href'), location.href);
          if (url.origin !== location.origin) return;
          file = decodeURIComponent(url.pathname.split('/').pop() || 'index.html');
        } catch (e) { return; }
        if (file !== here) return;
        a.classList.add('active', 'nav-current');
        a.setAttribute('aria-current', 'page');
        let d = a.closest('.dropdown');
        while (d && navLinks.contains(d)) {
          d.classList.add('nav-has-current');
          d = d.parentElement.closest('.dropdown');
        }
        const top = topItem(a);
        if (top) top.classList.add('nav-active');
      });
    }

    // Prépare tout ce qui est (re)construit : à l'ouverture de la page
    // et après chaque modification du menu par l'éditeur du site.
    function setup() {
      navLinks.querySelectorAll('a, .dropbtn').forEach(decorate);
      navLinks.querySelectorAll('.dropdown').forEach(function (d) {
        const btn = d.querySelector(':scope > .dropbtn');
        // Sur mobile, un lien qui a un sous-menu garde son lien :
        // un bouton séparé ouvre le sous-menu.
        if (btn && btn.tagName === 'A' && !d.querySelector(':scope > .nav-acc')) {
          const acc = document.createElement('button');
          acc.type = 'button';
          acc.className = 'nav-acc';
          acc.setAttribute('data-nav-ui', '');
          acc.setAttribute('aria-label', 'Afficher le sous-menu');
          acc.setAttribute('aria-expanded', 'false');
          btn.after(acc);
        }
        if (btn && btn.tagName === 'BUTTON') btn.setAttribute('aria-expanded', d.classList.contains('open') || d.classList.contains('expanded') ? 'true' : 'false');
        const content = d.querySelector(':scope > .dropdown-content');
        if (content) Array.prototype.forEach.call(content.children, function (c, i) { c.style.setProperty('--ni', i); });
      });
      let i = 0;
      Array.prototype.forEach.call(navLinks.children, function (c) {
        if (!c.hasAttribute('data-nav-ui')) c.style.setProperty('--ni', i++);
      });
      markActive();
      // Mobile : la rubrique de la page actuelle est déjà dépliée
      navLinks.querySelectorAll('.dropdown.nav-has-current').forEach(function (d) { setExpanded(d, true); });
      restIndicator(true);
    }

    function setExpanded(d, on) {
      d.classList.toggle('expanded', on);
      const t = d.querySelector(':scope > .nav-acc') || d.querySelector(':scope > button.dropbtn');
      if (t) t.setAttribute('aria-expanded', String(on));
    }

    // ── PC : trait lumineux sous l'entrée survolée ──
    const indicator = document.createElement('span');
    indicator.className = 'nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.setAttribute('data-nav-ui', '');
    navLinks.appendChild(indicator);

    function moveIndicator(item, instant) {
      if (mobileMQ.matches || !item || item === indicator) { indicator.style.opacity = '0'; return; }
      const target = item.matches('.dropdown') ? item.querySelector(':scope > .dropbtn') : item;
      if (!target) return;
      const r = target.getBoundingClientRect();
      const box = navLinks.getBoundingClientRect();
      indicator.classList.toggle('no-anim', !!instant);
      indicator.style.width = (r.width * 0.7) + 'px';
      indicator.style.transform = 'translateX(' + (r.left - box.left + r.width * 0.15) + 'px)';
      indicator.style.opacity = '1';
    }
    function restIndicator(instant) {
      moveIndicator(navLinks.querySelector(':scope > .nav-active'), instant);
    }

    // ── PC : panneaux au survol, avec un court délai de fermeture
    //    pour pouvoir passer en diagonale d'un menu à son sous-menu ──
    const closeTimers = new WeakMap();
    function contentOf(d) { return d.querySelector(':scope > .dropdown-content'); }

    function openDropdown(d) {
      clearTimeout(closeTimers.get(d));
      if (d.classList.contains('open')) return;
      Array.prototype.forEach.call(d.parentElement.children, function (s) {
        if (s !== d && s.classList && s.classList.contains('open')) closeDropdown(s, true);
      });
      const content = contentOf(d);
      if (content) {
        // Retourne le panneau s'il dépasserait de l'écran (calcul sur les
        // tailles réelles : le panneau parent est encore en animation)
        const r = d.getBoundingClientRect();
        const nested = d.parentElement.closest('.dropdown');
        const right = nested ? r.right + 8 + content.offsetWidth : r.left + content.offsetWidth;
        content.classList.toggle('nav-flip', right > window.innerWidth - 12);
      }
      d.classList.add('open');
      const btn = d.querySelector(':scope > button.dropbtn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
    function closeDropdown(d, now) {
      clearTimeout(closeTimers.get(d));
      function close() {
        d.classList.remove('open');
        d.querySelectorAll('.dropdown.open').forEach(function (x) { x.classList.remove('open'); });
        const btn = d.querySelector(':scope > button.dropbtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
      if (now) close(); else closeTimers.set(d, setTimeout(close, 220));
    }
    function openChain(el) {
      let d = el.closest('.dropdown');
      const chain = [];
      while (d && navLinks.contains(d)) { chain.unshift(d); d = d.parentElement.closest('.dropdown'); }
      chain.forEach(openDropdown);
    }
    function closeAll() {
      navLinks.querySelectorAll('.dropdown.open').forEach(function (d) { closeDropdown(d, true); });
    }

    navLinks.addEventListener('mouseover', function (e) {
      if (mobileMQ.matches) return;
      const item = topItem(e.target);
      if (item && item !== indicator) moveIndicator(item);
      openChain(e.target);
    });
    navLinks.addEventListener('mouseout', function (e) {
      if (mobileMQ.matches) return;
      const to = e.relatedTarget;
      let d = e.target.closest('.dropdown');
      while (d && navLinks.contains(d)) {
        if (!(to && d.contains(to))) closeDropdown(d);
        d = d.parentElement.closest('.dropdown');
      }
    });
    navLinks.addEventListener('mouseleave', function () { restIndicator(); });

    // Clavier : le focus ouvre les menus, Échap les referme
    navLinks.addEventListener('focusin', function (e) {
      if (mobileMQ.matches) return;
      Array.prototype.forEach.call(navLinks.querySelectorAll('.dropdown.open'), function (d) {
        if (!d.contains(e.target)) closeDropdown(d, true);
      });
      openChain(e.target);
      moveIndicator(topItem(e.target));
    });
    navLinks.addEventListener('focusout', function (e) {
      if (mobileMQ.matches || (e.relatedTarget && navLinks.contains(e.relatedTarget))) return;
      closeAll();
      restIndicator();
    });
    nav.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || mobileMQ.matches) return;
      const open = navLinks.querySelector(':scope > .dropdown.open');
      if (!open) return;
      closeAll();
      const btn = open.querySelector(':scope > .dropbtn');
      if (btn) btn.focus();
    });
    document.addEventListener('click', function (e) {
      if (!mobileMQ.matches && !nav.contains(e.target)) closeAll();
    });

    // ── Mobile : accordéons animés ──
    function toggleExpand(d) {
      const content = contentOf(d);
      const on = !d.classList.contains('expanded');
      if (!content || reduced) { setExpanded(d, on); return; }
      content.style.height = content.scrollHeight + 'px';
      if (on) {
        content.style.height = '0px';
        setExpanded(d, true);
        content.offsetHeight; // force le calcul avant l'animation
        content.style.height = content.scrollHeight + 'px';
      } else {
        content.offsetHeight;
        setExpanded(d, false);
        content.style.height = '0px';
      }
      content.addEventListener('transitionend', function done(ev) {
        if (ev.target !== content || ev.propertyName !== 'height') return;
        content.removeEventListener('transitionend', done);
        content.style.height = '';
      });
    }

    navLinks.addEventListener('click', function (e) {
      const trigger = e.target.closest('.nav-acc, button.dropbtn');
      if (!trigger || !navLinks.contains(trigger)) return;
      const d = trigger.closest('.dropdown');
      if (!d) return;
      e.preventDefault();
      // PC : le survol a déjà ouvert le menu, le clic (écran tactile) l'ouvre aussi
      if (mobileMQ.matches) toggleExpand(d);
      else openChain(trigger);
    });

    mobileMQ.addEventListener('change', function () {
      closeAll();
      restIndicator(true);
    });

    // ── Barre plus opaque dès qu'on fait défiler la page ──
    function onScroll() { nav.classList.toggle('nav-scrolled', window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ── Logo : retour à l'accueil (sauf en mode modification) ──
    const logo = nav.querySelector('.nav-logo');
    if (logo && here !== 'index.html') {
      logo.setAttribute('role', 'link');
      logo.setAttribute('tabindex', '0');
      logo.setAttribute('aria-label', "Retour à l'accueil");
      const goHome = function () {
        if (!document.body.classList.contains('edit-mode-active')) location.href = 'index.html';
      };
      logo.addEventListener('click', goHome);
      logo.addEventListener('keydown', function (e) { if (e.key === 'Enter') goHome(); });
    }

    window.addEventListener('resize', function () { restIndicator(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { restIndicator(true); });

    // Ré-applique le décor quand l'éditeur du site modifie le menu
    const observer = new MutationObserver(function () {
      observer.disconnect();
      setup();
      observer.observe(navLinks, { childList: true, subtree: true, characterData: true });
    });
    setup();
    observer.observe(navLinks, { childList: true, subtree: true, characterData: true });
  }

  // ── Tableaux défilants ────────────────────────────────────────
  document.querySelectorAll('table').forEach(function (table) {
    if (table.parentElement.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
})();

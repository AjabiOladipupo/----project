// Loads site content from Supabase and renders it into index.html and cv.html.
// The static HTML stays as a fallback: if Supabase is unreachable, the page still shows.
(async function () {
  const cfg = window.SITE_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  // Only these tags survive in "HTML allowed" settings; every attribute is stripped.
  const ALLOWED_TAGS = new Set(['EM', 'STRONG', 'BR', 'B', 'I']);
  const sanitize = (html) => {
    const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 1) {
          if (!ALLOWED_TAGS.has(child.tagName)) { child.replaceWith(...child.childNodes); walk(node); return; }
          [...child.attributes].forEach((a) => child.removeAttribute(a.name));
          walk(child);
        } else if (child.nodeType !== 3) child.remove();
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  };
  // Links may only use safe schemes or be relative. Anything else becomes "#".
  const safeUrl = (u) => {
    const v = String(u ?? '').trim();
    if (!v) return '#';
    if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '#';
    return v; // relative path or #anchor
  };
  // Images: https/http or a relative path. Any other scheme is dropped.
  const safeSrc = (u) => { const v = String(u ?? '').trim(); if (!v) return ''; if (/^https?:\/\//i.test(v)) return v; if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return ''; return v; };
  const page = document.body.dataset.page || 'home';

  const queries = {
    settings: sb.from('site_settings').select('key,value'),
  };
  if (page === 'home') {
    queries.projects = sb.from('projects').select('*').eq('published', true).order('sort_order');
    queries.posts = sb.from('posts').select('*').eq('published', true).order('sort_order');
  } else {
    queries.jobs = sb.from('jobs').select('*').eq('published', true).order('sort_order');
    queries.skills = sb.from('skills').select('*').order('sort_order');
    queries.credentials = sb.from('credentials').select('*').order('sort_order');
    queries.stats = sb.from('stats').select('*').order('sort_order');
  }

  const keys = Object.keys(queries);
  const results = await Promise.all(keys.map((k) => queries[k]));
  const data = {};
  keys.forEach((k, i) => {
    if (results[i].error) { console.warn('content:', k, results[i].error.message); data[k] = null; }
    else data[k] = results[i].data;
  });
  if (!data.settings) return;

  const S = Object.fromEntries(data.settings.map((r) => [r.key, r.value]));

  // ---- Simple settings hooks ----
  document.querySelectorAll('[data-s]').forEach((el) => { const v = S[el.dataset.s]; if (v != null) el.innerHTML = sanitize(v); });
  document.querySelectorAll('[data-s-href]').forEach((el) => { const v = S[el.dataset.sHref]; if (v) el.setAttribute('href', el.dataset.sPrefix ? el.dataset.sPrefix + v.replace(/[\s"'<>]/g, '') : safeUrl(v)); });
  document.querySelectorAll('[data-s-src]').forEach((el) => { const v = safeSrc(S[el.dataset.sSrc]); if (v) el.setAttribute('src', v); });

  // ---- Marquee ----
  document.querySelectorAll('[data-marquee]').forEach((el) => {
    const words = (S[el.dataset.marquee] || '').split('|').map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    const spans = words.map((w) => `<span>${esc(w)}</span>`).join('');
    el.innerHTML = spans + spans;
  });

  // ---- Lists ----
  const render = {
    'projects:vibe': (rows) => rows.map((r, i) => `<li class="row"><span class="idx">${pad(i + 1)}</span><div><h3><a href="${esc(safeUrl(r.url))}"${/^https?:/i.test(r.url || '') ? ' target="_blank" rel="noopener"' : ''}>${esc(r.title)}</a></h3><p>${esc(r.description)}</p></div>${r.tag ? `<span class="tag">${esc(r.tag)}</span>` : ''}</li>`).join(''),
    'posts': (rows) => rows.map((r) => {
      const d = r.published_on ? new Date(r.published_on + 'T00:00:00') : null;
      const meta = d ? `Post · ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : 'Post';
      return `<a class="card" href="${esc(safeUrl(r.url))}"${/^https?:/i.test(r.url || '') ? ' target="_blank" rel="noopener"' : ''}><div><div class="meta">${esc(meta)}</div><h3>${esc(r.title)}</h3>${r.excerpt ? `<p class="excerpt">${esc(r.excerpt)}</p>` : ''}</div><span class="read">Read →</span></a>`;
    }).join(''),
    'jobs': (rows) => rows.map((r) => `<article class="job"><div class="when">${esc(r.date_from)} — ${esc(r.date_to)}${r.is_current ? '<span class="now">Current</span>' : ''}</div><div><h3>${esc(r.title)}</h3><p class="org">${esc(r.org)}</p><ul>${(r.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div></article>`).join(''),
    'skills': (rows) => rows.map((r) => `<span class="chip${r.is_tool ? ' tool' : ''}">${esc(r.name)}</span>`).join(''),
    'credentials:education': (rows) => rows.map((r) => `<li class="row"><div><h3>${esc(r.title)}</h3><p>${esc(r.org)}</p></div><span class="yr">${esc(r.years)}</span></li>`).join(''),
    'stats': (rows) => rows.map((r) => `<div class="stat"><b>${esc(r.value)}</b><span>${esc(r.label)}</span></div>`).join(''),
  };
  render['projects:data'] = render['projects:vibe'];
  render['credentials:certificate'] = render['credentials:education'];

  document.querySelectorAll('[data-list]').forEach((el) => {
    const [table, filter] = el.dataset.list.split(':');
    let rows = data[table];
    if (!rows) return;
    if (table === 'projects' && filter) rows = rows.filter((r) => r.category === filter);
    if (table === 'credentials' && filter) rows = rows.filter((r) => r.kind === filter);
    const fn = render[el.dataset.list];
    if (fn) el.innerHTML = fn(rows);
  });

  document.body.setAttribute('data-content', 'loaded');
})();

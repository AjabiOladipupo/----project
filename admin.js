// Admin app for oladipupo.com.ng. Signs in with Supabase Auth, then edits
// every table that content.js reads. Writes are allowed only for ADMIN_EMAIL
// (enforced by row-level security in the database, not just here).
(function () {
  const cfg = window.SITE_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Theme toggle (same behaviour as the site) ----------
  const root = document.documentElement;
  const toggle = $('.theme-toggle');
  const syncToggle = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  toggle.addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') !== 'dark';
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  // ---------- Collections the admin can edit ----------
  const SECTIONS = [
    { id: 'settings', title: 'Text & links', desc: 'Headlines, intro copy, contact details and image URLs. Fields marked "HTML allowed" accept <em> and <strong> tags.' },
    { id: 'projects_vibe', title: 'Vibe coded projects', desc: 'Section 01 on the home page.', table: 'projects', where: { category: 'vibe' }, defaults: { category: 'vibe', published: true },
      fields: [{ k: 'title', l: 'Title' }, { k: 'tag', l: 'Tag (e.g. Web app)' }, { k: 'url', l: 'Link URL' }, { k: 'description', l: 'One-line description', t: 'textarea', full: true }, { k: 'published', l: 'Show on site', t: 'check' }] },
    { id: 'projects_data', title: 'Data & business projects', desc: 'Section 02 on the home page.', table: 'projects', where: { category: 'data' }, defaults: { category: 'data', published: true },
      fields: [{ k: 'title', l: 'Title' }, { k: 'tag', l: 'Tag (e.g. Dashboard)' }, { k: 'url', l: 'Link URL' }, { k: 'description', l: 'One-line description', t: 'textarea', full: true }, { k: 'published', l: 'Show on site', t: 'check' }] },
    { id: 'posts', title: 'Blog posts', desc: 'Section 03 on the home page. Link each card to wherever the post lives.', table: 'posts', defaults: { published: true },
      fields: [{ k: 'title', l: 'Title' }, { k: 'published_on', l: 'Date', t: 'date' }, { k: 'url', l: 'Link URL' }, { k: 'excerpt', l: 'Short excerpt (optional)', t: 'textarea', full: true }, { k: 'published', l: 'Show on site', t: 'check' }] },
    { id: 'jobs', title: 'Work history', desc: 'CV page. One bullet per line.', table: 'jobs', defaults: { published: true, is_current: false, bullets: [] },
      fields: [{ k: 'title', l: 'Job title' }, { k: 'org', l: 'Organisation' }, { k: 'date_from', l: 'From (e.g. Jun 2025)' }, { k: 'date_to', l: 'To (e.g. Present)' }, { k: 'bullets', l: 'Bullets, one per line', t: 'lines', full: true }, { k: 'is_current', l: 'Current role', t: 'check' }, { k: 'published', l: 'Show on site', t: 'check' }] },
    { id: 'skills', title: 'Core competencies', desc: 'CV page. Tick "Tool" to show it as a filled pill.', table: 'skills', defaults: { is_tool: false },
      fields: [{ k: 'name', l: 'Skill or tool' }, { k: 'is_tool', l: 'Tool', t: 'check' }] },
    { id: 'education', title: 'Education', desc: 'CV page, left column.', table: 'credentials', where: { kind: 'education' }, defaults: { kind: 'education' },
      fields: [{ k: 'title', l: 'Qualification' }, { k: 'org', l: 'Institution' }, { k: 'years', l: 'Years (e.g. 2013 — 2018)' }] },
    { id: 'certificates', title: 'Certificates', desc: 'CV page, right column.', table: 'credentials', where: { kind: 'certificate' }, defaults: { kind: 'certificate' },
      fields: [{ k: 'title', l: 'Certificate' }, { k: 'org', l: 'Issuer' }, { k: 'years', l: 'Year' }] },
    { id: 'stats', title: 'Headline numbers', desc: 'The four big figures under the CV marquee.', table: 'stats',
      fields: [{ k: 'value', l: 'Figure (e.g. 400K+)' }, { k: 'label', l: 'Label' }] },
  ];

  const authEl = $('#auth'), appEl = $('#app'), sideEl = $('#side'), panelEl = $('#panel'), signoutBtn = $('#signout');
  const authStatus = $('#auth-status');
  const say = (el, msg, cls = '') => { el.textContent = msg; el.className = 'status ' + cls; };

  // ---------- Auth ----------
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    say(authStatus, 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) say(authStatus, error.message, 'err');
  });
  $('#reset').addEventListener('click', async () => {
    const email = String(new FormData($('#auth-form')).get('email') || '').trim();
    if (!email) return say(authStatus, 'Enter your email first.', 'err');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    say(authStatus, error ? error.message : 'Password reset email sent.', error ? 'err' : 'ok');
  });
  signoutBtn.addEventListener('click', () => sb.auth.signOut());

  // Password recovery: Supabase signs the user in from the emailed link and fires PASSWORD_RECOVERY.
  const recoverEl = $('#recover');
  let recovering = false;
  $('#recover-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('#recover-status');
    say(st, 'Saving…');
    const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
    if (error) return say(st, error.message, 'err');
    recovering = false; recoverEl.hidden = true; say(st, '');
    const { data } = await sb.auth.getSession();
    render(data.session);
  });

  const render = (session) => {
    const user = session?.user;
    const isAdmin = user && user.email.toLowerCase() === cfg.ADMIN_EMAIL.toLowerCase();
    if (recovering) { authEl.hidden = true; appEl.hidden = true; recoverEl.hidden = false; signoutBtn.hidden = false; return; }
    authEl.hidden = !!isAdmin; appEl.hidden = !isAdmin; signoutBtn.hidden = !user;
    if (user && !isAdmin) say(authStatus, `Signed in as ${user.email}, but only ${cfg.ADMIN_EMAIL} can edit. Sign out and use the admin account.`, 'err');
    if (isAdmin) { $('#side .meta') || buildSide(); if (!panelEl.dataset.section) show('settings'); }
  };
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    render(session);
  });

  // ---------- Navigation ----------
  function buildSide() {
    sideEl.innerHTML = SECTIONS.map((s) => `<button type="button" data-id="${s.id}">${esc(s.title)}</button>`).join('') +
      `<div class="sep"></div><div class="meta">Signed in as<br><strong>${esc(cfg.ADMIN_EMAIL)}</strong></div>`;
    sideEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) show(b.dataset.id); });
  }
  function show(id) {
    if (panelEl.dataset.dirty === '1' && !confirm('You have unsaved changes. Leave without saving?')) return;
    sideEl.querySelectorAll('button[data-id]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
    panelEl.dataset.section = id; panelEl.dataset.dirty = '0';
    const s = SECTIONS.find((x) => x.id === id);
    if (s.id === 'settings') renderSettings(s); else renderCollection(s);
  }
  panelEl.addEventListener('input', () => { panelEl.dataset.dirty = '1'; });
  window.addEventListener('beforeunload', (e) => { if (panelEl.dataset.dirty === '1') { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Settings (key/value) ----------
  async function renderSettings(s) {
    panelEl.innerHTML = `<h2>${esc(s.title)}</h2><p class="desc">${esc(s.desc)}</p><p class="status">Loading…</p>`;
    const { data, error } = await sb.from('site_settings').select('*').order('"group"').order('sort_order');
    if (error) return (panelEl.innerHTML += `<p class="status err">${esc(error.message)}</p>`);
    const groups = {};
    data.forEach((r) => { (groups[r.group] ||= []).push(r); });
    const order = ['Home hero', 'Home sections', 'CV page', 'Contact', 'Images & files', 'Footer'];
    const html = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map((g) => `
      <div class="group"><h3>${esc(g)}</h3>${groups[g].map((r) => {
        const long = r.value.length > 70 || /HTML/i.test(r.label);
        return `<label class="f"><span>${esc(r.label)}</span>${long
          ? `<textarea class="in" name="${esc(r.key)}">${esc(r.value)}</textarea>`
          : `<input class="in" name="${esc(r.key)}" value="${esc(r.value)}" />`}</label>`;
      }).join('')}</div>`).join('');
    panelEl.innerHTML = `<h2>${esc(s.title)}</h2><p class="desc">${esc(s.desc)}</p><form id="f">${html}
      <div class="toolbar"><button class="btn" type="submit">Save changes</button><span class="status" id="st"></span></div></form>`;
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; say($('#st'), 'Saving…');
      const rows = data.map((r) => ({ key: r.key, value: e.target.elements[r.key].value, label: r.label, group: r.group, sort_order: r.sort_order }));
      const { error } = await sb.from('site_settings').upsert(rows, { onConflict: 'key' });
      btn.disabled = false;
      if (error) return say($('#st'), error.message, 'err');
      panelEl.dataset.dirty = '0'; say($('#st'), 'Saved. The site shows the new text on next load.', 'ok');
    });
  }

  // ---------- Collections (lists) ----------
  async function renderCollection(s) {
    panelEl.innerHTML = `<h2>${esc(s.title)}</h2><p class="desc">${esc(s.desc)}</p><p class="status">Loading…</p>`;
    let q = sb.from(s.table).select('*').order('sort_order');
    Object.entries(s.where || {}).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) return (panelEl.innerHTML += `<p class="status err">${esc(error.message)}</p>`);
    const removed = new Set();
    let items = data.slice();

    const field = (f, row) => {
      const v = row[f.k];
      if (f.t === 'check') return `<label class="check"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}/> ${esc(f.l)}</label>`;
      if (f.t === 'textarea') return `<label class="f${f.full ? ' full' : ''}"><span>${esc(f.l)}</span><textarea class="in" name="${f.k}">${esc(v)}</textarea></label>`;
      if (f.t === 'lines') return `<label class="f full"><span>${esc(f.l)}</span><textarea class="in lines" name="${f.k}">${esc((v || []).join('\n'))}</textarea></label>`;
      if (f.t === 'date') return `<label class="f"><span>${esc(f.l)}</span><input class="in" type="date" name="${f.k}" value="${esc(v || '')}" /></label>`;
      return `<label class="f"><span>${esc(f.l)}</span><input class="in" name="${f.k}" value="${esc(v)}" /></label>`;
    };
    const itemHtml = (row, i) => {
      const grid = s.fields.filter((f) => !f.full && f.t !== 'check');
      const full = s.fields.filter((f) => f.full);
      const checks = s.fields.filter((f) => f.t === 'check');
      return `<div class="item" data-i="${i}">
        <div class="bar"><span class="n">${String(i + 1).padStart(2, '0')}</span>
          <button class="btn ghost small" type="button" data-act="up" title="Move up">↑</button>
          <button class="btn ghost small" type="button" data-act="down" title="Move down">↓</button>
          <button class="btn danger small" type="button" data-act="del">Delete</button></div>
        <div class="${grid.length > 2 ? 'grid3' : 'grid2'}">${grid.map((f) => field(f, row)).join('')}</div>
        ${full.map((f) => field(f, row)).join('')}
        ${checks.length ? `<div class="checks">${checks.map((f) => field(f, row)).join('')}</div>` : ''}
      </div>`;
    };
    const draw = () => {
      $('#list').innerHTML = items.map(itemHtml).join('') || '<p class="status">Nothing here yet. Add the first one.</p>';
    };
    panelEl.innerHTML = `<h2>${esc(s.title)}</h2><p class="desc">${esc(s.desc)}</p><form id="f"><div id="list"></div>
      <div class="toolbar"><button class="btn ghost" type="button" id="add">+ Add</button><button class="btn" type="submit">Save changes</button><span class="status" id="st"></span></div></form>`;
    draw();

    // Read the form back into items before any reorder, so edits are not lost.
    const collect = () => {
      $('#list').querySelectorAll('.item').forEach((el) => {
        const row = items[+el.dataset.i];
        s.fields.forEach((f) => {
          const input = el.querySelector(`[name="${f.k}"]`);
          if (!input) return;
          if (f.t === 'check') row[f.k] = input.checked;
          else if (f.t === 'lines') row[f.k] = input.value.split('\n').map((x) => x.trim()).filter(Boolean);
          else if (f.t === 'date') row[f.k] = input.value || null;
          else row[f.k] = input.value;
        });
      });
    };
    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      collect();
      const i = +b.closest('.item').dataset.i;
      if (b.dataset.act === 'del') { if (!confirm('Delete this item?')) return; if (items[i].id) removed.add(items[i].id); items.splice(i, 1); }
      if (b.dataset.act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
      if (b.dataset.act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      panelEl.dataset.dirty = '1'; draw();
    });
    $('#add').addEventListener('click', () => {
      collect();
      const blank = { ...(s.defaults || {}) };
      s.fields.forEach((f) => { if (!(f.k in blank)) blank[f.k] = f.t === 'check' ? false : f.t === 'lines' ? [] : f.t === 'date' ? null : ''; });
      items.push(blank); panelEl.dataset.dirty = '1'; draw();
      $('#list').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault(); collect();
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; say($('#st'), 'Saving…');
      const rows = items.map((r, i) => { const o = { ...r, sort_order: i }; delete o.updated_at; if (!o.id) delete o.id; return o; });
      let error = null;
      if (removed.size) ({ error } = await sb.from(s.table).delete().in('id', [...removed]));
      if (!error && rows.length) ({ error } = await sb.from(s.table).upsert(rows));
      btn.disabled = false;
      if (error) return say($('#st'), error.message, 'err');
      removed.clear(); panelEl.dataset.dirty = '0';
      say($('#st'), 'Saved. Reloading list…', 'ok');
      renderCollection(s);
    });
  }
})();

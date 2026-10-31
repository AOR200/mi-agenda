/* Mi Agenda — versión personal inspirada en el modelo de datos de TickTick.
   Prioridad: 0 ninguna, 1 baja, 3 media, 5 alta. Estado: 0 pendiente, 2 completada. */
'use strict';

const STORE_KEY = 'miagenda.v1';
const PRIOS = [
  { v: 5, name: 'Alta', cls: 'p5' },
  { v: 3, name: 'Media', cls: 'p3' },
  { v: 1, name: 'Baja', cls: 'p1' },
  { v: 0, name: 'Ninguna', cls: 'p0' },
];
const QUADS = [
  { q: 1, prio: 5, name: 'Urgente e importante' },
  { q: 2, prio: 3, name: 'No urgente pero importante' },
  { q: 3, prio: 1, name: 'Urgente pero no importante' },
  { q: 4, prio: 0, name: 'No urgente y no importante' },
];
const REMINDERS = [
  ['', 'Sin recordatorio'], ['-PT0S', 'A la hora'], ['-PT5M', '5 min antes'], ['-PT30M', '30 min antes'],
  ['-PT1H', '1 hora antes'], ['-PT4H', '4 horas antes'], ['-P1D', '1 día antes'],
];
const REPEATS = [['', 'No repetir'], ['DAILY', 'Cada día'], ['WEEKDAY', 'Días laborables'], ['WEEKLY', 'Cada semana'], ['MONTHLY', 'Cada mes'], ['YEARLY', 'Cada año']];
const EMOJIS = ['📥', '💼', '🏠', '🛒', '📚', '💪', '🎂', '✈️', '💡', '🎯', '📈', '🏍️', '💰', '❤️', '🧩', '📝'];
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function dateLabel(s) {
  if (!s) return '';
  const t = today();
  if (s === t) return 'Hoy';
  if (s === ymd(addDays(new Date(), 1))) return 'Mañana';
  if (s === ymd(addDays(new Date(), -1))) return 'Ayer';
  const d = parseYmd(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${sameYear ? '' : ' ' + d.getFullYear()}`;
}
const isOverdue = (t) => t.status === 0 && t.date && (t.date < today() || (t.date === today() && t.time && t.time < nowHM()));
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const prioCls = (p) => (PRIOS.find((x) => x.v === p) || PRIOS[3]).cls;

/* ---------- Datos ---------- */
const DEFAULT_SETTINGS = { theme: 'auto', weekStart: 1, groupBy: 'priority', showCompletedInCal: true };
const INBOX = { id: 'inbox', name: 'Bandeja de entrada', emoji: '📥', sortOrder: 0, inbox: true };
let db = { version: 1, projects: [{ ...INBOX }], tasks: [], settings: { ...DEFAULT_SETTINGS } };

function exampleTasks() {
  const t = today(), tm = ymd(addDays(new Date(), 1));
  if (db.projects.length < 3) {
    db.projects.push({ id: uid(), name: 'Trabajo', emoji: '💼', sortOrder: 1 }, { id: uid(), name: 'Personal', emoji: '🏠', sortOrder: 2 });
  }
  const [, work, home] = db.projects;
  const mk = (title, extra) => ({ ...newTask(title), ...extra });
  return [
    mk('Ejemplo: toca una tarea para ver su detalle', { date: t, priority: 5 }),
    mk('Ejemplo: escribe "Reunión mañana 10:00 !alta #ventas" en Añadir tarea', { date: t, priority: 3 }),
    mk('Ejemplo: arrastra tareas entre cuadrantes en la Matriz', { date: tm, priority: 1, projectId: work.id }),
    mk('Ejemplo: ideas para el fin de semana', { priority: 0, projectId: home.id, items: [{ id: uid(), title: 'Cine', status: 0 }, { id: uid(), title: 'Ciclismo', status: 2 }] }),
  ];
}
function addExamples() { db.tasks.push(...exampleTasks()); save(); render(); }

/* Guardado: base de datos privada del Artifact (sincroniza PC y celular) o, fuera de claude.ai, el navegador. */
const store = { mode: 'loading', col: null, synced: new Map(), metaSynced: null, timer: null, flushing: false, again: false };
const metaOf = () => ({ projects: db.projects, settings: db.settings });

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* almacenamiento no disponible */ }
  const fresh = { version: 1, projects: [{ ...INBOX }], tasks: [], settings: { ...DEFAULT_SETTINGS } };
  db = fresh; fresh.tasks = exampleTasks();
  return fresh;
}
function save() {
  if (store.mode === 'local') {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { toast('No se pudo guardar en este dispositivo'); }
  } else if (store.mode === 'cloud') {
    clearTimeout(store.timer);
    store.timer = setTimeout(flush, 400);
  }
}
async function flush() {
  if (store.flushing) { store.again = true; return; }
  store.flushing = true;
  try {
    const ids = new Set(db.tasks.map((t) => t.id));
    for (const t of db.tasks) {
      const js = JSON.stringify(t);
      if (store.synced.get(t.id) === js) continue;
      store.synced.set(t.id, js);
      await store.col.doc('t_' + t.id).set(JSON.parse(js));
    }
    for (const id of [...store.synced.keys()]) {
      if (ids.has(id)) continue;
      store.synced.delete(id);
      await store.col.doc('t_' + id).delete();
    }
    const mj = JSON.stringify(metaOf());
    if (mj !== store.metaSynced) { store.metaSynced = mj; await store.col.doc('meta').set(JSON.parse(mj)); }
  } catch (e) {
    store.synced.clear(); store.metaSynced = null; // se reintenta en el próximo cambio
    toast(e && e.code === 'quota_exceeded' ? 'Se llenó el espacio de la agenda: elimina tareas completadas antiguas' : 'No se pudo guardar el último cambio; se reintentará');
  } finally {
    store.flushing = false;
    if (store.again) { store.again = false; flush(); }
  }
}
function applySnapshot(snap) {
  let changed = false, meta = null;
  const remote = new Map();
  snap.docs.forEach((d) => {
    if (d.id === 'meta') meta = d.data();
    else if (d.id.startsWith('t_')) remote.set(d.id.slice(2), d.data());
  });
  const local = new Map(db.tasks.map((t) => [t.id, t]));
  const next = [];
  for (const [id, data] of remote) {
    const js = JSON.stringify(data);
    const lt = local.get(id);
    const dirty = lt && JSON.stringify(lt) !== store.synced.get(id) && store.synced.has(id);
    store.synced.set(id, js);
    if (dirty) next.push(lt);
    else { if (!lt || JSON.stringify(lt) !== js) changed = true; next.push(structuredClone(data)); }
    local.delete(id);
  }
  for (const [id, lt] of local) {
    if (!store.synced.has(id)) next.push(lt); // nueva, aún sin guardar
    else { store.synced.delete(id); changed = true; } // eliminada en otro dispositivo
  }
  db.tasks = next;
  if (meta) {
    const mj = JSON.stringify(meta);
    const localMj = JSON.stringify(metaOf());
    if (mj !== store.metaSynced && (store.metaSynced === null || localMj === store.metaSynced)) {
      db.projects = structuredClone(meta.projects || []);
      db.settings = { ...DEFAULT_SETTINGS, ...(meta.settings || {}) };
      changed = true;
    }
    store.metaSynced = mj;
  }
  if (!db.projects.some((p) => p.id === 'inbox')) db.projects.unshift({ ...INBOX });
  return changed;
}
async function initStore() {
  const cl = window.claude;
  if (cl && typeof cl.use === 'function') {
    ui.loading = true; render();
    const [cdb, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    const id = cdb && user ? await user.id() : null;
    if (cdb && id) {
      store.mode = 'cloud';
      store.col = cdb.collection('data/users/' + id);
      const timer = setTimeout(() => { if (ui.loading) { ui.loading = false; ui.offline = true; render(); } }, 10000);
      store.col.onSnapshot((snap) => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); ui.offline = false; }
        const first = ui.loading;
        const changed = applySnapshot(snap);
        if (first && !snap.metadata.fromCache && store.metaSynced === null) save(); // primera vez: guarda la Bandeja
        if (first || changed) { ui.loading = false; render(); }
      }, (err) => {
        clearTimeout(timer); ui.loading = false; ui.offline = true; render();
        toast(err.code === 'revoked' ? 'Ya no tienes acceso a esta agenda' : 'Se perdió la conexión con tus datos');
      });
      return;
    }
    ui.loading = false;
  }
  store.mode = 'local';
  db = loadLocal();
  render();
}
function newTask(title) {
  const now = new Date().toISOString();
  return {
    id: uid(), title, content: '', projectId: 'inbox', priority: 0, status: 0, kind: 'TEXT',
    date: null, time: null, reminder: '', repeat: '', tags: [], items: [],
    createdTime: now, modifiedTime: now, completedTime: null, sortOrder: Date.now(), reminded: null,
  };
}
const getTask = (id) => db.tasks.find((t) => t.id === id);
const getProject = (id) => db.projects.find((p) => p.id === id) || db.projects[0];
const allTags = () => [...new Set(db.tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b));
function touch(t) { t.modifiedTime = new Date().toISOString(); save(); }

/* ---------- Estado de la interfaz ---------- */
const ui = {
  view: 'tasks',
  list: { type: 'smart', id: 'today' },
  selected: null,
  calMode: 'month',
  calDate: new Date(),
  collapsed: new Set(['Completadas']),
};

/* ---------- Alta rápida con fechas en español ---------- */
const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6 };
function parseQuick(text) {
  let s = ' ' + text + ' ';
  const out = { date: null, time: null, priority: null, tags: [], projectId: null };
  const take = (re, fn) => { s = s.replace(re, (...m) => { fn(...m); return ' '; }); };

  take(/\s#([^\s#]+)/g, (_, tag) => out.tags.push(tag));
  take(/\s\^([^\s^]+)/g, (_, name) => {
    const p = db.projects.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
    if (p) out.projectId = p.id;
  });
  take(/\s!(alta|media|baja|ninguna)\b/i, (_, p) => { out.priority = { alta: 5, media: 3, baja: 1, ninguna: 0 }[p.toLowerCase()]; });
  take(/\s(!{1,3})(?=\s)/, (_, b) => { out.priority = [1, 3, 5][b.length - 1]; });

  const base = new Date();
  take(/\spasado mañana\b/i, () => { out.date = ymd(addDays(base, 2)); });
  take(/\smañana\b/i, () => { out.date = ymd(addDays(base, 1)); });
  take(/\shoy\b/i, () => { out.date = ymd(base); });
  take(/\sen (\d{1,3}) d[ií]as?\b/i, (_, n) => { out.date = ymd(addDays(base, +n)); });
  take(/\s(?:el |este |próximo |proximo )?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/i, (_, w) => {
    const target = WEEKDAYS[w.toLowerCase()];
    let diff = (target - base.getDay() + 7) % 7; if (diff === 0) diff = 7;
    out.date = ymd(addDays(base, diff));
  });
  take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (_, d, m, y) => {
    let yr = y ? +y : base.getFullYear(); if (yr < 100) yr += 2000;
    const dt = new Date(yr, +m - 1, +d);
    if (!y && dt < addDays(base, -1)) dt.setFullYear(yr + 1);
    out.date = ymd(dt);
  });
  take(/\s(?:a las )?(\d{1,2}):(\d{2})\s*(am|pm)?\b/i, (_, h, mi, ap) => { out.time = to24(+h, +mi, ap); });
  take(/\s(?:a las )?(\d{1,2})\s*(am|pm)\b/i, (_, h, ap) => { out.time = to24(+h, 0, ap); });
  take(/\sa las (\d{1,2})\b/i, (_, h) => { out.time = `${pad(+h)}:00`; });
  if (out.time && !out.date) out.date = ymd(base);

  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}
function to24(h, m, ap) {
  if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
  return `${pad(Math.min(h, 23))}:${pad(Math.min(m, 59))}`;
}

function addTaskFromText(text, defaults = {}) {
  const p = parseQuick(text);
  if (!p.title) return null;
  const t = newTask(p.title);
  Object.assign(t, defaults);
  if (p.date) t.date = p.date;
  if (p.time) t.time = p.time;
  if (p.priority !== null) t.priority = p.priority;
  if (p.projectId) t.projectId = p.projectId;
  t.tags = [...new Set([...(defaults.tags || []), ...p.tags])];
  db.tasks.push(t);
  save();
  return t;
}

/* ---------- Completar / repetir ---------- */
function nextDate(dateStr, rule) {
  const d = parseYmd(dateStr);
  switch (rule) {
    case 'DAILY': return ymd(addDays(d, 1));
    case 'WEEKDAY': { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return ymd(x); }
    case 'WEEKLY': return ymd(addDays(d, 7));
    case 'MONTHLY': { const x = new Date(d); x.setMonth(x.getMonth() + 1); return ymd(x); }
    case 'YEARLY': { const x = new Date(d); x.setFullYear(x.getFullYear() + 1); return ymd(x); }
  }
  return null;
}
function toggleDone(id) {
  const t = getTask(id); if (!t) return;
  if (t.status === 0 && t.repeat && t.date) {
    // Igual que TickTick: queda un registro completado y la tarea salta a la siguiente fecha
    const done = { ...structuredClone(t), id: uid(), status: 2, completedTime: new Date().toISOString(), repeat: '' };
    db.tasks.push(done);
    t.date = nextDate(t.date, t.repeat);
    t.reminded = null;
    t.items.forEach((i) => (i.status = 0));
    touch(t);
    toast(`Repetición: siguiente el ${dateLabel(t.date)}`);
  } else {
    const was = t.status;
    t.status = was === 0 ? 2 : 0;
    t.completedTime = t.status === 2 ? new Date().toISOString() : null;
    touch(t);
    if (t.status === 2) toast('Tarea completada', () => { t.status = 0; t.completedTime = null; touch(t); render(); });
  }
  render();
}
function deleteTask(id) {
  const i = db.tasks.findIndex((t) => t.id === id); if (i < 0) return;
  const [t] = db.tasks.splice(i, 1);
  if (ui.selected === id) ui.selected = null;
  save(); render();
  toast('Tarea eliminada', () => { db.tasks.splice(i, 0, t); save(); render(); });
}

/* ---------- Listas inteligentes ---------- */
const SMART = [
  { id: 'today', name: 'Hoy', ico: '📅', filter: (t) => t.status === 0 && t.date && t.date <= today() },
  { id: 'tomorrow', name: 'Mañana', ico: '🌅', filter: (t) => t.status === 0 && t.date === ymd(addDays(new Date(), 1)) },
  { id: 'next7', name: 'Próximos 7 días', ico: '🗓️', filter: (t) => t.status === 0 && t.date && t.date <= ymd(addDays(new Date(), 6)) },
  { id: 'all', name: 'Todas', ico: '📋', filter: (t) => t.status === 0 },
];
function listTasks(list) {
  if (list.type === 'smart') {
    if (list.id === 'completed') return db.tasks.filter((t) => t.status === 2);
    const s = SMART.find((x) => x.id === list.id); return db.tasks.filter(s.filter);
  }
  if (list.type === 'project') return db.tasks.filter((t) => t.projectId === list.id);
  if (list.type === 'tag') return db.tasks.filter((t) => t.tags.includes(list.id));
  return [];
}
function listTitle(list) {
  if (list.type === 'smart') return list.id === 'completed' ? 'Completadas' : SMART.find((x) => x.id === list.id).name;
  if (list.type === 'project') { const p = getProject(list.id); return `${p.emoji} ${p.name}`; }
  return `# ${list.id}`;
}
const byDateThenPrio = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99') || b.priority - a.priority || a.sortOrder - b.sortOrder;

/* ---------- Render general ---------- */
function render() {
  document.documentElement.dataset.theme = db.settings.theme === 'auto' ? '' : db.settings.theme;
  if (db.settings.theme === 'auto') delete document.documentElement.dataset.theme;
  $$('.rail-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#app').classList.toggle('no-sidebar', ui.view !== 'tasks');
  renderSidebar();
  if (ui.view === 'tasks') renderTasks();
  else if (ui.view === 'calendar') renderCalendar();
  else renderMatrix();
  renderDetail();
}

/* ---------- Panel de listas ---------- */
function renderSidebar() {
  const sb = $('#sidebar');
  const item = (list, ico, name, count) => {
    const active = ui.list.type === list.type && ui.list.id === list.id;
    return `<button class="side-item ${active ? 'active' : ''}" data-list='${esc(JSON.stringify(list))}'>
      <span class="ico">${ico}</span><span>${esc(name)}</span><span class="count">${count || ''}</span></button>`;
  };
  const open = (t) => t.status === 0;
  let h = SMART.map((s) => item({ type: 'smart', id: s.id }, s.ico, s.name, db.tasks.filter(s.filter).length)).join('');
  h += `<div class="side-title">Listas <button data-action="new-project" title="Nueva lista">+</button></div>`;
  h += [...db.projects].sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => item({ type: 'project', id: p.id }, p.emoji, p.name, db.tasks.filter((t) => t.projectId === p.id && open(t)).length)).join('');
  const tags = allTags();
  if (tags.length) {
    h += `<div class="side-title">Etiquetas</div>`;
    h += tags.map((tg) => item({ type: 'tag', id: tg }, '🏷️', tg, db.tasks.filter((t) => t.tags.includes(tg) && open(t)).length)).join('');
  }
  h += `<div class="side-title">Otros</div>` + item({ type: 'smart', id: 'completed' }, '✅', 'Completadas', '');
  sb.innerHTML = h;
}

/* ---------- Vista Tareas ---------- */
function groupTasks(tasks, mode) {
  const groups = new Map();
  const put = (k, t) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); };
  const open = tasks.filter((t) => t.status === 0).sort(byDateThenPrio);
  if (mode === 'priority') {
    PRIOS.forEach((p) => open.filter((t) => t.priority === p.v).forEach((t) => put(p.name === 'Ninguna' ? 'Sin prioridad' : p.name, t)));
  } else if (mode === 'date') {
    const t0 = today(), t7 = ymd(addDays(new Date(), 6));
    open.forEach((t) => put(!t.date ? 'Sin fecha' : t.date < t0 ? 'Vencidas' : t.date === t0 ? 'Hoy' : t.date <= t7 ? cap(dateLabel(t.date)) : 'Más adelante', t));
  } else if (mode === 'list') {
    open.forEach((t) => { const p = getProject(t.projectId); put(`${p.emoji} ${p.name}`, t); });
  } else {
    open.forEach((t) => put('Tareas', t));
  }
  const done = tasks.filter((t) => t.status === 2).sort((a, b) => (b.completedTime || '').localeCompare(a.completedTime || ''));
  if (done.length) groups.set('Completadas', done);
  return groups;
}
function taskRow(t, opts = {}) {
  const proj = getProject(t.projectId);
  const items = t.items.length ? `<span>☑ ${t.items.filter((i) => i.status === 2).length}/${t.items.length}</span>` : '';
  const date = t.date ? `<span class="date ${isOverdue(t) ? 'overdue' : ''}">${dateLabel(t.date)}${t.time ? ' ' + t.time : ''}</span>` : '';
  const tags = t.tags.slice(0, 2).map((g) => `<span class="tag-chip">${esc(g)}</span>`).join('');
  return `<div class="task ${t.status === 2 ? 'done' : ''} ${ui.selected === t.id ? 'selected' : ''}" data-task="${t.id}" draggable="true">
    <button class="check ${prioCls(t.priority)} ${t.status === 2 ? 'on' : ''}" data-toggle="${t.id}" aria-label="Completar"></button>
    <span class="t-title">${esc(t.title)}</span>
    <span class="t-meta">${tags}${items}${t.repeat ? '<span title="Se repite">🔁</span>' : ''}${t.reminder ? '<span title="Recordatorio">⏰</span>' : ''}${opts.hideList ? '' : `<span class="list-name">${esc(proj.name)}</span>`}${date}</span>
  </div>`;
}
function renderTasks() {
  const m = $('#main');
  const tasks = listTasks(ui.list);
  const isCompleted = ui.list.type === 'smart' && ui.list.id === 'completed';
  const mode = db.settings.groupBy;
  const groups = groupTasks(tasks, isCompleted ? 'none' : mode);
  let h = `<div class="main-head">
      <button class="icon-btn menu-btn" data-action="open-sidebar" aria-label="Listas"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
      <h1>${esc(listTitle(ui.list))}</h1>
      ${isCompleted ? '' : `<div class="seg" role="group" aria-label="Agrupar">
        ${[['priority', 'Prioridad'], ['date', 'Fecha'], ['list', 'Lista']].map(([k, n]) => `<button data-group="${k}" class="${mode === k ? 'active' : ''}">${n}</button>`).join('')}
      </div>`}
    </div>`;
  if (ui.loading) { m.innerHTML = h + `<div class="empty"><div class="big">⏳</div>Cargando tus tareas…</div>`; return; }
  if (ui.offline) h += `<div class="notice">No se pudo conectar con tus datos guardados. Lo que ves puede no estar al día; los cambios se guardarán al reconectar.</div>`;
  if (!isCompleted) h += `<div class="quick-add"><span style="color:var(--muted)">＋</span><input id="quick" placeholder="Añadir tarea… ej. «Llamar a Juan mañana 9:00 !alta #ventas»" autocomplete="off"><span class="hint">Enter para guardar</span></div>`;
  if (!db.tasks.length && !isCompleted) {
    h += `<div class="empty"><div class="big">🗒️</div><p>Tu agenda está vacía. Escribe una tarea arriba y pulsa Enter,<br>o importa una copia desde Ajustes.</p>
      <button class="btn" data-action="examples">Añadir 4 tareas de ejemplo</button></div>`;
  } else if (!tasks.length) {
    h += `<div class="empty"><div class="big">🗒️</div>${isCompleted ? 'Aún no hay tareas completadas' : 'No hay tareas aquí. Escribe arriba para añadir una.'}</div>`;
  }
  for (const [name, list] of groups) {
    if (isCompleted && name === 'Tareas') continue;
    const closed = ui.collapsed.has(name);
    h += `<div class="group-head ${closed ? 'closed' : ''}" data-collapse="${esc(name)}">
      <svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>${esc(name)} <span class="n">${list.length}</span></div>`;
    if (!closed) h += list.map((t) => taskRow(t, { hideList: ui.list.type === 'project' })).join('');
  }
  m.innerHTML = h;
  const q = $('#quick');
  if (q) q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !q.value.trim()) return;
    const defaults = {};
    if (ui.list.type === 'project') defaults.projectId = ui.list.id;
    if (ui.list.type === 'tag') defaults.tags = [ui.list.id];
    if (ui.list.type === 'smart' && (ui.list.id === 'today' || ui.list.id === 'next7')) defaults.date = today();
    if (ui.list.type === 'smart' && ui.list.id === 'tomorrow') defaults.date = ymd(addDays(new Date(), 1));
    addTaskFromText(q.value, defaults);
    render();
    $('#quick')?.focus();
  });
}

/* ---------- Vista Calendario ---------- */
function calTasksOn(dateStr) {
  return db.tasks.filter((t) => t.date === dateStr && (t.status === 0 || db.settings.showCompletedInCal)).sort(byDateThenPrio);
}
function calEv(t) {
  return `<div class="cal-ev ${prioCls(t.priority)} ${t.status === 2 ? 'done' : ''}" data-task="${t.id}" draggable="true" title="${esc(t.title)}">${t.time ? `<b>${t.time}</b> ` : ''}${esc(t.title)}</div>`;
}
function renderCalendar() {
  const m = $('#main');
  const d = ui.calDate;
  const ws = db.settings.weekStart;
  let title, body;
  if (ui.calMode === 'month') {
    title = `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = addDays(first, -((first.getDay() - ws + 7) % 7));
    const dows = [...Array(7)].map((_, i) => `<div class="cal-dow">${DOW[(i + ws) % 7]}</div>`).join('');
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i), ds = ymd(day);
      const evs = calTasksOn(ds);
      const max = 3;
      cells += `<div class="cal-cell ${day.getMonth() !== d.getMonth() ? 'other' : ''} ${ds === today() ? 'today' : ''}" data-date="${ds}">
        <span class="cal-day">${day.getDate()}</span>${evs.slice(0, max).map(calEv).join('')}${evs.length > max ? `<span class="cal-more">+${evs.length - max} más</span>` : ''}</div>`;
    }
    body = `<div class="cal-grid">${dows}${cells}</div>`;
  } else {
    const start = addDays(d, -((d.getDay() - ws + 7) % 7));
    const days = [...Array(7)].map((_, i) => addDays(start, i));
    const end = days[6];
    title = start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
      : `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    let head = '<div></div>' + days.map((x) => `<div class="week-head ${ymd(x) === today() ? 'today' : ''}">${DOW[x.getDay()]}<b>${x.getDate()}</b></div>`).join('');
    head += '<div class="week-label">Todo el día</div>' + days.map((x) => `<div class="week-allday" data-date="${ymd(x)}">${calTasksOn(ymd(x)).filter((t) => !t.time).map(calEv).join('')}</div>`).join('');
    let hours = '<div>' + [...Array(24)].map((_, h) => `<div class="hour-label">${h ? pad(h) + ':00' : ''}</div>`).join('') + '</div>';
    hours += days.map((x) => {
      const ds = ymd(x);
      const slots = [...Array(24)].map((_, h) => `<div class="slot" data-date="${ds}" data-hour="${h}"></div>`).join('');
      const evs = calTasksOn(ds).filter((t) => t.time).map((t) => {
        const [hh, mm] = t.time.split(':').map(Number);
        return calEv(t).replace('class="cal-ev', `style="top:${hh * 48 + (mm / 60) * 48 + 2}px" class="cal-ev`);
      }).join('');
      return `<div class="week-col">${slots}${evs}</div>`;
    }).join('');
    body = `<div class="week">${head}<div class="week-body" id="weekBody">${hours}</div></div>`;
  }
  m.innerHTML = `<div class="main-head">
      <h1>${title}</h1>
      <button class="icon-btn" data-cal="prev" aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button class="btn" data-cal="today">Hoy</button>
      <button class="icon-btn" data-cal="next" aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <div class="seg"><button data-calmode="month" class="${ui.calMode === 'month' ? 'active' : ''}">Mes</button><button data-calmode="week" class="${ui.calMode === 'week' ? 'active' : ''}">Semana</button></div>
    </div>${body}`;
  const wb = $('#weekBody'); if (wb) wb.scrollTop = 7 * 48;
}

/* ---------- Vista Matriz ---------- */
function renderMatrix() {
  const m = $('#main');
  const t0 = today(), t1 = ymd(addDays(new Date(), 1));
  const bucket = (t) => !t.date ? 'Sin fecha' : t.date < t0 ? 'Vencidas' : t.date === t0 ? 'Hoy' : t.date === t1 ? 'Mañana' : 'Próximas';
  const order = ['Vencidas', 'Hoy', 'Mañana', 'Próximas', 'Sin fecha'];
  const quads = QUADS.map((q) => {
    const tasks = db.tasks.filter((t) => t.status === 0 && t.priority === q.prio).sort(byDateThenPrio);
    let inner = '';
    if (!tasks.length) inner = `<div class="empty">Sin tareas</div>`;
    order.forEach((b) => {
      const g = tasks.filter((t) => bucket(t) === b); if (!g.length) return;
      const key = `q${q.q}-${b}`, closed = ui.collapsed.has(key);
      inner += `<div class="group-head ${closed ? 'closed' : ''}" data-collapse="${key}"><svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>${b} <span class="n">${g.length}</span></div>`;
      if (!closed) inner += g.map((t) => taskRow(t)).join('');
    });
    return `<div class="quad q${q.q}" data-prio="${q.prio}">
      <div class="quad-head"><span class="quad-num">${['I', 'II', 'III', 'IV'][q.q - 1]}</span>${q.name}
        <button class="icon-btn add" data-addprio="${q.prio}" aria-label="Añadir"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div>
      <div class="quad-body">${inner}</div></div>`;
  }).join('');
  m.innerHTML = `<div class="main-head"><h1>Matriz Eisenhower</h1></div><div class="matrix">${quads}</div>`;
}

/* ---------- Detalle ---------- */
function renderDetail() {
  const el = $('#detail');
  const t = ui.selected && getTask(ui.selected);
  el.classList.toggle('open', !!t);
  if (!t) { el.innerHTML = ''; return; }
  const active = document.activeElement;
  const focusKey = active && el.contains(active) ? active.dataset.f || active.dataset.item : null;
  const created = new Date(t.createdTime);
  el.innerHTML = `<div class="detail-inner">
    <div class="detail-top">
      <button class="icon-btn" data-action="close-detail" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button class="check ${prioCls(t.priority)} ${t.status === 2 ? 'on' : ''}" data-toggle="${t.id}" aria-label="Completar"></button>
      <label class="field">📅 <input type="date" data-f="date" value="${t.date || ''}"></label>
      <label class="field">🕘 <input type="time" data-f="time" value="${t.time || ''}"></label>
      <span class="prio-pick">${PRIOS.map((p) => `<button data-prio="${p.v}" class="${t.priority === p.v ? 'active' : ''}" style="color:var(--${p.cls})" title="Prioridad ${p.name.toLowerCase()}"><svg class="flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="${p.v ? 'currentColor' : 'none'}"/></svg></button>`).join('')}</span>
    </div>
    <div class="detail-body">
      <textarea class="detail-title" data-f="title" rows="1">${esc(t.title)}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <label class="field">📂 <select data-f="projectId">${db.projects.map((p) => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field">⏰ <select data-f="reminder">${REMINDERS.map(([v, n]) => `<option value="${v}" ${v === t.reminder ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">🔁 <select data-f="repeat">${REPEATS.map(([v, n]) => `<option value="${v}" ${v === t.repeat ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <textarea class="detail-notes" data-f="content" placeholder="Notas…">${esc(t.content)}</textarea>
      <div class="section-label">Subtareas</div>
      ${t.items.map((i) => `<div class="check-item ${i.status === 2 ? 'done' : ''}">
        <button class="check ${i.status === 2 ? 'on' : ''}" data-itemtoggle="${i.id}"></button>
        <input type="text" data-item="${i.id}" value="${esc(i.title)}">
        <button class="x" data-itemdel="${i.id}" aria-label="Quitar">✕</button></div>`).join('')}
      <button class="add-line" data-action="add-item">＋ Añadir subtarea</button>
      <div class="section-label">Etiquetas</div>
      <label class="field" style="display:flex">🏷️ <input type="text" data-f="tags" value="${esc(t.tags.join(', '))}" placeholder="ventas, cliente" style="flex:1"></label>
    </div>
    <div class="detail-foot"><span>Creada ${created.getDate()} ${MONTHS[created.getMonth()].slice(0, 3)} ${created.getFullYear()}</span>
      <button class="danger" data-action="delete-task">Eliminar</button></div>
  </div>`;
  if (focusKey) { const f = el.querySelector(`[data-f="${focusKey}"],[data-item="${focusKey}"]`); if (f) { f.focus(); if (f.setSelectionRange && f.type === 'text') f.setSelectionRange(f.value.length, f.value.length); } }
  autoGrow($('.detail-title', el));
}
function autoGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

/* ---------- Modales ---------- */
function openModal(html, onMount) {
  $('#overlay').hidden = false;
  const m = $('#modal'); m.hidden = false; m.innerHTML = html;
  onMount && onMount(m);
}
function closeModal() { $('#overlay').hidden = true; $('#modal').hidden = true; $('#modal').innerHTML = ''; closeSidebar(); }

function addModal(defaults, title = 'Nueva tarea') {
  const hint = [defaults.date && `📅 ${dateLabel(defaults.date)}${defaults.time ? ' ' + defaults.time : ''}`, defaults.priority !== undefined && `Prioridad ${PRIOS.find((p) => p.v === defaults.priority).name.toLowerCase()}`].filter(Boolean).join(' · ');
  openModal(`<h2>${title}</h2>${hint ? `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">${hint}</div>` : ''}
    <input type="text" id="mAdd" placeholder="¿Qué hay que hacer?" autocomplete="off">
    <div class="row"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" id="mAddOk">Añadir</button></div>`, (m) => {
    const inp = $('#mAdd', m); inp.focus();
    const go = () => { if (!inp.value.trim()) return; addTaskFromText(inp.value, defaults); closeModal(); render(); };
    $('#mAddOk', m).onclick = go;
    inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
}

function projectModal(p) {
  const isNew = !p;
  let emoji = p ? p.emoji : '💼';
  openModal(`<h2>${isNew ? 'Nueva lista' : 'Editar lista'}</h2>
    <label>Nombre</label><input type="text" id="pName" value="${esc(p ? p.name : '')}" placeholder="Ej. Ventas">
    <label>Ícono</label><div class="emoji-row">${EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
    <div class="row">${!isNew && !p.inbox ? '<button class="btn danger" id="pDel" style="margin-right:auto">Eliminar lista</button>' : ''}
      <button class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" id="pOk">Guardar</button></div>`, (m) => {
    $('#pName', m).focus();
    $$('[data-emoji]', m).forEach((b) => b.onclick = () => { emoji = b.dataset.emoji; $$('[data-emoji]', m).forEach((x) => x.classList.toggle('active', x === b)); });
    $('#pOk', m).onclick = () => {
      const name = $('#pName', m).value.trim(); if (!name) return;
      if (isNew) { const np = { id: uid(), name, emoji, sortOrder: db.projects.length }; db.projects.push(np); ui.list = { type: 'project', id: np.id }; }
      else { p.name = name; p.emoji = emoji; }
      save(); closeModal(); render();
    };
    const del = $('#pDel', m);
    if (del) del.onclick = () => confirmBox(`¿Eliminar la lista «${p.name}»? Sus tareas pasarán a la Bandeja de entrada.`, 'Eliminar lista', () => {
      db.tasks.forEach((t) => { if (t.projectId === p.id) t.projectId = 'inbox'; });
      db.projects = db.projects.filter((x) => x.id !== p.id);
      ui.list = { type: 'project', id: 'inbox' };
      save(); render();
    });
  });
}

function searchModal() {
  openModal(`<h2>Buscar</h2><input type="search" id="sQ" placeholder="Título, nota o etiqueta…" autocomplete="off"><div class="search-results" id="sR" style="margin-top:10px"></div>`, (m) => {
    const q = $('#sQ', m); q.focus();
    q.oninput = () => {
      const s = q.value.trim().toLowerCase();
      const res = s ? db.tasks.filter((t) => (t.title + ' ' + t.content + ' ' + t.tags.join(' ')).toLowerCase().includes(s)).slice(0, 40) : [];
      $('#sR', m).innerHTML = res.length ? res.map((t) => taskRow(t)).join('') : (s ? '<div class="empty">Sin resultados</div>' : '');
    };
  });
}

function settingsModal() {
  const s = db.settings;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  openModal(`<h2>Ajustes</h2>
    <label>Tema</label><select id="sTheme"><option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option></select>
    <label>La semana empieza el</label><select id="sWeek"><option value="1">Lunes</option><option value="0">Domingo</option></select>
    <label><input type="checkbox" id="sShowDone" ${s.showCompletedInCal ? 'checked' : ''}> Mostrar completadas en el calendario</label>
    <label>Recordatorios</label>
    <button class="btn" id="sNotif" ${perm === 'granted' || perm === 'unsupported' ? 'disabled' : ''}>${perm === 'granted' ? '✅ Notificaciones activadas' : perm === 'unsupported' ? 'No disponibles en este navegador' : 'Activar notificaciones'}</button>
    <label>Copia de seguridad (para pasar datos entre PC y celular)</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="sExp">⬇️ Exportar</button><button class="btn" id="sImp">⬆️ Importar</button><input type="file" id="sFile" accept="application/json" hidden></div>
    <div class="row"><button class="btn primary" data-action="close-modal">Listo</button></div>`, (m) => {
    $('#sTheme', m).value = s.theme; $('#sWeek', m).value = String(s.weekStart);
    $('#sTheme', m).onchange = (e) => { s.theme = e.target.value; save(); render(); };
    $('#sWeek', m).onchange = (e) => { s.weekStart = +e.target.value; save(); render(); };
    $('#sShowDone', m).onchange = (e) => { s.showCompletedInCal = e.target.checked; save(); render(); };
    $('#sNotif', m).onclick = () => Notification.requestPermission().then(() => settingsModal());
    $('#sExp', m).onclick = async () => {
      const filename = `mi-agenda-${today()}.json`, json = JSON.stringify(db, null, 2);
      const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
      if (dl) { try { await dl.save({ filename, data: json }); } catch (err) { /* el usuario canceló */ } return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#sImp', m).onclick = () => $('#sFile', m).click();
    $('#sFile', m).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      let data;
      try {
        data = JSON.parse(await f.text());
        if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) throw new Error('formato');
      } catch (err) { toast('El archivo no es una copia válida de Mi Agenda'); return; }
      confirmBox(`Se reemplazarán tus datos actuales por las ${data.tasks.length} tareas del archivo.`, 'Reemplazar', () => {
        db.tasks = data.tasks; db.projects = data.projects; db.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
        if (!db.projects.some((p) => p.id === 'inbox')) db.projects.unshift({ ...INBOX });
        save(); render(); toast('Datos importados');
      });
    };
  });
}

function confirmBox(msg, okLabel, onOk) {
  openModal(`<h2>¿Confirmas?</h2><p>${esc(msg)}</p>
    <div class="row"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn danger" id="cOk">${esc(okLabel)}</button></div>`, (m) => {
    $('#cOk', m).onclick = () => { closeModal(); onOk(); };
  });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undo">Deshacer</button>' : ''}`;
  el.hidden = false;
  if (undo) $('#undo').onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

/* ---------- Sidebar móvil ---------- */
function openSidebar() { $('#sidebar').classList.add('open'); $('#overlay').hidden = false; }
function closeSidebar() { $('#sidebar').classList.remove('open'); if ($('#modal').hidden) $('#overlay').hidden = true; }

/* ---------- Eventos ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-task], [data-date], [data-collapse], .slot');
  if (!el) return;
  const d = el.dataset;

  if (d.view) { ui.view = d.view; render(); return; }
  if (d.toggle) { e.stopPropagation(); toggleDone(d.toggle); return; }
  if (d.list) { ui.list = JSON.parse(d.list); ui.view = 'tasks'; closeSidebar(); render(); return; }
  if (d.group) { db.settings.groupBy = d.group; save(); render(); return; }
  if (d.collapse !== undefined) { ui.collapsed.has(d.collapse) ? ui.collapsed.delete(d.collapse) : ui.collapsed.add(d.collapse); render(); return; }
  if (d.cal) {
    const step = ui.calMode === 'month' ? 'month' : 'week';
    if (d.cal === 'today') ui.calDate = new Date();
    else if (step === 'month') ui.calDate = new Date(ui.calDate.getFullYear(), ui.calDate.getMonth() + (d.cal === 'next' ? 1 : -1), 1);
    else ui.calDate = addDays(ui.calDate, d.cal === 'next' ? 7 : -7);
    render(); return;
  }
  if (d.calmode) { ui.calMode = d.calmode; render(); return; }
  if (d.addprio !== undefined) { addModal({ priority: +d.addprio }, 'Nueva tarea en este cuadrante'); return; }
  if (d.prio !== undefined && ui.selected) { const t = getTask(ui.selected); t.priority = +d.prio; touch(t); render(); return; }
  if (d.itemtoggle) { const t = getTask(ui.selected); const i = t.items.find((x) => x.id === d.itemtoggle); i.status = i.status === 2 ? 0 : 2; touch(t); render(); return; }
  if (d.itemdel) { const t = getTask(ui.selected); t.items = t.items.filter((x) => x.id !== d.itemdel); touch(t); render(); return; }
  if (d.task) {
    if (!$('#modal').hidden) closeModal();
    ui.selected = d.task; render(); return;
  }
  if (d.date !== undefined && el.classList.contains('cal-cell')) { addModal({ date: d.date }); return; }
  if (d.date !== undefined && el.classList.contains('week-allday')) { addModal({ date: d.date }); return; }
  if (el.classList.contains('slot')) { addModal({ date: d.date, time: `${pad(+d.hour)}:00` }); return; }

  switch (d.action) {
    case 'examples': addExamples(); break;
    case 'search': searchModal(); break;
    case 'settings': settingsModal(); break;
    case 'new-project': projectModal(null); break;
    case 'close-modal': closeModal(); break;
    case 'open-sidebar': openSidebar(); break;
    case 'close-detail': ui.selected = null; render(); break;
    case 'delete-task': deleteTask(ui.selected); break;
    case 'add-item': { const t = getTask(ui.selected); const it = { id: uid(), title: '', status: 0 }; t.items.push(it); t.kind = 'CHECKLIST'; touch(t); render(); $(`[data-item="${it.id}"]`)?.focus(); break; }
  }
});
document.addEventListener('dblclick', (e) => {
  const b = e.target.closest('.side-item[data-list]'); if (!b) return;
  const list = JSON.parse(b.dataset.list);
  if (list.type === 'project') projectModal(getProject(list.id));
});
document.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.side-item[data-list]'); if (!b) return;
  const list = JSON.parse(b.dataset.list);
  if (list.type === 'project') { e.preventDefault(); projectModal(getProject(list.id)); }
});
$('#overlay').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (ui.selected) { ui.selected = null; render(); } }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#modal').hidden) { e.preventDefault(); addModal(ui.view === 'tasks' && ui.list.type === 'project' ? { projectId: ui.list.id } : {}); }
});

// Edición en el panel de detalle
$('#detail').addEventListener('input', (e) => {
  const t = getTask(ui.selected); if (!t) return;
  const f = e.target.dataset.f;
  if (f === 'title') { t.title = e.target.value.replace(/\n/g, ' '); autoGrow(e.target); touch(t); refreshRow(t); }
  else if (f === 'content') { t.content = e.target.value; touch(t); }
  else if (e.target.dataset.item) { const i = t.items.find((x) => x.id === e.target.dataset.item); i.title = e.target.value; touch(t); }
});
$('#detail').addEventListener('change', (e) => {
  const t = getTask(ui.selected); if (!t) return;
  const f = e.target.dataset.f; if (!f || f === 'title' || f === 'content') return;
  if (f === 'tags') t.tags = [...new Set(e.target.value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean))];
  else if (f === 'date') { t.date = e.target.value || null; if (!t.date) t.time = null; t.reminded = null; }
  else if (f === 'time') { t.time = e.target.value || null; if (t.time && !t.date) t.date = today(); t.reminded = null; }
  else if (f === 'reminder') { t.reminder = e.target.value; t.reminded = null; if (t.reminder) askNotify(); }
  else t[f] = e.target.value;
  touch(t); render();
});
$('#detail').addEventListener('keydown', (e) => {
  if (e.target.dataset.f === 'title' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.target.dataset.item && e.key === 'Enter') { e.preventDefault(); $('[data-action="add-item"]').click(); }
});
function refreshRow(t) { $$(`.task[data-task="${t.id}"] .t-title, .cal-ev[data-task="${t.id}"]`).forEach((n) => { if (n.classList.contains('t-title')) n.textContent = t.title; }); }

/* ---------- Arrastrar y soltar ---------- */
let dragId = null;
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest('[data-task]'); if (!el) return;
  dragId = el.dataset.task; el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragend', () => { dragId = null; $$('.dragging, .drop-target').forEach((n) => n.classList.remove('dragging', 'drop-target')); });
const dropZone = (el) => el.closest('.quad, .cal-cell, .week-allday, .slot, .side-item[data-list]');
document.addEventListener('dragover', (e) => {
  if (!dragId) return; const z = dropZone(e.target); if (!z) return;
  e.preventDefault(); $$('.drop-target').forEach((n) => n !== z && n.classList.remove('drop-target')); z.classList.add('drop-target');
});
document.addEventListener('drop', (e) => {
  if (!dragId) return; const z = dropZone(e.target); if (!z) return;
  e.preventDefault();
  const t = getTask(dragId); if (!t) return;
  if (z.classList.contains('quad')) t.priority = +z.dataset.prio;
  else if (z.classList.contains('cal-cell') || z.classList.contains('week-allday')) { t.date = z.dataset.date; if (z.classList.contains('week-allday')) t.time = null; }
  else if (z.classList.contains('slot')) { t.date = z.dataset.date; t.time = `${pad(+z.dataset.hour)}:00`; }
  else if (z.dataset.list) {
    const list = JSON.parse(z.dataset.list);
    if (list.type === 'project') t.projectId = list.id;
    else if (list.type === 'tag' && !t.tags.includes(list.id)) t.tags.push(list.id);
    else if (list.type === 'smart' && list.id === 'today') t.date = today();
    else if (list.type === 'smart' && list.id === 'tomorrow') t.date = ymd(addDays(new Date(), 1));
  }
  t.reminded = null; touch(t); render();
});

/* ---------- Recordatorios ---------- */
function askNotify() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function offsetMs(trigger) {
  const m = /^-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trigger || ''); if (!m) return null;
  return (((+m[1] || 0) * 24 + (+m[2] || 0)) * 60 + (+m[3] || 0)) * 60000 + (+m[4] || 0) * 1000;
}
function checkReminders() {
  const now = Date.now();
  db.tasks.forEach((t) => {
    if (t.status !== 0 || !t.reminder || !t.date) return;
    const key = `${t.date} ${t.time || '09:00'} ${t.reminder}`;
    if (t.reminded === key) return;
    const [h, mi] = (t.time || '09:00').split(':').map(Number);
    const due = parseYmd(t.date); due.setHours(h, mi, 0, 0);
    const at = due.getTime() - offsetMs(t.reminder);
    if (now >= at && now - at < 6 * 3600e3) {
      t.reminded = key; save();
      const body = `${dateLabel(t.date)}${t.time ? ' ' + t.time : ''}`;
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(t.title, { body, icon: 'icon.svg', tag: t.id });
        n.onclick = () => { window.focus(); ui.selected = t.id; render(); };
      } else toast(`⏰ ${t.title} — ${body}`);
    }
  });
}
setInterval(checkReminders, 30000);

/* ---------- Inicio ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.claude) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
initStore().then(checkReminders);

// Generic Mobile Doc renderer: nothing here names a specific DocType. Every screen — list, card
// layout, search, filters, quick edit — is built entirely from what get_card_schema /
// get_quick_edit_fields / get_filters / get_list return for whichever Mobile Doc is active.

const API = "/api/method/leanerp_mobile_api.api.mobile_doc.";

const state = {
  mobileDocs: [],
  mobileDoc: null,
  doctype: null,
  cardSchema: null,
  quickEditSchema: null,
  filters: [],
  activeFilterNames: new Set(),
  search: "",
  records: [],
  limitStart: 0,
  hasMore: false,
  loadingMore: false,
};

const PAGE_SIZE = 20;

function csrfToken() {
  return window.frappe && window.frappe.csrf_token ? window.frappe.csrf_token : "";
}

async function apiGet(method, params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, v);
  }
  const res = await fetch(`${API}${method}?${usp.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.exception || `${method} failed`);
  return data.message;
}

async function apiResource(doctype, name) {
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.exception || "fetch record failed");
  return data.data;
}

async function apiSave(doctype, name, values) {
  const res = await fetch(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrfToken() },
    body: JSON.stringify(values),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.exception || "save failed");
  return data.data;
}

// --- field-role heuristics (naming/type conventions, not tied to any one DocType) ---
function isPhoneField(f) {
  return f.fieldtype === "Phone" || /phone|mobile|contact_number/i.test(f.fieldname);
}
function isPillField(f) {
  return /stage|status/i.test(f.fieldname);
}
function isDateField(f) {
  return f.fieldtype === "Date" || f.fieldtype === "Datetime";
}
function displayValue(record, f) {
  if (record._titles && record._titles[f.fieldname]) return record._titles[f.fieldname];
  return record[f.fieldname];
}
function initials(text) {
  if (!text) return "?";
  const parts = String(text).trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function hashHue(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function isPastDate(value) {
  if (!value) return false;
  return new Date(value) < new Date(new Date().toDateString());
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

// --- session gate ---
async function requireLogin() {
  const res = await fetch("/api/method/frappe.auth.get_logged_user");
  if (res.status !== 200) {
    window.location.href = "/login?redirect-to=" + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

async function loadUserName() {
  const res = await fetch("/api/method/frappe.auth.get_logged_user");
  const { message: user } = await res.json();
  try {
    const r = await fetch(
      "/api/method/frappe.client.get_value?doctype=User&filters=" +
        encodeURIComponent(JSON.stringify({ name: user })) +
        "&fieldname=" +
        encodeURIComponent(JSON.stringify(["first_name", "full_name"]))
    );
    const data = await r.json();
    return data.message.first_name || data.message.full_name || user;
  } catch (e) {
    return user;
  }
}

// --- sidebar / screen switching ---
async function loadMobileDocs() {
  const res = await fetch(
    "/api/resource/" +
      encodeURIComponent("Mobile Doc") +
      "?filters=" +
      encodeURIComponent(JSON.stringify([["disabled", "=", 0]])) +
      "&fields=" +
      encodeURIComponent(JSON.stringify(["name", "title", "doctype_link", "is_default"]))
  );
  const data = await res.json();
  state.mobileDocs = data.data || [];
}

function renderSidebar() {
  const list = document.getElementById("sidebar-list");
  list.innerHTML = "";
  for (const md of state.mobileDocs) {
    const item = document.createElement("div");
    item.className = "sidebar-item" + (md.name === state.mobileDoc ? " active" : "");
    item.innerHTML = `<span class="folder-icon">&#128193;</span><span>${md.title}</span>`;
    item.addEventListener("click", () => {
      closeSidebar();
      if (md.name !== state.mobileDoc) loadScreen(md.name);
    });
    list.appendChild(item);
  }
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("overlay").classList.add("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}

async function loadScreen(mobileDocName) {
  state.mobileDoc = mobileDocName;
  state.activeFilterNames = new Set();
  state.search = "";
  document.getElementById("search-input").value = "";

  document.getElementById("greeting-sub").textContent = greetingWord();

  const [cardSchema, quickEditSchema, filtersResp] = await Promise.all([
    apiGet("get_card_schema", { mobile_doc: mobileDocName }),
    apiGet("get_quick_edit_fields", { mobile_doc: mobileDocName }),
    apiGet("get_filters", { mobile_doc: mobileDocName }),
  ]);
  state.cardSchema = cardSchema;
  state.doctype = cardSchema.doctype;
  state.quickEditSchema = quickEditSchema;
  state.filters = filtersResp.filters;
  for (const f of state.filters) if (f.is_default) state.activeFilterNames.add(f.name);

  renderSidebar();
  renderFilters();
  await refreshList();
}

// --- filters ---
function mergedFilters() {
  const merged = [];
  for (const f of state.filters) {
    if (state.activeFilterNames.has(f.name)) merged.push(...f.filters);
  }
  return merged;
}

function renderFilters() {
  const row = document.getElementById("filter-row");
  row.innerHTML = "";
  for (const f of state.filters) {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.activeFilterNames.has(f.name) ? " active" : "");
    chip.textContent = f.label;
    chip.addEventListener("click", () => {
      if (state.activeFilterNames.has(f.name)) state.activeFilterNames.delete(f.name);
      else state.activeFilterNames.add(f.name);
      renderFilters();
      refreshList();
    });
    row.appendChild(chip);
  }
}

// --- list ---
async function refreshList() {
  state.limitStart = 0;
  state.hasMore = false;
  const filters = mergedFilters();
  const resp = await apiGet("get_list", {
    mobile_doc: state.mobileDoc,
    filters: filters.length ? JSON.stringify(filters) : undefined,
    search: state.search || undefined,
    limit_start: 0,
    limit_page_length: PAGE_SIZE,
  });
  state.records = resp.records;
  state.total = resp.total;
  state.hasMore = resp.has_more;
  state.limitStart = resp.records.length;
  document.getElementById("meta-row").textContent = `${state.records.length} of ${state.total} records`;
  renderCards(resp.records, { append: false });
}

async function loadMoreList() {
  if (state.loadingMore || !state.hasMore) return;
  state.loadingMore = true;
  const indicator = document.createElement("div");
  indicator.className = "empty-state";
  indicator.textContent = "Loading more…";
  document.getElementById("list").appendChild(indicator);
  const filters = mergedFilters();
  try {
    const resp = await apiGet("get_list", {
      mobile_doc: state.mobileDoc,
      filters: filters.length ? JSON.stringify(filters) : undefined,
      search: state.search || undefined,
      limit_start: state.limitStart,
      limit_page_length: PAGE_SIZE,
    });
    state.records = state.records.concat(resp.records);
    state.hasMore = resp.has_more;
    state.limitStart += resp.records.length;
    document.getElementById("meta-row").textContent = `${state.records.length} of ${state.total} records`;
    renderCards(resp.records, { append: true });
  } finally {
    indicator.remove();
    state.loadingMore = false;
  }
}

function renderCards(records, { append } = { append: false }) {
  const list = document.getElementById("list");
  if (!append) list.innerHTML = "";
  if (!append && !records.length) {
    list.innerHTML = '<div class="empty-state">No records match this view.</div>';
    return;
  }
  if (!records.length) return;

  const fields = state.cardSchema.fields;
  const titleField = fields[0];
  const phoneFields = fields.filter(isPhoneField);
  const pillFields = fields.filter((f) => isPillField(f) && f !== titleField);
  const dateFields = fields.filter((f) => isDateField(f) && f !== titleField);
  const restFields = fields.slice(1).filter(
    (f) => !isPhoneField(f) && !isPillField(f) && !isDateField(f)
  );

  for (const record of records) {
    const titleText = titleField ? String(displayValue(record, titleField) || "") : record.name;
    const hue = hashHue(titleText);

    const card = document.createElement("div");
    card.className = "card";

    const callable = phoneFields
      .map((f) => ({ label: f.label, value: record[f.fieldname] }))
      .filter((c) => c.value);

    let html = `
      <div class="card-top">
        <div class="avatar" style="background:hsl(${hue},45%,55%)">${initials(titleText)}</div>
        <div class="card-title">${titleText}</div>
        ${callable.length ? '<button class="call-btn" aria-label="Call">&#128222;</button>' : ""}
      </div>`;

    if (callable.length) {
      html += `<div class="card-phone">${callable[0].value}</div>`;
    }
    for (const f of pillFields) {
      const val = displayValue(record, f);
      if (!val) continue;
      const h = hashHue(val);
      html += `<div class="pill" style="background:hsl(${h},70%,92%);color:hsl(${h},55%,32%)">${val}</div>`;
    }
    for (const f of dateFields) {
      const val = record[f.fieldname];
      if (!val) continue;
      html += `<div class="card-row"><span class="label">${f.label}:</span> ${val}${
        isPastDate(val) ? '<span class="overdue-tag">OVERDUE</span>' : ""
      }</div>`;
    }
    for (const f of restFields) {
      const val = displayValue(record, f);
      if (!val) continue;
      html += `<div class="card-row"><span class="label">${f.label}:</span> ${val}</div>`;
    }
    card.innerHTML = html;

    if (callable.length) {
      card.querySelector(".call-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openCallSheet(callable);
      });
    }

    attachLongPress(card, () => openQuickEdit(record));
    list.appendChild(card);
  }
}

function attachLongPress(el, onLongPress) {
  let timer = null;
  const start = () => {
    timer = setTimeout(onLongPress, 500);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
  };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchmove", cancel);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", cancel);
  el.addEventListener("mouseleave", cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

// --- call sheet ---
function openCallSheet(candidates) {
  const sheet = document.getElementById("call-sheet");
  if (candidates.length === 1) {
    window.location.href = "tel:" + candidates[0].value;
    return;
  }
  let html = `
    <div class="sheet-header">
      <div class="title">Call which number?</div>
      <button id="call-sheet-close">&times;</button>
    </div>`;
  for (const c of candidates) {
    html += `<a class="call-sheet-row" href="tel:${c.value}"><span>${c.label}</span><span>${c.value}</span></a>`;
  }
  sheet.innerHTML = html;
  sheet.classList.add("open");
  document.getElementById("overlay").classList.add("open");
  document.getElementById("call-sheet-close").addEventListener("click", closeSheets);
}

function closeSheets() {
  document.getElementById("call-sheet").classList.remove("open");
  document.getElementById("quick-edit-sheet").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}

// --- quick edit sheet ---
async function openQuickEdit(record) {
  const fields = state.quickEditSchema.fields;
  if (!fields.length) {
    toast("No quick edit fields configured for this screen.");
    return;
  }
  const sheet = document.getElementById("quick-edit-sheet");
  sheet.innerHTML = `
    <div class="sheet-header">
      <div class="title">${state.cardSchema.fields[0] ? displayValue(record, state.cardSchema.fields[0]) : record.name}</div>
      <button id="qe-save" class="save-btn">Save</button>
    </div>
    <div id="qe-fields"></div>`;
  sheet.classList.add("open");
  document.getElementById("overlay").classList.add("open");

  const full = await apiResource(state.doctype, record.name);

  const container = document.getElementById("qe-fields");
  const changed = {};
  for (const f of fields) {
    const group = document.createElement("div");
    group.className = "field-group";
    const type = isDateField(f) ? "date" : "text";
    const value = full[f.fieldname] || "";
    group.innerHTML = `<label>${f.label}</label><input type="${type}" data-field="${f.fieldname}" value="${value}">`;
    container.appendChild(group);
  }
  container.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      changed[input.dataset.field] = input.value;
      document.getElementById("qe-save").classList.add("ready");
    });
  });

  document.getElementById("qe-save").addEventListener("click", async () => {
    if (!Object.keys(changed).length) {
      closeSheets();
      return;
    }
    try {
      await apiSave(state.doctype, record.name, changed);
      closeSheets();
      toast("Saved");
      refreshList();
    } catch (e) {
      toast("Save failed: " + e.message);
    }
  });
}

// --- wiring ---
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function init() {
  if (!(await requireLogin())) return;

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

  loadUserName().then((name) => {
    document.getElementById("greeting-name").textContent = name;
  });

  document.getElementById("menu-btn").addEventListener("click", openSidebar);
  document.getElementById("overlay").addEventListener("click", () => {
    closeSidebar();
    closeSheets();
  });
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/method/logout", {
      method: "POST",
      headers: { "X-Frappe-CSRF-Token": csrfToken() },
    });
    window.location.href = "/login";
  });
  document.getElementById("fab-btn").addEventListener("click", () => toast("Create screen not built in this POC."));
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.tab !== "home") toast("Not built in this POC yet.");
    });
  });
  document.getElementById("search-input").addEventListener(
    "input",
    debounce((e) => {
      state.search = e.target.value;
      refreshList();
    }, 400)
  );

  const list = document.getElementById("list");
  list.addEventListener("scroll", () => {
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 200) loadMoreList();
  });

  await loadMobileDocs();
  if (!state.mobileDocs.length) {
    document.getElementById("list").innerHTML = '<div class="empty-state">No Mobile Doc screens configured.</div>';
    return;
  }
  const initial = state.mobileDocs.find((d) => d.is_default) || state.mobileDocs[0];
  await loadScreen(initial.name);
}

init();

(function () {
  "use strict";

  const F = window.FORMS;
  const PASS = 0.85;
  const LS_SETTINGS = "qa_settings";
  const LS_EVALS = "qa_evals";
  const LS_DRAFT = "qa_draft";
  const LS_DELETED = "qa_deleted";

  // ---------- small helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  const pct = (x) => (x === null || x === undefined || x === "" || isNaN(x) ? "–" : Math.round(x * 1000) / 10 + "%");
  // Local date (not UTC), so an evaluation done just after midnight in the UAE gets the right day.
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function download(name, text, type) {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const csvCell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // ---------- language ----------
  const I = window.I18N;
  let lang = store("qa_lang") === "ar" ? "ar" : "en";
  function t(k, v) {
    let out = (I[lang] && I[lang][k] !== undefined) ? I[lang][k] : (I.en[k] !== undefined ? I.en[k] : k);
    for (const [a, b] of Object.entries(v || {})) out = out.split("{" + a + "}").join(b);
    return out;
  }
  const L = (it, f) => (lang === "ar" && it && it.ar && it.ar[f]) || (it && it[f]) || "";
  const formName = (k) => (lang === "ar" && F.forms[k] && F.forms[k].ar ? F.forms[k].ar.name : (F.forms[k] ? F.forms[k].name : k));
  const typeLabel = (form, v) => (lang === "ar" && F.forms[form] && F.forms[form].ar && F.forms[form].ar.types[v]) || v;
  const outLabel = (form, v) => (lang === "ar" && F.forms[form] && F.forms[form].ar && F.forms[form].ar.outcomes[v]) || v;
  const secLabel = (x) => (lang === "ar" && F.sectionsAr && F.sectionsAr[x]) || x;
  function applyStatic() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  }

  const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

  // ---------- scoring ----------
  function score(form, answers) {
    const def = F.forms[form];
    let met = 0, applicable = 0, open = 0;
    def.nc.forEach((it, i) => {
      const a = answers.nc[i] && answers.nc[i].result;
      if (a === "Met") { met += it.weight; applicable += it.weight; }
      else if (a === "Not met") applicable += it.weight;
      else if (!a) open++;
    });
    const errs = { CC: 0, EU: 0, BC: 0 };
    def.crit.forEach((it, i) => {
      const a = answers.crit[i] && answers.crit[i].result;
      if (a === "Error") errs[it.bucket]++;
      else if (!a) open++;
    });
    const critical = errs.CC + errs.EU + errs.BC;
    const nc = applicable ? met / applicable : null;
    const final = nc === null ? null : critical ? 0 : nc;
    return {
      nc, cc: errs.CC ? 0 : 1, eu: errs.EU ? 0 : 1, bc: errs.BC ? 0 : 1, critical, final, open,
      result: final === null ? "" : final >= PASS ? "Pass" : "Fail",
    };
  }

  // ---------- settings ----------
  const CFG = window.QA_CONFIG || {};
  const settings = Object.assign({ url: "", key: "", evaluator: "", mail: "auto" }, store(LS_SETTINGS) || {});
  if (CFG.sheetUrl && (!settings.url || (CFG.oldSheetUrls || []).includes(settings.url))) {
    settings.url = CFG.sheetUrl;
    if (settings.key) store(LS_SETTINGS, settings);
  }
  const connected = () => !!(settings.url && settings.key);

  async function apiGet(params) {
    const u = new URL(settings.url); u.searchParams.set("key", settings.key);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    const j = await (await fetch(u)).json();
    if (!j.ok) throw new Error(j.error || "Rejected");
    return j;
  }
  async function apiPost(obj) {
    const body = JSON.stringify(Object.assign({ key: settings.key }, obj));
    apiPost.last = null;
    try {
      const r = await fetch(settings.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Rejected");
      apiPost.last = j;
      return "saved";
    } catch (e) {
      if (String(e.message).match(/key|Rejected|Bad/i)) throw e;
      // Some browsers block reading the reply; send again without reading it.
      await fetch(settings.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      return "sent";
    }
  }

  // ---------- names (one shared list so reports group correctly) ----------
  const LS_ROSTER = "qa_roster";
  let roster = Object.assign({ agents: [], evaluators: [], emails: {} }, store(LS_ROSTER) || {});
  const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function similarName(list, name) {
    const k = nameKey(name);
    return list.find((x) => {
      const y = nameKey(x);
      return y === k || (Math.min(y.length, k.length) >= 4 && (y.startsWith(k) || k.startsWith(y))) || lev(y, k) <= 2;
    });
  }
  async function loadRoster() {
    if (!connected()) return;
    try {
      const j = await apiGet({ action: "roster" });
      if (!Array.isArray(j.agents)) return;
      const server = { agents: j.agents, evaluators: j.evaluators || [], emails: j.emails || {}, evalEmails: j.evalEmails || {} };
      // Names added on this device while it was not connected go up to the shared list.
      for (const role of ["agents", "evaluators"]) {
        for (const name of roster[role] || []) {
          if (server[role].some((x) => nameKey(x) === nameKey(name))) continue;
          try { await apiPost({ action: "addPerson", role, name }); server[role].push(name); } catch (e) { /* try again next time */ }
        }
        server[role].sort((a, b) => a.localeCompare(b));
      }
      roster = server;
      store(LS_ROSTER, roster);
    } catch (e) { /* keep the cached list */ }
  }
  async function addPerson(role, raw) {
    const name = normName(raw);
    if (!name) return null;
    const list = roster[role];
    const near = similarName(list, name);
    if (near && (nameKey(near) === nameKey(name) || confirm(t("similar_confirm", { a: near, b: name })))) return near;
    list.push(name); list.sort((a, b) => a.localeCompare(b)); store(LS_ROSTER, roster);
    if (connected()) {
      try { await apiPost({ action: "addPerson", role, name }); }
      catch (e) { alert(t("added_local", { e: e.message })); }
    }
    return name;
  }

  // ---------- evaluate view ----------
  let current = { form: "calls", answers: null };
  const HEADER = [
    ["agent", "h_agent", "person", true],
    ["evaluator", "h_evaluator", "person", true],
    ["evalDate", "h_evalDate", "date", true],
    ["interactionDate", "h_interactionDate", "datetime-local", true],
    ["odooRef", "h_odooRef", "text"],
    ["phone", "h_phone", "tel"],
    ["type", "h_type", "select", true],
    ["duration", "", "duration"],
    ["outcome", "h_outcome", "select"],
    ["kbVersion", "h_kbVersion", "text"],
    ["purpose", "h_purpose", "purpose"],
  ];

  function blankAnswers(form) {
    const d = F.forms[form];
    return {
      header: { evaluator: settings.evaluator, evalDate: today(), kbVersion: "" },
      nc: d.nc.map(() => ({ result: "", evidence: "", comment: "" })),
      crit: d.crit.map(() => ({ result: "", evidence: "", comment: "" })),
      feedback: { strengths: "", improve: "", coaching: "" },
      feedbackEdited: {},
    };
  }

  function codeFor(form, type) { return type ? F.forms[form].types[type] : null; }
  function applies(item, code) { return !code || item.applies.includes("ALL") || item.applies.includes(code); }

  function renderFormSwitch() {
    const box = $("#formSwitch"); box.innerHTML = "";
    for (const [k, d] of Object.entries(F.forms)) {
      box.append(h("button", {
        class: current.form === k ? "active" : "", text: (formName(k) + " " + t("form_suffix")).trim(),
        onclick: () => {
          if (current.form === k) return;
          if (dirty() && !confirm(t("switch_confirm"))) return;
          current = { form: k, answers: blankAnswers(k) }; renderEvaluate();
        },
      }));
    }
  }

  function dirty() {
    const a = current.answers;
    return a && (a.nc.some((x) => x.result) || a.crit.some((x) => x.result) || a.header.agent);
  }

  function renderHeader() {
    const d = F.forms[current.form], a = current.answers, box = $("#headerFields");
    box.innerHTML = "";
    for (const [key, label, kind, req] of HEADER) {
      let input;
      if (kind === "duration") { box.append(durationField(d, a)); continue; }
      if (kind === "purpose") { box.append(...purposeFields(a)); continue; }
      if (kind === "check") {
        const cb = h("input", { type: "checkbox", id: "hd_" + key });
        cb.checked = !!a.header[key];
        cb.addEventListener("change", () => { a.header[key] = cb.checked; saveDraft(); });
        box.append(h("label", { class: "check hd-check" }, cb, t(label)));
        continue;
      }
      const lab = t(label);
      if (kind === "select") {
        const opts = key === "type" ? Object.keys(d.types) : d.outcomes;
        const show = (o) => (key === "type" ? typeLabel(current.form, o) : outLabel(current.form, o));
        input = h("select", {}, h("option", { value: "", text: t("select") }), opts.map((o) => h("option", { value: o, text: show(o) })));
      } else if (kind === "person") {
        const role = key === "agent" ? "agents" : "evaluators";
        const opts = roster[role].slice();
        if (a.header[key] && !opts.includes(a.header[key])) opts.push(a.header[key]);
        input = h("select", {}, h("option", { value: "", text: t("select") }), opts.map((o) => h("option", { value: o, text: o })),
          h("option", { value: "__new", text: t("add_name") }));
      } else input = h("input", { type: kind });
      // Evaluation date is always the day it is saved (kept as is when correcting an old one).
      if (key === "evalDate") { if (!current.edit) a.header.evalDate = today(); input.readOnly = true; input.tabIndex = -1; input.className = "auto"; }
      // Offers / KB version follows the call date: the offers in force that month are the ones that count.
      if (key === "kbVersion") { a.header.kbVersion = kbFor(a.header.interactionDate) || a.header.kbVersion || ""; input.readOnly = true; input.tabIndex = -1; input.className = "auto"; input.placeholder = t("kb_auto_ph"); }
      if (kind === "tel") { input.dir = "ltr"; input.placeholder = "+9715XXXXXXXX"; input.inputMode = "tel"; }
      input.value = a.header[key] || "";
      input.id = "hd_" + key;
      input.addEventListener("input", async () => {
        if (input.value === "__new") {
          const role = key === "agent" ? "agents" : "evaluators";
          const name = await addPerson(role, prompt(key === "agent" ? t("new_agent_prompt") : t("new_eval_prompt")) || "");
          a.header[key] = name || a.header[key] || "";
          if (key === "evaluator" && name) { settings.evaluator = name; store(LS_SETTINGS, settings); }
          saveDraft(); renderHeader(); return;
        }
        if (key === "evaluator" && input.value) { settings.evaluator = input.value; store(LS_SETTINGS, settings); }
        a.header[key] = input.value;
        if (key === "type") { applyType(); renderItems(); }
        if (key === "interactionDate") { a.header.kbVersion = kbFor(input.value); const kb = $("#hd_kbVersion"); if (kb) kb.value = a.header.kbVersion; }
        saveDraft(); updateScore();
      });
      box.append(h("label", {}, lab + (req ? " *" : ""), input));
    }
  }

  // Purpose of the evaluation: a real one, a calibration sample or a certification role-play,
  // plus a "test" switch. Tests are kept apart from the dashboard and certification.
  const purposeOf = (hd) => hd.purpose || (hd.rolePlay ? "roleplay" : hd.sampleRef ? "calibration" : "live");
  const ymd = (d) => d.replace(/-/g, "");
  function sampleRefs() {
    const map = new Map();
    for (const r of allRecords()) {
      if (!r.sampleRef) continue;
      const g = map.get(r.sampleRef) || { ref: r.sampleRef, form: r.form, agent: r.agent, list: [] };
      g.list.push(r); map.set(r.sampleRef, g);
    }
    return map;
  }
  const CAL_RECENT_DAYS = 14;
  // The day a sample started: from its code (CAL-20261011-2), else its first save.
  function sampleStart(g) {
    const m = /(\d{4})(\d{2})(\d{2})-\d+$/.exec(g.ref);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    return g.list.map((r) => (r.savedAt || "").slice(0, 10)).filter(Boolean).sort()[0] || "";
  }
  function addDays(ymdStr, n) {
    const d = new Date(ymdStr + "T12:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  async function refreshRecordsQuietly() {
    if (!connected()) return;
    try { const j = await apiGet({}); forgetDeleted(j.deleted); addRecords(j.records); sheetLoaded = true; } catch (e) { /* use what we have */ }
  }
  // Next free code for today, e.g. CAL-20261011-2 (TEST-CAL-… for a test).
  function newSampleRef(test) {
    const prefix = (test ? "TEST-CAL-" : "CAL-") + ymd(today()) + "-";
    let n = 1;
    for (const ref of sampleRefs().keys()) if (ref.startsWith(prefix)) n = Math.max(n, (+ref.slice(prefix.length) || 0) + 1);
    return prefix + n;
  }
  function purposeFields(a) {
    const hd = a.header;
    hd.purpose = purposeOf(hd);
    const set = (p) => {
      hd.purpose = p; hd.rolePlay = p === "roleplay";
      if (p !== "calibration") hd.sampleRef = "";
      saveDraft(); renderHeader();
    };
    const sel = h("select", { id: "hd_purpose" }, ["live", "certcall", "program", "coaching", "calibration", "roleplay"].map((p) => h("option", { value: p, text: t("p_" + p) })));
    sel.value = hd.purpose;
    sel.addEventListener("input", async () => {
      if (sel.value === "calibration") await refreshRecordsQuietly();
      set(sel.value);
    });
    const cb = h("input", { type: "checkbox", id: "hd_test" });
    cb.checked = !!hd.test;
    cb.addEventListener("change", () => { hd.test = cb.checked; hd.sampleRef = ""; saveDraft(); renderHeader(); });
    const out = [h("label", {}, t("h_purpose"), sel), h("label", { class: "check hd-check" }, cb, t("h_test"))];
    if (hd.purpose === "calibration") {
      const groups = [...sampleRefs().values()].filter((g) => g.form === current.form && /^TEST-/.test(g.ref) === !!hd.test)
        .sort((x, y) => sampleStart(y).localeCompare(sampleStart(x)) || y.ref.localeCompare(x.ref));
      // Newest first, split so the current session is easy to find: samples you still have to score,
      // ones you already scored, and older ones (more than CAL_RECENT_DAYS old).
      const me = hd.evaluator || settings.evaluator || "";
      const cutoff = addDays(today(), -CAL_RECENT_DAYS);
      const optFor = (g) => h("option", { value: g.ref, text: [g.ref, g.agent || "–", whenText(g.list[0]), g.list[0].phone ? "\u2066" + g.list[0].phone + "\u2069" : g.list[0].odooRef || "",
        t("n_evaluators", { n: new Set(g.list.map((r) => r.evaluator)).size })].filter(Boolean).join(" · ") });
      const recent = groups.filter((g) => sampleStart(g) >= cutoff), older = groups.filter((g) => sampleStart(g) < cutoff);
      const mine = (g) => me && g.list.some((r) => r.evaluator === me);
      const bucket = (label, list) => list.length ? [h("optgroup", { label: label + " (" + list.length + ")" }, list.map(optFor))] : [];
      const rs = h("select", { id: "hd_sampleRef" }, h("option", { value: "", text: t("select") }),
        h("option", { value: "__new", text: t("new_sample") }),
        ...bucket(t("cal_todo"), recent.filter((g) => !mine(g))),
        ...bucket(t("cal_mine"), recent.filter(mine)),
        ...bucket(t("cal_older", { n: CAL_RECENT_DAYS }), older));
      if (hd.sampleRef && !groups.some((g) => g.ref === hd.sampleRef)) rs.append(h("option", { value: hd.sampleRef, text: hd.sampleRef }));
      rs.value = hd.sampleRef || "";
      rs.addEventListener("input", async () => {
        if (rs.value === "__new") { await refreshRecordsQuietly(); hd.sampleRef = newSampleRef(hd.test); }
        else {
          hd.sampleRef = rs.value;
          // Same sample = same interaction: copy its details so every evaluator scores the same thing.
          const g = sampleRefs().get(rs.value), first = g && g.list[0];
          if (first) for (const k of ["agent", "interactionDate", "odooRef", "phone", "type", "duration", "outcome", "kbVersion"]) if (!hd[k] && first[k]) hd[k] = first[k];
          applyType(); renderItems(); updateScore();
        }
        saveDraft(); renderHeader();
      });
      out.push(h("label", {}, t("h_sampleRef") + " *", rs));
    }
    return out;
  }

  // Duration is picked, not typed: minutes + seconds for calls, ranges for WhatsApp.
  function durationField(d, a) {
    const cfg = d.duration || { kind: "mmss", label: "Duration" };
    const label = lang === "ar" ? cfg.labelAr || cfg.label : cfg.label;
    const set = (v) => { a.header.duration = v; saveDraft(); };
    if (cfg.kind === "options") {
      const sel = h("select", { id: "hd_duration" }, h("option", { value: "", text: t("select") }),
        cfg.options.map((o, i) => h("option", { value: o, text: lang === "ar" ? cfg.optionsAr[i] : o })));
      sel.value = a.header.duration || "";
      sel.addEventListener("input", () => set(sel.value));
      return h("label", {}, label, sel);
    }
    const [m0, s0] = String(a.header.duration || "").split(":");
    const pad = (n) => String(n).padStart(2, "0");
    const mins = h("select", { id: "hd_duration_m", "aria-label": t("min") }, h("option", { value: "", text: t("min") }),
      Array.from({ length: 61 }, (_, i) => h("option", { value: pad(i), text: i + " " + t("min") })));
    const secs = h("select", { id: "hd_duration_s", "aria-label": t("sec") }, h("option", { value: "", text: t("sec") }),
      Array.from({ length: 12 }, (_, i) => h("option", { value: pad(i * 5), text: pad(i * 5) + " " + t("sec") })));
    mins.value = m0 || ""; secs.value = s0 || "";
    const upd = () => set(mins.value || secs.value ? (mins.value || "00") + ":" + (secs.value || "00") : "");
    mins.addEventListener("input", upd); secs.addEventListener("input", upd);
    return h("label", {}, label, h("div", { class: "pair" }, mins, secs));
  }

  function applyType() {
    const d = F.forms[current.form], a = current.answers, code = codeFor(current.form, a.header.type);
    [["nc", d.nc], ["crit", d.crit]].forEach(([k, list]) => list.forEach((it, i) => {
      const ans = a[k][i];
      if (!applies(it, code)) { ans.result = "N/A"; ans.locked = true; }
      else if (ans.locked) { ans.result = ""; ans.locked = false; }
    }));
  }

  function itemRow(kind, it, i, ans) {
    const isNc = kind === "nc";
    const opts = isNc ? [["Met", "good"], ["Not met", "bad"], ["N/A", "na"]] : [["No error", "good"], ["Error", "bad"], ["N/A", "na"]];
    const seg = h("div", { class: "seg" }, opts.map(([v, cls]) => h("button", {
      class: (ans.result === v ? "on " : "") + cls, text: t(v), type: "button",
      onclick: () => {
        if (ans.locked) return;
        ans.result = ans.result === v ? "" : v;
        row.replaceWith(itemRow(kind, it, i, ans)); saveDraft(); updateScore();
      },
    })));
    const meta = h("div", { class: "meta" },
      h("span", { class: "tag", text: it.section ? secLabel(it.section) : it.bucket }),
      it.applies.map((x) => h("span", { class: "tag", text: x })),
      isNc ? h("span", {}, t("weight") + " ", h("b", { text: it.weight }), " · " + t("not_met_if") + ": " + L(it, "guide")) : h("span", { text: t("example") + ": " + L(it, "example") }));
    const explainOpen = showExplain || openExplain.has(kind + i);
    const explain = L(it, "explain") ? h("div", { class: "explain" + (explainOpen ? " open" : "") }, L(it, "explain"),
      L(it, "vs") ? h("div", { class: "vs" }, h("b", { text: t("vs_label") + ": " }), L(it, "vs")) : null) : null;
    const infoBtn = explain ? h("button", { class: "info", type: "button", title: t("explain_btn"), "aria-label": t("explain_btn"), text: "?",
      onclick: () => { const k = kind + i; openExplain.has(k) ? openExplain.delete(k) : openExplain.add(k); explain.classList.toggle("open"); } }) : null;
    const ev = h("input", { placeholder: t("timestamp"), value: ans.evidence || "" });
    ev.addEventListener("input", () => { ans.evidence = ev.value; autoFeedback(); saveDraft(); });
    const cm = h("input", { placeholder: t("comment"), value: ans.comment || "" });
    cm.addEventListener("input", () => { ans.comment = cm.value; autoFeedback(); saveDraft(); });
    const showExtra = ans.result === "Not met" || ans.result === "Error" || ans.evidence || ans.comment;
    const row = h("div", { class: "item" + (ans.locked ? " locked" : ""), "data-kind": kind, "data-i": i },
      h("div", { class: "num", text: (isNc ? "N" : "C") + (i + 1) }),
      h("div", {}, h("div", { class: "title" }, L(it, "item"), infoBtn), explain, meta, ans.locked ? h("div", { class: "meta", text: t("not_applicable") }) : null),
      seg,
      showExtra ? h("div", { class: "extra" }, ev, cm) : null);
    return row;
  }

  let showExplain = !!store("qa_explain");
  const openExplain = new Set();

  function renderItems() {
    const d = F.forms[current.form], a = current.answers;
    const nc = $("#ncList"), cr = $("#critList");
    nc.innerHTML = ""; cr.innerHTML = "";
    d.nc.forEach((it, i) => nc.append(itemRow("nc", it, i, a.nc[i])));
    d.crit.forEach((it, i) => cr.append(itemRow("crit", it, i, a.crit[i])));
  }

  // Builds feedback text from the answers: strengths from the heaviest items met,
  // areas to improve and coaching tips from every miss (critical errors first).
  function genFeedback(form, a) {
    const d = F.forms[form];
    const answered = a.nc.some((x) => x.result && !x.locked) || a.crit.some((x) => x.result && !x.locked);
    if (!answered) return { strengths: "", improve: "", coaching: "" };
    const note = (x) => (x.evidence ? " (" + x.evidence + ")" : "") + (x.comment ? " – " + x.comment : "");
    const met = d.nc.map((it, i) => ({ it, x: a.nc[i] })).filter((o) => o.x.result === "Met").sort((p, q) => q.it.weight - p.it.weight);
    const misses = [
      ...d.crit.map((it, i) => ({ it, x: a.crit[i], crit: true })).filter((o) => o.x.result === "Error"),
      ...d.nc.map((it, i) => ({ it, x: a.nc[i] })).filter((o) => o.x.result === "Not met").sort((p, q) => q.it.weight - p.it.weight),
    ];
    const strengths = met.slice(0, 4).map((o) => "- " + L(o.it, "label")).join("\n");
    const improve = misses.length
      ? misses.map((o) => "- " + (o.crit ? "[" + t("critical_tag") + " " + o.it.bucket + "] " + L(o.it, "item") : L(o.it, "label") + ": " + L(o.it, "item")) + note(o.x)).join("\n")
      : t("no_improve");
    const coaching = misses.length
      ? misses.map((o, n) => n + 1 + ". " + L(o.it, "coach")).join("\n")
      : t("keep_going");
    return { strengths, improve, coaching };
  }

  function autoFeedback(force) {
    const a = current.answers;
    if (!a.feedbackEdited) a.feedbackEdited = {};
    const g = genFeedback(current.form, a);
    for (const k of ["strengths", "improve", "coaching"]) {
      if (force) a.feedbackEdited[k] = false;
      if (a.feedbackEdited[k]) continue;
      a.feedback[k] = g[k];
      const t = $("#fb_" + k); if (t) t.value = g[k];
    }
  }

  function renderFeedback() {
    for (const k of ["strengths", "improve", "coaching"]) {
      const t = $("#fb_" + k);
      t.value = current.answers.feedback[k] || "";
      t.oninput = () => {
        current.answers.feedback[k] = t.value;
        (current.answers.feedbackEdited = current.answers.feedbackEdited || {})[k] = true;
        saveDraft();
      };
    }
    $("#btnRegen").onclick = () => {
      if (Object.values(current.answers.feedbackEdited || {}).some(Boolean) && !confirm(t("regen_confirm"))) return;
      autoFeedback(true); saveDraft();
    };
    $("#btnCopyFb").onclick = async () => {
      const a = current.answers, sc = score(current.form, a), fb = a.feedback;
      const text = [
        t("copy_title") + " – " + formName(current.form) + (a.header.type ? " (" + typeLabel(current.form, a.header.type) + ")" : ""),
        t("copy_agent") + ": " + (a.header.agent || "") + " | " + t("copy_date") + ": " + (a.header.interactionDate || a.header.evalDate || "").replace("T", " ") + (a.header.odooRef ? " | Odoo: " + a.header.odooRef : ""),
        t("copy_score") + ": " + pct(sc.final) + " – " + (sc.result ? t(sc.result) : "") + (sc.critical ? " (" + sc.critical + " " + t("crit_errors") + ")" : ""),
        "", t("fb_strengths") + ":", fb.strengths || "-", "", t("fb_improve") + ":", fb.improve || "-", "", t("fb_coaching") + ":", fb.coaching || "-",
      ].join("\n");
      const m = $("#fbMsg");
      try { await navigator.clipboard.writeText(text); m.textContent = t("copied"); }
      catch (e) { download("QA_feedback_" + (a.header.agent || "agent") + ".txt", text, "text/plain"); m.textContent = t("copy_downloaded"); }
    };
  }

  function updateScore() {
    const s = score(current.form, current.answers);
    // Show a bucket / final number only once it is decided: an Error decides it at once (0%),
    // otherwise every item in it must be answered first, so a blank form never shows 100%.
    const crit = F.forms[current.form].crit;
    const openIn = (b) => crit.some((it, i) => it.bucket === b && !current.answers.crit[i].result);
    const bucket = (b, v) => (v === 0 ? pct(0) : openIn(b) ? "–" : pct(v));
    const decided = s.critical > 0 || s.open === 0;
    $("#sFinal").textContent = s.critical ? pct(0) : decided ? pct(s.final) : "–";
    const res = s.critical ? "Fail" : decided ? s.result : "";
    const r = $("#sResult"); r.textContent = res ? t(res) : t("pending"); r.className = "result " + (res === "Pass" ? "pass" : res === "Fail" ? "fail" : "muted");
    $("#sNC").textContent = pct(s.nc);
    $("#sCC").textContent = bucket("CC", s.cc); $("#sEU").textContent = bucket("EU", s.eu); $("#sBC").textContent = bucket("BC", s.bc);
    $("#sCrit").textContent = s.critical; $("#sOpen").textContent = s.open;
    autoFeedback();
  }

  function renderEvaluate() {
    if (!current.answers) current.answers = blankAnswers(current.form);
    renderFormSwitch(); renderHeader(); applyType(); renderItems(); renderFeedback(); updateScore(); renderEditBanner();
    $("#saveMsg").textContent = "";
  }

  function saveDraft() { store(LS_DRAFT, current); }

  // ---------- KB / offers updates log ----------
  // Every change to the KB or offers is logged with the exact time it takes effect. An evaluation
  // records which update was in force at the call time, so the agent is judged on what was valid then.
  const LS_KB = "qa_kb_log";
  let kbLog = store(LS_KB) || [];
  const isWhen = (w) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(w || "");
  const fmtWhen = (w) => String(w || "").slice(0, 16).replace("T", " ");
  const nowLocal = () => { const d = new Date(); return today() + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function kbInForce(when) {
    if (!isWhen(when)) return null;
    const w = when.slice(0, 16);
    return kbLog.filter((u) => isWhen(u.effective) && u.effective.slice(0, 16) <= w).sort((a, b) => b.effective.localeCompare(a.effective) || String(b.recordedAt).localeCompare(String(a.recordedAt)))[0] || null;
  }
  const kbLabel = (u) => "#" + u.no + " · " + fmtWhen(u.effective) + " · " + String(u.text || "").slice(0, 60);
  // Text stored with the evaluation: the update in force, or the call time when nothing is logged yet.
  const kbFor = (when) => { if (!isWhen(when)) return ""; const u = kbInForce(when); return u ? kbLabel(u) : t("kb_none_at", { w: fmtWhen(when) }); };
  async function loadKb() {
    if (!connected()) return;
    try { const j = await apiGet({ action: "kb" }); if (Array.isArray(j.updates)) { kbLog = j.updates; store(LS_KB, kbLog); } } catch (e) { /* keep cached log */ }
  }
  function renderKb() {
    const out = $("#kbOut"); if (!out) return;
    if (!$("#kbWhen").value) $("#kbWhen").value = nowLocal();
    const by = $("#kbBy"), prevBy = by.value || settings.evaluator || "";
    by.innerHTML = ""; by.append(h("option", { value: "", text: t("select") }), ...roster.evaluators.map((n) => h("option", { value: n, text: n })));
    by.value = roster.evaluators.includes(prevBy) ? prevBy : "";
    out.innerHTML = "";
    if (!kbLog.length) { out.append(h("div", { class: "empty", text: t("kb_empty") })); return; }
    const tbl = h("table", {}, h("tr", {}, ["#", "kb_effective", "kb_cat", "kb_text", "kb_by", "kb_recorded"].map((k) => h("th", { text: k === "#" ? k : t(k) }))));
    kbLog.slice().sort((a, b) => b.effective.localeCompare(a.effective)).forEach((u) => tbl.append(h("tr", {},
      h("td", { text: "#" + u.no }), h("td", { dir: "ltr", text: fmtWhen(u.effective) }), h("td", { text: t("kbc_" + u.category) || u.category }),
      h("td", { class: "wrap", text: u.text }), h("td", { text: u.by || "–" }), h("td", { dir: "ltr", class: "meta", text: fmtWhen(u.recordedAt) }))));
    out.append(tbl);
  }
  async function addKbUpdate() {
    const m = $("#kbMsg"); m.className = "msg";
    const u = { effective: $("#kbWhen").value, category: $("#kbCat").value, text: $("#kbText").value.trim(), by: $("#kbBy").value };
    if (!isWhen(u.effective) || !u.text || !u.by) { m.className = "msg err"; m.textContent = t("kb_missing"); return; }
    if (!connected()) { m.className = "msg err"; m.textContent = t("kb_need_conn"); return; }
    m.textContent = t("saving");
    try {
      await apiPost({ action: "addKb", update: u });
      await loadKb();
      $("#kbText").value = ""; $("#kbWhen").value = nowLocal();
      m.className = "msg ok"; m.textContent = t("kb_saved");
      renderKb(); renderHeader();
    } catch (e) { m.className = "msg err"; m.textContent = t("save_failed_plain", { e: e.message }); }
  }
  const normPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

  function buildRecord() {
    const a = current.answers, d = F.forms[current.form], s = score(current.form, a);
    return {
      id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)),
      savedAt: new Date().toISOString(),
      formsVersion: F.version, form: current.form,
      ...a.header,
      evalDate: current.edit ? a.header.evalDate || today() : today(),
      kbVersion: kbFor(a.header.interactionDate) || a.header.kbVersion || "",
      kbUpdate: (kbInForce(a.header.interactionDate) || {}).no || "",
      mailMode: settings.mail || "auto",
      purpose: purposeOf(a.header), rolePlay: purposeOf(a.header) === "roleplay", test: !!a.header.test,
      sampleRef: purposeOf(a.header) === "calibration" ? a.header.sampleRef || "" : "",
      phone: normPhone(a.header.phone),
      ncScore: s.nc, cc: s.cc, eu: s.eu, bc: s.bc, critical: s.critical, final: s.final, result: s.result,
      items: [
        ...d.nc.map((it, i) => ({ id: String(i + 1), kind: "NC", text: it.item, weight: it.weight, result: a.nc[i].result, evidence: a.nc[i].evidence, comment: a.nc[i].comment })),
        ...d.crit.map((it, i) => ({ id: "C" + (i + 1), kind: it.bucket, text: it.item, result: a.crit[i].result, evidence: a.crit[i].evidence, comment: a.crit[i].comment })),
      ],
      feedback: { strengths: a.feedback.strengths, improve: a.feedback.improve, coaching: a.feedback.coaching },
    };
  }

  function validate() {
    const a = current.answers, problems = [];
    for (const [key, label, , req] of HEADER) if (req && !a.header[key]) problems.push(t(label));
    if (purposeOf(a.header) === "calibration" && !a.header.sampleRef) problems.push(t("h_sampleRef"));
    if (!a.header.odooRef && !a.header.phone) problems.push(t("ref_needed"));
    $$(".item").forEach((el) => {
      const ans = a[el.dataset.kind][+el.dataset.i];
      el.classList.toggle("missing", !ans.result);
      if (!ans.result) problems.push(t("item_n", { n: $(".num", el).textContent }));
      else if ((ans.result === "Not met" || ans.result === "Error") && !ans.evidence) problems.push(t("evidence_n", { n: $(".num", el).textContent }));
    });
    return problems;
  }

  function recordCsv(rec) {
    const rows = [["Field", "Value"]];
    for (const [k, label] of HEADER) rows.push([label ? I.en[label] : "Duration", rec[k] || ""]);
    rows.push(["Form", F.forms[rec.form].name], ["NC score", pct(rec.ncScore)], ["CC accuracy", pct(rec.cc)], ["EU accuracy", pct(rec.eu)], ["BC accuracy", pct(rec.bc)], ["Critical errors", rec.critical], ["Final score", pct(rec.final)], ["Result", rec.result], []);
    rows.push(["#", "Bucket", "Item", "Weight", "Result", "Evidence", "Comment"]);
    rec.items.forEach((it) => rows.push([it.id, it.kind, it.text, it.weight || "", it.result, it.evidence, it.comment]));
    rows.push([], ["Strengths", rec.feedback.strengths], ["Areas to improve", rec.feedback.improve], ["Coaching", rec.feedback.coaching]);
    return toCsv(rows);
  }

  const postRecord = (rec) => apiPost({ record: rec });
  const LS_SYNCED = "qa_synced";
  const markSynced = (id) => { const s = store(LS_SYNCED) || []; if (!s.includes(id)) { s.push(id); store(LS_SYNCED, s); } };

  // Evaluations saved on this device while it was not connected (or when saving failed) are sent
  // to the sheet once it is connected. The sheet ignores an id it already has, so resending is safe.
  async function syncLocal() {
    if (!connected()) return 0;
    const done = new Set(store(LS_SYNCED) || []);
    let n = 0;
    for (const rec of store(LS_EVALS) || []) {
      if (!rec || !rec.id || done.has(rec.id)) continue;
      try { await postRecord(rec); markSynced(rec.id); n++; } catch (e) { break; }
    }
    return n;
  }

  function renderConnBanner() {
    const b = $("#connBanner"); if (!b) return;
    b.hidden = connected();
    b.textContent = t("conn_banner");
  }

  async function onSave() {
    const msg = $("#saveMsg"); msg.className = "msg";
    const problems = validate();
    if (problems.length) { msg.className = "msg err"; msg.textContent = t("missing", { x: problems.slice(0, 8).join((lang === "ar" ? "، " : ", ")) + (problems.length > 8 ? " …" : "") }); return; }
    const rec = buildRecord();
    const edit = current.edit;
    if (edit) Object.assign(rec, { id: edit.id, savedAt: edit.savedAt, editedAt: new Date().toISOString(), editedBy: settings.evaluator || rec.evaluator });
    else {
      const dup = findDuplicate(rec);
      if (dup && !confirm(t("dup_confirm", { e: dup.evaluator || "–", d: (dup.evalDate || "") }))) return;
    }
    const local = (store(LS_EVALS) || []).filter((r) => r.id !== rec.id); local.push(rec); store(LS_EVALS, local);
    loaded.set(rec.id, rec);
    if (connected()) {
      msg.textContent = t("saving");
      try {
        const how = edit ? await apiPost({ action: "updateRecord", record: rec }) : await postRecord(rec);
        markSynced(rec.id);
        msg.className = "msg ok"; msg.textContent = edit ? t("updated_sheet") : how === "saved" ? t("saved_sheet") : t("sent_sheet");
        const rep = apiPost.last || {};
        if (!edit && rep.emailed) msg.textContent += " " + t("emailed_agent", { n: rec.agent });
        else if (!edit && rep.emailNote) msg.textContent += " " + t("email_failed", { e: rep.emailNote });
        else if (!edit && how === "saved" && settings.mail === "auto" && mailable(rec) && rep.emailNote === "" && !(roster.emails || {})[rec.agent]) msg.textContent += " " + t("no_email_hint", { n: rec.agent });
      } catch (e) {
        msg.className = "msg err"; msg.textContent = t("save_failed", { e: e.message });
        download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      }
    } else {
      download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      msg.className = "msg ok"; msg.textContent = t("saved_local");
    }
    current = { form: current.form, answers: blankAnswers(current.form) };
    store(LS_DRAFT, null);
    const keep = msg.textContent, cls = msg.className;
    renderEvaluate(); msg.textContent = keep; msg.className = cls;
    if (!edit && settings.mail !== "auto" && mailable(rec)) msg.append(" ", outlookButton(rec));
  }

  // Same interaction already evaluated for real (same agent, time and customer)?
  function findDuplicate(rec) {
    if (rec.sampleRef || rec.test) return null;
    return allRecords().find((r) => r.id !== rec.id && !r.sampleRef && !r.test && purposeOf(r) === purposeOf(rec) && r.form === rec.form && r.agent === rec.agent &&
      r.interactionDate === rec.interactionDate && ((rec.phone && normPhone(r.phone) === rec.phone) || (rec.odooRef && r.odooRef === rec.odooRef)));
  }

  const fileName = (rec, ext) => ["QA", F.forms[rec.form].name, (rec.agent || "agent").replace(/[^\w؀-ۿ-]+/g, "_"), rec.evalDate, rec.id.slice(0, 6)].join("_") + "." + ext;

  // ---------- data for calibration & dashboard ----------
  let loaded = new Map();
  const stamp = (r) => r.editedAt || r.savedAt || "";
  let deleted = new Set(store(LS_DELETED) || []);
  function addRecords(list) {
    for (const r of list || []) {
      if (!r || !r.id || !r.form || !F.forms[r.form] || !Array.isArray(r.items) || deleted.has(r.id)) continue;
      const had = loaded.get(r.id);
      if (!had || stamp(r) >= stamp(had)) loaded.set(r.id, r);
    }
  }
  function forgetDeleted(ids) {
    for (const id of ids || []) { deleted.add(id); loaded.delete(id); }
    store(LS_DELETED, [...deleted]);
    store(LS_EVALS, (store(LS_EVALS) || []).filter((r) => !deleted.has(r.id)));
  }
  function allRecords() { addRecords(store(LS_EVALS) || []); return Array.from(loaded.values()); }

  function setupLoaders() {
    $$("[data-loader]").forEach((box) => {
      box.append($("#loaderTpl").content.cloneNode(true));
      const info = $(".loadInfo", box);
      $(".loadSheet", box).onclick = () => loadFromSheet();
      $(".loadFiles", box).onchange = async (ev) => {
        let n = 0;
        for (const f of ev.target.files) {
          try { const j = JSON.parse(await f.text()); const arr = Array.isArray(j) ? j : [j]; addRecords(arr); n += arr.length; } catch (e) { /* skip bad file */ }
        }
        info.textContent = t("imported_n", { n }); ev.target.value = ""; refreshViews();
      };
    });
  }

  let sheetLoaded = false;
  async function loadFromSheet() {
    const say = (t) => $$(".loadInfo").forEach((i) => (i.textContent = t));
    if (!connected()) { say(t("not_connected_load")); return; }
    say(t("loading"));
    try {
      const j = await apiGet({});
      forgetDeleted(j.deleted); addRecords(j.records); sheetLoaded = true;
      say(t("loaded_n", { n: j.records.length, t: new Date().toLocaleTimeString() }));
      refreshViews();
    } catch (e) { say(t("load_failed", { e: e.message })); }
  }

  // Keep what's on screen up to date: other evaluators' saves show up within a minute
  // (calibration differences, dashboard, evaluations list) without reloading the page.
  setInterval(() => {
    const view = ($("nav button.active") || {}).dataset;
    if (!connected() || document.visibilityState !== "visible" || !view || view.view === "evaluate" || view.view === "settings") return;
    loadFromSheet();
  }, 60000);
  function refreshViews() { renderCalibration(); renderDashboard(); renderCertification(); renderGuide(); renderRecords(); renderKb(); }

  // ---------- saved evaluations: find, open to correct, delete ----------
  // Phone numbers are wrapped in a left-to-right isolate so "+971…" never flips in Arabic.
  const refText = (r) => [r.phone ? "\u2066" + r.phone + "\u2069" : "", r.odooRef ? "Odoo " + r.odooRef : ""].filter(Boolean).join(" · ");
  // Result email sent from the evaluator's own work mailbox (Outlook): the tool opens a ready email,
  // the evaluator checks it and presses Send, so it goes out from their address and stays in their Sent items.
  const mailable = (r) => ["live", "certcall", "coaching"].includes(purposeOf(r)) && !r.test;
  function mailText(r) {
    const coaching = purposeOf(r) === "coaching";
    const form = r.form === "whatsapp" ? "واتساب" : "مكالمة";
    const when = whenText(r);
    const phone = String(r.phone || "").replace(/\D/g, "");
    const ref = [r.odooRef ? "Odoo: " + r.odooRef : "", phone ? "رقم العميل بينتهي بـ " + phone.slice(-4) : ""].filter(Boolean).join(" · ");
    const missed = (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error");
    const fb = r.feedback || {};
    const cert = purposeOf(r) === "certcall";
    const subject = (coaching ? "فيدباك – " : cert ? "تقييم السرتيفيكيشن – " : "تقييم الجودة – ") + form + " – " + when.slice(0, 10) + (coaching ? "" : " – " + pct(r.final));
    const lines = ["أهلاً " + (r.agent || "") + "،", "",
      (coaching ? "ده فيدباك (مش محسوب في تقييمك) على " : cert ? "ده تقييم السرتيفيكيشن لـ" : "ده تقييم الجودة لـ") + form + " بتاريخ " + when + (ref ? " (" + ref + ")" : "") + ".", "",
      "النتيجة النهائية: " + pct(r.final) + " – " + (r.result === "Pass" ? "ناجح" : "محتاج تحسين"),
      "درجة البنود العادية: " + pct(r.ncScore), "أخطاء حرجة: " + (r.critical || 0)];
    if (missed.length) lines.push("", "البنود اللي محتاجة تتظبط:", ...missed.map((i) => "- " + i.text + (i.comment ? " – " + i.comment : "")));
    if (fb.strengths) lines.push("", "نقاط القوة:", fb.strengths);
    if (fb.improve) lines.push("", "محتاج تحسين:", fb.improve);
    if (fb.coaching) lines.push("", "نصيحة للمرة الجاية:", fb.coaching);
    lines.push("", "لو عندك أي سؤال على التقييم كلّمني.", "", r.evaluator || "");
    return { subject, body: lines.join("\n") };
  }
  function openOutlook(r) {
    const to = (roster.emails || {})[r.agent] || "";
    const { subject, body } = mailText(r);
    const q = (o) => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    if (settings.mail === "outlookweb") window.open("https://outlook.office.com/mail/deeplink/compose?" + q({ to, subject, body }), "_blank");
    else location.href = "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") + "?" + q({ subject, body });
  }
  const outlookButton = (r, small) => h("button", { type: "button", class: small ? "ghost" : "", text: t(small ? "mail_btn_short" : "mail_btn"), onclick: () => openOutlook(r) });
  const whenText = (r) => (r.interactionDate || r.evalDate || "").replace("T", " ");
  const purposeTag = (r) => t("p_" + purposeOf(r)) + (r.test ? " · " + t("test_tag") : "");
  function renderRecords() {
    const out = $("#recOut"); if (!out) return;
    const all = allRecords();
    fillSelect($("#recEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#recAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    const f = { ev: $("#recEvaluator").value, ag: $("#recAgent").value, p: $("#recPurpose").value, q: $("#recSearch").value.trim().toLowerCase() };
    const qd = f.q.replace(/[^\d]/g, "");
    const recs = all.filter((r) => (!f.ev || r.evaluator === f.ev) && (!f.ag || r.agent === f.ag) &&
      (!f.p || (f.p === "test" ? r.test : !r.test && purposeOf(r) === f.p)) &&
      (!f.q || [r.odooRef, r.sampleRef, r.agent, r.evaluator].some((x) => String(x || "").toLowerCase().includes(f.q)) || (qd.length >= 4 && normPhone(r.phone).includes(qd))))
      .sort((a, b) => whenText(b).localeCompare(whenText(a)));
    out.innerHTML = "";
    if (!recs.length) { out.append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") })); return; }
    const tbl = h("table", {}, h("tr", {}, ["c_when", "c_agent", "evaluator", "f_form", "h_type", "c_purpose", "c_ref", "final", ""].map((k) => h("th", { text: k ? t(k) : "" }))));
    recs.slice(0, 300).forEach((r) => tbl.append(h("tr", {},
      h("td", { dir: "ltr", text: whenText(r) }), h("td", { text: r.agent || "–" }), h("td", { text: r.evaluator || "–" }),
      h("td", { text: formName(r.form) }), h("td", { text: typeLabel(r.form, r.type || "") || "–" }),
      h("td", {}, h("span", { class: "pill " + (r.test ? "na" : purposeOf(r) === "live" ? "good" : "info"), text: purposeTag(r) }), r.sampleRef ? h("div", { class: "meta", text: r.sampleRef }) : null),
      h("td", { dir: "ltr", text: refText(r) || "–" }),
      h("td", { class: "num" }, h("span", { class: "pill " + (r.result === "Pass" ? "good" : "bad"), text: pct(r.final) })),
      h("td", { class: "actions" }, h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }),
        mailable(r) ? outlookButton(r, true) : null,
        h("button", { type: "button", class: "ghost", text: t("del"), onclick: () => deleteRecord(r) })))));
    out.append(tbl);
    if (recs.length > 300) out.append(h("p", { class: "hint", text: t("rec_more", { n: recs.length }) }));
  }

  function openRecord(r) {
    const d = F.forms[r.form];
    const nc = r.items.filter((x) => x.kind === "NC"), cr = r.items.filter((x) => x.kind !== "NC");
    if (nc.length !== d.nc.length || cr.length !== d.crit.length) { alert(t("edit_mismatch")); return; }
    if (dirty() && !current.edit && !confirm(t("switch_confirm"))) return;
    const header = {};
    for (const [k] of HEADER) if (r[k] !== undefined) header[k] = r[k];
    Object.assign(header, { purpose: purposeOf(r), test: !!r.test, sampleRef: r.sampleRef || "", rolePlay: !!r.rolePlay, duration: r.duration || "" });
    const pick = (x) => ({ result: x.result || "", evidence: x.evidence || "", comment: x.comment || "" });
    current = { form: r.form, edit: { id: r.id, savedAt: r.savedAt },
      answers: { header, nc: nc.map(pick), crit: cr.map(pick), feedback: Object.assign({ strengths: "", improve: "", coaching: "" }, r.feedback), feedbackEdited: { strengths: true, improve: true, coaching: true } } };
    saveDraft(); renderEvaluate();
    $('nav button[data-view="evaluate"]').click(); window.scrollTo(0, 0);
  }

  async function deleteRecord(r) {
    if (!confirm(t("del_confirm", { a: r.agent || "–", d: whenText(r) }))) return;
    if (connected()) {
      try { await apiPost({ action: "deleteRecord", id: r.id, by: settings.evaluator || "" }); }
      catch (e) { alert(t("name_failed", { e: e.message })); return; }
    }
    forgetDeleted([r.id]);
    if (current.edit && current.edit.id === r.id) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); }
    refreshViews();
  }

  function renderEditBanner() {
    const b = $("#editBanner"); if (!b) return;
    b.hidden = !current.edit; b.innerHTML = "";
    if (!current.edit) return;
    b.append(h("span", { text: t("editing_banner", { a: current.answers.header.agent || "–", d: whenText(current.answers.header) }) }),
      h("button", { type: "button", class: "ghost", text: t("cancel_edit"), onclick: () => {
        current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } }));
  }

  // ---------- item guide: every item with its meaning and how it differs from similar items ----------
  function renderGuide() {
    const out = $("#guideOut"); if (!out) return;
    const sel = $("#guideForm");
    if (!sel.options.length || sel.dataset.lang !== lang) {
      const prev = sel.value || "calls"; sel.innerHTML = "";
      sel.append(...Object.keys(F.forms).map((k) => h("option", { value: k, text: formName(k) })));
      sel.value = prev; sel.dataset.lang = lang;
    }
    const f = F.forms[sel.value];
    const ap = (x) => x.applies.map((c) => h("span", { class: "tag", text: c }));
    const card = (num, title, sub, it, extra) => h("div", { class: "g-item" },
      h("div", { class: "g-head" }, h("span", { class: "num", text: num }), h("div", {}, h("div", { class: "title", text: title }), sub ? h("div", { class: "meta", text: sub }) : null), h("div", { class: "meta" }, ap(it), extra)),
      h("p", { text: L(it, "explain") }),
      it.guide ? h("p", { class: "meta" }, h("b", { text: t("not_met_if") + ": " }), L(it, "guide")) : h("p", { class: "meta" }, h("b", { text: t("example") + ": " }), L(it, "example")),
      L(it, "vs") ? h("p", { class: "vs" }, h("b", { text: t("vs_label") + ": " }), L(it, "vs")) : null);
    out.innerHTML = "";
    let sec = null;
    f.nc.forEach((it, i) => {
      if (it.section !== sec) { sec = it.section; out.append(h("h3", { text: t("partA") + " · " + secLabel(sec) })); }
      out.append(card("N" + (i + 1), L(it, "label"), L(it, "item"), it, h("span", {}, t("weight") + " ", h("b", { text: it.weight }))));
    });
    let b = null;
    f.crit.forEach((it, i) => {
      if (it.bucket !== b) { b = it.bucket; out.append(h("h3", { class: "crit-h", text: t("bucket_" + b) }), h("p", { class: "hint", text: t("bucket_" + b + "_hint") })); }
      out.append(card("C" + (i + 1), L(it, "item"), null, it));
    });
  }

  // Item definition for a stored item ("4" = NC item 4, "C3" = critical item 3).
  function itemDef(form, it) {
    const f = F.forms[form]; if (!f) return null;
    return it.kind === "NC" ? f.nc[+it.id - 1] : f.crit[+String(it.id).slice(1) - 1];
  }

  // ---------- calibration ----------
  function renderCalibration() {
    const recs = allRecords().filter((r) => r.sampleRef);
    const sel = $("#calSample"), prev = sel.value;
    const sg = sampleRefs();
    const samples = [...sg.values()].sort((x, y) => sampleStart(y).localeCompare(sampleStart(x)) || y.ref.localeCompare(x.ref)).map((g) => g.ref);
    sel.innerHTML = "";
    if (!samples.length) sel.append(h("option", { value: "", text: t("cal_none") }));
    samples.forEach((s) => { const g = sg.get(s);
      sel.append(h("option", { value: s, text: [s + (/^TEST-/.test(s) ? " (" + t("test_tag") + ")" : ""), g.agent || "–", formName(g.form),
        t("n_evaluators", { n: new Set(g.list.map((r) => r.evaluator)).size })].join(" · ") })); });
    if (samples.includes(prev)) sel.value = prev;
    const out = $("#calOut"); out.innerHTML = "";
    const group = recs.filter((r) => r.sampleRef === sel.value).sort((a, b) => (a.evaluator || "").localeCompare(b.evaluator || ""));
    if (!group.length) { out.append(h("div", { class: "empty", text: t("cal_empty") })); return; }
    const forms = new Set(group.map((r) => r.form));
    if (forms.size > 1) out.append(h("p", { class: "msg err", text: t("cal_mixed") }));
    const g = group.filter((r) => r.form === group[0].form);

    const ncs = g.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    const median = ncs.length ? (ncs.length % 2 ? ncs[(ncs.length - 1) / 2] : (ncs[ncs.length / 2 - 1] + ncs[ncs.length / 2]) / 2) : null;
    const agreedIn = $("#calAgreed").value;
    const agreed = agreedIn === "" ? median : Number(agreedIn) / 100;

    const sum = h("table", {}, h("tr", {}, h("th", { text: t("evaluator") }), h("th", { class: "num", text: t("nc_score") }), h("th", { class: "num", text: t("gap_agreed") }), h("th", { text: t("within5") }), h("th", { class: "num", text: t("crit_errors") }), h("th", { class: "num", text: t("final") })));
    g.forEach((r) => {
      const gap = r.ncScore === null || agreed === null ? null : Math.abs(r.ncScore - agreed);
      sum.append(h("tr", {}, h("td", { text: r.evaluator || "–" }), h("td", { class: "num", text: pct(r.ncScore) }), h("td", { class: "num", text: gap === null ? "–" : (Math.round(gap * 1000) / 10) + " " + t("pts") }),
        h("td", {}, gap === null ? "–" : h("span", { class: "pill " + (gap <= 0.05 ? "good" : "bad"), text: gap <= 0.05 ? t("yes") : t("no") })),
        h("td", { class: "num", text: r.critical }), h("td", { class: "num", text: pct(r.final) })));
    });
    const refs = [...new Set(g.map((r) => [whenText(r), refText(r)].filter(Boolean).join(" · ")).filter(Boolean))];
    out.append(h("h2", { text: t("sample_head", { s: sel.value, f: formName(g[0].form), p: pct(agreed) }) + (agreedIn === "" ? t("median") : "") }),
      h("p", { class: "cal-ref" }, h("b", { text: t("cal_ref") + ": " }), h("span", { dir: "ltr", text: (g[0].agent ? g[0].agent + " · " : "") + (refs.join("  |  ") || "–") })),
      ...(refs.length > 1 ? [h("p", { class: "msg err", text: t("cal_ref_differ") })] : []), sum);

    const itemsTbl = h("table", {}, h("tr", {}, h("th", { text: "#" }), h("th", { text: t("item") }), g.map((r) => h("th", { text: r.evaluator || "–" }))));
    let diffs = 0;
    g[0].items.forEach((it, idx) => {
      const vals = g.map((r) => (r.items[idx] || {}).result || "");
      const differ = new Set(vals).size > 1; if (differ) diffs++;
      itemsTbl.append(h("tr", { class: differ ? "diff" : "" }, h("td", { text: (it.kind === "NC" ? "N" : "") + it.id }), h("td", { text: L(itemDef(g[0].form, it), "item") || it.text }),
        g.map((r) => { const x = r.items[idx] || {}; const v = x.result || "";
          return h("td", {}, h("span", { class: "pill " + (v === "Met" || v === "No error" ? "good" : v === "N/A" || !v ? "na" : "bad"), text: v ? t(v) : "–" }), x.comment ? h("div", { class: "meta", text: x.comment }) : null); })));
    });
    out.append(h("h2", { text: t("diffs", { n: diffs }) }), h("p", { class: "hint", text: t("diffs_hint") }), itemsTbl,
      h("p", {}, h("button", { text: t("download_cmp"), onclick: () => {
        const rows = [["#", "Item", ...g.map((r) => r.evaluator || "")]];
        g[0].items.forEach((it, idx) => rows.push([it.id, it.text, ...g.map((r) => (r.items[idx] || {}).result || "")]));
        rows.push([], ["", "NC score", ...g.map((r) => pct(r.ncScore))], ["", "Final", ...g.map((r) => pct(r.final))]);
        download("Calibration_" + sel.value + ".csv", toCsv(rows), "text/csv");
      } })));
  }

  // ---------- dashboard ----------
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  function fillSelect(sel, values, allLabel, show) {
    const prev = sel.value;
    sel.innerHTML = "";
    sel.append(h("option", { value: "", text: allLabel }), ...values.map((v) => h("option", { value: v, text: show ? show(v) : v })));
    if (values.includes(prev)) sel.value = prev;
  }

  // Horizontal bar list: one hue, value label at the end, tooltip on hover.
  function bars(rows, opts = {}) {
    const max = opts.max || Math.max(1, ...rows.map((r) => r.value));
    const box = h("div", { class: "bars" });
    rows.forEach((r) => {
      const w = Math.max(0, Math.min(1, r.value / max));
      box.append(h("div", { class: "bar-row", title: r.title || "" },
        h("div", { class: "bar-label", text: r.label }),
        h("div", { class: "bar-track" },
          h("div", { class: "bar-fill" + (r.flag ? " flag" : ""), style: "width:" + (w * 100).toFixed(1) + "%" }),
          opts.target ? h("div", { class: "bar-target", style: "inset-inline-start:" + (opts.target / max * 100) + "%" }) : null),
        h("div", { class: "bar-value", text: r.display })));
    });
    return box;
  }

  function weekStart(d) {
    const t = new Date(d + "T00:00:00");
    if (isNaN(t)) return null;
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  }

  function section(id, title, hint, ...content) {
    const box = $(id); box.innerHTML = "";
    box.append(...[h("h2", { text: title }), hint ? h("p", { class: "hint", text: hint }) : null, ...content].filter(Boolean));
  }

  function renderDashboard() {
    const all = allRecords();
    fillSelect($("#dbAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    fillSelect($("#dbEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#dbType"), [...new Set(all.map((r) => r.type).filter(Boolean))].sort(), t("f_all_types"), (v) => typeLabel(all.find((r) => r.type === v).form, v));
    const f = { form: $("#dbForm").value, agent: $("#dbAgent").value, ev: $("#dbEvaluator").value, type: $("#dbType").value, from: $("#dbFrom").value, to: $("#dbTo").value, level: $("#dbCal").value || "agent" };
    const recs = all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) &&
      (!f.type || r.type === f.type) && (!f.from || (r.evalDate || "") >= f.from) && (!f.to || (r.evalDate || "") <= f.to) && !r.test &&
      (f.level === "all" || purposeOf(r) === "live" || (f.level === "program" && purposeOf(r) === "program")));

    const ids = ["#dbKpis", "#dbTrend", "#dbAgentsChart", "#dbAgents", "#dbItems", "#dbCrit", "#dbSections", "#dbEvaluators"];
    if (!recs.length) {
      ids.forEach((i) => ($(i).innerHTML = ""));
      $("#dbKpis").append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") }));
      ids.slice(1).forEach((i) => ($(i).style.display = "none"));
      return;
    }
    ids.forEach((i) => ($(i).style.display = ""));

    // KPI tiles
    const finals = recs.map((r) => r.final).filter((x) => x !== null && x !== undefined);
    const passRate = recs.filter((r) => r.result === "Pass").length / recs.length;
    const withCrit = recs.filter((r) => r.critical > 0).length;
    const tiles = [
      [t("k_evals"), recs.length, t("k_agents", { n: new Set(recs.map((r) => r.agent)).size })],
      [t("k_avg"), pct(avg(finals)), t("k_target")],
      [t("k_pass"), pct(passRate), t("k_passed", { a: recs.filter((r) => r.result === "Pass").length, b: recs.length })],
      [t("k_nc"), pct(avg(recs.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined))), t("k_before")],
      [t("k_crit"), withCrit, t("k_of_evals", { p: pct(withCrit / recs.length) })],
      [t("cc_acc"), pct(avg(recs.map((r) => r.cc))), t("k_cc")],
      [t("eu_acc"), pct(avg(recs.map((r) => r.eu))), t("k_eu")],
      [t("bc_acc"), pct(avg(recs.map((r) => r.bc))), t("k_bc")],
    ];
    section("#dbKpis", t("overview"), null, h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), h("div", { class: "tile-s", text: sub })))));

    // Weekly trend
    const weeks = new Map();
    recs.forEach((r) => { const w = weekStart(r.evalDate); if (!w) return; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); });
    const wk = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    section("#dbTrend", t("trend"), t("trend_hint"),
      bars(wk.map(([w, l]) => { const v = avg(l.map((r) => r.final || 0)); return { label: t("week_of", { w }), value: v, display: pct(v), flag: v < PASS, title: t("trend_tip", { n: l.length, p: pct(l.filter((r) => r.result === "Pass").length / l.length) }) }; }), { max: 1, target: PASS }));

    // Agents
    const by = new Map();
    recs.forEach((r) => { const k = r.agent || "–"; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const agents = [...by.entries()].map(([agent, list]) => {
      const fin = avg(list.map((r) => r.final).filter((x) => x !== null));
      const crit = list.reduce((s, r) => s + (r.critical || 0), 0);
      return { agent, list, fin, nc: avg(list.map((r) => r.ncScore).filter((x) => x !== null)), cc: avg(list.map((r) => r.cc)), eu: avg(list.map((r) => r.eu)), bc: avg(list.map((r) => r.bc)), crit, ok: fin !== null && fin >= PASS && crit === 0 };
    }).sort((a, b) => (b.fin || 0) - (a.fin || 0));
    section("#dbAgentsChart", t("by_agent"), t("by_agent_hint"),
      bars(agents.map((a) => ({ label: a.agent, value: a.fin || 0, display: pct(a.fin), flag: (a.fin || 0) < PASS, title: t("agent_tip", { n: a.list.length, c: a.crit }) })), { max: 1, target: PASS }));
    const rows = [["c_agent", "c_evals", "c_avg_final", "c_avg_nc", "c_cc", "c_eu", "c_bc", "c_crit", "c_status"].map((k) => t(k))];
    const tbl = h("table", {}, h("tr", {}, rows[0].map((t, i) => h("th", { class: i && i < 8 ? "num" : "", text: t }))));
    agents.forEach((a) => {
      const status = a.ok ? t("st_ok") : t("st_bad");
      tbl.append(h("tr", {}, h("td", {}, h("a", { href: "#", text: a.agent, onclick: (e) => { e.preventDefault(); $("#dbAgent").value = a.agent; renderDashboard(); } })),
        h("td", { class: "num", text: a.list.length }), h("td", { class: "num", text: pct(a.fin) }), h("td", { class: "num", text: pct(a.nc) }),
        h("td", { class: "num", text: pct(a.cc) }), h("td", { class: "num", text: pct(a.eu) }), h("td", { class: "num", text: pct(a.bc) }), h("td", { class: "num", text: a.crit }),
        h("td", {}, h("span", { class: "pill " + (a.ok ? "good" : "bad"), text: status }))));
      rows.push([a.agent, a.list.length, pct(a.fin), pct(a.nc), pct(a.cc), pct(a.eu), pct(a.bc), a.crit, status]);
    });
    section("#dbAgents", t("agents_tbl"), t("agents_tbl_hint"), tbl,
      h("p", {}, h("button", { text: t("download"), onclick: () => download("QA_Dashboard_" + today() + ".csv", toCsv(rows), "text/csv") })));

    // Item-level analysis: miss rate = misses / evaluations where the item applied.
    const stat = new Map();
    recs.forEach((r) => r.items.forEach((it) => {
      if (!it.result || it.result === "N/A") return;
      const key = r.form + "|" + it.id;
      if (!stat.has(key)) {
        const def = itemDef(r.form, it);
        stat.set(key, { form: r.form, id: it.id, kind: it.kind, text: (def && L(def, "label")) || it.text, full: (def && L(def, "item")) || it.text, section: def && def.section, coach: def && L(def, "coach"), n: 0, miss: 0 });
      }
      const s = stat.get(key); s.n++;
      if (it.result === "Not met" || it.result === "Error") s.miss++;
    }));
    const multiForm = new Set(recs.map((r) => r.form)).size > 1;
    const nm = (s) => (multiForm ? formName(s.form) + " · " : "") + (s.kind === "NC" ? "N" : "") + s.id + " " + s.text;
    const ncMiss = [...stat.values()].filter((s) => s.kind === "NC" && s.miss).sort((a, b) => b.miss / b.n - a.miss / a.n || b.miss - a.miss).slice(0, 10);
    section("#dbItems", t("most_missed"), t("most_missed_hint"),
      ncMiss.length ? bars(ncMiss.map((s) => ({ label: nm(s), value: s.miss / s.n, display: pct(s.miss / s.n) + " (" + s.miss + "/" + s.n + ")", title: s.full + "\n" + t("tip") + ": " + (s.coach || "") })), { max: 1 }) : h("div", { class: "empty", text: t("no_missed") }));

    const crMiss = [...stat.values()].filter((s) => s.kind !== "NC" && s.miss).sort((a, b) => b.miss - a.miss).slice(0, 10);
    section("#dbCrit", t("crit_title"), t("crit_hint"),
      crMiss.length ? bars(crMiss.map((s) => ({ label: (multiForm ? formName(s.form) + " · " : "") + "[" + s.kind + "] " + s.full, value: s.miss, display: String(s.miss), flag: true, title: t("tip") + ": " + (s.coach || "") }))) : h("div", { class: "empty", text: t("no_crit") }));

    const secs = new Map();
    [...stat.values()].filter((s) => s.kind === "NC").forEach((s) => { const k = s.section ? secLabel(s.section) : t("other"); const v = secs.get(k) || { n: 0, miss: 0 }; v.n += s.n; v.miss += s.miss; secs.set(k, v); });
    const secRows = [...secs.entries()].map(([k, v]) => ({ k, rate: v.n ? v.miss / v.n : 0, v })).sort((a, b) => b.rate - a.rate);
    section("#dbSections", t("by_area"), t("by_area_hint"),
      bars(secRows.map((x) => ({ label: x.k, value: x.rate, display: pct(x.rate), title: t("area_tip", { m: x.v.miss, n: x.v.n }) })), { max: Math.max(0.05, ...secRows.map((x) => x.rate)) }));

    // Evaluators: spot scoring that is much stricter or softer than the team.
    const evs = new Map();
    recs.forEach((r) => { const k = r.evaluator || "–"; if (!evs.has(k)) evs.set(k, []); evs.get(k).push(r); });
    const teamAvg = avg(finals);
    const et = h("table", {}, h("tr", {}, ["evaluator", "c_evals", "e_avg", "e_gap", "e_crit"].map((k, i) => h("th", { class: i ? "num" : "", text: t(k) }))));
    [...evs.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([ev, list]) => {
      const a = avg(list.map((r) => r.final).filter((x) => x !== null));
      const gap = a === null || teamAvg === null ? null : a - teamAvg;
      et.append(h("tr", {}, h("td", { text: ev }), h("td", { class: "num", text: list.length }), h("td", { class: "num", text: pct(a) }),
        h("td", { class: "num", text: gap === null ? "–" : (gap >= 0 ? "+" : "") + (Math.round(gap * 1000) / 10) + " " + t("pts") }),
        h("td", { class: "num", text: list.reduce((s, r) => s + (r.critical || 0), 0) })));
    });
    section("#dbEvaluators", t("evaluators"), t("evaluators_hint"), et);
  }

  // ---------- certification ----------
  // Everything comes from saved evaluations in the chosen window: live calls (calibration samples and
  // role-plays left out), Odoo accuracy from the Odoo items of those calls, and role-plays scored on
  // the same form with "Certification role-play" ticked. Only coaching notes are typed here.
  const CERT_DEFAULT = Object.assign({ calls: 5, rolePlays: 2, qa: 85, odoo: 90, failCrit: 2 }, (window.QA_CONFIG || {}).cert || {});
  const LS_CERT_RULES = "qa_cert_rules";
  let certRules = Object.assign({}, CERT_DEFAULT, store(LS_CERT_RULES) || {});
  const CERT_FIELDS = [["calls", "s_calls", 1, 50], ["rolePlays", "s_rp", 0, 10], ["qa", "s_qa", 0, 100], ["odoo", "s_odoo", 0, 100], ["failCrit", "s_crit", 1, 50]];
  const certCfg = () => ({ minCalls: certRules.calls, rolePlays: certRules.rolePlays, qa: certRules.qa / 100, odoo: certRules.odoo / 100, failCrit: certRules.failCrit });
  let CERT = certCfg();
  const LS_CERT = "qa_cert";
  const certInputs = store(LS_CERT) || {};
  const isOdoo = (def, it) => /odoo/i.test(((def && (def.item + " " + (def.section || ""))) || it.text || ""));

  function certDecision(c) {
    if (c.calls < CERT.minCalls || c.rps.length < CERT.rolePlays) return "Pending";
    if (c.avg < CERT.qa || c.crit >= CERT.failCrit) return "Not certified";
    if (c.crit >= 1 || (CERT.odoo > 0 && c.odoo !== null && c.odoo < CERT.odoo) || c.rps.some((r) => r.critical > 0)) return "Conditional";
    return "Certified";
  }

  function renderCertification() {
    const out = $("#ctOut"); if (!out) return;
    const sel = $("#ctForm");
    if (!sel.options.length || sel.dataset.lang !== lang) {
      const prev = sel.value || "calls"; sel.innerHTML = "";
      sel.append(...Object.keys(F.forms).map((k) => h("option", { value: k, text: formName(k) })));
      sel.value = prev; sel.dataset.lang = lang;
    }
    const box = $("#ctSettings"); box.innerHTML = "";
    CERT_FIELDS.forEach(([k, label, min, max]) => {
      const i = h("input", { type: "number", min: String(min), max: String(max), step: "1", value: certRules[k] });
      i.addEventListener("change", () => {
        const v = Math.round(Number(i.value));
        certRules[k] = i.value === "" || isNaN(v) ? CERT_DEFAULT[k] : Math.min(max, Math.max(min, v));
        store(LS_CERT_RULES, certRules); CERT = certCfg(); renderCertification();
      });
      box.append(h("label", {}, t(label), i));
    });
    const from = $("#ctFrom").value, to = $("#ctTo").value;
    const inWin = allRecords().filter((r) => r.form === sel.value && !r.sampleRef && !r.test && ["live", "certcall", "roleplay"].includes(purposeOf(r)) && r.agent &&
      (!from || (r.evalDate || "") >= from) && (!to || (r.evalDate || "") <= to));
    const recs = inWin.filter((r) => !r.rolePlay), rpAll = inWin.filter((r) => r.rolePlay);
    const names = [...new Set([...inWin.map((r) => r.agent), ...roster.agents])].sort((a, b) => a.localeCompare(b));
    out.innerHTML = "";
    if (!names.length) { out.append(h("div", { class: "empty", text: t("cert_empty") })); return; }

    const rows = names.map((agent) => {
      // Certification calls when the agent has any in the window; otherwise Agent level calls
      // (evaluations saved before the certification-call type existed).
      const mine = recs.filter((r) => r.agent === agent), certCalls = mine.filter((r) => purposeOf(r) === "certcall");
      const list = certCalls.length ? certCalls : mine;
      // Average the score before critical zeroing: critical errors are counted on their own below,
      // so one error is not charged twice (a single 0% would otherwise sink the average by itself).
      const fin = list.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined);
      let ok = 0, n = 0;
      list.forEach((r) => r.items.forEach((it) => {
        if (!it.result || it.result === "N/A" || !isOdoo(itemDef(r.form, it), it)) return;
        n++; if (it.result === "Met" || it.result === "No error") ok++;
      }));
      const rps = CERT.rolePlays ? rpAll.filter((r) => r.agent === agent).sort((a, b) => (a.savedAt || "").localeCompare(b.savedAt || "")).slice(-CERT.rolePlays) : [];
      const c = { agent, calls: list.length, avg: avg(fin), crit: list.filter((r) => r.critical > 0).length,
        odoo: n ? ok / n : null, odooN: n, rps, notes: (certInputs[agent] || {}).notes || "" };
      c.decision = certDecision(c);
      return c;
    });

    const cls = { Certified: "good", Conditional: "warn", "Not certified": "bad", Pending: "na" };
    const rpCell = (r) => r ? h("div", {}, pct(r.ncScore), r.critical > 0 ? h("span", { class: "pill bad cert-crit", text: t("c_crit_rp") }) : null) : "–";
    const rpIdx = Array.from({ length: CERT.rolePlays }, (_, i) => i);
    const useOdoo = CERT.odoo > 0;
    const th = (text, num) => h("th", { class: num ? "num" : "", text });
    const tbl = h("table", { class: "cert" }, h("tr", {}, th(t("c_agent")), th(t("c_calls"), 1), th(t("c_live"), 1), th(t("c_crit_live"), 1),
      useOdoo ? th(t("c_odoo"), 1) : null, rpIdx.map((i) => th(t("c_rp", { n: i + 1 }), 1)), th(t("c_decision")), th(t("c_notes"))));
    rows.forEach((c) => {
      const notes = h("input", { value: c.notes, placeholder: t("c_notes_ph"), "aria-label": t("c_notes") + " · " + c.agent });
      notes.addEventListener("change", () => { (certInputs[c.agent] = certInputs[c.agent] || {}).notes = notes.value; store(LS_CERT, certInputs); });
      tbl.append(h("tr", {},
        h("td", { text: c.agent }),
        h("td", { class: "num" + (c.calls < CERT.minCalls ? " short" : ""), dir: "ltr", text: c.calls + " / " + CERT.minCalls }),
        h("td", { class: "num", text: pct(c.avg) }),
        h("td", { class: "num", text: c.crit }),
        useOdoo ? h("td", { class: "num", title: t("c_odoo_tip", { n: c.odooN }), text: pct(c.odoo) }) : null,
        rpIdx.map((i) => h("td", { class: "num" }, rpCell(c.rps[i]))),
        h("td", {}, h("span", { class: "pill " + cls[c.decision], text: t("d_" + c.decision) })),
        h("td", {}, notes)));
    });

    const count = (d) => rows.filter((c) => c.decision === d).length;
    const tiles = ["Certified", "Conditional", "Not certified", "Pending"].map((d) =>
      h("div", { class: "tile" }, h("div", { class: "tile-k", text: t("d_" + d) }), h("div", { class: "tile-v", text: count(d) })));
    out.append(h("h2", { text: t("cert_results") }), h("div", { class: "tiles" }, tiles), h("div", { class: "table-wrap" }, tbl),
      h("p", { class: "hint", text: t("cert_local") }),
      h("p", {}, h("button", { text: t("download"), onclick: () => {
        const yn = (r) => (r ? (r.critical > 0 ? "Yes" : "No") : "");
        const csv = [["Agent", "Calls scored", "Live QA average (before critical)", "Evaluations with critical error", ...(useOdoo ? ["Odoo accuracy"] : []),
          ...rpIdx.flatMap((i) => ["Role-play " + (i + 1), "RP" + (i + 1) + " critical"]), "Decision", "Notes"]];
        rows.forEach((c) => csv.push([c.agent, c.calls, pct(c.avg), c.crit, ...(useOdoo ? [pct(c.odoo)] : []),
          ...rpIdx.flatMap((i) => [c.rps[i] ? pct(c.rps[i].ncScore) : "", yn(c.rps[i])]), c.decision, c.notes]));
        csv.push([], ["Rules", "Calls " + CERT.minCalls, "Role-plays " + CERT.rolePlays, "QA " + pct(CERT.qa), "Odoo " + (useOdoo ? pct(CERT.odoo) : "not used"), "Not certified at " + CERT.failCrit + " critical"]);
        download("Certification_" + formName(sel.value).replace(/\W+/g, "_") + "_" + today() + ".csv", toCsv(csv), "text/csv");
      } })));
  }

  // ---------- settings view ----------
  function setupLink() {
    const blob = btoa(unescape(encodeURIComponent(JSON.stringify({ u: settings.url, k: settings.key }))));
    return location.origin + location.pathname + "#setup=" + blob;
  }
  function readSetupLink() {
    const m = location.hash.match(/^#setup=(.+)$/);
    if (!m) return false;
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (j.u) settings.url = j.u;
      if (j.k) settings.key = j.k;
      store(LS_SETTINGS, settings);
    } catch (e) { /* ignore a broken link */ }
    history.replaceState(null, "", location.pathname);
    return true;
  }

  function renderSettings() {
    $("#setUrl").value = settings.url; $("#setKey").value = settings.key;
    const mm = $("#setMail"); mm.value = settings.mail || "auto";
    mm.onchange = () => { settings.mail = mm.value; store(LS_SETTINGS, settings); };
    const status = $("#connStatus");
    status.textContent = connected() ? t("conn_ok") : t("conn_no");
    status.className = "msg " + (connected() ? "ok" : "err");
    $("#btnSaveSettings").onclick = async () => {
      settings.url = $("#setUrl").value.trim(); settings.key = $("#setKey").value;
      store(LS_SETTINGS, settings);
      await loadRoster(); renderSettings(); renderHeader(); renderConnBanner();
      const m = $("#setMsg"); m.className = "msg ok"; m.textContent = t("set_saved");
      const n = await syncLocal(); if (n) { m.textContent += " " + t("synced_n", { n }); sheetLoaded = false; }
    };
    $("#btnTest").onclick = async () => {
      const m = $("#setMsg"); m.className = "msg"; m.textContent = t("testing");
      try {
        const j = await apiGet({});
        m.className = "msg ok"; m.textContent = t("test_ok", { n: j.records.length });
      } catch (e) { m.className = "msg err"; m.textContent = t("test_fail", { e: e.message }); }
    };
    $("#btnSetupLink").onclick = async () => {
      const m = $("#setMsg");
      if (!connected()) { m.className = "msg err"; m.textContent = t("need_key"); return; }
      const link = setupLink();
      try { await navigator.clipboard.writeText(link); m.className = "msg ok"; m.textContent = t("link_copied"); }
      catch (e) { m.className = "msg"; m.textContent = link; }
    };
    const rl = $("#rosterList"); rl.innerHTML = "";
    for (const [role, label] of [["agents", "agents"], ["evaluators", "evaluators"]]) {
      rl.append(h("h3", { text: t(label) + " (" + roster[role].length + ")" }));
      if (!roster[role].length) rl.append(h("div", { class: "hint", text: t("none_yet") }));
      rl.append(h("ul", { class: "names" }, roster[role].map((name) => h("li", {},
        h("span", {}, name, h("small", { class: "meta email", dir: "ltr", text: emailsFor(role)[name] || t("no_email") })),
        h("button", { type: "button", class: "ghost", text: t("email_btn"), onclick: () => setEmail(role, name) }),
        h("button", { type: "button", class: "ghost", text: t("rename"), onclick: () => renamePerson(role, name) }),
        h("button", { type: "button", class: "ghost", text: t("remove"), onclick: () => removePerson(role, name) })))));
    }
  }

  // Fix a name everywhere: the shared list, past evaluations in the sheet and on this device.
  async function renamePerson(role, from) {
    const to = normName(prompt(t("rename_prompt", { n: from }), from) || "");
    if (!to || to === from) return;
    const other = roster[role].find((x) => x !== from && nameKey(x) === nameKey(to));
    if (other && !confirm(t("rename_merge", { a: from, b: other }))) return;
    if (connected()) {
      try { await apiPost({ action: "renamePerson", role, from, to: other || to }); }
      catch (e) { alert(t("name_failed", { e: e.message })); return; }
    }
    const target = other || to, field = role === "agents" ? "agent" : "evaluator";
    roster[role] = [...new Set(roster[role].map((x) => (x === from ? target : x)))].sort((a, b) => a.localeCompare(b));
    store(LS_ROSTER, roster);
    const local = (store(LS_EVALS) || []).map((r) => (r[field] === from ? Object.assign(r, { [field]: target }) : r));
    store(LS_EVALS, local);
    for (const r of loaded.values()) if (r[field] === from) r[field] = target;
    if (current.answers.header[field] === from) current.answers.header[field] = target;
    if (role === "evaluators" && settings.evaluator === from) { settings.evaluator = target; store(LS_SETTINGS, settings); }
    renderSettings(); renderHeader(); refreshViews();
  }

  // Agent's email for the automatic result email (stored in the Roster tab, column D).
  const emailsFor = (role) => (role === "agents" ? roster.emails : roster.evalEmails) || {};
  async function setEmail(role, name) {
    const cur = emailsFor(role)[name] || "";
    const v = prompt(t(role === "agents" ? "email_prompt" : "email_prompt_ev", { n: name }), cur);
    if (v === null) return;
    const email = v.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert(t("bad_email")); return; }
    if (!connected()) { alert(t("email_needs_sheet")); return; }
    try { await apiPost({ action: "setEmail", role, name, email }); }
    catch (e) { alert(t("name_failed", { e: e.message })); return; }
    const k = role === "agents" ? "emails" : "evalEmails";
    roster[k] = Object.assign({}, roster[k]);
    if (email) roster[k][name] = email; else delete roster[k][name];
    store(LS_ROSTER, roster); renderSettings();
  }

  // Remove from the list only; past evaluations keep the name.
  async function removePerson(role, name) {
    if (!confirm(t("remove_confirm", { n: name }))) return;
    if (connected()) {
      try { await apiPost({ action: "removePerson", role, name }); }
      catch (e) { alert(t("name_failed", { e: e.message })); return; }
    }
    roster[role] = roster[role].filter((x) => x !== name); store(LS_ROSTER, roster);
    renderSettings(); renderHeader();
  }

  // ---------- boot ----------
  function boot() {
    $("#ver").textContent = F.version;
    $$("nav button").forEach((b) => b.onclick = () => {
      $$("nav button").forEach((x) => x.classList.toggle("active", x === b));
      $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
      if (b.dataset.view !== "evaluate") { if (!sheetLoaded && connected()) loadFromSheet(); refreshViews(); }
    });
    const fillForms = () => fillSelect($("#dbForm"), Object.keys(F.forms), t("f_all_forms"), formName);
    fillForms();
    $("#btnLang").onclick = () => {
      lang = lang === "ar" ? "en" : "ar"; store("qa_lang", lang);
      applyStatic(); renderConnBanner(); fillForms(); renderEvaluate(); renderSettings(); refreshViews();
    };
    $("#showExplain").checked = showExplain;
    $("#showExplain").onchange = (e) => { showExplain = e.target.checked; store("qa_explain", showExplain); renderItems(); };
    ["#dbForm", "#dbAgent", "#dbEvaluator", "#dbType", "#dbFrom", "#dbTo", "#dbCal"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    $("#calSample").addEventListener("input", renderCalibration);
    $("#kbAdd").onclick = addKbUpdate;
    ["#recEvaluator", "#recAgent", "#recPurpose", "#recSearch"].forEach((s) => $(s).addEventListener("input", renderRecords));
    $("#guideForm").addEventListener("input", renderGuide);
    ["#ctForm", "#ctFrom", "#ctTo"].forEach((s) => $(s).addEventListener("input", renderCertification));
    $("#ctReset").onclick = () => { certRules = Object.assign({}, CERT_DEFAULT); store(LS_CERT_RULES, null); CERT = certCfg(); renderCertification(); };
    $("#btnPrintGuide").onclick = () => window.print();
    $("#calAgreed").addEventListener("input", renderCalibration);
    $("#btnSave").onclick = onSave;
    $("#btnCsv").onclick = () => { const r = buildRecord(); download(fileName(r, "csv"), recordCsv(r), "text/csv"); };
    $("#btnReset").onclick = () => { if (!dirty() || confirm(t("clear_confirm"))) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } };
    const draft = store(LS_DRAFT);
    if (draft && F.forms[draft.form] && draft.answers && draft.answers.header && draft.answers.nc && draft.answers.nc.length === F.forms[draft.form].nc.length && draft.answers.crit.length === F.forms[draft.form].crit.length) current = draft;
    const fromLink = readSetupLink();
    setupLoaders(); applyStatic(); renderSettings(); renderEvaluate();
    if (fromLink) {
      const m = $("#saveMsg"); m.className = "msg ok";
      m.textContent = connected() ? t("linked_ok") : t("linked_bad");
    }
    renderConnBanner();
    window.addEventListener("hashchange", () => { if (readSetupLink()) location.reload(); });
    loadRoster().then(() => { renderHeader(); renderSettings(); renderKb(); });
    loadKb().then(() => { renderHeader(); renderKb(); });
    syncLocal().then((n) => { if (n) { const m = $("#saveMsg"); m.className = "msg ok"; m.textContent = t("synced_n", { n }); sheetLoaded = false; } });
  }
  boot();
})();

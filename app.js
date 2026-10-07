(function () {
  "use strict";

  const F = window.FORMS;
  const PASS = 0.85;
  const LS_SETTINGS = "qa_settings";
  const LS_EVALS = "qa_evals";
  const LS_DRAFT = "qa_draft";

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
  const today = () => new Date().toISOString().slice(0, 10);
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
  const settings = Object.assign({ url: "", key: "", evaluator: "" }, store(LS_SETTINGS) || {});
  if (!settings.url && CFG.sheetUrl) settings.url = CFG.sheetUrl;
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
    try {
      const r = await fetch(settings.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Rejected");
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
  let roster = Object.assign({ agents: [], evaluators: [] }, store(LS_ROSTER) || {});
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
      roster = { agents: j.agents, evaluators: j.evaluators || [] };
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
    ["interactionDate", "h_interactionDate", "datetime-local"],
    ["odooRef", "h_odooRef", "text"],
    ["type", "h_type", "select", true],
    ["duration", "", "duration"],
    ["outcome", "h_outcome", "select"],
    ["kbVersion", "h_kbVersion", "text"],
    ["sampleRef", "h_sampleRef", "text"],
    ["rolePlay", "h_rolePlay", "check"],
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
        saveDraft(); updateScore();
      });
      box.append(h("label", {}, lab + (req ? " *" : ""), input));
    }
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
    renderFormSwitch(); renderHeader(); applyType(); renderItems(); renderFeedback(); updateScore();
    $("#saveMsg").textContent = "";
  }

  function saveDraft() { store(LS_DRAFT, current); }

  function buildRecord() {
    const a = current.answers, d = F.forms[current.form], s = score(current.form, a);
    return {
      id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)),
      savedAt: new Date().toISOString(),
      formsVersion: F.version, form: current.form,
      ...a.header,
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

  async function onSave() {
    const msg = $("#saveMsg"); msg.className = "msg";
    const problems = validate();
    if (problems.length) { msg.className = "msg err"; msg.textContent = t("missing", { x: problems.slice(0, 8).join("، ".slice(lang === "ar" ? 0 : 1) + " ") + (problems.length > 8 ? " …" : "") }); return; }
    const rec = buildRecord();
    const local = store(LS_EVALS) || []; local.push(rec); store(LS_EVALS, local);
    if (connected()) {
      msg.textContent = t("saving");
      try {
        const how = await postRecord(rec);
        msg.className = "msg ok"; msg.textContent = how === "saved" ? t("saved_sheet") : t("sent_sheet");
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
  }

  const fileName = (rec, ext) => ["QA", F.forms[rec.form].name, (rec.agent || "agent").replace(/[^\w؀-ۿ-]+/g, "_"), rec.evalDate, rec.id.slice(0, 6)].join("_") + "." + ext;

  // ---------- data for calibration & dashboard ----------
  let loaded = new Map();
  function addRecords(list) {
    for (const r of list) if (r && r.id && r.form && F.forms[r.form] && Array.isArray(r.items)) loaded.set(r.id, r);
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
      addRecords(j.records); sheetLoaded = true;
      say(t("loaded_n", { n: j.records.length, t: new Date().toLocaleTimeString() }));
      refreshViews();
    } catch (e) { say(t("load_failed", { e: e.message })); }
  }

  function refreshViews() { renderCalibration(); renderDashboard(); renderCertification(); renderGuide(); }

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
    const samples = [...new Set(recs.map((r) => r.sampleRef))].sort();
    sel.innerHTML = "";
    if (!samples.length) sel.append(h("option", { value: "", text: t("cal_none") }));
    samples.forEach((s) => sel.append(h("option", { value: s, text: s })));
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
    out.append(h("h2", { text: t("sample_head", { s: sel.value, f: formName(g[0].form), p: pct(agreed) }) + (agreedIn === "" ? t("median") : "") }), sum);

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
    sel.append(h("option", { value: "", text: allLabel }), values.map((v) => h("option", { value: v, text: show ? show(v) : v })));
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
    const f = { form: $("#dbForm").value, agent: $("#dbAgent").value, ev: $("#dbEvaluator").value, type: $("#dbType").value, from: $("#dbFrom").value, to: $("#dbTo").value, cal: $("#dbCal").value === "yes" };
    const recs = all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) &&
      (!f.type || r.type === f.type) && (!f.from || (r.evalDate || "") >= f.from) && (!f.to || (r.evalDate || "") <= f.to) && (f.cal || (!r.sampleRef && !r.rolePlay)));

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
  const CERT = { qa: PASS, odoo: 0.9, minCalls: 5, rolePlays: 2, failCrit: 2 };
  const LS_CERT = "qa_cert";
  const certInputs = store(LS_CERT) || {};
  const isOdoo = (def, it) => /odoo/i.test(((def && (def.item + " " + (def.section || ""))) || it.text || ""));

  function certDecision(c) {
    if (c.calls < CERT.minCalls || c.rps.length < CERT.rolePlays) return "Pending";
    if (c.avg < CERT.qa || c.crit >= CERT.failCrit) return "Not certified";
    if (c.crit >= 1 || (c.odoo !== null && c.odoo < CERT.odoo) || c.rps.some((r) => r.critical > 0)) return "Conditional";
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
    $("#ctRules").innerHTML = "";
    $("#ctRules").append(...["cert_r1", "cert_r2", "cert_r3", "cert_r4", "cert_r5"].map((k) => h("li", { text: t(k, { q: pct(CERT.qa), o: pct(CERT.odoo), n: CERT.minCalls, r: CERT.rolePlays, c: CERT.failCrit }) })));
    const from = $("#ctFrom").value, to = $("#ctTo").value;
    const inWin = allRecords().filter((r) => r.form === sel.value && !r.sampleRef && r.agent &&
      (!from || (r.evalDate || "") >= from) && (!to || (r.evalDate || "") <= to));
    const recs = inWin.filter((r) => !r.rolePlay), rpAll = inWin.filter((r) => r.rolePlay);
    const names = [...new Set([...inWin.map((r) => r.agent), ...roster.agents])].sort((a, b) => a.localeCompare(b));
    out.innerHTML = "";
    if (!names.length) { out.append(h("div", { class: "empty", text: t("cert_empty") })); return; }

    const rows = names.map((agent) => {
      const list = recs.filter((r) => r.agent === agent);
      // Average the score before critical zeroing: critical errors are counted on their own below,
      // so one error is not charged twice (a single 0% would otherwise sink the average by itself).
      const fin = list.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined);
      let ok = 0, n = 0;
      list.forEach((r) => r.items.forEach((it) => {
        if (!it.result || it.result === "N/A" || !isOdoo(itemDef(r.form, it), it)) return;
        n++; if (it.result === "Met" || it.result === "No error") ok++;
      }));
      const rps = rpAll.filter((r) => r.agent === agent).sort((a, b) => (a.savedAt || "").localeCompare(b.savedAt || "")).slice(-CERT.rolePlays);
      const c = { agent, calls: list.length, avg: avg(fin), crit: list.filter((r) => r.critical > 0).length,
        odoo: n ? ok / n : null, odooN: n, rps, notes: (certInputs[agent] || {}).notes || "" };
      c.decision = certDecision(c);
      return c;
    });

    const cls = { Certified: "good", Conditional: "warn", "Not certified": "bad", Pending: "na" };
    const rpCell = (r) => r ? h("div", {}, pct(r.ncScore), r.critical > 0 ? h("span", { class: "pill bad cert-crit", text: t("c_crit_rp") }) : null) : "–";
    const heads = ["c_agent", "c_calls", "c_live", "c_crit_live", "c_odoo", "c_rp1", "c_rp2", "c_decision", "c_notes"];
    const tbl = h("table", { class: "cert" }, h("tr", {}, heads.map((k, i) => h("th", { class: i && i < 7 ? "num" : "", text: t(k) }))));
    rows.forEach((c) => {
      const notes = h("input", { value: c.notes, placeholder: t("c_notes_ph"), "aria-label": t("c_notes") + " · " + c.agent });
      notes.addEventListener("change", () => { (certInputs[c.agent] = certInputs[c.agent] || {}).notes = notes.value; store(LS_CERT, certInputs); });
      tbl.append(h("tr", {},
        h("td", { text: c.agent }),
        h("td", { class: "num" + (c.calls < CERT.minCalls ? " short" : ""), dir: "ltr", text: c.calls + " / " + CERT.minCalls }),
        h("td", { class: "num", text: pct(c.avg) }),
        h("td", { class: "num", text: c.crit }),
        h("td", { class: "num", title: t("c_odoo_tip", { n: c.odooN }), text: pct(c.odoo) }),
        h("td", { class: "num" }, rpCell(c.rps[0])),
        h("td", { class: "num" }, rpCell(c.rps[1])),
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
        const csv = [["Agent", "Calls scored", "Live QA average (before critical)", "Evaluations with critical error", "Odoo accuracy", "Role-play 1", "RP1 critical", "Role-play 2", "RP2 critical", "Decision", "Notes"]];
        rows.forEach((c) => csv.push([c.agent, c.calls, pct(c.avg), c.crit, pct(c.odoo), c.rps[0] ? pct(c.rps[0].ncScore) : "", yn(c.rps[0]), c.rps[1] ? pct(c.rps[1].ncScore) : "", yn(c.rps[1]), c.decision, c.notes]));
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
    const status = $("#connStatus");
    status.textContent = connected() ? t("conn_ok") : t("conn_no");
    status.className = "msg " + (connected() ? "ok" : "err");
    $("#btnSaveSettings").onclick = async () => {
      settings.url = $("#setUrl").value.trim(); settings.key = $("#setKey").value;
      store(LS_SETTINGS, settings);
      await loadRoster(); renderSettings(); renderHeader();
      const m = $("#setMsg"); m.className = "msg ok"; m.textContent = t("set_saved");
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
      rl.append(h("div", {}, h("b", { text: t(label) + " (" + roster[role].length + "): " }), roster[role].join("، ".slice(lang === "ar" ? 0 : 1) + " ") || t("none_yet")));
    }
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
      applyStatic(); fillForms(); renderEvaluate(); renderSettings(); refreshViews();
    };
    $("#showExplain").checked = showExplain;
    $("#showExplain").onchange = (e) => { showExplain = e.target.checked; store("qa_explain", showExplain); renderItems(); };
    ["#dbForm", "#dbAgent", "#dbEvaluator", "#dbType", "#dbFrom", "#dbTo", "#dbCal"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    $("#calSample").addEventListener("input", renderCalibration);
    $("#guideForm").addEventListener("input", renderGuide);
    ["#ctForm", "#ctFrom", "#ctTo"].forEach((s) => $(s).addEventListener("input", renderCertification));
    $("#btnPrintGuide").onclick = () => window.print();
    $("#calAgreed").addEventListener("input", renderCalibration);
    $("#btnSave").onclick = onSave;
    $("#btnCsv").onclick = () => { const r = buildRecord(); download(fileName(r, "csv"), recordCsv(r), "text/csv"); };
    $("#btnReset").onclick = () => { if (!dirty() || confirm(t("clear_confirm"))) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } };
    const draft = store(LS_DRAFT);
    if (draft && F.forms[draft.form] && draft.answers && draft.answers.nc && draft.answers.nc.length === F.forms[draft.form].nc.length && draft.answers.crit.length === F.forms[draft.form].crit.length) current = draft;
    const fromLink = readSetupLink();
    setupLoaders(); applyStatic(); renderSettings(); renderEvaluate();
    if (fromLink) {
      const m = $("#saveMsg"); m.className = "msg ok";
      m.textContent = connected() ? t("linked_ok") : t("linked_bad");
    }
    loadRoster().then(() => { renderHeader(); renderSettings(); });
  }
  boot();
})();

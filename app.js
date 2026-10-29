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
  // Returns false when the browser refuses to save (storage full or blocked), so callers can warn.
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) { return val === undefined ? null : false; }
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
  const stageLabel = (v) => { const s = F.odoo.stages.find((x) => x.name === v); return s ? (lang === "ar" ? s.ar + " (" + s.name + ")" : s.name) : v; };
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
    const final = critical ? 0 : nc; // any critical error fails the evaluation, even when every Part A item is N/A
    return {
      nc, cc: errs.CC ? 0 : 1, eu: errs.EU ? 0 : 1, bc: errs.BC ? 0 : 1, critical, final, open,
      result: final === null ? "" : final >= PASS ? "Pass" : "Fail",
    };
  }

  // ---------- settings ----------
  const CFG = window.QA_CONFIG || {};
  const settings = Object.assign({ url: "", key: "", session: "", email: "", who: "", owner: false, evaluator: "", mail: "auto" }, store(LS_SETTINGS) || {});
  // Result emails default to unified automatic sending from the tool (Quality Team) for all evaluators.
  if (!settings.mailV3) { settings.mail = "auto"; settings.mailV3 = true; store(LS_SETTINGS, settings); }
  if (CFG.sheetUrl && (!settings.url || (CFG.oldSheetUrls || []).includes(settings.url))) {
    settings.url = CFG.sheetUrl;
    if (settings.key || settings.session) store(LS_SETTINGS, settings);
  }
  // Evaluators sign in with a code sent to their email (session); the access key still works for the admin.
  const connected = () => !!(settings.url && (settings.key || settings.session));
  const signedIn = () => !settings.key && !!settings.session;
  // The owner (Role = Owner in the Names list, or whoever uses the access key) manages names, emails and team settings
  // and can correct or delete any evaluation; evaluators only their own. The script checks the same rules.
  const isOwner = () => !!settings.key || (signedIn() && !!settings.owner);
  const mailMode = () => settings.mail || "auto";
  const canChange = (r) => isOwner() || !connected() || nameKey(r.evaluator) === nameKey(settings.who);
  let teamCfg = Object.assign({ monthlyTarget: 4 }, store("qa_team_cfg") || {});
  const creds = () => (settings.key ? { key: settings.key } : settings.session ? { session: settings.session } : {});
  function signOut() {
    settings.session = ""; settings.email = ""; settings.who = ""; settings.owner = false; store(LS_SETTINGS, settings);
    showLogin();
  }
  // A sign-in that ended, or an access key that was changed on the script, sends this device back to the sign-in screen.
  const permMsg = (e) => (e === "not_owner" ? t("perm_owner") : e === "not_yours" ? t("perm_yours") : e);
  const checkSignedOut = (j) => {
    const oldKey = j && j.error === "Wrong access key" && settings.key;
    if (!(j && j.error === "signed_out") && !oldKey) return;
    if (oldKey) settings.key = "";
    signOut();
    throw Object.assign(new Error(t("li_expired")), { signedOut: true });
  };

  async function apiGet(params) {
    const u = new URL(settings.url);
    for (const [k, v] of Object.entries(Object.assign(creds(), params || {}))) u.searchParams.set(k, v);
    const j = await (await fetch(u)).json();
    checkSignedOut(j);
    if (!j.ok) throw new Error(permMsg(j.error) || "Rejected");
    return j;
  }
  async function apiPost(obj) {
    const body = JSON.stringify(Object.assign(creds(), obj));
    apiPost.last = null;
    try {
      const r = await fetch(settings.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      const j = await r.json();
      checkSignedOut(j);
      if (!j.ok) throw Object.assign(new Error(permMsg(j.error) || "Rejected"), { refused: true });
      apiPost.last = j;
      return "saved";
    } catch (e) {
      if (String(e.message).match(/key|Rejected|Bad/i) || e.signedOut || e.refused) throw e;
      // Some browsers block reading the reply; send again without reading it.
      await fetch(settings.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      return "sent";
    }
  }

  async function apiPostJson(obj) {
    await apiPost(obj);
    if (!apiPost.last) throw new Error(t("li_net"));
    return apiPost.last;
  }

  // ---------- names (one shared list so reports group correctly) ----------
  const LS_ROSTER = "qa_roster";
  let roster = Object.assign({ agents: [], evaluators: [], emails: {}, daysOff: {}, certDates: {} }, store(LS_ROSTER) || {});
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
      // An older Apps Script deployment doesn't send evaluator emails; keep the ones saved here until it does.
      const server = { agents: j.agents, evaluators: j.evaluators || [], owners: j.owners || [], emails: j.emails || {}, daysOff: j.daysOff || roster.daysOff || {}, certDates: j.certDates || roster.certDates || {}, evalEmails: j.evalEmails || roster.evalEmails || {} };
      if (j.config) { teamCfg = Object.assign(teamCfg, j.config); store("qa_team_cfg", teamCfg); }
      if (j.me && signedIn() && (j.me.name !== settings.who || !!j.me.owner !== !!settings.owner)) {
        settings.who = j.me.name; settings.owner = !!j.me.owner; settings.evaluator = j.me.name; store(LS_SETTINGS, settings);
      }
      // Names added on this device while it was not connected go up to the shared list.
      for (const role of ["agents", "evaluators"]) {
        for (const name of (role === "agents" || isOwner() ? roster[role] : []) || []) {
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
  // Call library tag: Wow and Good calls are named in the agent's email; Bad is only for the training library.
  const CALL_TAGS = ["wow", "good", "bad"];
  // How the evaluator heard the call; independent of the purpose (agent level, certification, calibration...).
  const METHODS = ["recording", "sidebyside"];
  // How the call was chosen. Random calls measure the agent fairly; targeted ones (a complaint, an escalation,
  // a follow-up on a known issue) are kept for coaching and left out of agent-level results, as COPC-style monitoring expects.
  const SELECTIONS = ["random", "targeted"];
  const selectionOf = (r) => r.selection || "random";
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
    ["odooTag", "h_odooTag", "select"],
    ["callTag", "h_callTag", "select"],
    ["kbVersion", "h_kbVersion", "text"],
    ["purpose", "h_purpose", "purpose"],
    ["method", "h_method", "select"],
    ["selection", "h_selection", "select"],
  ];

  function blankAnswers(form) {
    const d = F.forms[form];
    return {
      header: { evaluator: settings.evaluator, evalDate: today(), kbVersion: "", method: "recording", selection: "random" },
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
        // "Ended on" is the Odoo stage the lead should end on; the tag list follows the chosen stage.
        const stage = F.odoo.stages.find((s) => s.name === a.header.outcome);
        if ((key === "method" || key === "selection") && purposeOf(a.header) === "roleplay") continue;
        if (key === "odooTag" && !(stage && stage.tags.length)) { if (a.header.odooTag) { a.header.odooTag = ""; saveDraft(); } continue; }
        const opts = (key === "type" ? Object.keys(d.types) : key === "callTag" ? CALL_TAGS : key === "method" ? METHODS : key === "selection" ? SELECTIONS : key === "outcome" ? F.odoo.stages.map((s) => s.name) : key === "odooTag" ? stage.tags.slice() : d.outcomes).slice();
        if (key !== "type" && a.header[key] && !opts.includes(a.header[key])) opts.push(a.header[key]);
        const show = (o) => (key === "type" ? typeLabel(current.form, o) : key === "callTag" ? t("tag_" + o) : key === "method" ? t("m_" + o) : key === "selection" ? t("sel_" + o) : key === "outcome" ? stageLabel(o) : key === "odooTag" ? o : outLabel(current.form, o));
        input = h("select", {}, h("option", { value: "", text: t("select") }), opts.map((o) => h("option", { value: o, text: show(o) })));
      } else if (kind === "person") {
        const role = key === "agent" ? "agents" : "evaluators";
        const opts = roster[role].slice();
        if (a.header[key] && !opts.includes(a.header[key])) opts.push(a.header[key]);
        input = h("select", {}, h("option", { value: "", text: t("select") }), opts.map((o) => h("option", { value: o, text: o })),
          h("option", { value: "__new", text: t("add_name") }));
      } else input = h("input", { type: kind });
      // Signed-in evaluators always save under their own name (an old evaluation being corrected keeps its evaluator).
      if (key === "evaluator" && signedIn() && settings.who && !current.edit) {
        if (a.header.evaluator !== settings.who) { a.header.evaluator = settings.who; saveDraft(); }
        if (![...input.options].some((o) => o.value === settings.who)) input.append(h("option", { value: settings.who, text: settings.who }));
        input.disabled = true;
      }
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
        if (["odooRef", "phone", "interactionDate", "purpose"].includes(key)) checkSameCall();
        if (key === "selection") { if (input.value !== "random") { delete a.header.pick; delete a.header.pickAgent; } saveDraft(); renderHeader(); return; }
        if (key === "outcome") { const st = F.odoo.stages.find((s) => s.name === input.value); if (!st || !st.tags.includes(a.header.odooTag)) a.header.odooTag = ""; saveDraft(); renderHeader(); return; }
        saveDraft(); updateScore();
      });
      box.append(h("label", {}, lab + (req ? " *" : ""), input));
      if (key === "selection" && (a.header.selection || "random") === "random") box.append(randomPicker(a));
    }
  }

  // Random call picker: a random working day in the last week and a random time in working hours; the evaluator takes
  // the agent's first answered call after that time. Days the center is closed (team setting, Friday by default) are never
  // picked. Once a call is picked, the evaluator can only pick again by giving a reason (the agent was off, or no answered
  // calls that day); every pick and its reason is saved with the evaluation (pickLog) so re-picks can be checked later.
  const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIdx = (v) => String(v || "").split(/[,\s]+/).map((d) => WEEK.indexOf(d)).filter((i) => i >= 0);
  const ymdOf = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const wdOf = (day) => t("wd_" + WEEK[new Date(day + "T12:00:00").getDay()]);
  // "Picked 3 times: Mon 2026-10-20 14:10 (agent was off) → …" for records, Excel and the agent check.
  function pickTrail(r) {
    const log = r.pickLog || [];
    if (log.length < 2) return "";
    return t("pick_trail", { n: log.length }) + " " + log.map((e) => wdOf(e.p.slice(0, 10)) + " " + e.p + (e.why ? " (" + t("pick_why_" + e.why) + ")" : "")).join(" → ");
  }
  function randomPicker(a) {
    const box = h("div", { class: "picker" });
    const pick = (why) => {
      const agent = a.header.agent;
      const log = (a.header.pickLog || []).slice();
      if (why && log.length) log[log.length - 1] = Object.assign({}, log[log.length - 1], { why });
      const [fh, fm] = String(teamCfg.pickFrom || "10:00").split(":").map(Number), [th, tm] = String(teamCfg.pickTo || "21:30").split(":").map(Number);
      const days = Math.max(1, Number(teamCfg.pickDays) || 7);
      const off = new Set([...dayIdx(teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays), ...dayIdx((roster.daysOff || {})[agent])]);
      const skip = log.filter((e) => e.why && e.ag === agent).map((e) => e.p.slice(0, 10)), ok = [];
      for (let i = 1; i <= days; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (!off.has(d.getDay()) && !skip.includes(ymdOf(d))) ok.push(ymdOf(d));
      }
      if (!ok.length) { alert(t("pick_none", { n: days })); return; }
      const from = fh * 60 + (fm || 0), to = Math.max(from + 1, th * 60 + (tm || 0)), m = from + Math.floor(Math.random() * (to - from));
      a.header.pick = ok[Math.floor(Math.random() * ok.length)] + " " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
      a.header.pickAgent = agent;
      log.push({ p: a.header.pick, ag: agent, at: new Date().toISOString() });
      a.header.pickLog = log; saveDraft(); show();
    };
    const show = () => {
      box.innerHTML = "";
      const picked = a.header.pick && a.header.pickAgent === a.header.agent;
      if (!picked) box.append(h("button", { type: "button", class: "ghost", text: "🎲 " + t("pick_btn"), onclick: () => {
        if (!a.header.agent) { alert(t("pick_need_agent")); return; }
        pick("");
      } }));
      if (picked) {
        const day = a.header.pick.slice(0, 10);
        box.append(h("div", { class: "pick-out" }, t("pick_rule", { a: a.header.pickAgent, d: wdOf(day) + " " + day, t: a.header.pick.slice(11) })),
          h("div", { class: "hint", text: t("pick_again_hint") }),
          h("button", { type: "button", class: "ghost", text: t("pick_off_btn"), onclick: () => { if (confirm(t("pick_confirm", { d: wdOf(day) + " " + day }))) pick("off"); } }),
          h("button", { type: "button", class: "ghost", text: t("pick_nocalls_btn"), onclick: () => { if (confirm(t("pick_confirm", { d: wdOf(day) + " " + day }))) pick("nocalls"); } }));
        const tr = pickTrail(a.header);
        if (tr) box.append(h("div", { class: "hint", text: tr }));
      }
    };
    show();
    return box;
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
    const cbCoach = $("#fb_coached");
    if (cbCoach) {
      cbCoach.checked = !!(current.answers.feedback && current.answers.feedback.coached);
      cbCoach.onchange = () => {
        current.answers.feedback.coached = cbCoach.checked;
        current.answers.feedback.coachedAt = cbCoach.checked ? (current.answers.feedback.coachedAt || new Date().toISOString()) : "";
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
    $("#mbFinal").textContent = $("#sFinal").textContent; $("#mbOpen").textContent = s.open;
    autoFeedback();
  }

  function renderEvaluate() {
    if (!current.answers) current.answers = blankAnswers(current.form);
    renderFormSwitch(); renderHeader(); applyType(); renderItems(); renderFeedback(); updateScore(); renderEditBanner(); renderDupWarn();
    $("#saveMsg").textContent = "";
  }

  function saveDraft() {
    if (store(LS_DRAFT, current) === false && !saveDraft.warned) { saveDraft.warned = true; pruneLocal(); if (store(LS_DRAFT, current) === false) alert(t("storage_full")); }
  }

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
  function makeEvalId(ymd) {
    const d = String(ymd || today()).replace(/\D/g, "").slice(2, 8) || "000000";
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    for (let tries = 0; tries < 20; tries++) {
      let s = "";
      for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
      const code = "QA-" + d + "-" + s;
      if (!loaded.has(code)) return code;
    }
    return "QA-" + d + "-" + Date.now().toString(36).slice(-4).toUpperCase();
  }
  function evalIdOf(r) {
    if (!r) return "";
    if (r.evalId) return r.evalId;
    const id = String(r.id || "");
    if (/^QA-\d{6}-[A-Z0-9]{4,}$/i.test(id)) return id.toUpperCase();
    const d = String(r.evalDate || r.savedAt || r.interactionDate || "").replace(/\D/g, "").slice(2, 8) || "000000";
    const suf = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0");
    return "QA-" + d + "-" + suf;
  }

  function buildRecord() {
    const a = current.answers, d = F.forms[current.form], s = score(current.form, a);
    return {
      id: current.edit && current.edit.id ? current.edit.id : makeEvalId(current.edit ? a.header.evalDate || today() : today()),
      evalId: current.edit && current.edit.evalId ? current.edit.evalId : undefined,
      savedAt: new Date().toISOString(),
      formsVersion: F.version, form: current.form,
      ...a.header,
      evalDate: current.edit ? a.header.evalDate || today() : today(),
      kbVersion: kbFor(a.header.interactionDate) || a.header.kbVersion || "",
      kbUpdate: (kbInForce(a.header.interactionDate) || {}).no || "",
      mailMode: mailMode(),
      purpose: purposeOf(a.header), rolePlay: purposeOf(a.header) === "roleplay", test: !!a.header.test,
      sampleRef: purposeOf(a.header) === "calibration" ? a.header.sampleRef || "" : "",
      phone: normPhone(a.header.phone),
      ncScore: s.nc, cc: s.cc, eu: s.eu, bc: s.bc, critical: s.critical, final: s.final, result: s.result,
      items: [
        ...d.nc.map((it, i) => ({ id: String(i + 1), kind: "NC", text: it.item, weight: it.weight, result: a.nc[i].result, evidence: a.nc[i].evidence, comment: a.nc[i].comment })),
        ...d.crit.map((it, i) => ({ id: "C" + (i + 1), kind: it.bucket, text: it.item, result: a.crit[i].result, evidence: a.crit[i].evidence, comment: a.crit[i].comment })),
      ],
      coached: !!(a.feedback && a.feedback.coached),
      coachedAt: a.feedback && a.feedback.coached ? (a.feedback.coachedAt || (current.edit && current.edit.coachedAt) || new Date().toISOString()) : "",
      coachedBy: a.feedback && a.feedback.coached ? (settings.who || settings.evaluator || a.header.evaluator || "") : "",
      feedback: { strengths: a.feedback.strengths, improve: a.feedback.improve, coaching: a.feedback.coaching, coached: !!(a.feedback && a.feedback.coached), coachedAt: a.feedback && a.feedback.coached ? (a.feedback.coachedAt || (current.edit && current.edit.coachedAt) || new Date().toISOString()) : "" },
    };
  }

  function validate() {
    const a = current.answers, problems = [];
    for (const [key, label, , req] of HEADER) if (req && !a.header[key]) problems.push(t(label));
    if (purposeOf(a.header) === "calibration" && !a.header.sampleRef) problems.push(t("h_sampleRef"));
    if (!a.header.odooRef && !a.header.phone) problems.push(t("ref_needed"));
    if (a.header.interactionDate && purposeOf(a.header) !== "roleplay") {
      const when = new Date(a.header.interactionDate), now = Date.now();
      if (isNaN(when) || when.getTime() > now + 10 * 60000) problems.push(t("bad_future"));
      else if (when.getTime() < now - 120 * 864e5) problems.push(t("bad_old"));
    }
    if (a.header.phone && normPhone(a.header.phone).length < 7) problems.push(t("bad_phone"));
    $$(".item").forEach((el) => {
      const ans = a[el.dataset.kind][+el.dataset.i];
      el.classList.toggle("missing", !ans.result);
      if (!ans.result) problems.push(t("item_n", { n: $(".num", el).textContent }));
      else if ((ans.result === "Not met" || ans.result === "Error") && !ans.evidence) problems.push(t("evidence_n", { n: $(".num", el).textContent }));
    });
    return problems;
  }

  function recordCsv(rec) {
    const rows = [["Field", "Value"], ["Evaluation ID", evalIdOf(rec)]];
    for (const [k, label] of HEADER) rows.push([label ? I.en[label] : "Duration", rec[k] || ""]);
    rows.push(["Form", F.forms[rec.form].name], ["NC score", pct(rec.ncScore)], ["CC accuracy", pct(rec.cc)], ["EU accuracy", pct(rec.eu)], ["BC accuracy", pct(rec.bc)], ["Critical errors", rec.critical], ["Final score", pct(rec.final)], ["Result", rec.result], []);
    rows.push(["#", "Bucket", "Item", "Weight", "Result", "Evidence", "Comment"]);
    rec.items.forEach((it) => rows.push([it.id, it.kind, it.text, it.weight || "", it.result, it.evidence, it.comment]));
    rows.push([], ["Strengths", rec.feedback.strengths], ["Areas to improve", rec.feedback.improve], ["Coaching", rec.feedback.coaching], ["Coached 1-on-1", isCoached(rec) ? "Yes" : "No"], ["Coached at", rec.coachedAt || ""], ["Coached by", rec.coachedBy || ""]);
    return toCsv(rows);
  }

  const postRecord = (rec) => apiPost({ record: rec });
  const LS_SYNCED = "qa_synced";
  const markSynced = (id) => { const s = store(LS_SYNCED) || []; if (!s.includes(id)) { s.push(id); store(LS_SYNCED, s); } pruneLocal(); };
  // Evaluations already in the sheet don't need a full copy on this device; keep unsynced ones and the latest 30.
  function pruneLocal() {
    const done = new Set(store(LS_SYNCED) || []), local = store(LS_EVALS) || [];
    const synced = local.filter((r) => r && done.has(r.id));
    if (synced.length <= 30) return;
    const keep = new Set(synced.slice(-30).map((r) => r.id));
    store(LS_EVALS, local.filter((r) => r && (!done.has(r.id) || keep.has(r.id))));
    store(LS_SYNCED, [...done].filter((id) => keep.has(id)).slice(-500));
  }

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

  // The save result also shows as a big message at the top of the screen, so nobody leaves thinking it saved when it didn't.
  function toast(kind, text, list) {
    const b = $("#toast"); clearTimeout(toast.timer);
    b.className = "toast " + kind; b.innerHTML = "";
    b.append(h("div", { text }), list && list.length ? h("ul", {}, list.map((x) => h("li", { text: x }))) : null,
      h("button", { type: "button", class: "x", "aria-label": "×", text: "×", onclick: () => (b.hidden = true) }));
    b.hidden = false;
    if (kind === "ok") toast.timer = setTimeout(() => (b.hidden = true), 6000);
  }

  async function onSave() {
    const msg = $("#saveMsg"); msg.className = "msg";
    $("#toast").hidden = true;
    const problems = validate();
    if (problems.length) {
      msg.className = "msg err"; msg.textContent = t("missing", { x: problems.slice(0, 8).join((lang === "ar" ? "، " : ", ")) + (problems.length > 8 ? " …" : "") });
      toast("err", t("not_saved_yet", { n: problems.length }), problems.slice(0, 6).concat(problems.length > 6 ? ["…"] : []));
      const first = $(".item.missing") || $("#headerFields");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const rec = buildRecord();
    // "Test" hides an evaluation everywhere; people have ticked it on real certifications, so ask once more.
    if (rec.test && !confirm(t("test_confirm"))) return;
    const edit = current.edit;
    if (edit) Object.assign(rec, { id: edit.id, savedAt: edit.savedAt, editedAt: new Date().toISOString(), editedBy: settings.evaluator || rec.evaluator });
    else {
      const dup = findDuplicate(rec);
      if (dup && !confirm(t("dup_confirm", { e: dup.evaluator || "–", d: (dup.evalDate || "") }))) return;
    }
    const local = (store(LS_EVALS) || []).filter((r) => r.id !== rec.id); local.push(rec);
    if (store(LS_EVALS, local) === false) { pruneLocal(); store(LS_EVALS, (store(LS_EVALS) || []).filter((r) => r.id !== rec.id).concat([rec])); }
    loaded.set(rec.id, rec);
    if (connected()) {
      msg.textContent = t("saving");
      try {
        const how = edit ? await apiPost({ action: "updateRecord", record: rec }) : await postRecord(rec);
        markSynced(rec.id);
        msg.className = "msg ok"; msg.textContent = (edit ? t("updated_sheet") : how === "saved" ? t("saved_sheet") : t("sent_sheet")) + " [" + evalIdOf(rec) + "]";
        const rep = apiPost.last || {};
        if (!edit && rep.emailed) msg.textContent += " " + t("emailed_agent", { n: rec.agent });
        else if (!edit && rep.emailNote) msg.textContent += " " + t("email_failed", { e: rep.emailNote });
        else if (!edit && how === "saved" && mailMode() === "auto" && mailable(rec) && rep.emailNote === "" && !(roster.emails || {})[rec.agent]) msg.textContent += " " + t("no_email_hint", { n: rec.agent });
      } catch (e) {
        msg.className = "msg err"; msg.textContent = t("save_failed", { e: e.message });
        toast("err", msg.textContent);
        download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      }
    } else {
      download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      msg.className = "msg ok"; msg.textContent = t("saved_local") + " [" + evalIdOf(rec) + "]";
    }
    current = { form: current.form, answers: blankAnswers(current.form) };
    store(LS_DRAFT, null);
    const keep = msg.textContent, cls = msg.className;
    renderEvaluate(); msg.textContent = keep; msg.className = cls;
    if (cls.includes("ok")) toast("ok", "✓ " + keep);
    if (!edit && mailMode() !== "auto" && mailable(rec)) {
      const cta = h("div", { class: "mail-cta" }, h("b", { text: "📧 " + t("mail_cta", { n: rec.agent || "" }) }), h("div", { class: "hint", text: t("mail_cta_hint") }), outlookButton(rec));
      msg.after(cta);
      cta.querySelector("button").addEventListener("click", () => setTimeout(() => cta.remove(), 400));
    }
  }

  // Same interaction already evaluated (any evaluator, not a calibration sample or test):
  // same Odoo ref or customer number (last 9 digits), and the same call day when both have one.
  const phoneTail = (p) => normPhone(p).replace(/\D/g, "").slice(-9);
  function sameCallMatches(x) {
    const ref = String(x.odooRef || "").trim().toLowerCase(), tail = phoneTail(x.phone), day = String(x.interactionDate || "").slice(0, 10);
    if (!ref && tail.length < 7) return [];
    return allRecords().filter((r) => r.id !== x.id && !r.sampleRef && !r.test && r.form === x.form &&
      ((ref && String(r.odooRef || "").trim().toLowerCase() === ref) || (tail.length >= 7 && phoneTail(r.phone) === tail)) &&
      (!day || !r.interactionDate || String(r.interactionDate).slice(0, 10) === day));
  }
  function findDuplicate(rec) {
    if (rec.sampleRef || rec.test) return null;
    return sameCallMatches(rec)[0] || null;
  }
  // Shown while the evaluator fills the call details, before any time goes into scoring.
  function renderDupWarn() {
    const box = $("#dupWarn"); if (!box) return;
    const hd = current.answers.header;
    const list = current.edit || hd.test || purposeOf(hd) === "calibration" ? [] : sameCallMatches({ ...hd, form: current.form, id: current.edit && current.edit.id });
    box.hidden = !list.length;
    if (list.length) box.textContent = t("dup_early") + "\n" + list.slice(0, 3).map((r) =>
      "• " + (r.evaluator || "–") + " · " + (r.agent || "–") + " · " + whenText(r) + " · " + pct(r.final)).join("\n");
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

  let sheetLoaded = false, lastSheetLoad = 0;
  // Pull the latest saves from the sheet (at most every 30 s) so the same-call warning sees other evaluators' work.
  let dupTimer = null;
  function checkSameCall() {
    renderDupWarn();
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      if (connected() && Date.now() - lastSheetLoad > 30000) { await loadFromSheet(); }
      renderDupWarn();
    }, 800);
  }
  async function loadFromSheet() {
    const say = (t) => $$(".loadInfo").forEach((i) => (i.textContent = t));
    if (!connected()) { say(t("not_connected_load")); return; }
    say(t("loading"));
    try {
      // After a full load, ask only for what changed (10-minute overlap for clock differences); a full load every 15 minutes.
      const full = !sheetLoaded || !loadFromSheet.serverNow || Date.now() - loadFromSheet.lastFull > 15 * 60000;
      const j = await apiGet(full ? {} : { since: loadFromSheet.serverNow - 10 * 60000 });
      if (j.now) loadFromSheet.serverNow = j.now;
      if (full || !j.partial) loadFromSheet.lastFull = Date.now();
      forgetDeleted(j.deleted); addRecords(j.records); sheetLoaded = true; lastSheetLoad = Date.now();
      say(t("loaded_n", { n: j.partial ? loaded.size : j.records.length, t: new Date().toLocaleTimeString() }));
      refreshViews();
    } catch (e) { say(t("load_failed", { e: e.message })); }
  }

  // Keep what's on screen up to date: other evaluators' saves show up within a minute
  // (calibration differences, dashboard, evaluations list) without reloading the page.
  setInterval(() => {
    const view = ($("nav button.active") || {}).dataset;
    if (!connected() || document.visibilityState !== "visible" || !view || view.view === "evaluate" || view.view === "settings") return;
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest(".view.active input, .view.active textarea");
    if (typing) return;
    loadFromSheet();
  }, 60000);
  function refreshViews() { renderMyWork(); renderCalibration(); renderDashboard(); renderReports(); renderCertification(); renderGuide(); renderRecords(); renderKb(); }

  // ---------- saved evaluations: find, open to correct, delete ----------
  // Phone numbers are wrapped in a left-to-right isolate so "+971…" never flips in Arabic.
  const refText = (r) => [r.phone ? "\u2066" + r.phone + "\u2069" : "", r.odooRef ? "Odoo " + r.odooRef : ""].filter(Boolean).join(" · ");
  // Result email sent from the evaluator's own work mailbox (Outlook): the tool opens a ready email,
  // the evaluator checks it and presses Send, so it goes out from their address and stays in their Sent items.
  const mailable = (r) => ["live", "certcall", "coaching"].includes(purposeOf(r)) && !r.test;
  // Result emails follow the screen language (Arabic or English).
  const tx = (ar, en) => (lang === "en" ? en : ar);
  // Score split by category for result emails: Part A (non-critical) met/applicable, then each critical bucket with % view.
  function catBreakdown(r) {
    const its = r.items || [];
    const nc = its.filter((i) => i.kind === "NC" && i.result && i.result !== "N/A");
    const lines = [tx("- البنود العادية (NC): ", "- Non-critical (NC): ") + pct(r.ncScore) + " (" + nc.filter((i) => i.result === "Met").length + tx(" من ", " of ") + nc.length + ")"];
    [["CC", "دقة الكومبلاينس (CC)", "Compliance accuracy (CC)", r.cc], ["EU", "دقة العميل (EU)", "End-user accuracy (EU)", r.eu], ["BC", "دقة البيزنس (BC)", "Business critical accuracy (BC)", r.bc]].forEach(([k, ar, en, scoreVal]) => {
      const list = its.filter((i) => i.kind === k && i.result && i.result !== "N/A"), errs = list.filter((i) => i.result === "Error").length;
      if (!list.length) {
        lines.push("- " + tx(ar, en) + ": " + tx("مش منطبق", "not applicable"));
      } else {
        const scorePct = pct(scoreVal !== undefined && scoreVal !== null && scoreVal !== "" ? scoreVal : (errs ? 0 : 1));
        const detail = errs ? (tx("✗ ", "✗ ") + errs + tx(errs === 1 ? " غلطة" : " أخطاء", errs === 1 ? " error" : " errors")) : (tx("✓ مفيش أخطاء", "✓ no errors"));
        lines.push("- " + tx(ar, en) + ": " + scorePct + " (" + detail + ")");
      }
    });
    return lines;
  }
  const resultCc = () => String(teamCfg.ccResults || "").split(/[,;\s]+/).filter((x) => /@/.test(x));
  function mailText(r) {
    const coaching = purposeOf(r) === "coaching";
    const form = r.form === "whatsapp" ? tx("واتساب", "WhatsApp chat") : tx("مكالمة", "call");
    const when = whenText(r);
    const phone = String(r.phone || "").replace(/\D/g, "");
    const ref = [r.odooRef ? "Odoo: " + r.odooRef : "", phone ? tx("رقم العميل بينتهي بـ ", "customer number ending ") + phone.slice(-4) : ""].filter(Boolean).join(" · ");
    const missed = (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error");
    const fb = r.feedback || {};
    const cert = purposeOf(r) === "certcall";
    const pass = r.result === "Pass", isWow = r.callTag === "wow", isGood = r.callTag === "good";
    const subjPrefix = (isWow ? tx("🌟🏆 WOW CALL! – ", "🌟🏆 WOW CALL! – ") : isGood ? tx("👍 مكالمة مميزة – ", "👍 Good Call – ") : "") +
      (coaching ? tx("💡 فيدباك – ", "💡 Feedback – ") : cert ? tx("تقييم السرتيفيكيشن – ", "Certification evaluation – ") : tx("تقييم الجودة – ", "Quality evaluation – "));
    const statusTag = coaching ? "" : (isWow ? " – 🌟 Passed (" + pct(r.final) + ")" : pass ? " – ✅ Passed (" + pct(r.final) + ")" : " – ⚠️ Failed (" + pct(r.final) + ")");
    const subject = subjPrefix + form + " – " + when.slice(0, 10) + statusTag + " [" + evalIdOf(r) + "]";
    const topBanner = isWow
      ? tx("🌟🏆 WOW CALL! Outstanding Performance — مكالمة استثنائية! (" + pct(r.final) + ")\n🎉 Congratulations! المكالمة دي مش بس عدّت بنجاح، دي اتختارت كـ \"مكالمة Wow\" ومثال مميز يُحتذى به في مكتبة التدريب الخاصة بالفريق. فخورين جداً بأدائك الاحترافي! 👏", "🌟🏆 WOW CALL! Outstanding Performance (" + pct(r.final) + ")\n🎉 Congratulations! This call was selected as a standout \"Wow Call\" for the team's training library. Proud of your great work! 👏")
      : coaching
        ? tx("💡 فيدباك تدريبي (Coaching – غير محسوب في السكور)", "💡 Coaching feedback (not counted in your score)")
        : pass && isGood
          ? tx("🎉👍 Congratulations! مكالمة كويسة جداً وعدّيت التقييم بنجاح (PASSED – " + pct(r.final) + ") — المكالمة دي اتضافت كمثال كويس في مكتبة التدريب، استمر على نفس المستوى!", "🎉👍 Congratulations! Very good call & passed (PASSED – " + pct(r.final) + ") — Added as a good example to the training library, keep it up!")
          : pass
            ? tx("🎉 Congratulations! مبروك، عدّيت التقييم بنجاح (PASSED – " + pct(r.final) + ") — أداء كويس والتزام بمعايير الجودة، كمّل على نفس المستوى!", "🎉 Congratulations! You passed this evaluation (PASSED – " + pct(r.final) + ") — Good job, keep it up!")
            : tx("⚠️ التقييم لم يجتز الحد المطلوب (FAILED – " + pct(r.final) + ") — " + (r.critical ? "بسبب وجود خطأ حرج (Critical Error). راجع النقاط بالأسفل عشان تتفاداها المرة الجاية." : "السكور أقل من نسبة النجاح المطلوبة. راجع البنود اللي محتاجة تظبيط بالأسفل."), "⚠️ Evaluation did not pass (FAILED – " + pct(r.final) + ") — " + (r.critical ? "Due to a critical error. Please review the items below for next time." : "Score is below the passing threshold. Please review the items below."));
    const lines = [topBanner, "", tx("أهلاً ", "Hi ") + (r.agent || "") + tx("،", ","), "",
      (coaching ? tx("ده فيدباك (مش محسوب في تقييمك) على ", "This is feedback (not counted in your score) on the ") : cert ? tx("ده تقييم السرتيفيكيشن لـ", "This is the certification evaluation of the ") : tx("ده تقييم الجودة لـ", "This is the quality evaluation of the ")) +
        form + tx(" بتاريخ ", " on ") + when + (ref ? " (" + ref + ")" : "") + ".", "",
      tx("رقم التقييم (Evaluation ID): ", "Evaluation ID: ") + evalIdOf(r),
      tx("النتيجة النهائية: ", "Final score: ") + pct(r.final) + " – " + (r.result === "Pass" ? tx("ناجح", "Pass") : tx("محتاج تحسين", "Needs improvement")),
      ...(isWow ? [tx("تصنيف المكالمة: 🌟🏆 مكالمة Wow (مثال مميز في مكتبة التدريب)", "Call tag: 🌟🏆 Wow call (training library standout)")] : isGood ? [tx("تصنيف المكالمة: 👍 مكالمة كويسة جداً (مكتبة التدريب)", "Call tag: 👍 Very good call (training library)")] : []),
      ...(r.method === "sidebyside" ? [tx("طريقة التقييم: سايد باي سايد", "Evaluated: side by side")] : []),
      tx("دقة البنود الحرجة: ", "Critical accuracy: ") + (r.critical ? tx("0% (" + r.critical + (r.critical === 1 ? " غلطة)" : " أخطاء)"), "0% (" + r.critical + (r.critical === 1 ? " error)" : " errors)")) : tx("100% (مفيش أخطاء)", "100% (no errors)")), "",
      tx("تقسيم التقييم:", "Score by category:"), ...catBreakdown(r)];
    if (missed.length) lines.push("", tx("البنود اللي محتاجة تتظبط:", "Items to work on:"), ...missed.map((i) => "- " + i.text + (i.comment ? " – " + i.comment : "")));
    if (fb.strengths) lines.push("", tx("نقاط القوة:", "Strengths:"), fb.strengths);
    if (fb.improve) lines.push("", tx("محتاج تحسين:", "Areas to improve:"), fb.improve);
    if (fb.coaching) lines.push("", tx("نصيحة للمرة الجاية:", "Tip for next time:"), fb.coaching);
    lines.push("", tx("لو عندك أي سؤال على التقييم كلّمني.", "If you have any question about this evaluation, let me know."), "", (r.evaluator ? r.evaluator + " – " : "") + tx("فريق الجودة", "Quality Team"));
    return { subject, body: lines.join("\n") };
  }
  function composeMail(to, subject, body, cc) {
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    if (mailMode() === "outlookweb") window.open("https://outlook.office.com/mail/deeplink/compose?" + q({ to, cc, subject, body }), "_blank");
    else location.href = "mailto:" + encodeURIComponent(to).replace(/%40/g, "@").replace(/%2C/g, ",") + "?" + q({ cc, subject, body });
  }
  // Copy an email (subject + body) to paste anywhere, for when the mail button can't open a mail app.
  async function copyMail(m, btn) {
    const text = (m.cc ? "CC: " + m.cc + "\n" : "") + tx("الموضوع: ", "Subject: ") + m.subject + "\n\n" + m.body;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (!ok) { prompt(t("copy_manual"), text); return; }
    const was = btn.textContent; btn.textContent = t("copied"); setTimeout(() => (btn.textContent = was), 1500);
  }
  const mailButtons = (make, to, label) => [
    h("button", { type: "button", class: "ghost", text: t(label), onclick: () => { const m = make(); composeMail(to(), m.subject, m.body); } }),
    h("button", { type: "button", class: "ghost", text: t("copy_mail"), onclick: (e) => copyMail(make(), e.currentTarget) })];
  function openOutlook(r) {
    const { subject, body } = mailText(r);
    composeMail((roster.emails || {})[r.agent] || "", subject, body, resultCc().join(","));
    markMailed(r);
  }
  // Result emails sent from the evaluator's own Outlook: the tool can't see the Send press, so opening the ready
  // email (or "Sent") marks the evaluation as emailed. Records still waiting are flagged so none is forgotten.
  const mailPending = (r) => mailable(r) && !!r.mailMode && r.mailMode !== "auto" && !r.mailedAt;
  async function markMailed(r) {
    if (r.mailedAt) return;
    const rec = Object.assign({}, r, { mailedAt: new Date().toISOString() });
    loaded.set(rec.id, rec);
    const local = store(LS_EVALS) || [];
    if (local.some((x) => x.id === rec.id)) store(LS_EVALS, local.map((x) => (x.id === rec.id ? rec : x)));
    if (connected() && canChange(rec)) { try { await apiPost({ action: "updateRecord", record: rec }); } catch (e) { /* stays flagged on other devices */ } }
    refreshViews();
  }
  const isCoached = (r) => !!(r && (r.coached || (r.feedback && r.feedback.coached) || r.coachedAt));
  const needsCoaching = (r) => !!(r && !r.test && ["live", "certcall"].includes(purposeOf(r)) && r.result === "Fail");
  const coachSlaHours = () => Number(teamCfg.coachingSlaHours) || 48;
  function coachHours(r) {
    const start = new Date(r.savedAt || (r.evalDate ? r.evalDate + "T12:00:00" : "")).getTime();
    const end = isCoached(r) && (r.coachedAt || (r.feedback && r.feedback.coachedAt)) ? new Date(r.coachedAt || r.feedback.coachedAt).getTime() : Date.now();
    return isNaN(start) || isNaN(end) ? null : Math.max(0, Math.round((end - start) / 36e5));
  }
  async function markCoached(r) {
    if (isCoached(r)) return;
    const now = new Date().toISOString(), by = settings.who || settings.evaluator || r.evaluator || "";
    const fb = Object.assign({}, r.feedback || {}, { coached: true, coachedAt: now });
    const rec = Object.assign({}, r, { coached: true, coachedAt: now, coachedBy: by, feedback: fb, editedAt: now, editedBy: by });
    loaded.set(rec.id, rec);
    const local = store(LS_EVALS) || [];
    if (local.some((x) => x.id === rec.id)) store(LS_EVALS, local.map((x) => (x.id === rec.id ? rec : x)));
    if (connected() && canChange(rec)) { try { await apiPost({ action: "updateRecord", record: rec }); } catch (e) { /* stays local until synced */ } }
    refreshViews();
  }
  function coachBadge(r) {
    const sla = coachSlaHours(), hrs = coachHours(r);
    if (isCoached(r)) {
      const slaTxt = needsCoaching(r) && hrs !== null ? " · " + t(hrs <= sla ? "coach_within_sla" : "coach_late_sla", { h: hrs }) : "";
      return h("div", { class: "meta ok-txt", text: t("coach_done_tag") + slaTxt });
    }
    if (!needsCoaching(r)) return null;
    const over = hrs !== null && hrs > sla;
    return h("div", { class: "meta " + (over ? "bad-txt" : "warn"), text: over ? t("coach_overdue_tag", { h: sla }) : t("coach_pending_tag") });
  }
  const outlookButton = (r, small) => h("span", { class: "mail-btns" },
    h("button", { type: "button", class: small ? "ghost" : "", text: t(small ? "mail_btn_short" : "mail_btn"), onclick: () => openOutlook(r) }),
    h("button", { type: "button", class: "ghost", text: t("copy_mail"), onclick: (e) => copyMail(Object.assign(mailText(r), { cc: resultCc().join(", ") }), e.currentTarget) }));
  const whenText = (r) => (r.interactionDate || r.evalDate || "").replace("T", " ");
  // The day of the call (falls back to the evaluation day for role-plays and old records).
  const callDay = (r) => String(r.interactionDate || r.evalDate || "").slice(0, 10);
  const purposeTag = (r) => t("p_" + purposeOf(r)) + (r.test ? " · " + t("test_tag") : "");
  // Turn "test" evaluations back into real ones (saved through the normal update, so the sheet and item tabs follow).
  async function unmarkTest(list, btn) {
    btn.disabled = true; let ok = 0;
    for (const r of list) {
      const rec = Object.assign({}, r, { test: false, editedAt: new Date().toISOString(), editedBy: settings.evaluator || r.evaluator });
      try { await apiPost({ action: "updateRecord", record: rec }); } catch (e) { toast("err", t("save_failed", { e: e.message })); break; }
      loaded.set(rec.id, rec);
      const local = (store(LS_EVALS) || []).filter((x) => x.id !== rec.id); local.push(rec); store(LS_EVALS, local);
      ok++; btn.textContent = ok + " / " + list.length;
    }
    if (ok) toast("ok", "✓ " + t("test_fix_done", { n: ok }));
    refreshViews();
  }
  function renderRecords() {
    const out = $("#recOut"); if (!out) return;
    const all = allRecords();
    fillSelect($("#recEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#recAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    if ($("#recSearch") && /@/.test($("#recSearch").value)) $("#recSearch").value = "";
    const f = { ev: $("#recEvaluator").value, ag: $("#recAgent").value, p: $("#recPurpose").value, tag: $("#recTag").value, m: $("#recMethod").value, sel: $("#recSel").value, q: $("#recSearch").value.trim().toLowerCase() };
    const qd = f.q.replace(/[^\d]/g, "");
    const recs = all.filter((r) => (!f.ev || r.evaluator === f.ev) && (!f.ag || r.agent === f.ag) &&
      (!f.p || (f.p === "test" ? r.test : !r.test && purposeOf(r) === f.p)) && (!f.tag || r.callTag === f.tag) && (!f.m || (r.method || "recording") === f.m) && (!f.sel || (f.sel === "unsent" ? mailPending(r) : f.sel === "uncoached" ? (needsCoaching(r) && !isCoached(r)) : f.sel === "coached" ? isCoached(r) : selectionOf(r) === f.sel)) &&
      (!f.q || [evalIdOf(r), r.id, r.odooRef, r.sampleRef, r.agent, r.evaluator].some((x) => String(x || "").toLowerCase().includes(f.q)) || (qd.length >= 4 && normPhone(r.phone).includes(qd))))
      .sort((a, b) => whenText(b).localeCompare(whenText(a)));
    out.innerHTML = ""; lastLists.records = recs;
    const unsent = all.filter((r) => mailPending(r) && (isOwner() || r.evaluator === settings.evaluator));
    if (unsent.length && f.sel !== "unsent") out.append(h("div", { class: "msg err" }, t("mail_unsent_banner", { n: unsent.length }), " ",
      h("button", { type: "button", text: t("mail_unsent_show"), onclick: () => { $("#recSel").value = "unsent"; renderRecords(); } })));
    if (!recs.length) { out.append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") })); return; }
    const fixable = f.p === "test" && connected() ? recs.filter((r) => r.test && canChange(r)) : [];
    if (fixable.length) out.append(h("div", { class: "msg" }, t("test_fix_hint", { n: fixable.length }), " ",
      h("button", { type: "button", text: t("test_fix_btn", { n: fixable.length }), onclick: (e) => { if (confirm(t("test_fix_confirm", { n: fixable.length }))) unmarkTest(fixable, e.currentTarget); } })));
    const tbl = h("table", { class: "rec-table" }, h("tr", {}, ["", "c_when", "c_agent", "evaluator", "f_form", "h_type", "c_purpose", "c_ref", "final"].map((k) => h("th", { text: k ? t(k) : "" }))));
    recs.slice(0, 300).forEach((r) => tbl.append(h("tr", {},
      h("td", { class: "actions" }, canChange(r) ? h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }) : null,
        mailable(r) ? outlookButton(r, true) : null,
        mailPending(r) && canChange(r) ? h("button", { type: "button", class: "ghost", title: t("mail_mark_hint"), text: t("mail_mark"), onclick: () => markMailed(r) }) : null,
        !isCoached(r) && !r.test && ["live", "certcall", "coaching"].includes(purposeOf(r)) && canChange(r) ? h("button", { type: "button", class: "ghost", text: t("coach_btn"), onclick: () => markCoached(r) }) : null,
        r.test && canChange(r) && connected() ? h("button", { type: "button", class: "ghost", text: t("test_unmark"), onclick: (e) => unmarkTest([r], e.currentTarget) }) : null,
        canChange(r) ? h("button", { type: "button", class: "ghost", text: t("del"), onclick: () => deleteRecord(r) }) : null),
      h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), h("div", { class: "meta eval-id-tag", title: t("c_eval_id"), text: evalIdOf(r), onclick: () => { navigator.clipboard && navigator.clipboard.writeText(evalIdOf(r)); toast("ok", t("eval_id_copied", { id: evalIdOf(r) })); } })), h("td", { text: r.agent || "–" }), h("td", { text: r.evaluator || "–" }),
      h("td", { text: formName(r.form) }), h("td", { text: typeLabel(r.form, r.type || "") || "–" }),
      h("td", {}, h("span", { class: "pill " + (r.test ? "na" : purposeOf(r) === "live" ? "good" : "info"), text: purposeTag(r) }), r.callTag ? h("span", { class: "pill tag-" + r.callTag, text: t("tag_" + r.callTag) }) : null, r.method === "sidebyside" ? h("div", { class: "meta", text: t("m_sidebyside") }) : null, selectionOf(r) === "targeted" ? h("div", { class: "meta", text: t("sel_targeted") }) : null, coachBadge(r), mailPending(r) ? h("div", { class: "meta warn", text: "✉ " + t("mail_pending") }) : null, pickTrail(r) ? h("div", { class: "meta warn", title: pickTrail(r), text: "🎲 " + t("pick_repicked", { n: r.pickLog.length - 1 }) }) : null, r.sampleRef ? h("div", { class: "meta", text: r.sampleRef }) : null),
      h("td", { dir: "ltr", text: refText(r) || "–" }),
      h("td", { class: "num" }, h("span", { class: "pill " + (r.result === "Pass" ? "good" : "bad"), text: pct(r.final) })))));
    out.append(tbl);
    if (recs.length > 300) out.append(h("p", { class: "hint", text: t("rec_more", { n: recs.length }) }));
  }

  const editChanged = () => !!(current.edit && current.edit.orig &&
    current.edit.orig !== JSON.stringify(current.answers.header) + JSON.stringify(current.answers.nc) + JSON.stringify(current.answers.crit) + JSON.stringify(current.answers.feedback));
  function openRecord(r) {
    const d = F.forms[r.form];
    const nc = r.items.filter((x) => x.kind === "NC"), cr = r.items.filter((x) => x.kind !== "NC");
    if (nc.length !== d.nc.length || cr.length !== d.crit.length) { alert(t("edit_mismatch")); return; }
    if (((dirty() && !current.edit) || editChanged()) && !confirm(t("switch_confirm"))) return;
    const header = {};
    for (const [k] of HEADER) if (r[k] !== undefined) header[k] = r[k];
    Object.assign(header, { purpose: purposeOf(r), test: !!r.test, sampleRef: r.sampleRef || "", rolePlay: !!r.rolePlay, duration: r.duration || "" });
    const pick = (x) => ({ result: x.result || "", evidence: x.evidence || "", comment: x.comment || "" });
    current = { form: r.form, edit: { id: r.id, evalId: evalIdOf(r), savedAt: r.savedAt },
      answers: { header, nc: nc.map(pick), crit: cr.map(pick), feedback: Object.assign({ strengths: "", improve: "", coaching: "", coached: !!(r.coached || (r.feedback && r.feedback.coached)), coachedAt: r.coachedAt || (r.feedback && r.feedback.coachedAt) || "" }, r.feedback), feedbackEdited: { strengths: true, improve: true, coaching: true } } };
    current.edit.orig = JSON.stringify(current.answers.header) + JSON.stringify(current.answers.nc) + JSON.stringify(current.answers.crit) + JSON.stringify(current.answers.feedback);
    saveDraft(); renderEvaluate();
    $('nav button[data-view="evaluate"]').click(); window.scrollTo(0, 0);
  }

  async function deleteRecord(r) {
    if (!confirm(t("del_confirm", { a: r.agent || "–", d: whenText(r) }))) return;
    if (connected()) {
      try { await apiPost({ action: "deleteRecord", id: r.id, by: settings.who || settings.evaluator || "" }); }
      catch (e) { alert(t("del_failed", { e: e.message })); return; }
    }
    forgetDeleted([r.id]);
    if (current.edit && current.edit.id === r.id) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); }
    refreshViews();
  }

  function renderEditBanner() {
    const b = $("#editBanner"); if (!b) return;
    b.hidden = !current.edit; b.innerHTML = "";
    if (!current.edit) return;
    b.append(h("span", { text: t("editing_banner", { a: current.answers.header.agent || "–", d: whenText(current.answers.header) }) + " · [" + evalIdOf(current.edit) + "]" }),
      h("button", { type: "button", class: "ghost", text: t("cancel_edit"), onclick: () => {
        if (editChanged() && !confirm(t("discard_edit"))) return;
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
    // Odoo stages and the tags the client recommends for each, used to judge the Odoo items.
    const od = F.odoo;
    if (od) {
      const tagText = (n) => { const x = od.tags.find((g) => g.name === n); return x ? (lang === "ar" ? x.ar : x.en) : ""; };
      out.append(h("h3", { text: t("odoo_head") }), h("p", { class: "hint", text: t("odoo_hint") }),
        h("table", { class: "odoo-tags" }, h("tr", {}, h("th", { text: t("odoo_stage") }), h("th", { text: t("odoo_tags") })),
          ...od.stages.map((st) => h("tr", {}, h("td", {}, h("b", { dir: "ltr", text: st.name }), lang === "ar" ? h("div", { class: "meta", text: st.ar }) : null),
            h("td", {}, st.tags.length ? st.tags.map((n) => h("span", { class: "tag", dir: "ltr", title: tagText(n), text: n })) : h("span", { class: "meta", text: t("odoo_no_tags") }))))),
        h("h3", { text: t("odoo_tags_head") }),
        h("table", {}, h("tr", {}, h("th", { text: t("odoo_tag") }), h("th", { text: t("odoo_meaning") })),
          ...od.tags.map((g) => h("tr", {}, h("td", {}, h("b", { dir: "ltr", text: g.name })), h("td", { text: lang === "ar" ? g.ar : g.en })))));
    }
  }

  // Item definition for a stored item ("4" = NC item 4, "C3" = critical item 3).
  function itemDef(form, it) {
    const f = F.forms[form]; if (!f) return null;
    return it.kind === "NC" ? f.nc[+it.id - 1] : f.crit[+String(it.id).slice(1) - 1];
  }

  // ---------- calibration ----------
  // Calibration against the reference (expert) evaluator, following the COPC CX Standard approach
  // (monitors calibrated against a standard, critical-error accuracy checked per category: customer / business / compliance)
  // and the usual industry variance bands (no official COPC number is published):
  //   calibrated  = NC gap ≤ 5 points, ≥ 90% of items the same, every critical item the same, same pass/fail;
  //   close       = the same except an NC gap of 5–10 points: written feedback, no recalibration;
  //   recalibrate = NC gap over 10 points, under 90% of items, any critical item different, or a different pass/fail.
  const CAL = { gap: 0.05, watch: 0.10, agree: 0.9 };
  // Other evaluators' scores of the same call: same customer number, same Odoo ref, or same agent and call time.
  function sameInteraction(group) {
    const first = group[0], have = new Set(group.map((r) => r.evaluator));
    // Any record in the sample can identify the call: one evaluator may have typed the Odoo link or phone, another not.
    const phones = new Set(group.map((r) => normPhone(r.phone)).filter((x) => x.length >= 6));
    const odoos = new Set(group.map((r) => String(r.odooRef || "").trim()).filter(Boolean));
    const whens = new Set(group.filter((r) => r.agent && whenText(r)).map((r) => r.agent + "|" + whenText(r)));
    const odooSame = (r) => odoos.has(String(r.odooRef || "").trim());
    const best = new Map();
    for (const r of allRecords()) {
      if (r.form !== first.form || !r.evaluator || have.has(r.evaluator)) continue;
      // A copy saved with the test switch on still counts only when its Odoo link proves it is the same call;
      // the phone alone can be a practice run on another call with the same customer.
      const sameTest = !!r.test === !!first.test;
      const ok = odooSame(r) || (sameTest && (phones.has(normPhone(r.phone)) || whens.has(r.agent + "|" + whenText(r))));
      if (!ok) continue;
      const b = best.get(r.evaluator);
      if (!b || stamp(r) > stamp(b)) best.set(r.evaluator, r);
    }
    return [...best.values()];
  }
  function calStats(r, ref, agreed) {
    const gap = r.ncScore === null || r.ncScore === undefined || agreed === null || agreed === undefined ? null : Math.abs(r.ncScore - agreed);
    if (!ref || r === ref) return { gap, ok: gap !== null && gap <= CAL.gap, level: gap !== null && gap <= CAL.gap ? "ok" : "fail", diffs: [] };
    const diffs = [];
    let same = 0, critSame = true;
    ref.items.forEach((it, idx) => {
      const mine = (r.items[idx] || {}).result || "", theirs = it.result || "";
      if (mine === theirs) same++;
      else { diffs.push(idx); if (it.kind !== "NC") critSame = false; }
    });
    const agree = ref.items.length ? same / ref.items.length : null;
    const decisionSame = r.result === ref.result;
    const basics = gap !== null && agree >= CAL.agree && critSame && decisionSame;
    const level = basics && gap <= CAL.gap ? "ok" : basics && gap <= CAL.watch ? "watch" : "fail";
    // Critical-error accuracy per category, the way COPC measures it: same verdict (error / no error) in each bucket.
    const buckets = {};
    ref.items.forEach((it, idx) => {
      if (it.kind === "NC") return;
      const b = (itemDef(ref.form, it) || {}).bucket || "?";
      const err = (x) => (x || {}).result === "Error";
      buckets[b] = buckets[b] || { ref: false, mine: false };
      buckets[b].ref = buckets[b].ref || err(it); buckets[b].mine = buckets[b].mine || err(r.items[idx]);
    });
    return { gap, agree, critSame, decisionSame, diffs, buckets, level, ok: level === "ok" };
  }
  const RESULT_WORD = () => tx({ Met: "اتعمل", "Not met": "ماتعملش", "N/A": "لا ينطبق", "No error": "مفيش غلط", Error: "غلط حرج", "": "مش متقيّم" },
    { Met: "Met", "Not met": "Not met", "N/A": "N/A", "No error": "No error", Error: "Error", "": "not scored" });
  function mailItemName(form, it) {
    const d = itemDef(form, it), a = lang === "en" ? {} : (d && d.ar) || {};
    return it.kind === "NC" ? "N" + it.id + " " + (a.label || (d && d.label) || it.text) : it.id + " " + (a.item || (d && d.item) || it.text);
  }
  function calSampleLine(g, sample) {
    const r = g[0], form = r.form === "whatsapp" ? tx("واتساب", "WhatsApp chat") : tx("مكالمة", "call");
    return tx("عينة ", "sample ") + sample + " (" + form + (r.agent ? tx(" للإيجنت ", " by ") + r.agent : "") + (whenText(r) ? tx(" بتاريخ ", " on ") + whenText(r) : "") + ")";
  }
  // Coaching session details typed on the Calibration page, written into the emails so the plan is documented.
  function calSession() {
    const v = ($("#calSession") || {}).value || "", kind = ($("#calSessionKind") || {}).value || "one";
    if (!v) return null;
    const d = new Date(v);
    const when = isNaN(d) ? v.replace("T", " ") : d.toLocaleDateString(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" }) +
      tx(" الساعة ", " at ") + v.slice(11, 16);
    return { when, kind };
  }
  function calMail(r, ref, g, s, sample) {
    const p = (x) => (Math.round(x * 1000) / 10);
    const mark = (ok) => (ok ? "✔" : "✘");
    const W = RESULT_WORD(), ses = calSession();
    const bucket = { EU: tx("أخطاء العميل (EU)", "customer (EU)"), BC: tx("أخطاء البزنس (BC)", "business (BC)"), CC: tx("أخطاء الكومبلاينس (CC)", "compliance (CC)") };
    const levelWord = { ok: tx("معاير ✔", "Calibrated ✔"), watch: tx("قريب من المعيار (ملاحظات بس، من غير إعادة)", "Close (written feedback only, no recalibration)"), fail: tx("محتاج إعادة كاليبريشن", "Needs recalibration") };
    const subject = tx("نتيجة الكاليبريشن – عينة ", "Calibration result – sample ") + sample + " – " +
      { ok: tx("معاير", "Calibrated"), watch: tx("قريب من المعيار", "Close"), fail: tx("محتاج إعادة كاليبريشن", "Needs recalibration") }[s.level];
    const lines = [tx("أهلاً ", "Hi ") + (r.evaluator || "") + tx("،", ","), "",
      tx("دي نتيجتك في الكاليبريشن على ", "Here is your calibration result on ") + calSampleLine(g, sample) + tx("، مقارنةً بتقييم المرجع (", ", compared with the reference evaluation (") + ref.evaluator + ").", "",
      tx("- سكور البنود العادية (NC): ", "- Non-critical (NC) score: ") + pct(r.ncScore) + tx(" مقابل ", " vs ") + pct(ref.ncScore) + tx(" عند المرجع، يعني فرق ", " for the reference, a gap of ") + (s.gap === null ? "–" : p(s.gap)) + tx(" نقطة ", " points ") +
        (s.gap !== null && s.gap <= CAL.gap ? "✔" : s.gap !== null && s.gap <= CAL.watch ? tx("(بين " + p(CAL.gap) + " و" + p(CAL.watch) + "، قريب)", "(between " + p(CAL.gap) + " and " + p(CAL.watch) + ", close)") : "✘"),
      tx("- الاتفاق مع المرجع على البنود: ", "- Items scored the same as the reference: ") + pct(s.agree) + tx(" (المطلوب " + p(CAL.agree) + "% أو أكتر) ", " (target " + p(CAL.agree) + "% or more) ") + mark(s.agree >= CAL.agree),
      tx("- دقة الأخطاء الحرجة: ", "- Critical error accuracy: ") + ["EU", "BC", "CC"].filter((b) => s.buckets[b]).map((b) => bucket[b] + " " + mark(s.buckets[b].ref === s.buckets[b].mine)).join(tx("، ", ", ")) +
        (s.critSame ? "" : tx(" – فيه بند حرج متقيّم مختلف عن المرجع", " – a critical item was scored differently from the reference")),
      tx("- قرار ناجح / مش ناجح: ", "- Pass / fail decision: ") + (s.decisionSame ? tx("نفس قرار المرجع ✔", "same as the reference ✔") : tx("مختلف عن قرار المرجع ✘", "different from the reference ✘")), "",
      tx("النتيجة: ", "Result: ") + levelWord[s.level]];
    if (s.diffs.length) {
      lines.push("", tx("البنود اللي اختلفنا فيها:", "Items we scored differently:"));
      s.diffs.forEach((idx) => {
        const it = ref.items[idx], mine = r.items[idx] || {};
        lines.push("- " + mailItemName(ref.form, it) + tx(": تقييمك ", ": you scored ") + W[mine.result || ""] + tx("، والمرجع ", ", the reference ") + W[it.result || ""] + "." +
          (it.comment ? tx(" سبب المرجع: ", " Reference's reason: ") + it.comment : ""));
      });
      lines.push(tx("تقدر تراجع معنى كل بند وإمتى بيتحسب في تبويب \"دليل البنود\" في التول.", "You can check what each item means and when it applies in the \"Item guide\" tab of the tool."));
    }
    const sessionLine = ses ? (ses.kind === "group" ? tx("جلسة كوتشينج جماعية مع الفريق ", "Group coaching session with the team ") : tx("جلسة كوتشينج فردية ", "One-to-one coaching session ")) + ses.when +
      tx("، نسمع فيها التسجيل سوا ونتفق على حكم كل بند من اللي فوق.", ": we listen to the recording together and agree on each item above.")
      : tx("جلسة كوتشينج فردية 30 دقيقة نسمع فيها التسجيل سوا ونتفق على حكم كل بند من اللي فوق. هبعتلك ميعادها.", "A 30-minute one-to-one coaching session where we listen to the recording together and agree on each item above. I will send you the time.");
    if (s.level === "ok") lines.push("", tx("شغل ممتاز، تقييماتك ماشية مع المعيار.", "Great work, your scoring matches the standard.") + (s.diffs.length ? tx(" خلّي بالك بس من البنود اللي فوق.", " Just keep an eye on the items above.") : ""));
    else if (s.level === "watch") lines.push("", tx("المطلوب:", "Next steps:"),
      tx("1. راجع البنود اللي فوق في \"دليل البنود\" وطبّق الحكم ده من النهارده.", "1. Review the items above in the \"Item guide\" and apply this ruling from today."),
      ses && ses.kind === "group" ? tx("2. الجلسة الجماعية " + ses.when + " هنراجع فيها الأحكام دي، حضورك مهم.", "2. We will go over these rulings in the group session " + ses.when + "; please attend.")
        : tx("2. مش محتاج جلسة إعادة. هنتابع البنود دي في الكاليبريشن الجاي، ولو الفرق اتكرر هنعمل جلسة كوتشينج.", "2. No recalibration needed. We will follow these items in the next calibration; if the gap repeats we will hold a coaching session."));
    else lines.push("", tx("خطة الكوتشينج:", "Coaching plan:"), "1. " + sessionLine,
      tx("2. قبل الجلسة، راجع البنود دي في \"دليل البنود\" واكتب سبب تقييمك لكل بند.", "2. Before the session, review these items in the \"Item guide\" and note why you scored each one."),
      tx("3. بعد الجلسة، هتقيّم عينة كاليبريشن جديدة خلال أسبوع.", "3. After the session, you will score a new calibration sample within a week."),
      tx("4. لحد ما تعدّي الإعادة، هراجع معاك تقييماتك على البنود دي قبل ما توصل للإيجنتس.", "4. Until you pass it, I will review your scores on these items before they reach the agents."));
    lines.push("", tx("لو عندك أي سؤال على النتيجة كلّمني.", "If you have any question about the result, let me know."), "", ref.evaluator || "");
    return { subject, body: lines.join("\n") };
  }
  // One email to every evaluator on the sample: the agreed ruling on each item someone scored differently. No individual scores.
  function calRulingsMail(ref, g, sample) {
    const W = RESULT_WORD(), ses = calSession();
    const idxs = ref.items.map((_, idx) => idx).filter((idx) => g.some((r) => ((r.items[idx] || {}).result || "") !== (ref.items[idx].result || "")));
    const subject = tx("أحكام الكاليبريشن المتفق عليها – عينة ", "Agreed calibration rulings – sample ") + sample;
    const lines = [tx("أهلاً يا جماعة،", "Hi all,"), "", tx("دي الأحكام المتفق عليها في ", "These are the agreed rulings on ") + calSampleLine(g, sample) + tx(". من النهارده بنقيّم البنود دي بالشكل ده:", ". From today we score these items this way:"), ""];
    if (!idxs.length) lines.push(tx("كلنا اتفقنا على كل البنود، برافو.", "We all agreed on every item, well done."));
    idxs.forEach((idx) => {
      const it = ref.items[idx];
      lines.push("- " + mailItemName(ref.form, it) + ": " + W[it.result || ""] + (it.comment ? tx("، لأن ", ", because ") + it.comment : "") + ".");
    });
    if (ses) lines.push("", (ses.kind === "group" ? tx("جلسة الكوتشينج الجماعية: ", "Group coaching session: ") : tx("ميعاد الكوتشينج: ", "Coaching session: ")) + ses.when +
      tx("، هنسمع فيها التسجيل سوا ونتكلم على الأحكام دي.", ". We will listen to the recording together and go over these rulings."));
    lines.push("", tx("الأحكام دي هتتسجل في الـ Calibration Log. لو حد عنده اعتراض على حكم، يبعتلي قبل الكاليبريشن الجاي.", "These rulings go into the Calibration Log. If you disagree with one, send it to me before the next calibration."), "", ref.evaluator || "");
    return { subject, body: lines.join("\n") };
  }

  // Everyone who scored one calibration sample. Evaluators who scored the same call under another sample code,
  // or saved it as a normal evaluation, are found by the call details and compared too (newest save per evaluator).
  function calGroup(recs, sample) {
    const group = recs.filter((r) => r.sampleRef === sample);
    if (!group.length) return null;
    const matched = sameInteraction(group);
    group.push(...matched);
    group.sort((a, b) => (a.evaluator || "").localeCompare(b.evaluator || ""));
    return { g: group.filter((r) => r.form === group[0].form), matched, mixed: new Set(group.map((r) => r.form)).size > 1 };
  }
  // Samples of one calibration round share the date part of the code (CAL-20261012-1, -2, -3).
  const calRound = (sample) => (/\d{8}-\d+$/.test(sample) ? sample.replace(/-\d+$/, "") : "");
  // One email per evaluator for the whole round: every sample's result and differences, then one coaching plan
  // set by the worst sample.
  function calRoundMail(name, ref0, round, items) {
    const p = (x) => (Math.round(x * 1000) / 10);
    const W = RESULT_WORD(), ses = calSession();
    const rank = { ok: 0, watch: 1, fail: 2 }, worst = items.reduce((w, x) => (rank[x.s.level] > rank[w] ? x.s.level : w), "ok");
    const levelWord = { ok: tx("معاير ✔", "Calibrated ✔"), watch: tx("قريب من المعيار", "Close"), fail: tx("محتاج إعادة كاليبريشن", "Needs recalibration") };
    const subject = tx("نتيجة الكاليبريشن – ", "Calibration result – ") + round + " – " + levelWord[worst].replace(" ✔", "");
    const lines = [tx("أهلاً ", "Hi ") + name + tx("،", ","), "",
      tx("دي نتيجتك في جولة الكاليبريشن ", "Here is your result in calibration round ") + round + tx("، مقارنةً بتقييم المرجع (", ", compared with the reference evaluation (") + ref0 + ").", "",
      tx("الملخص:", "Summary:")];
    items.forEach(({ sample, s }) => lines.push("- " + sample + ": " + levelWord[s.level] + tx(" – فرق السكور ", " – score gap ") + (s.gap === null ? "–" : p(s.gap)) +
      tx(" نقطة، اتفاق البنود ", " points, items agreed ") + pct(s.agree) + (s.critSame ? "" : tx("، بند حرج مختلف", ", a critical item differs")) +
      (s.decisionSame ? "" : tx("، قرار ناجح/مش ناجح مختلف", ", different pass/fail decision"))));
    lines.push("", tx("النتيجة العامة: ", "Overall result: ") + levelWord[worst]);
    const withDiffs = items.filter((x) => x.s.diffs.length);
    if (withDiffs.length) {
      lines.push("", tx("البنود اللي اختلفنا فيها:", "Items we scored differently:"));
      withDiffs.forEach(({ sample, r, ref, g, s }) => {
        lines.push("", calSampleLine(g, sample) + ":");
        s.diffs.forEach((idx) => {
          const it = ref.items[idx], mine = r.items[idx] || {};
          lines.push("- " + mailItemName(ref.form, it) + tx(": تقييمك ", ": you scored ") + W[mine.result || ""] + tx("، والمرجع ", ", the reference ") + W[it.result || ""] + "." +
            (it.comment ? tx(" سبب المرجع: ", " Reference's reason: ") + it.comment : ""));
        });
      });
      lines.push("", tx("تقدر تراجع معنى كل بند وإمتى بيتحسب في تبويب \"دليل البنود\" في التول.", "You can check what each item means and when it applies in the \"Item guide\" tab of the tool."));
    }
    const sessionLine = ses ? (ses.kind === "group" ? tx("جلسة كوتشينج جماعية مع الفريق ", "Group coaching session with the team ") : tx("جلسة كوتشينج فردية ", "One-to-one coaching session ")) + ses.when +
      tx("، نسمع فيها التسجيلات سوا ونتفق على حكم كل بند من اللي فوق.", ": we listen to the recordings together and agree on each item above.")
      : tx("جلسة كوتشينج فردية 30 دقيقة نسمع فيها التسجيلات سوا ونتفق على حكم كل بند من اللي فوق. هبعتلك ميعادها.", "A 30-minute one-to-one coaching session where we listen to the recordings together and agree on each item above. I will send you the time.");
    if (worst === "ok") lines.push("", tx("شغل ممتاز، تقييماتك ماشية مع المعيار.", "Great work, your scoring matches the standard."));
    else if (worst === "watch") lines.push("", tx("المطلوب:", "Next steps:"),
      tx("1. راجع البنود اللي فوق في \"دليل البنود\" وطبّق الحكم ده من النهارده.", "1. Review the items above in the \"Item guide\" and apply this ruling from today."),
      ses && ses.kind === "group" ? tx("2. الجلسة الجماعية " + ses.when + " هنراجع فيها الأحكام دي، حضورك مهم.", "2. We will go over these rulings in the group session " + ses.when + "; please attend.")
        : tx("2. مش محتاج جلسة إعادة. هنتابع البنود دي في الكاليبريشن الجاي، ولو الفرق اتكرر هنعمل جلسة كوتشينج.", "2. No recalibration needed. We will follow these items in the next calibration; if the gap repeats we will hold a coaching session."));
    else lines.push("", tx("خطة الكوتشينج:", "Coaching plan:"), "1. " + sessionLine,
      tx("2. قبل الجلسة، راجع البنود دي في \"دليل البنود\" واكتب سبب تقييمك لكل بند.", "2. Before the session, review these items in the \"Item guide\" and note why you scored each one."),
      tx("3. بعد الجلسة، هتقيّم عينة كاليبريشن جديدة خلال أسبوع.", "3. After the session, you will score a new calibration sample within a week."),
      tx("4. لحد ما تعدّي الإعادة، هراجع معاك تقييماتك على البنود دي قبل ما توصل للإيجنتس.", "4. Until you pass it, I will review your scores on these items before they reach the agents."));
    lines.push("", tx("لو عندك أي سؤال على النتيجة كلّمني.", "If you have any question about the result, let me know."), "", ref0);
    return { subject, body: lines.join("\n") };
  }

  // Calls for a recalibration: already-scored real calls where the items this evaluator got wrong were in play
  // (scored, not N/A), so the new sample tests the same situations. Calls where the item was actually missed rank first.
  // Calls the evaluator scored before, and the sample's own call, are left out.
  function recalCandidates(r, ref, g, s) {
    const keyOf = (it) => it.kind + ":" + it.id;
    const want = s.diffs.map((idx) => ref.items[idx]).filter(Boolean);
    if (!want.length) return [];
    const callKey = (x) => String(x.odooRef || "").trim() || (normPhone(x.phone).length >= 6 ? normPhone(x.phone) + "|" + whenText(x) : (x.agent || "") + "|" + whenText(x));
    const used = new Set(g.map(callKey)), heard = new Set();
    allRecords().forEach((x) => { if (x.evaluator === r.evaluator) heard.add(callKey(x)); });
    const best = new Map();
    for (const x of allRecords()) {
      if (x.form !== ref.form || x.test || x.sampleRef || ["calibration", "roleplay"].includes(purposeOf(x))) continue;
      const k = callKey(x);
      if (used.has(k) || heard.has(k)) continue;
      const byKey = new Map((x.items || []).map((it) => [keyOf(it), it.result || ""]));
      const hits = want.map((it) => ({ it, v: byKey.get(keyOf(it)) || "" })).filter((h) => h.v && h.v !== "N/A");
      if (!hits.length) continue;
      const missed = hits.filter((h) => h.v === "Not met" || h.v === "Error").length;
      const cand = { x, hits, score: hits.length * 2 + missed };
      const b = best.get(k);
      if (!b || cand.score > b.score || (cand.score === b.score && stamp(x) > stamp(b.x))) best.set(k, cand);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || stamp(b.x).localeCompare(stamp(a.x))).slice(0, 5);
  }
  function renderCalibration() {
    const recs = allRecords().filter((r) => r.sampleRef);
    const sel = $("#calSample"), prev = sel.value;
    const sg = sampleRefs();
    // Real samples first (newest first), test samples after them, so the page opens on a real one.
    const isTest = (g) => (/^TEST/i.test(g.ref) || g.list.every((r) => r.test) ? 1 : 0);
    const samples = [...sg.values()].sort((x, y) => isTest(x) - isTest(y) || sampleStart(y).localeCompare(sampleStart(x)) || y.ref.localeCompare(x.ref)).map((g) => g.ref);
    sel.innerHTML = "";
    if (!samples.length) sel.append(h("option", { value: "", text: t("cal_none") }));
    samples.forEach((s) => { const g = sg.get(s);
      sel.append(h("option", { value: s, text: [s + (/^TEST-/.test(s) ? " (" + t("test_tag") + ")" : ""), g.agent || "–", formName(g.form),
        t("n_evaluators", { n: new Set(g.list.map((r) => r.evaluator)).size })].join(" · ") })); });
    if (samples.includes(prev)) sel.value = prev;
    const out = $("#calOut"); out.innerHTML = "";
    const cg = calGroup(recs, sel.value);
    if (!cg) { out.append(h("div", { class: "empty", text: t("cal_empty") })); return; }
    const { g, matched } = cg;
    if (cg.mixed) out.append(h("p", { class: "msg err", text: t("cal_mixed") }));

    const ncs = g.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    const median = ncs.length ? (ncs.length % 2 ? ncs[(ncs.length - 1) / 2] : (ncs[ncs.length / 2 - 1] + ncs[ncs.length / 2]) / 2) : null;

    // Reference (expert) evaluator: everyone else is measured against their scoring, item by item.
    const refSel = $("#calRef"), names = [...new Set(g.map((r) => r.evaluator).filter(Boolean))];
    const want = refSel.dataset.touched ? refSel.value : settings.evaluator;
    refSel.innerHTML = "";
    refSel.append(h("option", { value: "", text: t("cal_ref_none") }), ...names.map((n) => h("option", { value: n, text: n })));
    refSel.value = names.includes(want) ? want : "";
    const ref = g.find((r) => r.evaluator === refSel.value) || null;

    const agreedIn = $("#calAgreed").value;
    const agreedNum = Number(agreedIn);
    const agreed = agreedIn !== "" && agreedNum >= 0 && agreedNum <= 100 ? agreedNum / 100 : ref ? ref.ncScore : median;
    const stats = (r) => calStats(r, ref, agreed);

    const cols = ["evaluator", "nc_score", "gap_agreed", "within5", ...(ref ? ["cal_items_agree", "cal_crit_agree", "cal_decision", "cal_verdict"] : []), "crit_errors", "final", ...(ref ? [""] : [])];
    const sum = h("table", {}, h("tr", {}, cols.map((k) => h("th", { class: ["nc_score", "gap_agreed", "crit_errors", "final", "cal_items_agree"].includes(k) ? "num" : "", text: k ? t(k) : "" }))));
    const yesNo = (ok) => h("span", { class: "pill " + (ok ? "good" : "bad"), text: ok ? t("yes") : t("no") });
    g.forEach((r) => {
      const s = stats(r), isRef = ref && r === ref;
      sum.append(h("tr", {}, h("td", {}, r.evaluator || "–", isRef ? h("span", { class: "pill info", style: "margin-inline-start:6px", text: t("cal_ref_tag") }) : null),
        h("td", { class: "num", text: pct(r.ncScore) }), h("td", { class: "num", text: s.gap === null ? "–" : (Math.round(s.gap * 1000) / 10) + " " + t("pts") }),
        h("td", {}, s.gap === null ? "–" : s.gap <= CAL.gap ? yesNo(true) : s.gap <= CAL.watch ? h("span", { class: "pill warn", text: t("cal_close_gap", { gap: CAL.gap * 100, watch: CAL.watch * 100 }) }) : yesNo(false)),
        ...(ref ? (isRef ? [h("td", { text: "–" }), h("td", { text: "–" }), h("td", { text: "–" }), h("td", { text: "–" })] :
          [h("td", { class: "num", text: pct(s.agree) }), h("td", {}, yesNo(s.critSame)), h("td", {}, yesNo(s.decisionSame)),
            h("td", {}, h("span", { class: "pill " + { ok: "good", watch: "warn", fail: "bad" }[s.level], text: t({ ok: "cal_ok", watch: "cal_watch", fail: "cal_not_ok" }[s.level]) }))]) : []),
        h("td", { class: "num", text: r.critical }), h("td", { class: "num", text: pct(r.final) }),
        ...(ref ? [h("td", { class: "actions" }, ...(isRef ? [] : mailButtons(() => calMail(r, ref, g, s, sel.value), () => (roster.evalEmails || {})[r.evaluator] || "", "cal_mail_btn")))] : [])));
    });
    const refs = [...new Set(g.map((r) => [whenText(r), refText(r)].filter(Boolean).join(" · ")).filter(Boolean))];
    if (matched.length) out.append(h("p", { class: "msg" }, h("b", { text: t("cal_matched") + " " }),
      matched.map((r) => (r.evaluator || "–") + " (" + (r.sampleRef ? t("cal_matched_code", { c: r.sampleRef }) : t("cal_matched_as", { p: t("p_" + purposeOf(r)) })) + ")").join("، ")));
    out.append(h("h2", { text: t("sample_head", { s: sel.value, f: formName(g[0].form), p: pct(agreed) }) + (agreedIn !== "" ? "" : ref ? t("cal_by_ref") : t("median")) }),
      h("p", { class: "cal-ref" }, h("b", { text: t("cal_ref") + ": " }), h("span", { dir: "ltr", text: (g[0].agent ? g[0].agent + " · " : "") + (refs.join("  |  ") || "–") })),
      ...(refs.length > 1 ? [h("p", { class: "msg err", text: t("cal_ref_differ") })] : []), sum,
      h("p", { class: "hint", text: ref ? t("cal_rules", { gap: CAL.gap * 100, watch: CAL.watch * 100, agree: CAL.agree * 100 }) : t("cal_pick_ref") }),
      ...(ref && g.length > 1 ? [h("p", { class: "actions" }, ...mailButtons(() => calRulingsMail(ref, g, sel.value),
        () => g.filter((r) => r !== ref).map((r) => (roster.evalEmails || {})[r.evaluator]).filter(Boolean).join(","), "cal_rulings_btn"))] : []));

    // Suggested calls for each evaluator who needs a recalibration.
    const needRecal = ref ? g.filter((r) => r !== ref && stats(r).level === "fail") : [];
    if (needRecal.length) {
      const tbl = h("table", {}, h("tr", {}, [tx("المقيّم", "Evaluator"), tx("مكالمة مقترحة", "Suggested call"), tx("البنود اللي فيها", "Items in play"), tx("اتقيّمت من", "Scored by")].map((x) => h("th", { text: x }))));
      needRecal.forEach((r) => {
        const list = recalCandidates(r, ref, g, stats(r));
        if (!list.length) { tbl.append(h("tr", {}, h("td", { text: r.evaluator || "–" }), h("td", { colspan: "3", class: "meta", text: tx("مفيش مكالمات متقيّمة فيها البنود دي لسه. اختار مكالمة جديدة واسمعها الأول.", "No scored calls with these items yet. Pick a new call and listen to it first.") }))); return; }
        list.forEach((c, i) => tbl.append(h("tr", {}, h("td", { text: i ? "" : r.evaluator || "–" }),
          h("td", {}, h("span", { dir: "ltr", text: [c.x.agent, whenText(c.x)].filter(Boolean).join(" · ") }), h("div", { class: "meta", dir: "ltr", text: refText(c.x) || "–" })),
          h("td", {}, ...c.hits.map((hh) => { const bad = hh.v === "Not met" || hh.v === "Error";
            return h("span", { class: "pill " + (bad ? "bad" : "good"), style: "margin:1px", title: L(itemDef(ref.form, hh.it), "item") || hh.it.text, text: (hh.it.kind === "NC" ? "N" : "") + hh.it.id + (bad ? " ✘" : " ✔") }); })),
          h("td", { text: c.x.evaluator || "–" }))));
      });
      out.append(h("h2", { text: tx("مكالمات مقترحة لإعادة الكاليبريشن", "Suggested calls for the recalibration") }),
        h("p", { class: "hint", text: tx("مكالمات اتقيّمت قبل كده وكانت البنود اللي المقيّم اختلف فيها منطبقة عليها، فالموقف موجود فيها أكيد. ✘ يعني الإيجنت غلط في البند ده فعلاً، ودي أقوى اختبار. ✔ يعني البند اتعمل صح. خد مكالمتين يغطوا البنود دي (3 لو الغلط كان حرج أو قرار نجاح مختلف)، واسمعها انت الأول عشان تبقى المرجع. المكالمات اللي المقيّم قيّمها قبل كده مش ظاهرة هنا.",
          "Calls already scored where the items this evaluator differed on were in play, so the situation is there. ✘ means the agent actually missed the item, the strongest test. ✔ means it was done right. Take two calls that cover these items (3 if a critical item or the pass/fail decision differed), and score them yourself first as the reference. Calls this evaluator scored before are left out.") }), tbl);
    }

    // Whole round in one email per evaluator, measured against the same reference on every sample.
    const round = calRound(sel.value);
    const roundSamples = round ? samples.filter((x) => calRound(x) === round) : [];
    if (ref && roundSamples.length > 1) {
      const per = {};
      roundSamples.forEach((sample) => {
        const c = calGroup(recs, sample), rf = c && c.g.find((r) => r.evaluator === ref.evaluator);
        if (!rf) return;
        c.g.filter((r) => r !== rf).forEach((r) => (per[r.evaluator || "–"] = per[r.evaluator || "–"] || []).push({ sample, r, ref: rf, g: c.g, s: calStats(r, rf, rf.ncScore) }));
      });
      const names = Object.keys(per).sort();
      names.forEach((n) => per[n].sort((a, b) => a.sample.localeCompare(b.sample, undefined, { numeric: true })));
      if (names.length) out.append(h("h2", { text: t("cal_round_head", { r: round, n: roundSamples.length }) }), h("p", { class: "hint", text: t("cal_round_hint") }),
        h("table", {}, ...names.map((n) => h("tr", {}, h("td", { text: n }), h("td", { text: per[n].map((x) => x.sample.replace(round + "-", "#") + " " + t({ ok: "cal_ok", watch: "cal_watch", fail: "cal_not_ok" }[x.s.level])).join(" · ") }),
          h("td", { class: "actions" }, ...mailButtons(() => calRoundMail(n, ref.evaluator, round, per[n]),
            () => (roster.evalEmails || {})[n] || "", "cal_round_btn"))))));
    }

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
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  }

  function section(id, title, hint, ...content) {
    const box = $(id); box.innerHTML = "";
    box.append(...[h("h2", { text: title }), hint ? h("p", { class: "hint", text: hint }) : null, ...content].filter(Boolean));
  }

  // COPC R8.0 (Item 3.4.2) Mandatory Action Alerts:
  // (a/c) 100% of failed evaluations must receive 1-on-1 coaching within SLA + increased monitoring frequency;
  // (b) a sample of passing evaluations must receive 1-on-1 coaching;
  // (d) repeat critical error offenders must be temporarily removed from handling transactions until corrective action is completed.
  function renderCopcAlerts(boxId, recs, allLive) {
    const box = $(boxId); if (!box) return;
    box.innerHTML = "";
    const valid = (recs || []).filter((r) => !r.test && ["live", "certcall"].includes(purposeOf(r)));
    if (!valid.length) { box.hidden = true; return; }
    const sla = coachSlaHours();
    const byAgCrit = new Map();
    valid.filter((r) => r.critical > 0).forEach((r) => {
      const a = r.agent || "–"; if (!byAgCrit.has(a)) byAgCrit.set(a, []);
      byAgCrit.get(a).push(r);
    });
    const repeatCrit = [...byAgCrit.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length);
    const failed = valid.filter((r) => r.result === "Fail").sort((a, b) => whenText(b).localeCompare(whenText(a)));
    const passed = valid.filter((r) => r.result === "Pass");
    const passedCoached = passed.filter(isCoached).length;

    const kids = [h("h2", { text: t("copc_alerts_title") }), h("p", { class: "hint", text: t("copc_alerts_hint", { h: sla }) })];
    if (repeatCrit.length) {
      kids.push(h("div", { class: "copc-crit-box" },
        h("h3", { text: t("copc_repeat_crit_head") }),
        h("ul", {}, repeatCrit.map(([a, l]) => {
          const items = [...new Set(l.flatMap((r) => (r.items || []).filter((i) => i.kind !== "NC" && i.result === "Error").map((i) => "[" + i.kind + "] " + i.id)))].join("، ");
          return h("li", { text: t("copc_repeat_crit_row", { a, n: l.length, items: items || "Critical" }) });
        }))));
    }
    if (failed.length) {
      const tb = h("table", {}, h("tr", {}, [t("c_when"), t("c_agent"), t("evaluator"), t("final"), t("copc_col_coaching", { h: sla }), t("copc_col_followup")].map((x, i) => h("th", { class: i === 3 ? "num" : "", text: x }))));
      failed.slice(0, 25).forEach((r) => {
        const hrs = coachHours(r), done = isCoached(r);
        const nextEval = (allLive || []).filter((x) => x.id !== r.id && !x.test && ["live", "certcall"].includes(purposeOf(x)) && x.agent === r.agent && callDay(x) > callDay(r))
          .sort((a, b) => callDay(a).localeCompare(callDay(b)))[0];
        const cCell = h("td", {},
          done ? h("span", { class: "pill " + (hrs !== null && hrs > sla ? "warn" : "good"), text: t("coach_done_tag") + (hrs !== null ? " · " + t(hrs <= sla ? "coach_within_sla" : "coach_late_sla", { h: hrs }) : "") })
            : h("span", { class: "pill " + (hrs !== null && hrs > sla ? "bad" : "warn"), text: hrs !== null && hrs > sla ? t("coach_overdue_tag", { h: sla }) : t("coach_pending_tag") }),
          !done && canChange(r) ? h("button", { type: "button", class: "ghost", style: "margin-inline-start:6px;padding:2px 8px;font-size:12px", text: t("coach_btn"), onclick: () => markCoached(r) }) : null);
        const fCell = h("td", {}, nextEval
          ? h("span", { class: "pill good", text: t("copc_followup_done", { d: callDay(nextEval) }) })
          : h("span", { class: "pill warn", text: t("copc_followup_need") }));
        tb.append(h("tr", {}, h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), h("div", { class: "meta eval-id-tag", text: evalIdOf(r) })), h("td", { text: r.agent || "–" }), h("td", { text: r.evaluator || "–" }),
          h("td", { class: "num" }, h("span", { class: "pill bad", text: pct(r.final) })), cCell, fCell));
      });
      kids.push(h("h3", { text: t("copc_fail_followup_head") }), h("div", { class: "table-wrap" }, tb));
    }
    kids.push(h("p", { class: "copc-pass-stat", text: t("copc_pass_coached_stat", { a: passedCoached, b: passed.length, p: passed.length ? pct(passedCoached / passed.length) : "0%" }) }));
    box.append(...kids);
    box.hidden = false;
  }

  function renderDashboard() {
    const all = allRecords();
    fillSelect($("#dbAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    fillSelect($("#dbEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#dbType"), [...new Set(all.map((r) => r.type).filter(Boolean))].sort(), t("f_all_types"), (v) => typeLabel(all.find((r) => r.type === v).form, v));
    const f = { form: $("#dbForm").value, agent: $("#dbAgent").value, ev: $("#dbEvaluator").value, type: $("#dbType").value, from: $("#dbFrom").value, to: $("#dbTo").value, level: $("#dbCal").value || "agent" };
    const recs = all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) &&
      (!f.type || r.type === f.type) && (!f.from || callDay(r) >= f.from) && (!f.to || callDay(r) <= f.to) && !r.test &&
      (f.level === "all" || (purposeOf(r) === "live" && selectionOf(r) === "random") || (f.level === "program" && purposeOf(r) === "program")));

    lastLists.dashboard = recs;
    const ids = ["#dbKpis", "#dbTrend", "#dbAgentsChart", "#dbAgents", "#dbItems", "#dbCrit", "#dbSections", "#dbEvaluators"];
    if (!recs.length) {
      ids.forEach((i) => ($(i).innerHTML = ""));
      $("#dbKpis").append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") }));
      if ($("#dbAlerts")) $("#dbAlerts").hidden = true;
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
    renderCopcAlerts("#dbAlerts", recs, all);

    // Weekly trend
    const weeks = new Map();
    recs.forEach((r) => { const w = weekStart(callDay(r)); if (!w) return; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); });
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

  // ---------- reports: pick period, filters and sections, then download as PDF or Excel ----------
  const LS_REPORT = "qa_report";
  const RP_SECTIONS = ["summary", "pareto", "categories", "agents", "matrix", "trend", "types", "critlog", "evaluators", "coaching"];
  const RP_DEFAULT = ["summary", "pareto", "categories", "agents", "matrix", "trend", "critlog"];
  let rpState = Object.assign({ preset: "month", secs: RP_DEFAULT.slice() }, store(LS_REPORT) || {});
  // Short Excel sheet names (Excel allows 31 characters).
  const RP_SHEET = {};
  const rpSheetNames = () => { const n = { summary: "Summary", pareto: "Most missed (Pareto)", categories: "By category", agents: "Agents", matrix: "Agent x attribute", trend: "Weekly trend", types: "By type & outcome", critlog: "Critical errors", evaluators: "Evaluators", coaching: "Coaching focus" };
    RP_SECTIONS.forEach((k) => (RP_SHEET[t("rp_s_" + k)] = n[k])); };
  const isMiss = (i) => i.result === "Not met" || i.result === "Error";
  function rpRange(p) {
    const d = new Date();
    if (p === "lastweek") { const s = new Date(weekStart(ymdOf(d)) + "T00:00:00"); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return [ymdOf(s), ymdOf(e)]; }
    if (p === "all") return ["", ""];
    return periodRange(p);
  }
  // Same length, right before the chosen dates; empty when there are no dates.
  function rpPrevRange(from, to) {
    if (!from || !to) return null;
    const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
    const days = Math.round((b - a) / 864e5) + 1;
    const pe = new Date(a); pe.setDate(pe.getDate() - 1); const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1);
    return [ymdOf(ps), ymdOf(pe)];
  }
  function rpTable(head, rows, num) {
    const tb = h("table", {}, h("tr", {}, head.map((x, i) => h("th", { class: num && num.includes(i) ? "num" : "", text: x }))));
    rows.forEach((r) => tb.append(h("tr", {}, r.map((c, i) => (c instanceof Node ? h("td", {}, c) : c && typeof c === "object" && "text" in c ? h("td", Object.assign({ class: num && num.includes(i) ? "num" : "" }, c)) : h("td", { class: num && num.includes(i) ? "num" : "", text: c === null || c === undefined ? "" : c }))))));
    return h("div", { class: "table-wrap" }, tb);
  }
  const rpCard = (title, hint, ...content) => h("div", { class: "card rp-card", "data-sheet": RP_SHEET[title] || null }, h("h2", { text: title }), hint ? h("p", { class: "hint", text: hint }) : null, ...content);
  const signed = (x, unit) => (x === null || x === undefined || isNaN(x) ? "–" : (x > 0 ? "+" : "") + (Math.round(x * 1000) / 10) + (unit || " " + t("pts")));
  function itemStats(recs) {
    const stat = new Map();
    recs.forEach((r) => (r.items || []).forEach((it) => {
      if (!it.result || it.result === "N/A") return;
      const key = r.form + "|" + it.kind + "|" + it.id;
      if (!stat.has(key)) {
        const def = itemDef(r.form, it);
        stat.set(key, { key, form: r.form, id: it.id, kind: it.kind, text: (def && L(def, "label")) || it.text, full: (def && L(def, "item")) || it.text, section: def && def.section, n: 0, miss: 0, agents: new Map() });
      }
      const s = stat.get(key); s.n++; if (isMiss(it)) s.miss++;
      const a = s.agents.get(r.agent) || { n: 0, miss: 0 }; a.n++; if (isMiss(it)) a.miss++; s.agents.set(r.agent, a);
    }));
    return [...stat.values()];
  }
  function rpStats(list) {
    const fin = list.map((r) => r.final).filter((x) => x !== null && x !== undefined);
    return { n: list.length, avg: avg(fin), pass: list.length ? list.filter((r) => r.result === "Pass").length / list.length : null,
      nc: avg(list.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined)), crit: list.filter((r) => r.critical > 0).length,
      cc: avg(list.map((r) => r.cc).filter((x) => x !== null && x !== undefined)), eu: avg(list.map((r) => r.eu).filter((x) => x !== null && x !== undefined)), bc: avg(list.map((r) => r.bc).filter((x) => x !== null && x !== undefined)) };
  }
  function renderReports() {
    if (!$("#view-reports")) return;
    const all = allRecords().filter((r) => !r.test);
    fillSelect($("#rpForm"), Object.keys(F.forms), t("f_all_forms"), formName);
    fillSelect($("#rpAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    fillSelect($("#rpEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#rpType"), [...new Set(all.map((r) => r.type).filter(Boolean))].sort(), t("f_all_types"), (v) => typeLabel(all.find((r) => r.type === v).form, v));
    if (!$("#rpSecs").dataset.built) {
      $("#rpSecs").dataset.built = "1";
      ["form", "agent", "evaluator", "type", "level", "method"].forEach((k) => { const el = $("#rp" + k[0].toUpperCase() + k.slice(1)); if (rpState[k] !== undefined && [...el.options].some((o) => o.value === rpState[k])) el.value = rpState[k]; });
      $("#rpPreset").value = rpState.preset || "month";
      if (rpState.preset === "custom") { $("#rpFrom").value = rpState.from || ""; $("#rpTo").value = rpState.to || ""; }
    }
    const box = $("#rpSecs"); box.innerHTML = "";
    RP_SECTIONS.forEach((k) => box.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: rpState.secs.includes(k) ? "" : null, onchange: (e) => {
      rpState.secs = e.target.checked ? RP_SECTIONS.filter((x) => x === k || rpState.secs.includes(x)) : rpState.secs.filter((x) => x !== k); store(LS_REPORT, rpState); renderReports(); } }), t("rp_s_" + k))));
    if (rpState.preset !== "custom") { const [a, b] = rpRange(rpState.preset); $("#rpFrom").value = a; $("#rpTo").value = b; }
    const f = { form: $("#rpForm").value, agent: $("#rpAgent").value, ev: $("#rpEvaluator").value, type: $("#rpType").value, level: $("#rpLevel").value || "agent", method: $("#rpMethod").value, from: $("#rpFrom").value, to: $("#rpTo").value };
    const pick = (from, to) => all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) && (!f.type || r.type === f.type) &&
      (!f.method || (r.method || "recording") === f.method) && (!from || callDay(r) >= from) && (!to || callDay(r) <= to) &&
      (f.level === "all" ? !["calibration", "roleplay"].includes(purposeOf(r)) : (purposeOf(r) === "live" && selectionOf(r) === "random") || (f.level === "program" && purposeOf(r) === "program")));
    const recs = pick(f.from, f.to);
    const pr = rpPrevRange(f.from, f.to), prev = pr ? pick(pr[0], pr[1]) : null;
    lastLists.reports = recs;
    rpSheetNames();
    const out = $("#rpOut"); out.innerHTML = "";
    if (!recs.length) { out.append(h("div", { class: "card" }, h("div", { class: "empty", text: t("rp_none") }))); return; }
    const on = (k) => rpState.secs.includes(k);
    const S = rpStats(recs), P = prev && prev.length ? rpStats(prev) : null;
    const items = itemStats(recs), prevItems = prev ? itemStats(prev) : [];
    const multiForm = new Set(recs.map((r) => r.form)).size > 1;
    const iname = (s) => (multiForm ? formName(s.form) + " · " : "") + (s.kind === "NC" ? "N" : "") + s.id + " " + s.text;
    const icat = (s) => (s.kind === "NC" ? t("rp_nc_cat") : t("rp_crit_cat") + " " + s.kind);

    if (on("summary")) {
      const row = (label, a, b, isPct, lowerBetter) => {
        const ch = a === null || b === null || b === undefined ? null : a - b;
        return [label, isPct ? pct(a) : a, P ? (isPct ? pct(b) : b) : "–", !P || ch === null ? "–" : { text: isPct ? signed(ch) : (ch > 0 ? "+" : "") + ch, class: "num " + ((lowerBetter ? ch < 0 : ch > 0) ? "good-txt" : ch === 0 ? "" : "bad-txt") }];
      };
      const tiles = [[t("rp_evals"), S.n, t("k_agents", { n: new Set(recs.map((r) => r.agent)).size })], [t("rp_avg"), pct(S.avg), t("k_target")], [t("rp_pass"), pct(S.pass), ""], [t("rp_withcrit"), S.crit, pct(S.crit / S.n)]];
      out.append(rpCard(t("rp_s_summary"), pr ? t("rp_vs", { a: pr[0], b: pr[1] }) + (P ? "" : " " + t("rp_prev_empty")) : t("rp_prev_na"),
        h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), h("div", { class: "tile-s", text: sub })))),
        rpTable([t("rp_metric"), t("rp_this"), t("rp_prev"), t("rp_change")], [
          row(t("rp_evals"), S.n, P && P.n), row(t("rp_avg"), S.avg, P && P.avg, true), row(t("rp_pass"), S.pass, P && P.pass, true), row(t("rp_nc"), S.nc, P && P.nc, true),
          row(t("cc_acc"), S.cc, P && P.cc, true), row(t("eu_acc"), S.eu, P && P.eu, true), row(t("bc_acc"), S.bc, P && P.bc, true), row(t("rp_withcrit"), S.crit, P && P.crit, false, true)], [1, 2, 3])));
    }
    if (on("pareto")) {
      const missed = items.filter((s) => s.miss).sort((a, b) => b.miss - a.miss || b.miss / b.n - a.miss / a.n);
      const total = missed.reduce((x, s) => x + s.miss, 0); let cum = 0;
      const rows = missed.slice(0, 20).map((s, i) => { cum += s.miss; const pv = prevItems.find((p) => p.key === s.key);
        return [i + 1, iname(s), icat(s), s.miss, s.n, pct(s.miss / s.n), pct(s.miss / total), pct(cum / total), pv && pv.n ? signed(s.miss / s.n - pv.miss / pv.n) : "–"]; });
      out.append(rpCard(t("rp_s_pareto"), t("rp_pareto_hint"),
        missed.length ? bars(missed.slice(0, 10).map((s) => ({ label: iname(s), value: s.miss, display: s.miss + " · " + pct(s.miss / s.n), flag: s.kind !== "NC", title: s.full }))) : h("div", { class: "empty", text: t("no_missed") }),
        missed.length ? rpTable(["#", t("rp_item"), t("rp_cat"), t("rp_misses"), t("rp_applied"), t("rp_rate"), t("rp_share"), t("rp_cum"), t("rp_rate_change")], rows, [0, 3, 4, 5, 6, 7, 8]) : null));
    }
    if (on("categories")) {
      const cats = ["NC", "CC", "EU", "BC"].map((k) => { const l = items.filter((s) => s.kind === k); const n = l.reduce((x, s) => x + s.n, 0), m = l.reduce((x, s) => x + s.miss, 0);
        const evWith = k === "NC" ? null : recs.filter((r) => (r.items || []).some((i) => i.kind === k && i.result === "Error")).length;
        return [k === "NC" ? t("rp_nc_cat") : t("rp_crit_cat") + " " + k, k === "NC" ? pct(S.nc) : pct(S[k.toLowerCase()]), m, n, n ? pct(m / n) : "–", evWith === null ? "–" : evWith]; });
      const secs = new Map();
      items.filter((s) => s.kind === "NC").forEach((s) => { const k = s.section ? secLabel(s.section) : t("other"); const v = secs.get(k) || { n: 0, miss: 0 }; v.n += s.n; v.miss += s.miss; secs.set(k, v); });
      out.append(rpCard(t("rp_s_categories"), t("rp_cat_hint"),
        rpTable([t("rp_cat"), t("rp_score_acc"), t("rp_misses"), t("rp_applied"), t("rp_rate"), t("rp_evals_with")], cats, [1, 2, 3, 4, 5]),
        h("h3", { text: t("rp_area") }),
        rpTable([t("rp_area"), t("rp_misses"), t("rp_applied"), t("rp_rate")], [...secs.entries()].sort((a, b) => b[1].miss / (b[1].n || 1) - a[1].miss / (a[1].n || 1)).map(([k, v]) => [k, v.miss, v.n, v.n ? pct(v.miss / v.n) : "–"]), [1, 2, 3])));
    }
    const byAgent = new Map(); recs.forEach((r) => { const k = r.agent || "–"; if (!byAgent.has(k)) byAgent.set(k, []); byAgent.get(k).push(r); });
    const agentNames = [...byAgent.keys()].sort((a, b) => (rpStats(byAgent.get(b)).avg || 0) - (rpStats(byAgent.get(a)).avg || 0));
    if (on("agents")) {
      const rows = agentNames.map((a) => { const l = byAgent.get(a), s = rpStats(l), ps = prev ? rpStats(prev.filter((r) => r.agent === a)) : null;
        const top = itemStats(l).filter((x) => x.miss).sort((x, y) => y.miss - x.miss)[0];
        const ok = s.avg !== null && s.avg >= PASS && !l.some((r) => r.critical > 0);
        return [a, s.n, pct(s.avg), ps && ps.n ? signed(s.avg - ps.avg) : "–", pct(s.pass), pct(s.nc), pct(s.cc), pct(s.eu), pct(s.bc), l.reduce((x, r) => x + (r.critical || 0), 0), top ? iname(top) + " (" + top.miss + ")" : "–", { text: ok ? t("st_ok") : t("st_bad"), class: ok ? "good-txt" : "bad-txt" }]; });
      out.append(rpCard(t("rp_s_agents"), t("rp_agents_hint"),
        rpTable([t("c_agent"), t("rp_evals"), t("rp_avg"), t("rp_change"), t("rp_pass"), t("rp_nc"), t("cc_acc"), t("eu_acc"), t("bc_acc"), t("c_crit"), t("rp_top_miss"), t("c_status")], rows, [1, 2, 3, 4, 5, 6, 7, 8, 9])));
    }
    if (on("matrix")) {
      const cols = items.filter((s) => s.miss).sort((a, b) => b.miss - a.miss).slice(0, 12);
      const rows = agentNames.map((a) => [a, ...cols.map((s) => { const x = s.agents.get(a); if (!x || !x.n) return "–"; const r = x.miss / x.n;
        return { text: x.miss + "/" + x.n, class: "num heat" + (r >= 0.5 ? " h3" : r >= 0.25 ? " h2" : r > 0 ? " h1" : ""), title: pct(r) }; })]);
      rows.push([t("rp_team"), ...cols.map((s) => ({ text: s.miss + "/" + s.n, class: "num", title: pct(s.miss / s.n) }))]);
      out.append(rpCard(t("rp_s_matrix"), t("rp_matrix_hint"),
        cols.length ? rpTable([t("c_agent"), ...cols.map((s) => (s.kind === "NC" ? "N" : "") + s.id + " " + s.text)], rows, cols.map((_, i) => i + 1)) : h("div", { class: "empty", text: t("no_missed") })));
    }
    if (on("trend")) {
      const weeks = new Map(); recs.forEach((r) => { const w = weekStart(callDay(r)); if (!w) return; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); });
      const wk = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      out.append(rpCard(t("rp_s_trend"), t("trend_hint"),
        bars(wk.map(([w, l]) => { const v = rpStats(l).avg; return { label: t("week_of", { w }), value: v || 0, display: pct(v), flag: (v || 0) < PASS }; }), { max: 1, target: PASS }),
        rpTable([t("rp_week"), t("rp_evals"), t("rp_avg"), t("rp_pass"), t("rp_nc"), t("rp_withcrit")], wk.map(([w, l]) => { const s = rpStats(l); return [w, s.n, pct(s.avg), pct(s.pass), pct(s.nc), s.crit]; }), [1, 2, 3, 4, 5])));
    }
    if (on("types")) {
      const grp = (key, label) => { const m = new Map(); recs.forEach((r) => { const k = label(r) || "–"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
        return [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, l]) => { const s = rpStats(l); return [k, s.n, pct(s.avg), pct(s.pass), s.crit]; }); };
      const head = (x) => [x, t("rp_evals"), t("rp_avg"), t("rp_pass"), t("rp_withcrit")];
      out.append(rpCard(t("rp_s_types"), null,
        rpTable(head(t("f_type")), grp("type", (r) => typeLabel(r.form, r.type)), [1, 2, 3, 4]),
        h("h3", { text: t("rp_outcome") }), rpTable(head(t("rp_outcome")), grp("outcome", (r) => r.outcome), [1, 2, 3, 4]),
        h("h3", { text: t("rp_method") }), rpTable(head(t("rp_method")), grp("method", (r) => t(r.method === "sidebyside" ? "rp_m_sbs" : "m_recording")), [1, 2, 3, 4])));
    }
    if (on("critlog")) {
      const rows = [];
      recs.slice().sort((a, b) => callDay(b).localeCompare(callDay(a))).forEach((r) => (r.items || []).filter((i) => i.kind !== "NC" && i.result === "Error").forEach((i) => {
        const def = itemDef(r.form, i); rows.push([callDay(r), r.agent || "", "[" + i.kind + "] " + i.id + " " + ((def && L(def, "label")) || i.text), r.evaluator || "", [i.evidence, i.comment].filter(Boolean).join(" · ")]); }));
      out.append(rpCard(t("rp_s_critlog"), null, rows.length ? rpTable([t("rp_date"), t("c_agent"), t("rp_item"), t("evaluator"), t("rp_comment")], rows) : h("div", { class: "empty", text: t("no_crit") })));
    }
    if (on("evaluators")) {
      const m = new Map(); recs.forEach((r) => { const k = r.evaluator || "–"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
      out.append(rpCard(t("rp_s_evaluators"), t("evaluators_hint"), rpTable([t("evaluator"), t("rp_evals"), t("rp_avg"), t("e_gap"), t("e_crit"), t("m_recording"), t("rp_m_sbs"), t("rp_agents_n")],
        [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([ev, l]) => { const s = rpStats(l);
          return [ev, s.n, pct(s.avg), s.avg === null || S.avg === null ? "–" : signed(s.avg - S.avg), l.reduce((x, r) => x + (r.critical || 0), 0), l.filter((r) => r.method !== "sidebyside").length, l.filter((r) => r.method === "sidebyside").length, new Set(l.map((r) => r.agent)).size]; }), [1, 2, 3, 4, 5, 6, 7])));
    }
    if (on("coaching")) {
      out.append(rpCard(t("rp_s_coaching"), t("rp_coach_hint"), rpTable([t("c_agent"), t("rp_coach_focus"), t("rp_last_coach")], agentNames.map((a) => {
        const l = byAgent.get(a), top = itemStats(l).filter((x) => x.miss).sort((x, y) => (y.kind !== "NC") - (x.kind !== "NC") || y.miss - x.miss).slice(0, 3);
        const last = l.slice().sort((x, y) => callDay(y).localeCompare(callDay(x))).find((r) => r.feedback && r.feedback.coaching);
        return [a, top.length ? top.map((s) => iname(s) + " (" + s.miss + "/" + s.n + ")").join(" · ") : t("no_missed"), last ? callDay(last) + ": " + last.feedback.coaching.replace(/\s*\n\s*/g, " ") : "–"]; }))));
    }
  }
  function wireReports() {
    if (!$("#view-reports")) return;
    const save = () => { ["form", "agent", "evaluator", "type", "level", "method"].forEach((k) => (rpState[k] = $("#rp" + k[0].toUpperCase() + k.slice(1)).value)); rpState.preset = $("#rpPreset").value; rpState.from = $("#rpFrom").value; rpState.to = $("#rpTo").value; store(LS_REPORT, rpState); };
    ["#rpForm", "#rpAgent", "#rpEvaluator", "#rpType", "#rpLevel", "#rpMethod"].forEach((s) => $(s).addEventListener("input", () => { save(); renderReports(); }));
    $("#rpPreset").addEventListener("input", () => { save(); renderReports(); });
    ["#rpFrom", "#rpTo"].forEach((s) => $(s).addEventListener("input", () => { $("#rpPreset").value = "custom"; save(); renderReports(); }));
  }

  // ---------- my work: what each evaluator scored, and which agents still need evaluations ----------
  function periodRange(p) {
    const d = new Date(), ymd = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    if (p === "month") return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(d)];
    if (p === "lastmonth") return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
    if (p === "week") return [weekStart(ymd(d)), ymd(d)];
    return ["", ""];
  }
  const PURPOSE_KEYS = ["live", "certcall", "program", "coaching", "calibration", "roleplay"];
  function workStats(list) {
    const by = {}; PURPOSE_KEYS.forEach((k) => (by[k] = 0));
    list.forEach((r) => { by[purposeOf(r)] = (by[purposeOf(r)] || 0) + 1; });
    const counted = list.filter((r) => purposeOf(r) !== "calibration" && purposeOf(r) !== "roleplay");
    return {
      n: list.length, by,
      rec: list.filter((r) => (r.method || "recording") === "recording" && purposeOf(r) !== "roleplay").length,
      sbs: list.filter((r) => r.method === "sidebyside" && purposeOf(r) !== "roleplay").length,
      targeted: list.filter((r) => selectionOf(r) === "targeted" && purposeOf(r) !== "roleplay").length,
      agents: new Set(list.map((r) => r.agent).filter(Boolean)).size,
      avg: avg(counted.map((r) => r.final).filter((x) => x !== null && x !== undefined)),
      crit: list.reduce((s, r) => s + (r.critical || 0), 0),
    };
  }
  function renderMyWork() {
    if (!$("#view-mywork")) return;
    const all = allRecords().filter((r) => !r.test);
    const evaluators = [...new Set([...(roster.evaluators || []), ...all.map((r) => r.evaluator).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const sel = $("#mwWho"), own = isOwner();
    const me = settings.who || settings.evaluator || "";
    $("#mwWhoBox").hidden = !own;
    if (own) {
      const prev = sel.value || me;
      sel.innerHTML = ""; sel.append(h("option", { value: "", text: t("mw_whole_team") }), ...evaluators.map((v) => h("option", { value: v, text: v })));
      sel.value = evaluators.includes(prev) ? prev : "";
      if (!sel.dataset.wired) { sel.dataset.wired = "1"; sel.addEventListener("change", renderMyWork); $("#mwPeriod").addEventListener("change", renderMyWork); }
    } else if (!$("#mwPeriod").dataset.wired) { $("#mwPeriod").dataset.wired = "1"; $("#mwPeriod").addEventListener("change", renderMyWork); }
    const who = own ? sel.value : me;
    const per = $("#mwPeriod").value || "month";
    const [from, to] = periodRange(per);
    const inPeriod = all.filter((r) => (!from || (r.evalDate || "") >= from) && (!to || (r.evalDate || "") <= to));
    const mine = who ? inPeriod.filter((r) => nameKey(r.evaluator) === nameKey(who)) : inPeriod;
    const s = workStats(mine), team = workStats(inPeriod); lastLists.mywork = mine;
    $("#mwTitle").textContent = who ? (who === me ? t("mw_title") : t("mw_title_of", { n: who })) : t("mw_whole_team");

    // KPI tiles
    const gap = s.avg !== null && team.avg !== null && who ? s.avg - team.avg : null;
    const tiles = [
      [t("mw_k_evals"), s.n, t("mw_k_counted", { n: s.by.live + s.by.certcall })],
      [t("mw_k_agents"), s.agents, roster.agents.length ? t("mw_k_of", { n: roster.agents.length }) : ""],
      [t("m_recording"), s.rec, s.rec + s.sbs ? pct(s.rec / (s.rec + s.sbs)) : ""],
      [t("m_sidebyside"), s.sbs, s.rec + s.sbs ? pct(s.sbs / (s.rec + s.sbs)) : ""],
      [t("mw_k_avg"), pct(s.avg), gap === null ? "" : t("mw_k_vs_team", { g: (gap >= 0 ? "+" : "") + (Math.round(gap * 1000) / 10) })],
      [t("sel_targeted"), s.targeted, s.n ? t("mw_k_targeted_hint") : ""],
      [t("e_crit"), s.crit, ""],
    ];
    section("#mwKpis", t("overview"), null, s.n ? h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), h("div", { class: "tile-s", text: sub }))))
      : h("div", { class: "empty", text: all.length ? t("mw_none") : t("db_empty") }));
    renderCopcAlerts("#mwAlerts", mine, all);

    // Agent coverage against the monthly target (agent-level evaluations by anyone, so the team sees who is still missing).
    const target = Number(teamCfg.monthlyTarget) || 0;
    const [mFrom, mTo] = periodRange(per === "lastmonth" ? "lastmonth" : "month");
    const refD = new Date((mTo || today()) + "T12:00:00");
    const qStart = ymdOf(new Date(refD.getFullYear(), Math.floor(refD.getMonth() / 3) * 3, 1));
    const qEnd = ymdOf(new Date(refD.getFullYear(), Math.floor(refD.getMonth() / 3) * 3 + 3, 0));
    const wStart = weekStart(ymdOf(refD)), wEnd = ymdOf(refD);
    const qLive = all.filter((r) => ["live", "certcall"].includes(purposeOf(r)) && (r.evalDate || "") >= qStart && (r.evalDate || "") <= qEnd);
    const wLive = all.filter((r) => ["live", "certcall"].includes(purposeOf(r)) && (r.evalDate || "") >= wStart && (r.evalDate || "") <= wEnd);
    const activeForms = [...new Set([...Object.keys(F.forms), ...qLive.map((r) => r.form).filter(Boolean)])];
    const monthLive = all.filter((r) => purposeOf(r) === "live" && selectionOf(r) === "random" && (r.evalDate || "") >= mFrom && (r.evalDate || "") <= mTo);
    const agents = [...new Set([...(roster.agents || []), ...monthLive.map((r) => r.agent).filter(Boolean)])];
    const cov = agents.map((a) => {
      const l = monthLive.filter((r) => r.agent === a);
      const ql = qLive.filter((r) => r.agent === a), wl = wLive.filter((r) => r.agent === a);
      const ci = agentCertInfo(a, all, ymdOf(refD)), isNew = ci.isNew;
      const qRec = ql.filter((r) => (r.method || "recording") === "recording").length;
      const qSbs = ql.filter((r) => r.method === "sidebyside").length;
      const qChans = [...new Set(ql.map((r) => r.form).filter(Boolean))];
      return { a, isNew, ci, team: l.length, mine: who ? l.filter((r) => nameKey(r.evaluator) === nameKey(who)).length : l.length, wk: wl.length, qRec, qSbs, qChans, last: l.map((r) => r.evalDate).sort().pop() || "" };
    }).sort((x, y) => x.team - y.team || x.a.localeCompare(y.a));
    const ct = h("table", {}, h("tr", {}, [t("c_agent"), who ? t("mw_by_me") : null, t("mw_team_month"), t("mw_wk_this"), t("mw_q_rec"), t("mw_q_sbs"), t("mw_q_chan"), t("mw_last")].filter(Boolean).map((x, i) => h("th", { class: i ? "num" : "", text: x }))));
    cov.forEach((c) => ct.append(h("tr", {},
      h("td", {}, c.a, c.isNew ? h("span", { class: "pill info", style: "margin-inline-start:6px", title: t("newhire_tip", { d: c.ci.certDate }), text: t("newhire_days_tag", { n: c.ci.newDaysLeft }) }) : null),
      who ? h("td", { class: "num", text: c.mine }) : null,

      h("td", { class: "num" }, h("span", { class: "pill " + (target && c.team >= target ? "good" : c.team ? "info" : "bad"), dir: "ltr", text: target ? c.team + " / " + target : String(c.team) })),
      h("td", { class: "num" }, c.isNew ? h("span", { class: "pill " + (c.wk >= 1 ? "good" : "bad"), dir: "ltr", text: c.wk + " / 1" }) : h("span", { class: "meta", dir: "ltr", text: String(c.wk) })),
      h("td", { class: "num" }, h("span", { class: "pill " + (c.qRec >= 1 ? "good" : "bad"), dir: "ltr", text: (c.qRec >= 1 ? "✓ " : "✗ ") + c.qRec })),
      h("td", { class: "num" }, h("span", { class: "pill " + (c.qSbs >= 1 ? "good" : "bad"), dir: "ltr", text: (c.qSbs >= 1 ? "✓ " : "✗ ") + c.qSbs })),
      h("td", { class: "num" }, h("span", { class: "pill " + (c.qChans.length >= activeForms.length ? "good" : c.qChans.length ? "warn" : "bad"), text: c.qChans.length ? c.qChans.map(formName).join(" + ") : "0 / " + activeForms.length })),
      h("td", { class: "num", dir: "ltr", text: c.last || "-" }))));




    const missing = target ? cov.filter((c) => c.team < target).length : 0;
    section("#mwCoverage", t("mw_cov_title", { m: (per === "lastmonth" ? t("mw_last_month") : t("mw_this_month")) }),
      target ? t("mw_cov_hint", { n: target, k: missing }) : t("mw_cov_hint0"), cov.length ? ct : h("div", { class: "empty", text: t("none_yet") }));

    // By evaluation type
    section("#mwTypes", t("mw_types"), null, s.n ? bars(PURPOSE_KEYS.filter((k) => s.by[k]).map((k) => ({ label: t("p_" + k).replace(/\s*\(.*\)$/, ""), value: s.by[k], display: String(s.by[k]) }))) : h("div", { class: "empty", text: t("mw_none") }));

    // Team table (owner)
    $("#mwTeam").hidden = !own;
    if (own) {
      const head = [t("evaluator"), t("c_evals"), ...PURPOSE_KEYS.map((k) => t("p_" + k).replace(/\s*\(.*\)$/, "")), t("m_recording"), t("m_sidebyside"), t("sel_targeted"), t("mw_k_agents"), t("e_avg"), t("e_gap")];
      const rows = [head];
      const tt = h("table", {}, h("tr", {}, head.map((x, i) => h("th", { class: i ? "num" : "", text: x }))));
      evaluators.map((ev) => [ev, workStats(inPeriod.filter((r) => nameKey(r.evaluator) === nameKey(ev)))]).filter(([ev, w]) => w.n || (roster.evaluators || []).includes(ev))
        .sort((a, b) => b[1].n - a[1].n).forEach(([ev, w]) => {
          const g = w.avg === null || team.avg === null ? "–" : ((w.avg - team.avg) >= 0 ? "+" : "") + (Math.round((w.avg - team.avg) * 1000) / 10) + " " + t("pts");
          const row = [ev, w.n, ...PURPOSE_KEYS.map((k) => w.by[k]), w.rec, w.sbs, w.targeted, w.agents, pct(w.avg), g];
          rows.push(row);
          tt.append(h("tr", { class: w.n ? "" : "muted" }, row.map((x, i) => h("td", { class: i ? "num" : "", text: i === 0 ? x : String(x) }))));
        });
      section("#mwTeam", t("mw_team_title"), t("mw_team_hint"), tt,
        h("p", {}, h("button", { text: t("download"), onclick: () => download("QA_Evaluators_" + per + "_" + today() + ".csv", toCsv(rows), "text/csv") })));
    }

    // Recent evaluations
    const recent = mine.slice().sort((a, b) => whenText(b).localeCompare(whenText(a))).slice(0, 8);
    const rt = h("table", {}, h("tr", {}, ["c_when", "c_agent", who ? null : "evaluator", "c_purpose", "final", ""].filter(Boolean).map((k) => h("th", { text: k ? t(k) : "" }))));
    recent.forEach((r) => rt.append(h("tr", {}, h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), h("div", { class: "meta eval-id-tag", text: evalIdOf(r) })), h("td", { text: r.agent || "–" }), who ? null : h("td", { text: r.evaluator || "–" }),
      h("td", {}, h("span", { class: "pill " + (purposeOf(r) === "live" ? "good" : "info"), text: t("p_" + purposeOf(r)).replace(/\s*\(.*\)$/, "") }), r.method === "sidebyside" ? h("div", { class: "meta", text: t("m_sidebyside").replace(/\s*\(.*\)$/, "") }) : null),
      h("td", { class: "num" }, h("span", { class: "pill " + (r.result === "Pass" ? "good" : "bad"), text: pct(r.final) })),
      h("td", { class: "actions" }, canChange(r) ? h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }) : null))));
    section("#mwRecent", t("mw_recent"), null, recent.length ? rt : h("div", { class: "empty", text: t("mw_none") }));
  }

  // ---------- PDF and Excel downloads for the main pages ----------
  const lastLists = {};
  const EXPORT_VIEWS = { mywork: "mw_title", dashboard: "db_title", reports: "rp_title", calibration: "cal_title", certification: "cert_title", records: "rec_title", evaluate: "nav_evaluate" };
  const fileStamp = () => today() + "_" + new Date().toTimeString().slice(0, 5).replace(":", "");
  function filterSummary(view) {
    const first = $(".card", view); if (!first) return "";
    return [...first.querySelectorAll("label")].map((l) => {
      const el = l.querySelector("select, input:not([type=checkbox]):not([type=file])"); if (!el || l.hidden || l.closest("[hidden]")) return "";
      const v = el.tagName === "SELECT" ? (el.selectedOptions[0] || {}).text || "" : el.value;
      const k = (l.querySelector("span") || l).childNodes[0].textContent.trim();
      return v ? k + ": " + v : "";
    }).filter(Boolean).join(" · ");
  }
  async function exportPdf(name) {
    const view = $(".view.active"); if (!view) return;
    const head = $("#printHead");
    const title = view.id === "view-evaluate" ? t("nav_evaluate") + " · " + (current.answers.header.agent || "") + (current.edit ? " · " + evalIdOf(current.edit) : "") : t(EXPORT_VIEWS[name] || (name === "guide" ? "nav_guide" : "nav_dashboard"));
    head.innerHTML = "";
    head.append(h("div", { class: "ph-logos" }, h("img", { src: "img/techsource.png", alt: "" }), h("img", { src: "img/tresjolie.png", alt: "", class: "acct" })),
      h("div", {}, h("div", { class: "ph-title", text: "QA Scorecard · " + title }),
        h("div", { class: "ph-meta", text: [filterSummary(view), t("pdf_made", { d: new Date().toLocaleString(lang === "ar" ? "ar-EG" : "en-GB"), n: settings.who || settings.evaluator || "" })].filter(Boolean).join(" · ") })));
    const old = document.title; document.title = "QA_" + name + "_" + fileStamp();
    // Wait for the logos so they are in the PDF.
    await Promise.all([...head.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; }))));
    window.print();
    setTimeout(() => (document.title = old), 500);
  }
  let xlsxLib = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLib) xlsxLib = new Promise((ok, bad) => {
      const sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      sc.onload = () => ok(window.XLSX); sc.onerror = () => { xlsxLib = null; bad(new Error("Excel library")); };
      document.head.append(sc);
    });
    return xlsxLib;
  }
  const cellVal = (v) => {
    const x = String(v == null ? "" : v).trim();
    if (/^[+-]?\d+(\.\d+)?%$/.test(x)) return { v: parseFloat(x) / 100, t: "n", z: "0.0%" };
    if (/^[+-]?\d+(\.\d+)?$/.test(x)) return { v: parseFloat(x), t: "n" };
    return { v: x, t: "s" };
  };
  // Every card on the page becomes a sheet: its tiles, tables and bar lists, as shown.
  function viewSheets(view) {
    const out = [];
    $$(".card", view).forEach((card) => {
      if (card.hidden || card.closest("[hidden]") || card.style.display === "none") return;
      const title = card.dataset.sheet || ((card.querySelector("h2") || {}).textContent || "").trim();
      const rows = [];
      card.querySelectorAll(".tile").forEach((x) => rows.push([$(".tile-k", x).textContent, $(".tile-v", x).textContent, ($(".tile-s", x) || {}).textContent || ""]));
      card.querySelectorAll("table").forEach((tb) => { if (rows.length) rows.push([]); tb.querySelectorAll("tr").forEach((tr) => {
        const cells = [...tr.children].filter((c) => !c.classList.contains("actions") && !(c.tagName === "TH" && !c.textContent.trim() && c === tr.firstElementChild && tr.parentNode.querySelector("td.actions")));
        rows.push(cells.map((c) => c.innerText.replace(/\s*\n\s*/g, " · ").trim())); }); });
      card.querySelectorAll(".bar-row").forEach((b) => rows.push([$(".bar-label", b).textContent, $(".bar-value", b).textContent]));
      if (rows.length && title) out.push({ name: title, rows });
    });
    return out;
  }
  function recordRows(list) {
    const head = ["Evaluation ID", "Call date/time", "Agent", "Evaluator", "Form", "Interaction type", "Purpose", "How heard", "How chosen", "Call tag", "Odoo ref", "Ended on (Odoo stage)", "Odoo tag",
      "NC score", "CC accuracy", "EU accuracy", "BC accuracy", "Critical errors", "Final score", "Result", "Missed items", "Strengths", "Areas to improve", "Coaching", "Coached 1-on-1", "Coached at", "Coached by", "KB version", "Evaluation date", "Edited by", "Random pick history"];
    return [head, ...list.map((r) => [evalIdOf(r), whenText(r), r.agent || "", r.evaluator || "", F.forms[r.form] ? F.forms[r.form].name : r.form, r.type || "", purposeOf(r) + (r.test ? " (test)" : ""),
      r.method || "recording", selectionOf(r), r.callTag || "", r.odooRef || "", r.outcome || "", r.odooTag || "",
      ...[r.ncScore, r.cc, r.eu, r.bc].map((x) => (x === null || x === undefined ? "" : { v: x, t: "n", z: "0.0%" })), r.critical || 0,
      r.final === null || r.final === undefined ? "" : { v: r.final, t: "n", z: "0.0%" }, r.result || "",
      (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error").map((i) => (i.kind === "NC" ? "N" : "") + i.id + " " + i.text).join(" | "),
      (r.feedback || {}).strengths || "", (r.feedback || {}).improve || "", (r.feedback || {}).coaching || "", isCoached(r) ? "Yes" : (needsCoaching(r) ? "Pending" : ""), r.coachedAt || "", r.coachedBy || "", r.kbVersion || "", r.evalDate || "", r.editedBy || "", pickTrail(r)])];
  }
  // One column per scorecard item (critical and non-critical), one sheet per form, plus an error-rate summary per item.
  const itemKey = (i) => (i.kind === "NC" ? "N" : "") + i.id;
  const itemCat = (i) => (i.kind === "NC" ? "Non-critical" : "Critical " + i.kind);
  function itemSheets(list) {
    const out = [];
    [...new Set(list.map((r) => r.form))].forEach((form) => {
      const recs = list.filter((r) => r.form === form), cols = [];
      [...recs].sort((x, y) => String(x.savedAt || "").localeCompare(String(y.savedAt || ""))).forEach((r) => (r.items || []).forEach((i) => { const c = cols.find((c) => c.k === itemKey(i)); if (c) c.i = i; else cols.push({ k: itemKey(i), i }); })); // newest wording wins
      const head = ["Evaluation ID", "Call date/time", "Agent", "Evaluator", "Purpose", "Final score", "Result", "Critical errors", "Non-critical missed", ...cols.map((c) => c.k + " [" + itemCat(c.i) + "] " + c.i.text)];
      const rows = recs.map((r) => { const by = {}; (r.items || []).forEach((i) => (by[itemKey(i)] = i));
        return [evalIdOf(r), whenText(r), r.agent || "", r.evaluator || "", purposeOf(r) + (r.test ? " (test)" : ""), r.final === null || r.final === undefined ? "" : { v: r.final, t: "n", z: "0.0%" }, r.result || "",
          r.critical || 0, (r.items || []).filter((i) => i.kind === "NC" && i.result === "Not met").length,
          ...cols.map((c) => { const i = by[c.k]; return i ? i.result + ((i.result === "Not met" || i.result === "Error") && i.comment ? ": " + i.comment : "") : ""; })]; });
      const sum = [["Item", "Category", "Item text", "Evaluated (not N/A)", "Errors / Not met", "Error rate"], ...cols.map((c) => {
        const vals = recs.map((r) => (r.items || []).find((i) => itemKey(i) === c.k)).filter((i) => i && i.result && i.result !== "N/A");
        const bad = vals.filter((i) => i.result === "Not met" || i.result === "Error").length;
        return [c.k, itemCat(c.i), c.i.text, vals.length, bad, vals.length ? { v: bad / vals.length, t: "n", z: "0.0%" } : ""]; })];
      const fname = F.forms[form] ? F.forms[form].name : form;
      out.push({ name: "Items " + fname, rows: [head, ...rows] }, { name: "Item errors " + fname, rows: sum });
    });
    return out;
  }
  async function exportExcel(name) {
    const view = $(".view.active"); if (!view) return;
    let X;
    try { X = await loadXlsx(); } catch (e) { alert(t("xlsx_failed")); return; }
    const wb = X.utils.book_new(); const used = new Set();
    const add = (title, rows) => {
      let n = String(title).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 28) || "Sheet"; let k = 2; const base = n;
      while (used.has(n)) n = base.slice(0, 26) + " " + k++; used.add(n);
      const ws = X.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c && typeof c === "object" ? c : cellVal(c)))));
      ws["!cols"] = (rows[0] || []).map((_, i) => ({ wch: Math.min(60, Math.max(10, ...rows.map((r) => String(r[i] && r[i].v !== undefined ? r[i].v : r[i] || "").length))) }));
      X.utils.book_append_sheet(wb, ws, n);
    };
    const info = [["QA Scorecard · " + t(EXPORT_VIEWS[name] || "nav_dashboard")], [filterSummary(view)], [t("pdf_made", { d: new Date().toLocaleString("en-GB"), n: settings.who || settings.evaluator || "" })]];
    add(t("xlsx_info"), info);
    viewSheets(view).forEach((sh) => add(sh.name, sh.rows));
    const raw = lastLists[name];
    if (raw && raw.length && name !== "records") add(t("xlsx_evals"), recordRows(raw));
    if (name === "records" && raw) add(t("rec_title"), recordRows(raw));
    if (raw && raw.length) itemSheets(raw).forEach((sh) => add(sh.name, sh.rows));
    if (lang === "ar") wb.Workbook = { Views: [{ RTL: true }] };
    X.writeFile(wb, "QA_" + name + "_" + fileStamp() + ".xlsx");
  }
  function addExportButtons() {
    for (const name of Object.keys(EXPORT_VIEWS)) {
      const view = $("#view-" + name); if (!view || $(".export-bar", view)) continue;
      const bar = h("div", { class: "export-bar" },
        h("button", { type: "button", class: "ghost", text: "⬇ PDF", onclick: () => exportPdf(name) }),
        name === "evaluate" ? null : h("button", { type: "button", class: "ghost", text: "⬇ Excel", onclick: () => exportExcel(name) }));
      const target = name === "evaluate" ? $("#btnCsv").parentNode : $(".card", view);
      if (name === "evaluate") $("#btnCsv").after(bar); else target.prepend(bar);
    }
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

  // Evaluate an agent's certification attempt on a list of calls and role-plays.
  // If the agent failed an earlier certification attempt and did a recertification (more than CERT.minCalls calls),
  // the latest CERT.minCalls calls are evaluated so the old failed attempt doesn't block passing recertification.
  function evalAgentCert(agent, rawCalls, rawRps) {
    const sortChron = (a, b) => (callDay(a) || a.evalDate || "").localeCompare(callDay(b) || b.evalDate || "") || String(a.savedAt || "").localeCompare(String(b.savedAt || ""));
    const callsAll = (rawCalls || []).slice().sort(sortChron);
    const rpsAll = (rawRps || []).slice().sort(sortChron);
    const rps = CERT.rolePlays ? rpsAll.slice(-CERT.rolePlays) : [];
    const calc = (list, recert) => {
      const fin = list.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined);
      let ok = 0, n = 0;
      list.forEach((r) => (r.items || []).forEach((it) => {
        if (!it.result || it.result === "N/A" || !isOdoo(itemDef(r.form, it), it)) return;
        n++; if (it.result === "Met" || it.result === "No error") ok++;
      }));
      const c = { agent, calls: list.length, avg: avg(fin), crit: list.filter((r) => r.critical > 0).length,
        odoo: n ? ok / n : null, odooN: n, rps, recert: !!recert, usedCalls: list };
      c.decision = certDecision(c);
      return c;
    };
    let c = calc(callsAll, false);
    if (callsAll.length > CERT.minCalls && c.decision !== "Certified") {
      const latest = calc(callsAll.slice(-CERT.minCalls), true);
      const rank = { Certified: 3, Conditional: 2, "Not certified": 1, Pending: 0 };
      if (rank[latest.decision] >= rank[c.decision]) c = latest;
    }
    // Passed certification date: ONLY when decision === "Certified" (Passed!).
    const passItems = c.decision === "Certified" ? [...c.usedCalls.slice(-CERT.minCalls), ...rps] : [];
    c.passedDate = passItems.length ? passItems.map((r) => r.evalDate || callDay(r)).filter(Boolean).sort().pop() || "" : "";
    return c;
  }

  // Automatic 30-day New Hire & 365-day Annual Reverification tracker from PASSED Certification date.
  // An agent is only counted as certified once they PASS certification (decision === "Certified", or manual certDates override).
  function agentCertInfo(agent, allRecs, refYmd, formFilter) {
    const recs = (allRecs || allRecords()).filter((r) => !r.test && !r.sampleRef && r.agent === agent && ["live", "certcall", "roleplay"].includes(purposeOf(r)) && selectionOf(r) === "random");
    const forms = formFilter ? [formFilter] : Object.keys(F.forms);
    let autoDate = "";
    forms.forEach((f) => {
      const fRecs = recs.filter((r) => r.form === f);
      const certCalls = fRecs.filter((r) => !r.rolePlay && purposeOf(r) === "certcall");
      const rps = fRecs.filter((r) => r.rolePlay);
      // Only auto-derive certification from records if the agent has certification evaluations (certcall or roleplay).
      if (!certCalls.length && !rps.length) return;
      const calls = certCalls.length ? certCalls : fRecs.filter((r) => !r.rolePlay);
      const res = evalAgentCert(agent, calls, rps);
      if (res.decision === "Certified" && res.passedDate > autoDate) autoDate = res.passedDate;
    });
    const manualDate = (roster.certDates || {})[agent] || "";
    const certDate = [autoDate, manualDate].filter(Boolean).sort().pop() || "";
    const ref = refYmd || today();
    const daysSince = certDate ? Math.floor((new Date(ref + "T12:00:00") - new Date(certDate + "T12:00:00")) / 864e5) : null;
    const isNew = !!(certDate && daysSince !== null && daysSince >= 0 && daysSince <= 30);
    const newDaysLeft = isNew ? 30 - daysSince : 0;
    const expDate = certDate ? addDays(certDate, 365) : "";
    const annualDaysLeft = expDate ? Math.ceil((new Date(expDate + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5) : null;
    return { certified: !!certDate, certDate, autoDate, manualDate, daysSince, isNew, newDaysLeft, expDate, annualDaysLeft };
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
    const from = $("#ctFrom").value, to = $("#ctTo").value, mode = ($("#ctMode") && $("#ctMode").value) || "initial";
    const allForm = allRecords().filter((r) => r.form === sel.value && !r.sampleRef && !r.test && ["live", "certcall", "roleplay"].includes(purposeOf(r)) && selectionOf(r) === "random" && r.agent);
    const inWin = allRecords().filter((r) => r.form === sel.value && !r.sampleRef && !r.test && ["live", "certcall", "roleplay"].includes(purposeOf(r)) && selectionOf(r) === "random" && r.agent &&
      (!from || callDay(r) >= from) && (!to || callDay(r) <= to));
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
      const evCert = evalAgentCert(agent, list, rpAll.filter((r) => r.agent === agent));
      const ci = agentCertInfo(agent, allForm, today(), sel.value);
      const lastCert = [ci.certDate, evCert.passedDate].filter(Boolean).sort().pop() || "";
      const expDate = lastCert ? addDays(lastCert, 365) : "";
      const daysLeft = expDate ? Math.ceil((new Date(expDate + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5) : null;


      const c = Object.assign(evCert, { lastCert, expDate, daysLeft, notes: (certInputs[agent] || {}).notes || "" });





      c.decision = certDecision(c);
      return c;
    });

    const cls = { Certified: "good", Conditional: "warn", "Not certified": "bad", Pending: "na" };
    const rpCell = (r) => r ? h("div", {}, pct(r.ncScore), r.critical > 0 ? h("span", { class: "pill bad cert-crit", text: t("c_crit_rp") }) : null) : "–";
    const rpIdx = Array.from({ length: CERT.rolePlays }, (_, i) => i);
    const useOdoo = CERT.odoo > 0;
    const th = (text, num) => h("th", { class: num ? "num" : "", text });
    const tbl = h("table", { class: "cert" }, h("tr", {}, th(t("c_agent")), th(t("c_calls"), 1), th(t("c_live"), 1), th(t("c_crit_live"), 1),
      useOdoo ? th(t("c_odoo"), 1) : null, rpIdx.map((i) => th(t("c_rp", { n: i + 1 }), 1)), mode === "annual" ? th(t("c_last_cert")) : null, mode === "annual" ? th(t("c_annual_status")) : null, th(t("c_decision")), th(t("c_notes"))));
    rows.forEach((c) => {
      const notes = h("input", { value: c.notes, placeholder: t("c_notes_ph"), "aria-label": t("c_notes") + " · " + c.agent });
      notes.addEventListener("change", () => { (certInputs[c.agent] = certInputs[c.agent] || {}).notes = notes.value; store(LS_CERT, certInputs); });
      tbl.append(h("tr", {},
        h("td", { text: c.agent }),
        h("td", { class: "num" + (c.calls < CERT.minCalls ? " short" : ""), dir: "ltr", text: c.calls + " / " + CERT.minCalls + (c.recert ? t("recert_note", { n: CERT.minCalls }) : "") }),
        h("td", { class: "num", text: pct(c.avg) }),
        h("td", { class: "num", text: c.crit }),
        useOdoo ? h("td", { class: "num", title: t("c_odoo_tip", { n: c.odooN }), text: pct(c.odoo) }) : null,
        rpIdx.map((i) => h("td", { class: "num" }, rpCell(c.rps[i]))),
        mode === "annual" ? h("td", { dir: "ltr", text: c.lastCert || "–" }) : null,
        mode === "annual" ? h("td", {}, !c.lastCert ? h("span", { class: "pill na", text: t("annual_none") }) : c.daysLeft >= 0 ? h("span", { class: "pill " + (c.daysLeft <= 30 ? "warn" : "good"), text: t("annual_valid", { d: c.expDate, n: c.daysLeft }) }) : h("span", { class: "pill bad", text: t("annual_due", { d: c.expDate }) })) : null,
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

  // ---------- sign-in (code sent by email) ----------
  const LI_ERR = { bad_email: "li_bad_email", not_allowed: "li_not_allowed", wrong_code: "li_wrong_code", code_expired: "li_code_expired", too_many_tries: "li_too_many" };
  function showLogin() {
    const box = $("#login"); if (!box) return;
    box.hidden = connected() || !settings.url;
    if (box.hidden) return;
    $("#li1").hidden = false; $("#li2").hidden = true; $("#liMsg").textContent = "";
    if (settings.email) $("#liEmail").value = settings.email;
    setTimeout(() => $("#liEmail").focus(), 50);
  }
  async function loginCall(obj, btn) {
    const m = $("#liMsg"); m.className = "msg"; m.textContent = ""; btn.disabled = true;
    try {
      const call = async () => (await fetch(settings.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(obj), cache: "no-store" })).json();
      // The script can be slow to wake up; one quiet retry saves people from pressing again.
      const j = await call().catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(call));
      if (!j.ok) { m.className = "msg err"; m.textContent = j.error === "Wrong access key" ? t("li_old_script") : (LI_ERR[j.error] ? t(LI_ERR[j.error]) : j.error); return null; }
      return j;
    } catch (e) { m.className = "msg err"; m.textContent = t("li_net"); return null; }
    finally { btn.disabled = false; }
  }
  function setupLogin() {
    $("#loginLang").onclick = () => $("#btnLang").click();
    let tick = null;
    const startResend = () => {
      const b = $("#liResend"); let n = 45; clearInterval(tick);
      const draw = () => { b.disabled = n > 0; b.textContent = n > 0 ? t("li_resend_in", { n }) : t("li_resend"); };
      draw(); tick = setInterval(() => { n--; draw(); if (n <= 0) clearInterval(tick); }, 1000);
    };
    $("#liResend").onclick = async () => {
      const j = await loginCall({ action: "otpRequest", email: settings.email }, $("#liResend"));
      if (!j) return;
      const m = $("#liMsg"); m.className = "msg ok"; m.textContent = j.wait ? t("li_wait") : t("li_resent");
      startResend();
    };
    $("#liSend").onclick = async () => {
      const em = $("#liEmail").value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { const m = $("#liMsg"); m.className = "msg err"; m.textContent = t("li_bad_email"); return; }
      const j = await loginCall({ action: "otpRequest", email: em }, $("#liSend"));
      if (!j) return;
      settings.email = em; store(LS_SETTINGS, settings);
      $("#liTo").textContent = em; $("#li1").hidden = true; $("#li2").hidden = false;
      const m = $("#liMsg"); m.className = "msg ok"; m.textContent = j.wait ? t("li_wait") : "";
      $("#liCode").value = ""; setTimeout(() => $("#liCode").focus(), 50);
      startResend();
    };
    $("#liVerify").onclick = async () => {
      const code = $("#liCode").value.replace(/\D/g, "");
      if (code.length !== 6) { const m = $("#liMsg"); m.className = "msg err"; m.textContent = t("li_six"); return; }
      const j = await loginCall({ action: "otpVerify", email: settings.email, code }, $("#liVerify"));
      if (!j) return;
      Object.assign(settings, { session: j.session, email: j.email, who: j.name, owner: !!j.owner, evaluator: j.name });
      store(LS_SETTINGS, settings);
      location.reload();
    };
    $("#liBack").onclick = () => { $("#li1").hidden = false; $("#li2").hidden = true; $("#liMsg").textContent = ""; };
    $("#liEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#liSend").click(); });
    $("#liCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#liVerify").click(); });
    $("#liAdmin").onclick = () => { $("#login").hidden = true; $('nav button[data-view="settings"]').click(); };
    $("#btnSignOut").onclick = () => { if (confirm(t("li_signout_confirm"))) signOut(); };
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
    const mm = $("#setMail");
    mm.value = settings.mail || "auto";
    mm.onchange = () => { settings.mail = mm.value; store(LS_SETTINGS, settings); };
    const status = $("#connStatus");
    status.textContent = connected() ? t("conn_ok") : t("conn_no");
    status.className = "msg " + (connected() ? "ok" : "err");
    $("#account").hidden = !signedIn();
    $("#accountWho").textContent = signedIn() ? t("li_as", { n: settings.who, e: settings.email }) : "";
    for (const id of ["#setUrl", "#setKey", "#btnSaveSettings", "#btnSetupLink"]) $(id).closest("label, button").hidden = signedIn();
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
    $("#ownerCard").hidden = !isOwner();
    $("#setTarget").value = teamCfg.monthlyTarget;
    if ($("#setCoachSla")) $("#setCoachSla").value = teamCfg.coachingSlaHours || 48;
    $("#setPickFrom").value = teamCfg.pickFrom || "10:00"; $("#setPickTo").value = teamCfg.pickTo || "21:30"; $("#setPickDays").value = teamCfg.pickDays || 7;
    $("#setCcResults").value = teamCfg.ccResults || ""; $("#setClosedDays").value = teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays;
    $("#setSenderName").value = teamCfg.senderName || "Quality Team";
    $("#btnSaveTarget").onclick = async () => {
      const m = $("#ownMsg"), n = Math.round(Number($("#setTarget").value));
      if (!(n >= 0 && n <= 100)) { m.className = "msg err"; m.textContent = t("own_bad"); return; }
      const pf = $("#setPickFrom").value || "10:00", pt = $("#setPickTo").value || "21:30", pd = Math.round(Number($("#setPickDays").value) || 7);
      if (pt <= pf || pd < 1 || pd > 31) { m.className = "msg err"; m.textContent = t("own_bad"); return; }
      const cc = $("#setCcResults").value.split(/[,;\s]+/).filter(Boolean);
      if (cc.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) { m.className = "msg err"; m.textContent = t("own_bad_cc"); return; }


      const sn = $("#setSenderName").value.trim() || "Quality Team";
      const sla = Math.max(1, Math.min(720, Math.round(Number(($("#setCoachSla") || {}).value) || 48)));
      try { const j = await apiPostJson({ action: "setConfig", config: { monthlyTarget: n, coachingSlaHours: sla, pickFrom: pf, pickTo: pt, pickDays: pd, closedDays: $("#setClosedDays").value.trim(), ccResults: cc.join(", "), senderName: sn } }); teamCfg = Object.assign(teamCfg, j.config); store("qa_team_cfg", teamCfg); m.className = "msg ok"; m.textContent = t("set_saved"); renderMyWork(); renderDashboard(); }
      catch (e) { m.className = "msg err"; m.textContent = e.message; }
    };
    $("#namesHint").textContent = isOwner() ? t("names_hint") : t("names_hint_ro");
    const rl = $("#rosterList"); rl.innerHTML = "";
    for (const [role, label] of [["agents", "agents"], ["evaluators", "evaluators"]]) {
      rl.append(h("h3", { text: t(label) + " (" + roster[role].length + ")" }));
      if (!roster[role].length) rl.append(h("div", { class: "hint", text: t("none_yet") }));
      const own = isOwner();
      rl.append(h("ul", { class: "names" }, roster[role].map((name) => h("li", {},


        h("span", {}, name, (roster.owners || []).includes(name) ? h("span", { class: "pill info", text: t("owner_tag") }) : null,
          role === "agents" && agentCertInfo(name).isNew ? h("span", { class: "pill info", style: "margin-inline-start:4px", title: t("newhire_tip", { d: agentCertInfo(name).certDate }), text: t("newhire_days_tag", { n: agentCertInfo(name).newDaysLeft }) }) : null,
          own ? h("small", { class: "meta email", dir: "ltr", text: (emailsFor(role)[name] || t("no_email")) + (role === "agents" ? " · " + t("off_tag") + ": " + ((roster.daysOff || {})[name] || t("off_none")) + (agentCertInfo(name).certDate ? " · ✓ " + t("certdate_tag") + ": " + agentCertInfo(name).certDate : "") : "") }) : null,
          null),
        own && role === "agents" ? h("button", { type: "button", class: "ghost", text: t("newhire_btn"), onclick: () => setCertDate(name) }) : null,
        own && role === "agents" ? h("button", { type: "button", class: "ghost", text: t("off_btn"), onclick: () => setDaysOff(name) }) : null,
        own ? h("button", { type: "button", class: "ghost", text: t("email_btn"), onclick: () => setEmail(role, name) }) : null,
        own ? h("button", { type: "button", class: "ghost", text: t("rename"), onclick: () => renamePerson(role, name) }) : null,
        own ? h("button", { type: "button", class: "ghost", text: t("remove"), onclick: () => removePerson(role, name) }) : null))));
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
  async function setDaysOff(name) {
    const cur = (roster.daysOff || {})[name] || "";
    const v = prompt(t("off_prompt", { n: name }), cur);
    if (v === null) return;
    if (!connected()) { alert(t("email_needs_sheet")); return; }
    try {
      const j = await apiPostJson({ action: "setDaysOff", name, days: v.trim() });
      roster.daysOff = Object.assign({}, roster.daysOff);
      if (j.days) roster.daysOff[name] = j.days; else delete roster.daysOff[name];
      store(LS_ROSTER, roster); renderSettings();
    } catch (e) { alert(t("name_failed", { e: e.message })); }
  }
  async function setCertDate(name) {
    if (!connected()) { alert(t("email_needs_sheet")); return; }
    const ci = agentCertInfo(name);
    const cur = (roster.certDates || {})[name] || ci.autoDate || "";
    const v = prompt(t("certdate_prompt", { n: name }), cur);
    if (v === null) return;
    const cd = v.trim().slice(0, 10);
    if (cd && !/^\d{4}-\d{2}-\d{2}$/.test(cd)) { alert("YYYY-MM-DD"); return; }
    try {
      await apiPostJson({ action: "setCertDate", name, certDate: cd });
      roster.certDates = Object.assign({}, roster.certDates);
      if (cd) roster.certDates[name] = cd; else delete roster.certDates[name];
      store(LS_ROSTER, roster); renderSettings(); renderMyWork(); renderCertification();
    } catch (e) { alert(t("name_failed", { e: e.message })); }
  }
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
    const showMini = (v) => { $("#miniBar").hidden = v !== "evaluate"; document.body.classList.toggle("scoring", v === "evaluate"); };
    $("#mbSave").onclick = () => $("#btnSave").click();
    showMini("evaluate");
    $$("nav button").forEach((b) => b.onclick = () => {
      showMini(b.dataset.view);
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
    // Only items left empty get filled; misses already marked and N/A items stay as they are.
    const fillRest = (kind, value) => {
      const list = current.answers[kind].filter((x) => !x.result && !x.locked);
      if (!list.length) return alert(t("fill_none"));
      list.forEach((x) => { x.result = value; });
      renderItems(); autoFeedback(); saveDraft(); updateScore();
    };
    $("#fillNc").onclick = () => fillRest("nc", "Met");
    $("#fillCrit").onclick = () => fillRest("crit", "No error");
    $("#showExplain").onchange = (e) => { showExplain = e.target.checked; store("qa_explain", showExplain); renderItems(); };
    ["#dbForm", "#dbAgent", "#dbEvaluator", "#dbType", "#dbFrom", "#dbTo", "#dbCal"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    wireReports();
    $("#calSample").addEventListener("input", renderCalibration);
    $("#kbAdd").onclick = addKbUpdate;
    ["#recEvaluator", "#recAgent", "#recPurpose", "#recTag", "#recMethod", "#recSel", "#recSearch"].forEach((s) => $(s).addEventListener("input", renderRecords));
    $("#guideForm").addEventListener("input", renderGuide);
    ["#ctMode", "#ctForm", "#ctFrom", "#ctTo"].forEach((s) => { if ($(s)) $(s).addEventListener("input", renderCertification); });
    $("#ctReset").onclick = () => { certRules = Object.assign({}, CERT_DEFAULT); store(LS_CERT_RULES, null); CERT = certCfg(); renderCertification(); };
    $("#btnPrintGuide").onclick = () => exportPdf("guide");
    $("#calAgreed").addEventListener("input", renderCalibration);
    $("#calRef").addEventListener("change", (e) => { e.target.dataset.touched = "1"; renderCalibration(); });
    $("#btnSave").onclick = onSave;
    $("#btnCsv").onclick = () => { const r = buildRecord(); download(fileName(r, "csv"), recordCsv(r), "text/csv"); };
    $("#btnReset").onclick = () => { if (!dirty() || confirm(t("clear_confirm"))) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } };
    const draft = store(LS_DRAFT);
    if (draft && F.forms[draft.form] && draft.answers && draft.answers.header && draft.answers.nc && draft.answers.nc.length === F.forms[draft.form].nc.length && draft.answers.crit.length === F.forms[draft.form].crit.length) current = draft;
    const fromLink = readSetupLink();
    setupLoaders(); setupLogin(); addExportButtons(); applyStatic(); renderSettings(); renderEvaluate(); showLogin();
    if (fromLink) {
      const m = $("#saveMsg"); m.className = "msg ok";
      m.textContent = connected() ? t("linked_ok") : t("linked_bad");
    }
    renderConnBanner();
    window.addEventListener("hashchange", () => { if (readSetupLink()) location.reload(); });
    loadRoster().then(() => { renderHeader(); renderSettings(); renderKb(); });
    loadKb().then(() => { renderHeader(); renderKb(); });
    if (connected()) loadFromSheet().then(renderDupWarn);
    syncLocal().then((n) => { if (n) { const m = $("#saveMsg"); m.className = "msg ok"; m.textContent = t("synced_n", { n }); sheetLoaded = false; } });
  }
  boot();
})();

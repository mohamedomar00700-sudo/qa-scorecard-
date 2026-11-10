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
    syncChips();
  }
  // Short filter lists (period, status, level) show as one-tap chips. The select stays in the page (visually hidden)
  // so the existing code, saved choices and the PDF filter line keep working.
  function syncChips() {
    $$("select[data-chips]").forEach((sel) => {
      const lbl = sel.closest("label"); if (!lbl) return;
      let row = lbl.nextElementSibling && lbl.nextElementSibling.classList.contains("chip-field") ? lbl.nextElementSibling : null;
      if (!row) {
        row = h("div", { class: "chip-field" }); lbl.after(row); lbl.classList.add("sr-only");
        sel.addEventListener("change", syncChips); sel.addEventListener("input", syncChips);
      }
      row.innerHTML = "";
      row.append(h("span", { class: "chip-field-k", text: (lbl.querySelector("span") || {}).textContent || "" }),
        h("div", { class: "chip-row" }, [...sel.options].filter((o) => !o.hidden).map((o) => h("button", { type: "button", class: "chip" + (o.value === sel.value ? " active" : ""), text: o.textContent,
          onclick: () => { if (sel.value === o.value) return; sel.value = o.value; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); syncChips(); } }))));
    });
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
  // The owner can make result emails manual for the whole team: each evaluator sends the designed email from their own Outlook.
  const teamManual = () => teamCfg.mailSend === "manual";
  const mailMode = () => (teamManual() ? (settings.mail && settings.mail !== "auto" ? settings.mail : "outlook") : settings.mail || "auto");
  const canChange = (r) => isOwner() || !connected() || nameKey(r.evaluator) === nameKey(settings.who);
  let teamCfg = Object.assign({ monthlyTarget: 4, leaderWeekly: 4, qualityWeekly: 40 }, store("qa_team_cfg") || {});
  const creds = () => (settings.key ? { key: settings.key } : settings.session ? { session: settings.session } : {});
  function signOut() {
    settings.session = ""; settings.email = ""; settings.who = ""; settings.owner = false; store(LS_SETTINGS, settings);
    showLogin();
  }
  // A sign-in that ended, or an access key that was changed on the script, sends this device back to the sign-in screen.
  const permMsg = (e) => (e === "not_owner" ? t("perm_owner") : e === "not_yours" ? t("perm_yours") : /^(calls?_[a-z_]+|gauge_[a-z_]+|pick_need_agent)$/.test(e || "") && t(e) !== e ? t(e) : e);
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
      const server = { agents: j.agents, evaluators: j.evaluators || [], owners: j.owners || [], quality: j.quality || roster.quality || [], emails: j.emails || {}, daysOff: j.daysOff || roster.daysOff || {}, certDates: j.certDates || roster.certDates || {}, certStatus: j.certStatus || roster.certStatus || {}, evalEmails: j.evalEmails || roster.evalEmails || {}, aliases: j.aliases || roster.aliases || {} };
      if (j.config) { teamCfg = Object.assign(teamCfg, j.config); store("qa_team_cfg", teamCfg); }
      if (j.me && signedIn() && (j.me.name !== settings.who || !!j.me.owner !== !!settings.owner)) {
        settings.who = j.me.name; settings.owner = !!j.me.owner; settings.evaluator = j.me.name; store(LS_SETTINGS, settings);
      }
      // Only names added on this device while it was not connected go up to the shared list. Names that are just
      // missing from the server (for example an agent set to Active = No) are dropped, never added back.
      const pending = store(LS_PENDING) || [], left = [];
      for (const p of pending) {
        if (!["agents", "evaluators"].includes(p.role) || (p.role === "evaluators" && !isOwner())) continue;
        if (server[p.role].some((x) => nameKey(x) === nameKey(p.name)) || (j.inactive || []).some((x) => nameKey(x) === nameKey(p.name))) continue;
        try { await apiPost({ action: "addPerson", role: p.role, name: p.name }); server[p.role].push(p.name); } catch (e) { left.push(p); }
      }
      store(LS_PENDING, left);
      for (const role of ["agents", "evaluators"]) server[role].sort((a, b) => a.localeCompare(b));
      roster = server;
      store(LS_ROSTER, roster);
      // Names renamed on another device: move this device's copies (and the open form) to the new name.
      const al = (n) => (n && roster.aliases[nameKey(n)]) || n;
      if (Object.keys(roster.aliases).length) {
        store(LS_EVALS, (store(LS_EVALS) || []).map((r) => Object.assign(r, { agent: al(r.agent), evaluator: al(r.evaluator) })));
        for (const r of loaded.values()) { r.agent = al(r.agent); r.evaluator = al(r.evaluator); }
        if (current && current.answers && current.answers.header) { const hd = current.answers.header; if (hd.agent) hd.agent = al(hd.agent); if (hd.evaluator) hd.evaluator = al(hd.evaluator); }
        if (settings.evaluator && al(settings.evaluator) !== settings.evaluator) { settings.evaluator = al(settings.evaluator); store(LS_SETTINGS, settings); }
      }
    } catch (e) { /* keep the cached list */ }
  }
  const LS_PENDING = "qa_roster_pending";
  async function addPerson(role, raw) {
    const name = normName(raw);
    if (!name) return null;
    const list = roster[role];
    const near = similarName(list, name);
    if (near && (nameKey(near) === nameKey(name) || confirm(t("similar_confirm", { a: near, b: name })))) return near;
    list.push(name); list.sort((a, b) => a.localeCompare(b)); store(LS_ROSTER, roster);
    const queue = () => { const q = store(LS_PENDING) || []; q.push({ role, name }); store(LS_PENDING, q); };
    if (connected()) {
      try { await apiPost({ action: "addPerson", role, name }); }
      catch (e) { queue(); alert(t("added_local", { e: e.message })); }
    } else queue();
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
        if ((key === "method" || key === "selection") && ["roleplay", "gauge"].includes(purposeOf(a.header))) continue;
        if (key === "selection" && purposeOf(a.header) === "postcoach") continue;
        if (key === "selection" && progRandom(a)) { if (a.header.selection !== "random") { a.header.selection = "random"; saveDraft(); } box.append(pickerFor(a)); continue; }
        if (key === "odooTag" && !(stage && stage.tags.length)) { if (a.header.odooTag) { a.header.odooTag = ""; saveDraft(); } continue; }
        const opts = (key === "type" ? Object.keys(d.types) : key === "callTag" ? CALL_TAGS : key === "method" ? METHODS : key === "selection" ? SELECTIONS : key === "outcome" ? F.odoo.stages.map((s) => s.name) : key === "odooTag" ? stage.tags.slice() : d.outcomes).slice();
        if (key !== "type" && a.header[key] && !opts.includes(a.header[key])) opts.push(a.header[key]);
        const show = (o) => (key === "type" ? typeLabel(current.form, o) : key === "callTag" ? t("tag_" + o) : key === "method" ? t("m_" + o) : key === "selection" ? t("sel_" + o) : key === "outcome" ? stageLabel(o) : key === "odooTag" ? o : outLabel(current.form, o));
        input = h("select", {}, h("option", { value: "", text: t("select") }), opts.map((o) => h("option", { value: o, text: show(o) })));
      } else if (kind === "person" && key === "agent" && progRandom(a)) {
        // Program level: nobody chooses the agent. The tool draws one at random from the agents not heard yet this week.
        box.append(h("label", {}, lab + " *", h("input", { id: "hd_agent", value: a.header.agent || "", placeholder: t("prog_agent_ph"), readOnly: true, tabIndex: -1, class: "auto" })));
        box.append(progCoverage());
        continue;
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
      // A call picked from the raw call data fixes the agent, the call time and the customer number.
      if (a.header.callId && ["agent", "interactionDate", "phone"].includes(key)) { input.disabled = key === "agent"; input.readOnly = true; input.tabIndex = -1; input.className = "auto"; }
      // Program level: the call day is the randomly picked day, not a choice; only the time of the call found is typed.
      let progHint = null;
      if (key === "interactionDate" && progRandom(a) && !a.header.callId) {
        const pk = a.header.pick && a.header.pickAgent === a.header.agent ? a.header.pick : "";
        if (!pk) { input.readOnly = true; input.tabIndex = -1; input.className = "auto"; input.value = ""; if (a.header.interactionDate) { a.header.interactionDate = ""; saveDraft(); } progHint = t("prog_date_wait"); }
        else {
          const day = pk.slice(0, 10);
          if (!a.header.interactionDate || a.header.interactionDate.slice(0, 10) !== day) { a.header.interactionDate = day + "T" + pk.slice(11); input.value = a.header.interactionDate; a.header.kbVersion = kbFor(a.header.interactionDate); saveDraft(); }
          input.min = day + "T00:00"; input.max = day + "T23:59"; progHint = t("prog_date_lock", { d: wdOf(day) + " " + day });
        }
      }
      input.id = "hd_" + key;
      input.addEventListener("input", async () => {
        if (key === "interactionDate" && progRandom(a) && a.header.pick) {
          const day = a.header.pick.slice(0, 10);
          if (input.value.slice(0, 10) !== day) input.value = day + "T" + (input.value.slice(11, 16) || a.header.pick.slice(11));
        }
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
        if (key === "evaluator") { saveDraft(); renderHeader(); return; } // the evaluation level depends on who scores (Quality vs operations)
        if (key === "interactionDate") { a.header.kbVersion = kbFor(input.value); const kb = $("#hd_kbVersion"); if (kb) kb.value = a.header.kbVersion; }
        if (["odooRef", "phone", "interactionDate", "purpose"].includes(key)) checkSameCall();
        if (key === "selection") { if (input.value !== "random") { delete a.header.pick; delete a.header.pickAgent; for (const k of ["callId", "callTalk", "callPool", "callPbx", "callExt", "promises"]) delete a.header[k]; } saveDraft(); renderHeader(); return; }
        if (key === "outcome") { const st = F.odoo.stages.find((s) => s.name === input.value); if (!st || !st.tags.includes(a.header.odooTag)) a.header.odooTag = ""; saveDraft(); renderHeader(); return; }
        saveDraft(); updateScore();
      });
      box.append(h("label", {}, lab + (req ? " *" : ""), input, progHint ? h("span", { class: "hint", text: progHint }) : null));
      if (key === "selection" && (a.header.selection || "random") === "random") box.append(pickerFor(a));
    }
    if (!["roleplay", "calibration", "gauge"].includes(purposeOf(a.header))) box.append(promisesField(a));
  }

  // ---------- Promises made to the customer in this call (call back at a time, send offers / location on WhatsApp) ----------
  // They never change this call's score. Promised calls are checked later against the raw call data (Promises page);
  // WhatsApp promises are marked sent / not sent there. Something due right away (send the location now) and not done
  // is still scored in the call itself.
  function promisesField(a) {
    const box = h("div", { class: "promises-box" });
    const list = () => (a.header.promises = a.header.promises || []);
    const draw = () => {
      box.innerHTML = "";
      box.append(h("div", { class: "pr-head" }, h("div", {}, h("b", { text: "🤝 " + t("pr_title") }), h("div", { class: "hint", text: t("pr_hint") })),
        h("div", { class: "pr-add" },
          h("button", { type: "button", class: "ghost", text: "📞 " + t("pr_add_call"), onclick: () => { list().push({ kind: "call", due: "", time: "" }); saveDraft(); draw(); } }),
          h("button", { type: "button", class: "ghost", text: "💬 " + t("pr_add_wa"), onclick: () => { list().push({ kind: "wa", what: "offers", due: "" }); saveDraft(); draw(); } }))));
      list().forEach((q, i) => {
        const set = (k, v) => { q[k] = v; saveDraft(); };
        const row = h("div", { class: "pr-row" }, h("span", { class: "pr-kind", text: q.kind === "call" ? "📞 " + t("pr_call") : "💬 " + t("pr_wa") }));
        if (q.kind === "wa") {
          const sel = h("select", {}, ["offers", "location", "prices", "other"].map((o) => h("option", { value: o, text: t("pr_what_" + o) })));
          sel.value = q.what || "offers"; sel.onchange = () => set("what", sel.value);
          row.append(h("label", {}, t("pr_what"), sel));
        }
        const d = h("input", { type: "date", value: q.due || "" }); d.onchange = () => set("due", d.value);
        row.append(h("label", {}, t(q.kind === "call" ? "pr_due" : "pr_wa_due"), d));
        if (q.kind === "call") { const tm = h("input", { type: "time", value: q.time || "" }); tm.onchange = () => set("time", tm.value); row.append(h("label", {}, t("pr_time"), tm)); }
        row.append(h("button", { type: "button", class: "ghost pr-del", title: t("pr_del"), text: "✕", onclick: () => { list().splice(i, 1); saveDraft(); draw(); } }));
        box.append(row);
      });
      if (list().some((q) => q.kind === "call")) box.append(h("div", { class: "hint", text: t("pr_time_hint") }));
    };
    draw();
    return box;
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
    return t("pick_trail", { n: log.length }) + " " + log.map((e) => wdOf(e.p.slice(0, 10)) + " " + e.p + (e.c ? " #" + e.c : "") + (e.why ? " (" + t("pick_why_" + e.why) + ")" : "")).join(" → ");
  }
  // ---------- Program level: random agent with weekly coverage ----------
  // The week starts on Saturday (Friday is the day off). Every agent is heard at least once a week (so also every month);
  // agents can be heard more than once, numbers don't have to be equal.
  const progRandom = (a) => purposeOf(a.header) === "program" && !current.edit;
  function weekStartOf(day) { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return ymdOf(d); }
  function programCoverage() {
    const now = today(), ws = weekStartOf(now), ms = now.slice(0, 8) + "01", all = allRecords();
    // Agents still going through certification (they have certification evaluations but haven't passed) are not on
    // the floor yet, so they are left out until they pass, or until a certified date is put in the Roster (an exception).
    const notYet = (roster.agents || []).filter((n) => !agentStage(n, all).floor), agents = (roster.agents || []).filter((n) => !notYet.includes(n));
    const week = new Map(), month = new Map();
    for (const r of all) {
      if (purposeOf(r) !== "program" || r.test || !r.agent) continue;
      const d = String(r.evalDate || r.savedAt || "").slice(0, 10);
      if (d >= ms && d <= now) month.set(r.agent, (month.get(r.agent) || 0) + 1);
      if (d >= ws && d <= now) week.set(r.agent, (week.get(r.agent) || 0) + 1);
    }
    return { agents, notYet, week, month, ws, todoWeek: agents.filter((n) => !week.has(n)), todoMonth: agents.filter((n) => !month.has(n)) };
  }
  function agentDayEvals(agent, day) {
    if (!agent || !day) return [];
    return allRecords().filter((r) => !r.test && !r.rolePlay && nameKey(r.agent) === nameKey(agent) && String(r.interactionDate || r.evalDate || "").slice(0, 10) === day);
  }
  function drawProgramAgent(excludeList) {
    const c = programCoverage();
    if (!c.agents.length) return "";
    const allProg = allRecords().filter((r) => purposeOf(r) === "program" && !r.test && r.agent)
      .sort((x, y) => String(y.savedAt || y.evalDate || "").localeCompare(String(x.savedAt || x.evalDate || "")));
    const lastAg = allProg[0] ? allProg[0].agent : "";
    const excl = new Set([lastAg, ...(excludeList || [])].filter(Boolean).map(nameKey));
    const base = c.agents.filter((n) => !excl.has(nameKey(n)));
    const cand = base.length ? base : c.agents.filter((n) => !(excludeList || []).some((x) => nameKey(x) === nameKey(n)));
    const list = cand.length ? cand : c.agents;
    const minW = Math.min(...list.map((n) => c.week.get(n) || 0));
    const tierW = list.filter((n) => (c.week.get(n) || 0) === minW);
    const minM = Math.min(...tierW.map((n) => c.month.get(n) || 0));
    const pool = tierW.filter((n) => (c.month.get(n) || 0) === minM);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";




  }
  function progCoverage() {
    const c = programCoverage(), n = c.agents.length;
    const box = h("div", { class: "hint prog-cov" },
      h("div", { text: t("prog_rule") }),
      h("div", { text: t("prog_week", { d: c.agents.length - c.todoWeek.length, n }) + (c.todoWeek.length ? " · " + t("prog_left", { list: c.todoWeek.join("، ") }) : " ✓") }),
      h("div", { text: t("prog_month", { d: n - c.todoMonth.length, n }) + (c.todoMonth.length ? " · " + t("prog_left", { list: c.todoMonth.join("، ") }) : " ✓") }),
      ((l) => l.length ? h("div", { text: t("prog_notcert", { list: l.join("، ") }) }) : null)(c.notYet.map((n) => [n, agentStage(n)]).filter(([, st]) => st.key !== "dropped").map(([n, st]) => n + " (" + st.label + ")")));
    return box;
  }
  // Agents' shifts (Egypt time): winter 8 AM–6 PM, summer time (DST) 9 AM–7 PM. The owner can set fixed hours instead.
  function cairoSummer(day) {
    try { const tz = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "shortOffset" }).formatToParts(new Date(day + "T10:00:00Z")).find((p) => p.type === "timeZoneName"); return /\+3/.test(tz ? tz.value : ""); }
    catch (e) { const m = +day.slice(5, 7); return m >= 5 && m <= 10; }
  }
  function pickWindow(day) {
    if (teamCfg.pickMode === "manual") return [teamCfg.pickFrom || "08:00", teamCfg.pickTo || "18:00"];
    return cairoSummer(day) ? ["09:00", "19:00"] : ["08:00", "18:00"];
  }
  function randomPicker(a) {
    const box = h("div", { class: "picker" });
    const pick = (why) => {
      if (progRandom(a) && !why) { const ag = drawProgramAgent(a.header.agent ? [a.header.agent] : []); if (!ag) { alert(t("prog_no_agents")); return; } a.header.agent = ag; a.header.randAgent = true; }
      let agent = a.header.agent;
      const log = (a.header.pickLog || []).slice();
      if (why && log.length) log[log.length - 1] = Object.assign({}, log[log.length - 1], { why });
      const win = (day) => pickWindow(day);
      const [fh, fm] = win(today())[0].split(":").map(Number);
      const days = Math.max(1, Number(teamCfg.pickDays) || 7);
      const off = new Set([...dayIdx(teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays), ...dayIdx((roster.daysOff || {})[agent])]);
      const skip = log.filter((e) => e.why && e.ag === agent).map((e) => e.p.slice(0, 10)), ok = [];
      // Look back over the set window; if every day there is closed or was already rejected (the agent was off, no
      // calls), keep going back one day at a time (up to 31 days) instead of stopping the evaluator.
      // Program level only picks from this month (from the 1st), never the month before.
      const prog = progRandom(a);
      let wider = false, todayOnly = false;
      for (let i = 1; i <= 31 && (i <= days || !ok.length); i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (ymdOf(d) < weekFloor(today(), closedSet())) break;
        if (!off.has(d.getDay()) && !skip.includes(ymdOf(d))) { ok.push(ymdOf(d)); if (i > days) wider = true; }
      }
      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
      if (!ok.length && prog && !off.has(new Date().getDay()) && !skip.includes(today()) && nowM > fh * 60 + (fm || 0) + 30) { ok.push(today()); todayOnly = true; }
      if (prog && why && (!ok.length || !ok.some((d) => !agentDayEvals(agent, d).length))) {
        const tried = [...new Set(log.map((e) => e.ag).concat(agent).filter(Boolean))];
        const nextAg = drawProgramAgent(tried);
        if (nextAg && nameKey(nextAg) !== nameKey(agent)) {
          agent = a.header.agent = nextAg; a.header.randAgent = true;
          const off2 = new Set([...dayIdx(teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays), ...dayIdx((roster.daysOff || {})[agent])]);
          const skip2 = log.filter((e) => e.why && e.ag === agent).map((e) => e.p.slice(0, 10));
          ok.length = 0; todayOnly = false;
          for (let i = 1; i <= 31 && (i <= days || !ok.length); i++) {
            const d = new Date(); d.setDate(d.getDate() - i);
            if (ymdOf(d) < weekFloor(today(), closedSet())) break;
            if (!off2.has(d.getDay()) && !skip2.includes(ymdOf(d))) ok.push(ymdOf(d));
          }
          if (!ok.length && !off2.has(new Date().getDay()) && !skip2.includes(today()) && nowM > fh * 60 + (fm || 0) + 30) { ok.push(today()); todayOnly = true; }
        }
      }
      if (!ok.length) { alert(prog ? t("prog_pick_none") : t("pick_none", { n: 31 })); return; }
      if (wider && !prog) alert(t("pick_wider", { n: days }));
      // A random time inside the shift, at least 30 minutes before it ends so there are calls after it.
      const minEv = Math.min(...ok.map((d) => agentDayEvals(agent, d).length));
      const bestDays = ok.filter((d) => agentDayEvals(agent, d).length === minEv);
      const day = bestDays[Math.floor(Math.random() * bestDays.length)], [w0, w1] = win(day).map((x) => { const [hh, mm] = x.split(":").map(Number); return hh * 60 + (mm || 0); });
      const from = w0, to = Math.max(from + 1, Math.min(w1 - 30, todayOnly ? nowM - 15 : 24 * 60));
      const hadMins = agentDayEvals(agent, day).map((r) => { const tm = String(r.interactionDate || "").slice(11, 16); if (!tm) return null; const [h1, m1] = tm.split(":").map(Number); return isNaN(h1) ? null : h1 * 60 + (m1 || 0); }).filter((x) => x !== null);
      let m = from + Math.floor(Math.random() * (to - from));
      for (let tTry = 0; tTry < 15 && hadMins.some((hm) => Math.abs(hm - m) < 90); tTry++) m = from + Math.floor(Math.random() * (to - from));
      a.header.pick = day + " " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
      a.header.pickAgent = agent;
      log.push({ p: a.header.pick, ag: agent, at: new Date().toISOString() });
      a.header.pickLog = log;
      if (prog) { a.header.interactionDate = a.header.pick.replace(" ", "T"); a.header.kbVersion = kbFor(a.header.interactionDate); saveDraft(); renderHeader(); return; }
      saveDraft(); show();
    };
    const show = () => {
      box.innerHTML = "";
      if (progRandom(a) && a.header.pick && a.header.pick.slice(0, 10) < today().slice(0, 8) + "01") { delete a.header.pick; delete a.header.pickAgent; a.header.agent = ""; a.header.interactionDate = ""; delete a.header.randAgent; saveDraft(); setTimeout(renderHeader); }
      const picked = a.header.pick && a.header.pickAgent === a.header.agent;
      if (!picked) box.append(h("button", { type: "button", class: progRandom(a) ? "" : "ghost", text: "🎲 " + t(progRandom(a) ? "prog_pick_btn" : "pick_btn"), onclick: () => {
        if (!a.header.agent && !progRandom(a)) { alert(t("pick_need_agent")); return; }
        pick(""); if (progRandom(a)) renderHeader();
      } }));
      if (picked) {
        const day = a.header.pick.slice(0, 10);
        const dayEvals = agentDayEvals(a.header.pickAgent, day);
        const dayEvalList = dayEvals.map((r) => [String(r.interactionDate || "").slice(11, 16) || "–", r.odooRef ? "Odoo " + r.odooRef : (r.phone ? "#" + String(r.phone).slice(-4) : "")].filter(Boolean).join(" ")).join("، ");
        box.append(h("div", { class: "pick-out" }, t("pick_rule", { a: a.header.pickAgent, d: wdOf(day) + " " + day, t: a.header.pick.slice(11) })),
          dayEvals.length ? h("div", { class: "meta warn", text: t("pick_day_had", { a: a.header.pickAgent, list: dayEvalList }) }) : null,
          h("div", { class: "hint", text: t("pick_again_hint") }),
          h("button", { type: "button", class: "repick", text: "🔁 " + t("pick_off_btn"), onclick: () => { if (confirm(t("pick_confirm", { d: wdOf(day) + " " + day }))) pick("off"); } }),
          h("button", { type: "button", class: "repick", text: "🔁 " + t("pick_nocalls_btn"), onclick: () => { if (confirm(t("pick_confirm", { d: wdOf(day) + " " + day }))) pick("nocalls"); } }),
          h("button", { type: "button", class: "repick", text: "🔁 " + t("pick_taken_btn"), onclick: () => { if (confirm(t("pick_confirm", { d: wdOf(day) + " " + day }))) pick("taken"); } }));
        const tr = pickTrail(a.header);
        if (tr) box.append(h("div", { class: "hint", text: tr }));
      }
    };
    show();
    return box;
  }

  // ---------- Random call from the raw call data (phone system call log) ----------
  // When the owner has linked the raw call data sheet, the calls form doesn't send the evaluator to look for a call:
  // the server draws one real call at random (answered, 1 minute or more of talk time, never evaluated or held by
  // someone else) and the evaluator only opens it by its Call ID or the customer number. Re-picking needs a reason;
  // the call turned down never comes back, and every pick is kept in the evaluation and the 'Call picks' tab.
  const rawCallsOn = () => current.form === "calls" && !!teamCfg.callsSource && connected();
  const pickerFor = (a) => (rawCallsOn() || a.header.callId ? callPicker(a) : randomPicker(a));
  const mmss = (sec) => String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  const hm12 = (tm) => { const [hh, mm] = String(tm || "").split(":").map(Number); if (isNaN(hh)) return tm || ""; return ((hh % 12) || 12) + ":" + String(mm || 0).padStart(2, "0") + (hh < 12 ? " AM" : " PM"); };
  // First day a random call may come from: today and the last pickDays working days before it (closed days skipped).
  // Apps Script enforces the same window on every pick.
  function pickWindowFrom() {
    const n = Math.max(1, Math.min(31, Number(teamCfg.pickDays) || 3));
    const off = new Set(dayIdx(Array.isArray(teamCfg.closedDays) ? teamCfg.closedDays.join(",") : teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays));
    const d = new Date(today() + "T12:00:00");
    let left = n, guard = 0;
    while (left > 0 && guard++ < 40) { d.setDate(d.getDate() - 1); if (!off.has(d.getDay())) left--; }
    // Never before this week's first day (1, 8, 15, 22), so early-week picks count in this week's target; on the week's
    // first working day the last working day of last week is allowed too, so that day is still heard (Apps Script: weekFloor_).
    const ws = weekFloor(today(), off);
    return ymdOf(d) < ws ? ws : ymdOf(d);
  }
  const closedSet = () => new Set(dayIdx(Array.isArray(teamCfg.closedDays) ? teamCfg.closedDays.join(",") : teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays));
  function weekFloor(day, off) {
    const ws = mWeekStartOf(day), d = new Date(ws + "T12:00:00");
    let g = 0;
    while (off.has(d.getDay()) && g++ < 7) d.setDate(d.getDate() + 1);
    if (ymdOf(d) !== day) return ws;
    const p = new Date(ws + "T12:00:00"); p.setDate(p.getDate() - 1); g = 0;
    while (off.has(p.getDay()) && g++ < 7) p.setDate(p.getDate() - 1);
    return ymdOf(p);
  }
  const mWeekStartOf = (day) => String(day).slice(0, 8) + ["01", "08", "15", "22"][Math.min(3, Math.floor((+String(day).slice(8, 10) - 1) / 7))];
  function callPicker(a) {
    const box = h("div", { class: "picker call-panel" });
    const prog = progRandom(a);
    let busy = false;
    // While the server draws the call: a rolling dice, the steps it goes through and a shuffling Call ID, shown for at
    // least ~1.8 s so nobody thinks the page froze or keeps pressing the button.
    const rolling = () => {
      box.innerHTML = "";
      const steps = ["call_step1", "call_step2", "call_step3"].map((k) => h("li", { text: t(k) }));
      const ticker = h("div", { class: "cp-ticker", dir: "ltr" });
      const bar = h("div", { class: "cp-bar" }, h("span"));
      box.append(h("div", { class: "cp-rolling", role: "status", "aria-live": "polite" },
        h("div", { class: "cp-dice", "aria-hidden": "true" }, h("span", { text: "🎲" })),
        h("div", { class: "cp-roll-body" }, h("div", { class: "cp-title", text: t("call_rolling") }), ticker, h("ol", { class: "cp-steps" }, steps), bar)));
      const hex = "0123456789ABCDEF";
      let n = 0;
      const tick = setInterval(() => {
        ticker.textContent = "2026" + Array.from({ length: 15 }, () => hex[Math.floor(Math.random() * 16)]).join("");
        const at = Math.min(steps.length - 1, Math.floor(n / 8));
        steps.forEach((li, i) => { li.className = i < at ? "done" : i === at ? "now" : ""; });
        n++;
      }, 75);
      return () => clearInterval(tick);
    };
    const go = async (why) => {
      if (busy) return;
      if (!prog && !a.header.agent) { alert(t("pick_need_agent")); return; }
      const log = (a.header.pickLog || []).slice();
      let agent = a.header.agent, prev = why ? a.header.callId || "" : "";
      if (prog && !why) { agent = drawProgramAgent(a.header.agent ? [a.header.agent] : []); if (!agent) { alert(t("prog_no_agents")); return; } }
      const to = today(), from = pickWindowFrom();
      const tried = [];
      busy = true;
      const stop = rolling(), t0 = Date.now();
      const settle = async () => { const wait = 1800 - (Date.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); stop(); };
      try {
        for (;;) {
          const j = await apiPostJson({ action: "pickCall", agent, from, to, widen: !prog, workDays: Math.max(1, Number(teamCfg.pickDays) || 3), prev, why: why || "" });
          if (prev && log.length) { log[log.length - 1] = Object.assign({}, log[log.length - 1], { why }); prev = ""; a.header.pickLog = log; delete a.header.callId; saveDraft(); }
          if (j.call) {
            const c = j.call;
            await settle();
            a.header.agent = agent; if (prog) a.header.randAgent = true;
            a.header.callId = c.id; a.header.callTalk = c.talk; a.header.callPool = j.pool || 0; a.header.callPbx = c.pbx || ""; a.header.callExt = c.ext || "";
            a.header.pick = c.day + " " + c.time; a.header.pickAgent = agent;
            a.header.interactionDate = c.day + "T" + c.time; a.header.kbVersion = kbFor(a.header.interactionDate);
            a.header.phone = c.num ? (c.num.startsWith("+") ? c.num : "+" + c.num) : "";
            a.header.duration = mmss(Math.round(c.talk)); // exact talk time from the phone system
            log.push({ p: a.header.pick, ag: agent, c: c.id, at: new Date().toISOString() });
            a.header.pickLog = log;
            busy = false; pickCall.fresh = true;
            saveDraft(); renderHeader(); checkSameCall();
            if (j.wider) alert(t("call_wider", { n: Number(teamCfg.pickDays) || 3 }));
            return;
          }
          // Nothing left for this agent: on Program level the next agent is drawn; otherwise tell the evaluator.
          if (!prog && j.weekCut) { await settle(); busy = false; alert(t("call_none_week", { a: agent, f: j.weekFrom || from, d: j.dataTo || "–" })); renderHeader(); return; }
          if (!prog) { await settle(); busy = false; alert(t("call_none", { a: agent, d: j.dataTo || "–", f: j.winFrom || from, n: j.winDays || Number(teamCfg.pickDays) || 3 })); renderHeader(); return; }
          tried.push(agent);
          agent = drawProgramAgent(tried);
          if (!agent || tried.some((x) => nameKey(x) === nameKey(agent))) { await settle(); busy = false; alert(j.weekCut ? t("call_none_week_prog", { f: j.weekFrom || from, d: j.dataTo || "–" }) : t("call_none_prog", { d: j.dataTo || "–", f: j.winFrom || from, n: j.winDays || Number(teamCfg.pickDays) || 3 })); a.header.agent = ""; saveDraft(); renderHeader(); return; }
        }
      } catch (e) { stop(); busy = false; show(); alert(e.message); }
    };
    const tile = (icon, k, v, cls) => h("div", { class: "cp-tile" + (cls ? " " + cls : "") }, h("span", { class: "cp-ico", text: icon, "aria-hidden": "true" }), h("div", {}, h("div", { class: "cp-k", text: t(k) }), h("div", { class: "cp-v", dir: "auto", text: v })));
    const show = () => {
      box.innerHTML = "";
      if (prog && a.header.callId && !current.edit && String(a.header.pick || "").slice(0, 10) < pickWindowFrom()) { for (const k of ["callId", "callTalk", "callPool", "callPbx", "callExt", "pick", "pickAgent", "randAgent"]) delete a.header[k]; a.header.agent = ""; a.header.interactionDate = ""; a.header.phone = ""; saveDraft(); setTimeout(renderHeader); }
      const picked = a.header.callId && a.header.pickAgent === a.header.agent;
      if (!picked) {
        if (current.edit) return;
        box.append(h("div", { class: "cp-idle" },
          h("div", { class: "cp-idle-text" }, h("div", { class: "cp-title", text: t(prog ? "prog_pick_btn" : "pick_btn") }), h("div", { class: "hint", text: t("call_src_hint") })),
          h("button", { type: "button", class: "primary cp-go", onclick: () => go("") }, h("span", { class: "cp-go-dice", text: "🎲", "aria-hidden": "true" }), t("call_go"))));
        return;
      }
      const day = a.header.pick.slice(0, 10), tm = a.header.pick.slice(11);
      const copyBtn = h("button", { type: "button", class: "cp-copy", title: t("call_copy"), text: "📋 " + t("call_copy_short") });
      copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(a.header.callId); copyBtn.textContent = "✓ " + t("call_copied"); copyBtn.classList.add("ok"); setTimeout(() => { copyBtn.textContent = "📋 " + t("call_copy_short"); copyBtn.classList.remove("ok"); }, 1600); } catch (e) {} };
      const card = h("div", { class: "cp-card" + (pickCall.fresh ? " fresh" : "") },
        h("div", { class: "cp-head" },
          h("div", { class: "cp-badge", text: "✓" }),
          h("div", {}, h("div", { class: "cp-title", text: t("call_picked_title", { a: a.header.pickAgent }) }),
            h("div", { class: "hint", text: a.header.callPool ? t("call_pool", { n: a.header.callPool }) : t("call_src_hint") }))),
        h("div", { class: "cp-id" }, h("span", { class: "cp-id-k", text: "Call ID" }), h("code", { dir: "ltr", text: a.header.callId }), current.edit ? null : copyBtn),
        h("div", { class: "cp-tiles" },
          tile("📅", "call_t_day", wdOf(day) + " " + day),
          tile("🕒", "call_t_time", hm12(tm)),
          a.header.phone ? tile("📞", "call_t_num", a.header.phone, "ltr") : null,
          a.header.callTalk ? tile("⏱️", "call_t_talk", mmss(Math.round(a.header.callTalk))) : null,
          a.header.callExt ? tile("🎧", "call_t_user", (a.header.callPbx || a.header.pickAgent) + " · " + a.header.callExt) : null),
        h("div", { class: "cp-rule", text: t("call_rule", { a: a.header.pickAgent }) }));
      pickCall.fresh = false;
      box.append(card);
      if (current.edit) return;
      const tr = pickTrail(a.header);
      box.append(h("details", { class: "cp-repick" },
        h("summary", { text: t("call_cant") }),
        h("div", { class: "hint", text: t("call_again_hint") }),
        h("div", { class: "cp-repick-btns" },
          h("button", { type: "button", class: "repick", text: "🔁 " + t("call_norec_btn"), onclick: () => { if (confirm(t("call_confirm"))) go("norec"); } }),
          h("button", { type: "button", class: "repick", text: "🔁 " + t("call_unfit_btn"), onclick: () => { if (confirm(t("call_confirm"))) go("unfit"); } })),
        tr ? h("div", { class: "hint", text: tr }) : null));
    };
    show();
    return box;
  }
  const pickCall = {};

  // Purpose of the evaluation: a real one, a calibration sample or a certification role-play,
  // plus a "test" switch. Tests are kept apart from the dashboard and certification.
  const isQualityName = (n) => !!n && (roster.quality || []).some((q) => nameKey(q) === nameKey(n));
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
  // Calibration codes: CAL-YYYYMMDD-N; recalibration codes: RECAL-YYYYMMDD-N (new calls, scored by everyone who
  // came out "needs recalibration"), so the two are told apart in every report.
  function newSampleRef(test, recal) {
    const prefix = (test ? "TEST-" : "") + (recal ? "RECAL-" : "CAL-") + ymd(today()) + "-";
    let n = 1;
    for (const ref of sampleRefs().keys()) if (ref.startsWith(prefix)) n = Math.max(n, (+ref.slice(prefix.length) || 0) + 1);
    return prefix + n;
  }
  function purposeFields(a) {
    const hd = a.header;
    hd.purpose = purposeOf(hd);
    const set = (p) => {
      hd.purpose = p; hd.rolePlay = p === "roleplay";
      hd.sampleRef = "";
      for (const k of ["gCall", "trial", "gCallId"]) delete hd[k];
      if (p === "gauge") { hd.test = false; hd.selection = "targeted"; for (const k of ["pick", "pickAgent", "pickLog", "callId", "callTalk", "callPool", "callPbx", "callExt", "randAgent", "promises"]) delete hd[k]; }
      if (p === "program" && !hd.randAgent && !current.edit) { hd.agent = ""; delete hd.pick; delete hd.pickAgent; hd.selection = "random"; }
      if (p === "postcoach") { hd.selection = "targeted"; delete hd.pick; delete hd.pickAgent; } else { delete hd.followOf; delete hd.followOfId; }
      saveDraft(); renderHeader();
    };
    // Quality scores Program level, operations score Agent level (the owner can pick either).
    const evName = hd.evaluator || settings.evaluator || "";
    const isQ = isQualityName(evName), isOwn = (roster.owners || []).some((n) => nameKey(n) === nameKey(evName));
    const levels = ["live", "certcall", "program", "coaching", "postcoach", "calibration", "gauge", "roleplay"]
      .filter((p) => !(p === "live" && isQ) && !(p === "program" && !isQ && !isOwn && evName));
    if (!levels.includes(hd.purpose)) { hd.purpose = isQ ? "program" : "live"; if (hd.purpose === "program" && !hd.randAgent && !current.edit) { hd.agent = ""; delete hd.pick; delete hd.pickAgent; } saveDraft(); setTimeout(renderHeader); }
    const sel = h("select", { id: "hd_purpose" }, levels.map((p) => h("option", { value: p, text: t("p_" + p) })));
    sel.value = hd.purpose;
    sel.addEventListener("input", async () => {
      if (sel.value === "calibration" || sel.value === "gauge") await refreshRecordsQuietly();
      set(sel.value);
    });
    const cb = h("input", { type: "checkbox", id: "hd_test" });
    cb.checked = !!hd.test;
    cb.addEventListener("change", () => { hd.test = cb.checked; hd.sampleRef = ""; saveDraft(); renderHeader(); });
    const out = [h("label", {}, t("h_purpose"), sel), hd.purpose === "gauge" ? null : h("label", { class: "check hd-check" }, cb, t("h_test"))].filter(Boolean);
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
        h("option", { value: "__recal", text: t("new_recal") }),
        ...bucket(t("cal_todo"), recent.filter((g) => !mine(g))),
        ...bucket(t("cal_mine"), recent.filter(mine)),
        ...bucket(t("cal_older", { n: CAL_RECENT_DAYS }), older));
      if (hd.sampleRef && !groups.some((g) => g.ref === hd.sampleRef)) rs.append(h("option", { value: hd.sampleRef, text: hd.sampleRef }));
      rs.value = hd.sampleRef || "";
      rs.addEventListener("input", async () => {
        if (rs.value === "__new" || rs.value === "__recal") { const recal = rs.value === "__recal"; await refreshRecordsQuietly(); hd.sampleRef = newSampleRef(hd.test, recal); }
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
    if (hd.purpose === "gauge") out.push(...gaugeFields(a));
    if (hd.purpose === "postcoach") {
      // The first call after a coaching session: linked to the coached evaluation, so the tool can check it came after.
      const open = allRecords().filter((r) => isCoached(r) && r.result === "Fail" && !r.test && r.form === current.form && (!hd.agent || r.agent === hd.agent) &&
        (r.id === hd.followOf || !followUpOf(r))).sort((x, y) => coachTime(y) - coachTime(x));
      const fs = h("select", { id: "hd_followOf" }, h("option", { value: "", text: open.length ? t("select") : t("fu_none") }),
        open.map((r) => h("option", { value: r.id, text: [evalIdOf(r), r.agent || "–", t("fu_coached_on", { d: dtText(r.coachedAt) }), pct(r.final)].join(" · ") })));
      fs.value = hd.followOf || "";
      fs.addEventListener("input", () => {
        const o = open.find((r) => r.id === fs.value);
        hd.followOf = fs.value; hd.followOfId = o ? evalIdOf(o) : "";
        if (o) { hd.agent = o.agent; hd.selection = "targeted"; }
        saveDraft(); renderHeader();
      });
      out.push(h("label", {}, t("h_followOf") + " *", fs));
      const o = open.find((r) => r.id === hd.followOf);
      if (o) out.push(h("div", { class: "pick-out" }, t("fu_rule", { a: o.agent, d: dtText(o.coachedAt) })));
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
      Array.from({ length: 60 }, (_, i) => h("option", { value: pad(i), text: pad(i) + " " + t("sec") })));
    mins.value = m0 || ""; secs.value = s0 || "";
    // A call drawn from the raw call data brings its exact talk time from the phone system: shown, not chosen.
    if (a.header.callId) { mins.disabled = secs.disabled = true; mins.classList.add("auto"); secs.classList.add("auto"); }
    const upd = () => set(mins.value || secs.value ? (mins.value || "00") + ":" + (secs.value || "00") : "");
    const warn = h("span", { class: "hint warn-short", text: t("short_call_warn") });
    const chk = () => { const sec = (+mins.value || 0) * 60 + (+secs.value || 0); warn.hidden = !((mins.value || secs.value) && sec < 60 && (a.header.selection || "random") === "random" && purposeOf(a.header) !== "roleplay"); };
    mins.addEventListener("input", () => { upd(); chk(); }); secs.addEventListener("input", () => { upd(); chk(); }); chk();
    return h("label", {}, label, h("div", { class: "pair" }, mins, secs), warn);
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
      sampleRef: ["calibration", "gauge"].includes(purposeOf(a.header)) ? a.header.sampleRef || "" : "",
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
    if (purposeOf(a.header) === "gauge" && (!a.header.sampleRef || !a.header.gCall)) problems.push(t("gauge_pick_first"));
    if (purposeOf(a.header) === "postcoach") {
      const o = a.header.followOf && allRecords().find((r) => r.id === a.header.followOf);
      if (!o) problems.push(t("h_followOf"));
      else if (a.header.interactionDate && new Date(a.header.interactionDate).getTime() <= coachTime(o)) problems.push(t("fu_before", { d: dtText(o.coachedAt) }));
    }
    if (!a.header.odooRef && !a.header.phone) problems.push(t("ref_needed"));
    if ((a.header.promises || []).some((q) => !q.due)) problems.push(t("pr_need_day"));
    if ((a.header.promises || []).some((q) => q.kind === "call") && !a.header.phone) problems.push(t("pr_need_phone"));
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

  // One save at a time: a second click while the first is still saving used to store the same evaluation twice.
  async function onSave() {
    if (onSave.busy) return;
    const btn = $("#btnSave");
    onSave.busy = true; if (btn) btn.disabled = true;
    try { await saveOnce(); } finally { onSave.busy = false; if (btn) btn.disabled = false; }
  }
  // The same evaluator already saved this exact interaction (same agent, same call time, same form): a double save.
  function sameEvaluatorDup(rec) {
    if (rec.test || rec.sampleRef || !rec.agent || !rec.interactionDate) return null;
    return allRecords().find((r) => r.id !== rec.id && !r.test && !r.sampleRef && r.form === rec.form && r.agent === rec.agent &&
      (r.evaluator || "") === (rec.evaluator || "") && String(r.interactionDate) === String(rec.interactionDate) && purposeOf(r) === purposeOf(rec)) || null;
  }
  async function saveOnce() {
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
    if (rec.purpose === "gauge") return saveGauge(rec, msg);
    // "Test" hides an evaluation everywhere; people have ticked it on real certifications, so ask once more.
    if (rec.test && !confirm(t("test_confirm"))) return;
    const edit = current.edit;
    if (edit) Object.assign(rec, { id: edit.id, savedAt: edit.savedAt, editedAt: new Date().toISOString(), editedBy: settings.evaluator || rec.evaluator });
    else {
      const mine = sameEvaluatorDup(rec);
      if (mine) {
        msg.className = "msg err"; msg.textContent = t("dup_mine", { id: evalIdOf(mine) });
        toast("err", msg.textContent);
        return;
      }
      // A call from the raw call data can only be evaluated once.
      const sameCall = rec.callId && !rec.test && allRecords().find((r) => r.callId === rec.callId && r.id !== rec.id && !r.test);
      if (sameCall) { msg.className = "msg err"; msg.textContent = t("call_taken") + " [" + evalIdOf(sameCall) + "]"; toast("err", msg.textContent); return; }
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
        // The server refused it as a double save of an evaluation it already has: keep only that one.
        const dupOf = !edit && (apiPost.last || {}).duplicateOf;
        if (dupOf) {
          loaded.delete(rec.id); store(LS_EVALS, (store(LS_EVALS) || []).filter((r) => r.id !== rec.id));
          msg.className = "msg err"; msg.textContent = t("dup_mine", { id: dupOf }); toast("err", msg.textContent);
          refreshViews(); return;
        }
        msg.className = "msg ok"; msg.textContent = (edit ? t("updated_sheet") : how === "saved" ? t("saved_sheet") : t("sent_sheet")) + " [" + evalIdOf(rec) + "]";
        const rep = apiPost.last || {};
        if (!edit && rep.emailed) msg.textContent += " " + t("emailed_agent", { n: rec.agent });
        else if (!edit && rep.emailNote && /too many times|مرات كثيرة/i.test(rep.emailNote)) msg.textContent += " " + t("email_quota");
        else if (!edit && rep.emailNote) msg.textContent += " " + t("email_failed", { e: rep.emailNote });
        else if (!edit && how === "saved" && mailMode() === "auto" && mailable(rec) && rep.emailNote === "" && !(roster.emails || {})[rec.agent]) msg.textContent += " " + t("no_email_hint", { n: rec.agent });
      } catch (e) {
        if (e.message === t("call_taken")) {
          loaded.delete(rec.id); store(LS_EVALS, (store(LS_EVALS) || []).filter((r) => r.id !== rec.id));
          msg.className = "msg err"; msg.textContent = t("call_taken"); toast("err", msg.textContent); return;
        }
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
    const list = current.edit || hd.test || ["calibration", "gauge"].includes(purposeOf(hd)) ? [] : sameCallMatches({ ...hd, form: current.form, id: current.edit && current.edit.id });
    box.hidden = !list.length;
    if (list.length) box.textContent = t("dup_early") + "\n" + list.slice(0, 3).map((r) =>
      "• " + (r.evaluator || "–") + " · " + (r.agent || "–") + " · " + whenText(r) + " · " + pct(r.final)).join("\n");
  }

  const fileName = (rec, ext) => ["QA", F.forms[rec.form].name, (rec.agent || "agent").replace(/[^\w؀-ۿ-]+/g, "_"), rec.evalDate, rec.id.slice(0, 6)].join("_") + "." + ext;

  // ---------- data for calibration & dashboard ----------
  let loaded = new Map();
  const stamp = (r) => r.editedAt || r.savedAt || "";
  let deleted = new Set(store(LS_DELETED) || []);
  // Gauge R&R evaluations live apart from everything else (never in records, reports, targets or the dashboard).
  // For an evaluator in an open study the sheet only sends bare markers (hidden: true), with no scores.
  const gaugeRecs = new Map();
  function addRecords(list) {
    for (const r of list || []) {
      if (!r || !r.id || !r.form || !F.forms[r.form] || !Array.isArray(r.items) || deleted.has(r.id)) continue;
      if (r.purpose === "gauge") { gaugeRecs.set(r.id, r); continue; }
      const al = roster.aliases || {};
      for (const f of ["agent", "evaluator"]) { const to = r[f] && al[nameKey(r[f])]; if (to) r[f] = to; }
      const had = loaded.get(r.id);
      if (!had || stamp(r) >= stamp(had)) loaded.set(r.id, r);
    }
  }
  function forgetDeleted(ids) {
    for (const id of ids || []) { deleted.add(id); loaded.delete(id); gaugeRecs.delete(id); }
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
  function refreshViews() { if ($("#view-promises").classList.contains("active")) { prData = null; renderPromises(); } renderCoachingView(); renderMyWork(); renderCalibration(); renderDashboard(); renderReports(); renderCertification(); renderGuide(); renderRecords(); renderKb(); syncChips(); }

  // ---------- saved evaluations: find, open to correct, delete ----------
  // Phone numbers are wrapped in a left-to-right isolate so "+971…" never flips in Arabic.
  const phoneDiv = (r) => (r && r.phone ? h("div", { class: "meta", dir: "ltr", text: "📞 " + normPhone(r.phone) }) : null); // customer number under the call date (Mohamed, 2026-11-08)
  const refText = (r) => [r.phone ? "\u2066" + r.phone + "\u2069" : "", r.odooRef ? "Odoo " + r.odooRef : ""].filter(Boolean).join(" · ");
  // Result email sent from the evaluator's own work mailbox (Outlook): the tool opens a ready email,
  // the evaluator checks it and presses Send, so it goes out from their address and stays in their Sent items.
  const mailable = (r) => ["live", "certcall", "coaching", "postcoach", "program"].includes(purposeOf(r)) && !r.test;
    const tx = (ar, en) => (lang === "en" ? en : ar);
  // Emails are English-only whatever the screen language (Hussein asked for no mixed Arabic/English emails).
  // Evaluators' typed comments and feedback go in as written.
  const mx = (ar, en) => en;
  // Score split by category for result emails: Part A (non-critical) met/applicable, then each critical bucket with % view.
  function catBreakdown(r) {
    const its = r.items || [];
    const nc = its.filter((i) => i.kind === "NC" && i.result && i.result !== "N/A");
    const lines = [mx("- البنود العادية (NC): ", "- Non-critical (NC): ") + pct(r.ncScore) + " (" + nc.filter((i) => i.result === "Met").length + mx(" من ", " of ") + nc.length + ")"];
    [["CC", "دقة الكومبلاينس (CC)", "Compliance accuracy (CC)", r.cc], ["EU", "دقة العميل (EU)", "End-user accuracy (EU)", r.eu], ["BC", "دقة البيزنس (BC)", "Business critical accuracy (BC)", r.bc]].forEach(([k, ar, en, scoreVal]) => {
      const list = its.filter((i) => i.kind === k && i.result && i.result !== "N/A"), errs = list.filter((i) => i.result === "Error").length;
      if (!list.length) {
        lines.push("- " + mx(ar, en) + ": " + mx("مش منطبق", "not applicable"));
      } else {
        const scorePct = pct(scoreVal !== undefined && scoreVal !== null && scoreVal !== "" ? scoreVal : (errs ? 0 : 1));
        const detail = errs ? (mx("✗ ", "✗ ") + errs + mx(errs === 1 ? " غلطة" : " أخطاء", errs === 1 ? " error" : " errors")) : (mx("✓ مفيش أخطاء", "✓ no errors"));
        lines.push("- " + mx(ar, en) + ": " + scorePct + " (" + detail + ")");
      }
    });
    return lines;
  }
  const resultCc = () => teamCfg.ccMode === "digest" ? [] : String(teamCfg.ccResults || "").split(/[,;\s]+/).filter((x) => /@/.test(x));
  function mailText(r) {
    const coaching = purposeOf(r) === "coaching";
    const form = r.form === "whatsapp" ? mx("واتساب", "WhatsApp chat") : mx("مكالمة", "call");
    const when = whenText(r);
    const phone = String(r.phone || "").replace(/\D/g, "");
    const ref = [r.odooRef ? "Odoo: " + r.odooRef : "", phone ? mx("رقم العميل ", "customer number ") + normPhone(r.phone) : ""].filter(Boolean).join(" · ");
    const missed = (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error");
    const fb = r.feedback || {};
    const cert = purposeOf(r) === "certcall";
    const pass = r.result === "Pass", isWow = r.callTag === "wow", isGood = r.callTag === "good";
    const subjPrefix = (isWow ? mx("🌟🏆 WOW CALL! – ", "🌟🏆 WOW CALL! – ") : isGood ? mx("👍 مكالمة مميزة – ", "👍 Good Call – ") : "") +
      (coaching ? mx("💡 إكسترا تارجت – ", "💡 Extra target – ") : purposeOf(r) === "program" ? mx("📊 عينة البرنامج (غير محسوبة) – ", "📊 Program sample (not counted) – ") : purposeOf(r) === "postcoach" ? mx("كوتشينج كول – ", "Coaching call – ") : cert ? mx("تقييم السرتيفيكيشن – ", "Certification evaluation – ") : mx("تقييم الجودة – ", "Quality evaluation – "));
    const statusTag = coaching ? "" : (isWow ? " – 🌟 Passed (" + pct(r.final) + ")" : pass ? " – ✅ Passed (" + pct(r.final) + ")" : " – ⚠️ Failed (" + pct(r.final) + ")");
    const subject = subjPrefix + form + " – " + when.slice(0, 10) + statusTag + " [" + evalIdOf(r) + "]";
    const topBanner = isWow
      ? mx("🌟🏆 WOW CALL! Outstanding Performance — مكالمة استثنائية! (" + pct(r.final) + ")\n🎉 Congratulations! المكالمة دي مش بس عدّت بنجاح، دي اتختارت كـ \"مكالمة Wow\" ومثال مميز يُحتذى به في مكتبة التدريب الخاصة بالفريق. فخورين جداً بأدائك الاحترافي! 👏", "🌟🏆 WOW CALL! Outstanding Performance (" + pct(r.final) + ")\n🎉 Congratulations! This call was selected as a standout \"Wow Call\" for the team's training library. Proud of your great work! 👏")
      : purposeOf(r) === "program"
        ? mx("📊 عينة جودة البرنامج (Program level): مش محسوبة في تقييمك. المكالمة اتسمعت ضمن عينة الكواليتي للأكاونت، والنتيجة للمعلومة والتعلّم بس (" + pct(r.final) + ").", "📊 Program quality sample (Program level): not counted in your score. Your call was heard in Quality's account sample; the result is for your information and learning (" + pct(r.final) + ").")
      : coaching
        ? mx("💡 إكسترا تارجت (غير محسوب في السكور)", "💡 Extra target (not counted in your score)")
        : pass && isGood
          ? mx("🎉👍 Congratulations! مكالمة كويسة جداً وعدّيت التقييم بنجاح (PASSED – " + pct(r.final) + ") — المكالمة دي اتضافت كمثال كويس في مكتبة التدريب، استمر على نفس المستوى!", "🎉👍 Congratulations! Very good call & passed (PASSED – " + pct(r.final) + ") — Added as a good example to the training library, keep it up!")
          : pass
            ? mx("🎉 Congratulations! مبروك، عدّيت التقييم بنجاح (PASSED – " + pct(r.final) + ") — أداء كويس والتزام بمعايير الجودة، كمّل على نفس المستوى!", "🎉 Congratulations! You passed this evaluation (PASSED – " + pct(r.final) + ") — Good job, keep it up!")
            : mx("⚠️ التقييم لم يجتز الحد المطلوب (FAILED – " + pct(r.final) + ") — " + (r.critical ? "بسبب وجود خطأ حرج (Critical Error). راجع النقاط بالأسفل عشان تتفاداها المرة الجاية." : "السكور أقل من نسبة النجاح المطلوبة. راجع البنود اللي محتاجة تظبيط بالأسفل."), "⚠️ Evaluation did not pass (FAILED – " + pct(r.final) + ") — " + (r.critical ? "Due to a critical error. Please review the items below for next time." : "Score is below the passing threshold. Please review the items below."));
    const lines = [topBanner, "", mx("أهلاً ", "Hi ") + (r.agent || "") + mx("،", ","), "",
      (purposeOf(r) === "postcoach" ? mx("ده تقييم الكوتشينج كول، أول مكالمة ليك بعد جلسة الكوتشينج على التقييم " + (r.followOfId || "") + "، لـ", "This is the evaluation of your first call after the coaching session on " + (r.followOfId || "") + ", the ") : coaching ? mx("ده تقييم إكسترا تارجت (مش محسوب في تقييمك) على ", "This is an extra-target evaluation (not counted in your score) of the ") : purposeOf(r) === "program" ? mx("ده تقييم من عينة جودة البرنامج (مش محسوب في تقييمك) لـ", "This is a program quality sample evaluation (not counted in your score) of your ") : cert ? mx("ده تقييم السرتيفيكيشن لـ", "This is the certification evaluation of the ") : mx("ده تقييم الجودة لـ", "This is the quality evaluation of the ")) +
        form + mx(" بتاريخ ", " on ") + when + (ref ? " (" + ref + ")" : "") + ".", "",
      mx("رقم التقييم (Evaluation ID): ", "Evaluation ID: ") + evalIdOf(r),
      ...(r.callId ? [mx("رقم المكالمة (Call ID): ", "Call ID: ") + r.callId] : []),
      ...(r.callPbx || r.callExt ? [mx("الإيجنت على سيستم التليفونات: ", "Agent on the phone system: ") + (r.callPbx || r.agent) + (r.callExt ? " · User ID " + r.callExt : "")] : []),
      ...(r.callTalk ? [mx("مدة الكلام: ", "Talk time: ") + mmss(Math.round(r.callTalk))] : []),
      mx("النتيجة النهائية: ", "Final score: ") + pct(r.final) + " – " + (r.result === "Pass" ? mx("ناجح", "Pass") : mx("محتاج تحسين", "Needs improvement")),
      ...(isWow ? [mx("تصنيف المكالمة: 🌟🏆 مكالمة Wow (مثال مميز في مكتبة التدريب)", "Call tag: 🌟🏆 Wow call (training library standout)")] : isGood ? [mx("تصنيف المكالمة: 👍 مكالمة كويسة جداً (مكتبة التدريب)", "Call tag: 👍 Very good call (training library)")] : []),
      ...(r.method === "sidebyside" ? [mx("طريقة التقييم: سايد باي سايد", "Evaluated: side by side")] : []),
      mx("دقة البنود الحرجة: ", "Critical accuracy: ") + (r.critical ? mx("0% (" + r.critical + (r.critical === 1 ? " غلطة)" : " أخطاء)"), "0% (" + r.critical + (r.critical === 1 ? " error)" : " errors)")) : mx("100% (مفيش أخطاء)", "100% (no errors)")), "",
      mx("تقسيم التقييم:", "Score by category:"), ...catBreakdown(r)];
    if (missed.length) lines.push("", mx("البنود اللي محتاجة تتظبط:", "Items to work on:"), ...missed.map((i) => "- " + i.text + (i.comment ? " – " + i.comment : "")));
    if (fb.strengths) lines.push("", mx("نقاط القوة:", "Strengths:"), fb.strengths);
    if (fb.improve) lines.push("", mx("محتاج تحسين:", "Areas to improve:"), fb.improve);
    if (fb.coaching) lines.push("", mx("نصيحة للمرة الجاية:", "Tip for next time:"), fb.coaching);
    lines.push("", mx("لو عندك أي سؤال على التقييم كلّمني.", "If you have any question about this evaluation, let me know."), "", (r.evaluator ? r.evaluator + " – " : "") + mx("فريق الجودة", "Quality Team"));
    return { subject, body: lines.join("\n") };
  }
  // Arabic typed text (comments, feedback, notes) is machine-translated by the script; the original stays under it.
  const AR_RE = /[\u0600-\u06FF]/;
  async function enMail(subject, body) {
    const lines = String(body || "").split("\n"), idx = lines.map((l, i) => (AR_RE.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!connected() || (!idx.length && !AR_RE.test(subject))) return { subject, body };
    const texts = idx.map((i) => lines[i]).concat(AR_RE.test(subject) ? [subject] : []).slice(0, 8);
    let en = [];
    try { en = (await Promise.race([apiPostJson({ action: "translate", texts }), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 3500))]).en) || []; } catch (e) { return { subject, body }; }
    idx.slice(0, 8).forEach((i, k) => { const tr = en[k]; if (tr && tr !== lines[i]) lines[i] = tr + " (auto-translated)\n    Arabic original: " + lines[i].replace(/^[-\s]+/, ""); });
    const sj = AR_RE.test(subject) && en[texts.length - 1] ? en[texts.length - 1] : subject;
    return { subject: sj, body: lines.join("\n") };
  }
  async function composeMail(to, subject0, body0, cc) {
    const { subject, body } = await enMail(subject0, body0);
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    if (mailMode() === "outlookweb") window.open("https://outlook.office.com/mail/deeplink/compose?" + q({ to, cc, subject, body }), "_blank");
    else location.href = "mailto:" + encodeURIComponent(to).replace(/%40/g, "@").replace(/%2C/g, ",") + "?" + q({ cc, subject, body });
  }
  // Copy an email (subject + body) to paste anywhere, for when the mail button can't open a mail app.
  async function copyMail(m0, btn) {
    const m = Object.assign({}, m0, await enMail(m0.subject, m0.body));
    const text = (m.cc ? "CC: " + m.cc + "\n" : "") + mx("الموضوع: ", "Subject: ") + m.subject + "\n\n" + m.body;
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
    if (connected()) return openDesigned(r);
    const { subject, body } = mailText(r);
    composeMail((roster.emails || {})[r.agent] || "", subject, body, resultCc().join(","));
    markMailed(r);
  }
  // The same designed email the system sends automatically: the script builds it, the page copies it (with its design)
  // and opens a new Outlook email with To, CC and Subject filled in; the evaluator pastes it (Ctrl+V) and presses Send.
  // If the script is older or the browser can't copy formatted text, it falls back to the plain ready email.
  async function copyDesigned(r) {
    const p = apiPostJson({ action: "resultMail", id: r.id }).then((j) => { if (!j.ok || !j.html) throw new Error(j.error || "no html"); return j; });
    const plain = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.innerText || d.textContent || ""; };
    try {
      if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": p.then((j) => new Blob([j.html], { type: "text/html" })),
        "text/plain": p.then((j) => new Blob([plain(j.html)], { type: "text/plain" })) })]);
      return await p;
    } catch (e) { p.catch(() => {}); return null; }
  }
  async function openDesigned(r) {
    const j = await copyDesigned(r);
    if (!j) {
      const { subject, body } = mailText(r);
      composeMail((roster.emails || {})[r.agent] || "", subject, body, resultCc().join(","));
      markMailed(r); return;
    }
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    if (mailMode() === "outlookweb") window.open("https://outlook.office.com/mail/deeplink/compose?" + q({ to: j.to, cc: j.cc, subject: j.subject }), "_blank");
    else location.href = "mailto:" + encodeURIComponent(j.to || "").replace(/%40/g, "@").replace(/%2C/g, ",") + "?" + q({ cc: j.cc, subject: j.subject });
    toast("ok info", t("mail_paste", { n: r.agent || "" }));
    markMailed(r);
  }
  // Result emails sent from the evaluator's own Outlook: the tool can't see the Send press, so opening the ready
  // email (or "Sent") marks the evaluation as emailed. Records still waiting are flagged so none is forgotten.
  const autoMailed = (r) => mailable(r) && (!r.mailMode || r.mailMode === "auto") && !!(roster.emails || {})[r.agent] && !r.mailQueued;
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
  // Every failed evaluation needs coaching (Agent level, program level, feedback-only, certification, role play, coaching call);
  // only calibration copies are left out, since those test the evaluator, not the agent.
  const needsCoaching = (r) => !!(r && !r.test && purposeOf(r) !== "calibration" && r.result === "Fail");
  const coachTime = (r) => new Date(r.coachedAt || (r.feedback && r.feedback.coachedAt) || 0).getTime() || 0;
  // The post-coaching evaluation linked to a coached evaluation (the newest one if there are several).
  const followUpOf = (r) => allRecords().filter((x) => x.followOf === r.id && !x.test).sort((a, b) => whenText(b).localeCompare(whenText(a)))[0];
  const pad2 = (n) => String(n).padStart(2, "0");
  const localDT = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  const dtText = (iso) => { const d = new Date(iso); return isNaN(d) ? "–" : localDT(d).replace("T", " "); };
  // Status of the coaching loop on an evaluation: post-coaching call passed / failed, or still waiting for it.
  function followBadge(r) {
    if (!isCoached(r) || r.result !== "Fail") return null;
    const fu = followUpOf(r);
    if (fu) return h("div", { class: "meta " + (fu.result === "Pass" ? "ok-txt" : "bad-txt"), text: t(fu.result === "Pass" ? "fu_passed" : "fu_failed", { id: evalIdOf(fu) }) });
    return h("div", { class: "meta warn", text: t("fu_waiting") });
  }
  // Coaching session on an evaluation: when it happened, the points coached and what was agreed. Saved on the evaluation,
  // then a summary email goes to the agent. The agent's first call after it is scored as "post-coaching" (followOf).
  function openCoaching(r) {
    const missed = (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error");
    const now = localDT(new Date());
    const when = h("input", { type: "datetime-local", value: r.coachedAt ? localDT(new Date(r.coachedAt)) : now, max: now });
    const boxes = missed.map((i) => { const cb = h("input", { type: "checkbox" }); cb.checked = !r.coachPoints || r.coachPoints.includes(itemKey(i)); return [i, cb]; });
    const note = h("textarea", { rows: 4, placeholder: t("coach_note_ph") }); note.value = r.coachNote || "";
    const ack = h("input", { type: "checkbox" }); ack.checked = r.coachAck !== false;
    const msg = h("div", { class: "msg" });
    const close = () => ov.remove();
    const save = h("button", { type: "button", text: t("coach_save") });
    const ov = h("div", { class: "overlay", onclick: (e) => { if (e.target === ov) close(); } }, h("div", { class: "card dialog" },
      h("h2", { text: t("coach_title", { n: r.agent || "" }) }),
      h("div", { class: "meta", dir: "auto", text: [evalIdOf(r), whenText(r), pct(r.final) + " " + (r.result === "Fail" ? "✗" : "✓")].join(" · ") }),
      h("p", { class: "hint", text: t("coach_steps") }),
      h("label", {}, t("coach_when"), when),
      missed.length ? h("div", {}, h("b", { text: t("coach_points") }), ...boxes.map(([i, cb]) => h("label", { class: "check" }, cb, (i.kind === "NC" ? "" : "[" + i.kind + "] ") + i.text))) : null,
      h("label", {}, t("coach_note"), note),
      h("label", { class: "check" }, ack, t("coach_ack")),
      msg,
      h("div", { class: "row" }, save, h("button", { type: "button", class: "ghost", text: t("cancel"), onclick: close }))));
    save.onclick = async () => {
      const at = new Date(when.value);
      if (isNaN(at) || at.getTime() > Date.now() + 10 * 60000) { msg.className = "msg err"; msg.textContent = t("bad_future"); return; }
      if (at.getTime() < new Date(r.savedAt || r.evalDate || 0).getTime() - 864e5) { msg.className = "msg err"; msg.textContent = t("coach_before_eval"); return; }
      save.disabled = true; msg.className = "msg"; msg.textContent = t("saving");
      const by = settings.who || settings.evaluator || r.evaluator || "", iso = at.toISOString(), stamp = new Date().toISOString();
      const rec = Object.assign({}, r, { coached: true, coachedAt: iso, coachedBy: by, coachPoints: boxes.filter(([, cb]) => cb.checked).map(([i]) => itemKey(i)),
        coachNote: note.value.trim(), coachAck: ack.checked, feedback: Object.assign({}, r.feedback || {}, { coached: true, coachedAt: iso }), editedAt: stamp, editedBy: by });
      loaded.set(rec.id, rec);
      const local = store(LS_EVALS) || [];
      if (local.some((x) => x.id === rec.id)) store(LS_EVALS, local.map((x) => (x.id === rec.id ? rec : x)));
      const fields = (x) => ({ coachedAt: x.coachedAt, coachedBy: x.coachedBy, coachPoints: x.coachPoints, coachNote: x.coachNote, coachAck: x.coachAck, coachMailedAt: x.coachMailedAt || "" });
      try {
        if (connected()) await apiPostJson({ action: "saveCoaching", id: rec.id, coaching: fields(rec) });
        let sent = false;
        if (connected() && mailMode() === "auto") {
          try { await apiPostJson({ action: "sendCoaching", id: rec.id }); sent = true; } catch (e) { toast("err", t("email_failed", { e: e.message })); }
        } else { const m = coachingMail(rec); composeMail((roster.emails || {})[rec.agent] || "", m.subject, m.body, resultCc().join(",")); sent = true; }
        if (sent && connected()) { rec.coachMailedAt = new Date().toISOString(); loaded.set(rec.id, rec); apiPost({ action: "saveCoaching", id: rec.id, coaching: fields(rec) }).catch(() => {}); }
        toast("ok", "✓ " + t(sent ? "coach_saved_mailed" : "coach_saved", { n: rec.agent }));
        close(); refreshViews();
      } catch (e) { save.disabled = false; msg.className = "msg err"; msg.textContent = t("save_failed", { e: e.message }); }
    };
    document.body.append(ov);
    when.focus();
  }
  // Coaching summary email (used when emails open in Outlook; the automatic one is built by the script the same way).
  function coachingMail(r) {
    const pts = (r.items || []).filter((i) => (r.coachPoints || []).includes(itemKey(i)));
    const lines = [mx("أهلاً ", "Hi ") + (r.agent || "") + mx("،", ","), "",
      mx("ده ملخص جلسة الكوتشينج اللي عملناها مع بعض يوم ", "Here is a summary of our coaching session on ") + dtText(r.coachedAt) + mx(" على التقييم ", " about evaluation ") + evalIdOf(r) + " (" + whenText(r) + ").", ""];
    if (pts.length) lines.push(mx("النقاط اللي اتكلمنا فيها:", "What we worked on:"), ...pts.map((i) => "- " + i.text), "");
    if (r.coachNote) lines.push(mx("اتفقنا على:", "What we agreed:"), r.coachNote, "");
    lines.push(mx("هنسمع أول مكالمة ليك بعد الكوتشينج علشان نتأكد إن النقاط دي بقت تمام.", "We'll listen to your first call after this session to make sure these points are in place."), "",
      (r.coachedBy || r.evaluator || "") + mx(" – فريق الجودة", " – Quality Team"));
    return { subject: mx("📝 ملخص جلسة الكوتشينج – ", "📝 Coaching session summary – ") + dtText(r.coachedAt).slice(0, 10) + " [" + evalIdOf(r) + "]", body: lines.join("\n") };
  }
  const coachSlaHours = () => Number(teamCfg.coachingSlaHours) || 48;
  const passedSlaHours = () => Number(teamCfg.passedSlaHours) || 48;
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
    h("button", { type: "button", class: "ghost", text: t("copy_mail"), onclick: async (e) => {
      const btn = e.currentTarget;
      if (connected() && (await copyDesigned(r))) { const was = btn.textContent; btn.textContent = t("copied"); setTimeout(() => (btn.textContent = was), 1500); return; }
      copyMail(Object.assign(mailText(r), { cc: resultCc().join(", ") }), btn);
    } }));
  const whenText = (r) => (r.interactionDate || r.evalDate || "").replace("T", " ");
  // The day of the call (falls back to the evaluation day for role-plays and old records).
  const callDay = (r) => String(r.interactionDate || r.evalDate || "").slice(0, 10);
  // The evaluation type as the scorecard names it (Agent level, Program level, Extra target, ...), for reports and exports.
  const short = (x) => String(x || "").replace(/\s*\(.*\)$/, "");
  const purposeLabel = (r) => (purposeOf(r) === "calibration" && /(^|-)RECAL-/.test(r.sampleRef || "") ? t("p_recal") : t("p_" + purposeOf(r)).split(" (")[0]) + (r.test ? " (test)" : "");
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
    const f = { ev: $("#recEvaluator").value, ag: $("#recAgent").value, p: $("#recPurpose").value, tag: $("#recTag").value, m: $("#recMethod").value, sel: $("#recSel").value, q: $("#recSearch").value.trim().toLowerCase(), per: ($("#recPeriod") || {}).value || "" };
    const [pFrom, pTo] = f.per ? periodRange(f.per) : ["", ""];
    const qd = f.q.replace(/[^\d]/g, "");
    const recs = all.filter((r) => (!f.ev || r.evaluator === f.ev) && (!f.ag || r.agent === f.ag) &&
      (!f.p || (f.p === "test" ? r.test : !r.test && purposeOf(r) === f.p)) && (!f.tag || r.callTag === f.tag) && (!f.m || (r.method || "recording") === f.m) && (!f.sel || (f.sel === "unsent" ? mailPending(r) : f.sel === "uncoached" ? (needsCoaching(r) && !isCoached(r)) : f.sel === "coached" ? isCoached(r) : selectionOf(r) === f.sel)) &&
      (!pFrom || callDay(r) >= pFrom) && (!pTo || callDay(r) <= pTo) &&
      (!f.q || [evalIdOf(r), r.id, r.odooRef, r.sampleRef, r.agent, r.evaluator].some((x) => String(x || "").toLowerCase().includes(f.q)) || (qd.length >= 4 && normPhone(r.phone).includes(qd))))
      .sort((a, b) => whenText(b).localeCompare(whenText(a)));
    out.innerHTML = ""; lastLists.records = recs;
    const unsent = all.filter((r) => mailPending(r) && (isOwner() || r.evaluator === settings.evaluator));
    if (unsent.length && f.sel !== "unsent") out.append(h("div", { class: "msg err" }, t("mail_unsent_banner", { n: unsent.length }), " ",
      h("button", { type: "button", text: t("mail_unsent_show"), onclick: () => { $("#recSel").value = "unsent"; renderRecords(); } })));
    if (!recs.length) { out.append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") })); return; }
    // Summary strip for what is listed; the coaching and email numbers filter the list when clicked.
    const real = recs.filter((r) => !r.test), fins = real.map((r) => r.final).filter((x) => x !== null && x !== undefined);
    const passN = real.filter((r) => r.result === "Pass").length, unc = real.filter((r) => needsCoaching(r) && !isCoached(r)).length, uns = recs.filter(mailPending).length;
    const stat = (k, v, cls, on) => h(on ? "button" : "div", Object.assign({ class: "rec-stat" + (cls ? " " + cls : "") }, on ? { type: "button", onclick: on } : {}), h("b", { text: String(v) }), h("span", { text: k }));
    out.append(h("div", { class: "rec-stats" },
      stat(tl("تقييم", "evaluations"), recs.length),
      stat(tl("متوسط النهائي", "average final"), pct(avg(fins)), avg(fins) !== null && avg(fins) < PASS ? "bad" : "good"),
      stat(tl("نسبة النجاح", "pass rate"), pct(real.length ? passN / real.length : null)),
      stat(tl("محتاجة كوتشينج", "need coaching"), unc, unc ? "warn" : "", unc ? () => { $("#recSel").value = "uncoached"; renderRecords(); } : null),
      stat(tl("إيميل لسه متبعتش", "email not sent"), uns, uns ? "bad" : "", uns ? () => { $("#recSel").value = "unsent"; renderRecords(); } : null)));
    const fixable = f.p === "test" && connected() ? recs.filter((r) => r.test && canChange(r)) : [];
    if (fixable.length) out.append(h("div", { class: "msg" }, t("test_fix_hint", { n: fixable.length }), " ",
      h("button", { type: "button", text: t("test_fix_btn", { n: fixable.length }), onclick: (e) => { if (confirm(t("test_fix_confirm", { n: fixable.length }))) unmarkTest(fixable, e.currentTarget); } })));
    const tbl = h("table", { class: "rec-table" }, h("tr", {}, ["", "c_when", "c_agent", "evaluator", "f_form", "h_type", "c_purpose", "c_ref", "final"].map((k) => h("th", { text: k ? t(k) : "" }))));
    recs.slice(0, 300).forEach((r) => tbl.append(h("tr", {},
      h("td", { class: "actions" }, canChange(r) ? h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }) : null, h("details", { class: "row-more" }, h("summary", { title: tl("أكتر", "More"), text: "⋯" }), h("div", { class: "row-more-menu" },
        // Sent automatically by the system (the designed email): no Outlook button, so the agent doesn't get it twice.
        mailable(r) ? (autoMailed(r) ? h("span", { class: "meta ok-txt", title: t("mail_auto_tip"), text: "✓ " + t("mail_auto_sent") }) : outlookButton(r, true)) : null,
        mailable(r) && r.mailQueued && !r.mailedAt ? h("span", { class: "meta warn", title: t("mail_queued_tip"), text: "⏳ " + t("mail_queued") }) : null,
        mailPending(r) && canChange(r) ? h("button", { type: "button", class: "ghost", title: t("mail_mark_hint"), text: t("mail_mark"), onclick: () => markMailed(r) }) : null,
        !isCoached(r) && !r.test && ["live", "certcall", "coaching", "postcoach"].includes(purposeOf(r)) && (canChange(r) || connected()) ? h("button", { type: "button", class: "ghost", text: t("coach_btn"), onclick: () => openCoaching(r) }) : null,
        r.test && canChange(r) && connected() ? h("button", { type: "button", class: "ghost", text: t("test_unmark"), onclick: (e) => unmarkTest([r], e.currentTarget) }) : null,
        canChange(r) ? h("button", { type: "button", class: "ghost", text: t("del"), onclick: () => deleteRecord(r) }) : null))),
      h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), h("div", { class: "meta eval-id-tag", title: t("c_eval_id"), text: evalIdOf(r), onclick: () => { navigator.clipboard && navigator.clipboard.writeText(evalIdOf(r)); toast("ok", t("eval_id_copied", { id: evalIdOf(r) })); } })), h("td", { text: r.agent || "–" }), h("td", { text: r.evaluator || "–" }),
      h("td", { text: formName(r.form) }), h("td", { text: typeLabel(r.form, r.type || "") || "–" }),
      h("td", {}, h("span", { class: "pill " + (r.test ? "na" : purposeOf(r) === "live" ? "good" : purposeOf(r) === "program" ? "prog" : "info"), title: purposeTag(r), text: String(purposeTag(r)).replace(/\s*\(.*\)\s*$/, "") }), r.callTag ? h("span", { class: "pill tag-" + r.callTag, text: t("tag_" + r.callTag) }) : null, r.method === "sidebyside" ? h("div", { class: "meta", text: t("m_sidebyside") }) : null, selectionOf(r) === "targeted" && purposeOf(r) !== "postcoach" ? h("div", { class: "meta", text: t("sel_targeted") }) : null, coachBadge(r), followBadge(r), r.followOfId ? h("div", { class: "meta", text: t("fu_of", { id: r.followOfId }) }) : null, mailPending(r) ? h("div", { class: "meta warn", text: "✉ " + t("mail_pending") }) : null, pickTrail(r) ? h("div", { class: "meta warn", title: pickTrail(r), text: "🎲 " + t("pick_repicked", { n: r.pickLog.length - 1 }) }) : null, r.sampleRef ? h("div", { class: "meta", text: r.sampleRef }) : null),
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
    for (const k of ["followOf", "followOfId", "pick", "pickAgent", "pickLog", "callId", "callTalk", "callPool", "callPbx", "callExt", "gCall", "trial", "gCallId"]) if (r[k] !== undefined) header[k] = r[k];
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
  const RESULT_WORD = () => mx({ Met: "اتعمل", "Not met": "ماتعملش", "N/A": "لا ينطبق", "No error": "مفيش غلط", Error: "غلط حرج", "": "مش متقيّم" },
    { Met: "Met", "Not met": "Not met", "N/A": "N/A", "No error": "No error", Error: "Error", "": "not scored" });
  function mailItemName(form, it) {
    const d = itemDef(form, it), a = {};
    return it.kind === "NC" ? "N" + it.id + " " + (a.label || (d && d.label) || it.text) : it.id + " " + (a.item || (d && d.item) || it.text);
  }
  function calSampleLine(g, sample) {
    const r = g[0], form = r.form === "whatsapp" ? mx("واتساب", "WhatsApp chat") : mx("مكالمة", "call");
    return mx("عينة ", "sample ") + sample + " (" + form + (r.agent ? mx(" للإيجنت ", " by ") + r.agent : "") + (whenText(r) ? mx(" بتاريخ ", " on ") + whenText(r) : "") + ")";
  }
  // Coaching session details typed on the Calibration page, written into the emails so the plan is documented.
  function calSession() {
    const v = ($("#calSession") || {}).value || "", kind = ($("#calSessionKind") || {}).value || "one";
    if (!v) return null;
    const d = new Date(v);
    const when = isNaN(d) ? v.replace("T", " ") : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) +
      mx(" الساعة ", " at ") + v.slice(11, 16);
    return { when, kind };
  }
  function calMail(r, ref, g, s, sample) {
    const p = (x) => (Math.round(x * 1000) / 10);
    const mark = (ok) => (ok ? "✔" : "✘");
    const W = RESULT_WORD(), ses = calSession();
    const bucket = { EU: mx("أخطاء العميل (EU)", "customer (EU)"), BC: mx("أخطاء البزنس (BC)", "business (BC)"), CC: mx("أخطاء الكومبلاينس (CC)", "compliance (CC)") };
    const levelWord = { ok: mx("معاير ✔", "Calibrated ✔"), watch: mx("قريب من المعيار (ملاحظات بس، من غير إعادة)", "Close (written feedback only, no recalibration)"), fail: mx("محتاج إعادة كاليبريشن", "Needs recalibration") };
    const subject = mx("نتيجة الكاليبريشن – عينة ", "Calibration result – sample ") + sample + " – " +
      { ok: mx("معاير", "Calibrated"), watch: mx("قريب من المعيار", "Close"), fail: mx("محتاج إعادة كاليبريشن", "Needs recalibration") }[s.level];
    const lines = [mx("أهلاً ", "Hi ") + (r.evaluator || "") + mx("،", ","), "",
      mx("دي نتيجتك في الكاليبريشن على ", "Here is your calibration result on ") + calSampleLine(g, sample) + mx("، مقارنةً بتقييم المرجع (", ", compared with the reference evaluation (") + ref.evaluator + ").", "",
      mx("- سكور البنود العادية (NC): ", "- Non-critical (NC) score: ") + pct(r.ncScore) + mx(" مقابل ", " vs ") + pct(ref.ncScore) + mx(" عند المرجع، يعني فرق ", " for the reference, a gap of ") + (s.gap === null ? "–" : p(s.gap)) + mx(" نقطة ", " points ") +
        (s.gap !== null && s.gap <= CAL.gap ? "✔" : s.gap !== null && s.gap <= CAL.watch ? mx("(بين " + p(CAL.gap) + " و" + p(CAL.watch) + "، قريب)", "(between " + p(CAL.gap) + " and " + p(CAL.watch) + ", close)") : "✘"),
      mx("- الاتفاق مع المرجع على البنود: ", "- Items scored the same as the reference: ") + pct(s.agree) + mx(" (المطلوب " + p(CAL.agree) + "% أو أكتر) ", " (target " + p(CAL.agree) + "% or more) ") + mark(s.agree >= CAL.agree),
      mx("- دقة الأخطاء الحرجة: ", "- Critical error accuracy: ") + ["EU", "BC", "CC"].filter((b) => s.buckets[b]).map((b) => bucket[b] + " " + mark(s.buckets[b].ref === s.buckets[b].mine)).join(mx("، ", ", ")) +
        (s.critSame ? "" : mx(" – فيه بند حرج متقيّم مختلف عن المرجع", " – a critical item was scored differently from the reference")),
      mx("- قرار ناجح / مش ناجح: ", "- Pass / fail decision: ") + (s.decisionSame ? mx("نفس قرار المرجع ✔", "same as the reference ✔") : mx("مختلف عن قرار المرجع ✘", "different from the reference ✘")), "",
      mx("النتيجة: ", "Result: ") + levelWord[s.level]];
    if (s.diffs.length) {
      lines.push("", mx("البنود اللي اختلفنا فيها:", "Items we scored differently:"));
      s.diffs.forEach((idx) => {
        const it = ref.items[idx], mine = r.items[idx] || {};
        lines.push("- " + mailItemName(ref.form, it) + mx(": تقييمك ", ": you scored ") + W[mine.result || ""] + mx("، والمرجع ", ", the reference ") + W[it.result || ""] + "." +
          (it.comment ? mx(" سبب المرجع: ", " Reference's reason: ") + it.comment : ""));
      });
      lines.push(mx("تقدر تراجع معنى كل بند وإمتى بيتحسب في تبويب \"دليل البنود\" في التول.", "You can check what each item means and when it applies in the \"Item guide\" tab of the tool."));
    }
    const sessionLine = ses ? (ses.kind === "group" ? mx("جلسة كوتشينج جماعية مع الفريق ", "Group coaching session with the team ") : mx("جلسة كوتشينج فردية ", "One-to-one coaching session ")) + ses.when +
      mx("، نسمع فيها التسجيل سوا ونتفق على حكم كل بند من اللي فوق.", ": we listen to the recording together and agree on each item above.")
      : mx("جلسة كوتشينج فردية 30 دقيقة نسمع فيها التسجيل سوا ونتفق على حكم كل بند من اللي فوق. هبعتلك ميعادها.", "A 30-minute one-to-one coaching session where we listen to the recording together and agree on each item above. I will send you the time.");
    if (s.level === "ok") lines.push("", mx("شغل ممتاز، تقييماتك ماشية مع المعيار.", "Great work, your scoring matches the standard.") + (s.diffs.length ? mx(" خلّي بالك بس من البنود اللي فوق.", " Just keep an eye on the items above.") : ""));
    else if (s.level === "watch") lines.push("", mx("المطلوب:", "Next steps:"),
      mx("1. راجع البنود اللي فوق في \"دليل البنود\" وطبّق الحكم ده من النهارده.", "1. Review the items above in the \"Item guide\" and apply this ruling from today."),
      ses && ses.kind === "group" ? mx("2. الجلسة الجماعية " + ses.when + " هنراجع فيها الأحكام دي، حضورك مهم.", "2. We will go over these rulings in the group session " + ses.when + "; please attend.")
        : mx("2. مش محتاج جلسة إعادة. هنتابع البنود دي في الكاليبريشن الجاي، ولو الفرق اتكرر هنعمل جلسة كوتشينج.", "2. No recalibration needed. We will follow these items in the next calibration; if the gap repeats we will hold a coaching session."));
    else lines.push("", mx("خطة الكوتشينج:", "Coaching plan:"), "1. " + sessionLine,
      mx("2. قبل الجلسة، راجع البنود دي في \"دليل البنود\" واكتب سبب تقييمك لكل بند.", "2. Before the session, review these items in the \"Item guide\" and note why you scored each one."),
      mx("3. بعد الجلسة، هتقيّم عينة كاليبريشن جديدة خلال أسبوع.", "3. After the session, you will score a new calibration sample within a week."),
      mx("4. لحد ما تعدّي الإعادة، هراجع معاك تقييماتك على البنود دي قبل ما توصل للإيجنتس.", "4. Until you pass it, I will review your scores on these items before they reach the agents."));
    lines.push("", mx("لو عندك أي سؤال على النتيجة كلّمني.", "If you have any question about the result, let me know."), "", ref.evaluator || "");
    return { subject, body: lines.join("\n") };
  }
  // One email to every evaluator on the sample: the agreed ruling on each item someone scored differently. No individual scores.
  function calRulingsMail(ref, g, sample) {
    const W = RESULT_WORD(), ses = calSession();
    const idxs = ref.items.map((_, idx) => idx).filter((idx) => g.some((r) => ((r.items[idx] || {}).result || "") !== (ref.items[idx].result || "")));
    const subject = mx("أحكام الكاليبريشن المتفق عليها – عينة ", "Agreed calibration rulings – sample ") + sample;
    const lines = [mx("أهلاً يا جماعة،", "Hi all,"), "", mx("دي الأحكام المتفق عليها في ", "These are the agreed rulings on ") + calSampleLine(g, sample) + mx(". من النهارده بنقيّم البنود دي بالشكل ده:", ". From today we score these items this way:"), ""];
    if (!idxs.length) lines.push(mx("كلنا اتفقنا على كل البنود، برافو.", "We all agreed on every item, well done."));
    idxs.forEach((idx) => {
      const it = ref.items[idx];
      lines.push("- " + mailItemName(ref.form, it) + ": " + W[it.result || ""] + (it.comment ? mx("، لأن ", ", because ") + it.comment : "") + ".");
    });
    if (ses) lines.push("", (ses.kind === "group" ? mx("جلسة الكوتشينج الجماعية: ", "Group coaching session: ") : mx("ميعاد الكوتشينج: ", "Coaching session: ")) + ses.when +
      mx("، هنسمع فيها التسجيل سوا ونتكلم على الأحكام دي.", ". We will listen to the recording together and go over these rulings."));
    lines.push("", mx("الأحكام دي هتتسجل في الـ Calibration Log. لو حد عنده اعتراض على حكم، يبعتلي قبل الكاليبريشن الجاي.", "These rulings go into the Calibration Log. If you disagree with one, send it to me before the next calibration."), "", ref.evaluator || "");
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
    const levelWord = { ok: mx("معاير ✔", "Calibrated ✔"), watch: mx("قريب من المعيار", "Close"), fail: mx("محتاج إعادة كاليبريشن", "Needs recalibration") };
    const subject = mx("نتيجة الكاليبريشن – ", "Calibration result – ") + round + " – " + levelWord[worst].replace(" ✔", "");
    const lines = [mx("أهلاً ", "Hi ") + name + mx("،", ","), "",
      mx("دي نتيجتك في جولة الكاليبريشن ", "Here is your result in calibration round ") + round + mx("، مقارنةً بتقييم المرجع (", ", compared with the reference evaluation (") + ref0 + ").", "",
      mx("الملخص:", "Summary:")];
    items.forEach(({ sample, s }) => lines.push("- " + sample + ": " + levelWord[s.level] + mx(" – فرق السكور ", " – score gap ") + (s.gap === null ? "–" : p(s.gap)) +
      mx(" نقطة، اتفاق البنود ", " points, items agreed ") + pct(s.agree) + (s.critSame ? "" : mx("، بند حرج مختلف", ", a critical item differs")) +
      (s.decisionSame ? "" : mx("، قرار ناجح/مش ناجح مختلف", ", different pass/fail decision"))));
    lines.push("", mx("النتيجة العامة: ", "Overall result: ") + levelWord[worst]);
    const withDiffs = items.filter((x) => x.s.diffs.length);
    if (withDiffs.length) {
      lines.push("", mx("البنود اللي اختلفنا فيها:", "Items we scored differently:"));
      withDiffs.forEach(({ sample, r, ref, g, s }) => {
        lines.push("", calSampleLine(g, sample) + ":");
        s.diffs.forEach((idx) => {
          const it = ref.items[idx], mine = r.items[idx] || {};
          lines.push("- " + mailItemName(ref.form, it) + mx(": تقييمك ", ": you scored ") + W[mine.result || ""] + mx("، والمرجع ", ", the reference ") + W[it.result || ""] + "." +
            (it.comment ? mx(" سبب المرجع: ", " Reference's reason: ") + it.comment : ""));
        });
      });
      lines.push("", mx("تقدر تراجع معنى كل بند وإمتى بيتحسب في تبويب \"دليل البنود\" في التول.", "You can check what each item means and when it applies in the \"Item guide\" tab of the tool."));
    }
    const sessionLine = ses ? (ses.kind === "group" ? mx("جلسة كوتشينج جماعية مع الفريق ", "Group coaching session with the team ") : mx("جلسة كوتشينج فردية ", "One-to-one coaching session ")) + ses.when +
      mx("، نسمع فيها التسجيلات سوا ونتفق على حكم كل بند من اللي فوق.", ": we listen to the recordings together and agree on each item above.")
      : mx("جلسة كوتشينج فردية 30 دقيقة نسمع فيها التسجيلات سوا ونتفق على حكم كل بند من اللي فوق. هبعتلك ميعادها.", "A 30-minute one-to-one coaching session where we listen to the recordings together and agree on each item above. I will send you the time.");
    if (worst === "ok") lines.push("", mx("شغل ممتاز، تقييماتك ماشية مع المعيار.", "Great work, your scoring matches the standard."));
    else if (worst === "watch") lines.push("", mx("المطلوب:", "Next steps:"),
      mx("1. راجع البنود اللي فوق في \"دليل البنود\" وطبّق الحكم ده من النهارده.", "1. Review the items above in the \"Item guide\" and apply this ruling from today."),
      ses && ses.kind === "group" ? mx("2. الجلسة الجماعية " + ses.when + " هنراجع فيها الأحكام دي، حضورك مهم.", "2. We will go over these rulings in the group session " + ses.when + "; please attend.")
        : mx("2. مش محتاج جلسة إعادة. هنتابع البنود دي في الكاليبريشن الجاي، ولو الفرق اتكرر هنعمل جلسة كوتشينج.", "2. No recalibration needed. We will follow these items in the next calibration; if the gap repeats we will hold a coaching session."));
    else lines.push("", mx("خطة الكوتشينج:", "Coaching plan:"), "1. " + sessionLine,
      mx("2. قبل الجلسة، راجع البنود دي في \"دليل البنود\" واكتب سبب تقييمك لكل بند.", "2. Before the session, review these items in the \"Item guide\" and note why you scored each one."),
      mx("3. بعد الجلسة، هتقيّم عينة كاليبريشن جديدة خلال أسبوع.", "3. After the session, you will score a new calibration sample within a week."),
      mx("4. لحد ما تعدّي الإعادة، هراجع معاك تقييماتك على البنود دي قبل ما توصل للإيجنتس.", "4. Until you pass it, I will review your scores on these items before they reach the agents."));
    lines.push("", mx("لو عندك أي سؤال على النتيجة كلّمني.", "If you have any question about the result, let me know."), "", ref0);
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
  // Recalibration tracker: every sample where an evaluator came out "needs recalibration" against the reference,
  // and the next sample they scored with the same reference (the recalibration) with its result.
  function renderCalTrack() {
    const box = $("#calTrack"); if (!box) return;
    const recs = allRecords().filter((r) => r.sampleRef);
    const sg = sampleRefs();
    const samples = [...sg.values()].filter((g) => !/^TEST/i.test(g.ref) && !g.list.every((r) => r.test))
      .sort((x, y) => sampleStart(x).localeCompare(sampleStart(y)) || x.ref.localeCompare(y.ref, undefined, { numeric: true }));
    const count = new Map();
    samples.forEach((g) => new Set(g.list.map((r) => r.evaluator).filter(Boolean)).forEach((n) => count.set(n, (count.get(n) || 0) + 1)));
    const names = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b));
    const prevSel = $("#calTrackRef"), prev = prevSel ? prevSel.value : "";
    const refName = names.includes(prev) ? prev : names.includes(settings.evaluator) ? settings.evaluator : names[0] || "";
    box.innerHTML = "";
    box.append(h("h2", { text: tx("🔁 متابعة الريكاليبريشن", "🔁 Recalibration follow-up") }),
      h("p", { class: "hint", text: tx("كل مقيّم وقع في كاليبريشن (محتاج إعادة كاليبريشن) قدام المرجع، وأول عينة قيّمها بعدها مع نفس المرجع بتتحسب ريكاليبريشن ليه، ونتيجتها جنبها. العينات التجريبية (TEST) مش محسوبة.",
        "Every evaluator who came out \"needs recalibration\" against the reference, and the first sample they scored after it with the same reference counts as their recalibration, with its result. TEST samples are left out.") }));
    if (!names.length) { box.append(h("div", { class: "empty", text: t("cal_none") })); return; }
    const sel = h("select", { id: "calTrackRef" }, names.map((n) => h("option", { value: n, text: n })));
    sel.value = refName; sel.addEventListener("change", renderCalTrack);
    box.append(h("div", { class: "grid" }, h("label", {}, h("span", { text: tx("المرجع", "Reference") }), sel)));
    // Each evaluator's result on every sample the reference scored, oldest first.
    const per = new Map();
    samples.forEach((sgp) => {
      const c = calGroup(recs, sgp.ref); if (!c) return;
      const rf = c.g.find((r) => r.evaluator === refName); if (!rf) return;
      c.g.filter((r) => r !== rf && r.evaluator).forEach((r) => {
        const s = calStats(r, rf, rf.ncScore);
        (per.get(r.evaluator) || per.set(r.evaluator, []).get(r.evaluator)).push({ sample: sgp.ref, day: sampleStart(sgp), r, level: s.level, gap: s.gap });
      });
    });
    const W = { ok: t("cal_ok"), watch: t("cal_watch"), fail: t("cal_not_ok") }, P = { ok: "good", watch: "warn", fail: "bad" };
    const rows = [];
    per.forEach((list, n) => list.forEach((x, i) => { if (x.level === "fail") rows.push({ n, x, next: list[i + 1] || null }); }));
    const open = rows.filter((z) => !z.next || z.next.level === "fail").length;
    box.append(h("div", { class: "tiles" },
      [[tx("وقعوا في الكاليبريشن", "Failed a calibration"), rows.length, tx("مرة", "times")],
        [tx("اتعملهم ريكاليبريشن", "Recalibrated"), rows.filter((z) => z.next).length, tx("ونجحوا فيه: ", "passed: ") + rows.filter((z) => z.next && z.next.level !== "fail").length],
        [tx("لسه مفتوحين", "Still open"), open, tx("مستنيين ريكاليبريشن أو وقعوا تاني", "waiting, or failed again")]]
        .map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: String(v) }), h("div", { class: "tile-s", text: sub })))));
    if (!rows.length) { box.append(h("p", { class: "msg", text: tx("مفيش حد وقع في كاليبريشن قدام المرجع ده.", "Nobody failed a calibration against this reference.") })); return; }
    const tbl = h("table", {}, h("tr", {}, [tx("المقيّم", "Evaluator"), tx("الكاليبريشن اللي وقع فيه", "Failed calibration"), tx("الريكاليبريشن", "Recalibration"), tx("الحالة", "Status")].map((x) => h("th", { text: x }))));
    const isOpen = (z) => (!z.next || z.next.level === "fail" ? 0 : 1);
    rows.sort((a, b) => isOpen(a) - isOpen(b) || b.x.day.localeCompare(a.x.day));
    const gapTxt = (g) => (g === null || g === undefined ? "" : " · " + tx("فرق ", "gap ") + Math.round(g * 1000) / 10 + " " + t("pts"));
    rows.forEach(({ n, x, next }) => {
      const status = !next ? h("span", { class: "pill bad", text: tx("لسه متعملوش ريكاليبريشن", "No recalibration yet") })
        : next.level === "fail" ? h("span", { class: "pill bad", text: tx("وقع تاني، محتاج ريكاليبريشن تاني", "Failed again, needs another") })
        : h("span", { class: "pill good", text: tx("✓ اتقفلت", "✓ Closed") });
      const days = next && x.day && next.day ? Math.round((new Date(next.day) - new Date(x.day)) / 864e5) : null;
      tbl.append(h("tr", {}, h("td", {}, h("b", { text: n })),
        h("td", {}, h("div", { dir: "ltr", text: x.sample }), h("div", { class: "meta", text: (x.day || "") + gapTxt(x.gap) })),
        h("td", {}, next ? [h("div", { dir: "ltr", text: next.sample }), h("span", { class: "pill " + P[next.level], text: W[next.level] }),
          h("div", { class: "meta", text: (next.day || "") + (days !== null ? " · " + tx("بعد ", "after ") + days + tx(" يوم", " days") : "") + gapTxt(next.gap) })]
          : h("span", { class: "meta", text: "–" })),
        h("td", {}, status)));
    });
    box.append(h("div", { class: "table-wrap" }, tbl));
  }
  // ---------- Gauge R&R (attribute agreement analysis) ----------
  // Calibration aligns people by discussing a call. Gauge R&R tests the measurement itself: a set of calls with an agreed
  // standard (scored by an owner), every evaluator scores each call twice, blind, some days apart. From that:
  //   repeatability  = an evaluator agrees with himself across the two rounds,
  //   accuracy       = an evaluator agrees with the standard (both rounds),
  //   reproducibility = the evaluators agree with each other.
  // Bands are our own rule, taken from common practice: 90%+ certified, 80-90% targeted calibration, under 80% retraining;
  // kappa 0.9+ excellent, under 0.7 needs action.
  const GAUGE_OK = 0.9, GAUGE_WATCH = 0.8, GAUGE_MIN_CALLS = 10;
  const gaugeGap = () => { const n = Number(teamCfg.gaugeGapDays); return n >= 0 && n <= 60 && teamCfg.gaugeGapDays !== undefined && teamCfg.gaugeGapDays !== "" ? Math.round(n) : 5; };
  const gaugeIsClosed = (ref) => (teamCfg.gaugeClosed || []).includes(ref);
  const gaugeMe = () => settings.who || settings.evaluator || "";
  function gaugeStudies() {
    const map = new Map();
    for (const r of gaugeRecs.values()) {
      if (!r.sampleRef || deleted.has(r.id)) continue;
      const st = map.get(r.sampleRef) || { ref: r.sampleRef, form: r.form, std: new Map(), recs: [] };
      if (Number(r.trial) === 0) st.std.set(Number(r.gCall), r); else st.recs.push(r);
      map.set(r.sampleRef, st);
    }
    return map;
  }
  const gaugeDay = (ref) => { const m = /^GRR-(\d{4})(\d{2})(\d{2})-/.exec(ref); return m ? m[1] + "-" + m[2] + "-" + m[3] : ""; };
  function newGaugeRef() {
    const prefix = "GRR-" + ymd(today()) + "-";
    let n = 1;
    for (const ref of gaugeStudies().keys()) if (ref.startsWith(prefix)) n = Math.max(n, (+ref.slice(prefix.length) || 0) + 1);
    return prefix + n;
  }
  // What one evaluator still has to score in a study: round 1 for every call, then round 2 once the gap has passed.
  function gaugeTodo(st, who) {
    const due = [], waits = [];
    let d1 = 0, d2 = 0;
    for (const n of st.std.keys()) {
      const mine = st.recs.filter((r) => Number(r.gCall) === n && nameKey(r.evaluator) === nameKey(who));
      const t1 = mine.find((r) => Number(r.trial) === 1), t2 = mine.find((r) => Number(r.trial) === 2);
      if (t1) d1++; if (t2) d2++;
      if (!t1) due.push({ n, trial: 1 });
      else if (!t2) { const open = addDays(localDay(t1.savedAt), gaugeGap()); if (today() >= open) due.push({ n, trial: 2 }); else waits.push(open); }
    }
    return { due, waits: waits.sort(), d1, d2, total: st.std.size };
  }
  const localDay = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? today() : ymdOf(d); };
  const GAUGE_COPY = ["agent", "interactionDate", "odooRef", "phone", "type", "duration", "kbVersion", "gCallId"];
  function gaugeFields(a) {
    const hd = a.header, own = isOwner(), out = [];
    const studies = [...gaugeStudies().values()].filter((st) => st.form === current.form && (!gaugeIsClosed(st.ref) || st.ref === hd.sampleRef))
      .sort((x, y) => y.ref.localeCompare(x.ref, undefined, { numeric: true }));
    const nextCall = (ref) => { const st = gaugeStudies().get(ref); return st ? Math.max(0, ...st.std.keys()) + 1 : 1; };
    const ss = h("select", { id: "hd_gaugeStudy" }, h("option", { value: "", text: t("select") }),
      own && !current.edit ? h("option", { value: "__new", text: tl("➕ دراسة جيج جديدة", "➕ New Gauge study") }) : null,
      studies.map((st) => h("option", { value: st.ref, text: st.ref + " · " + st.std.size + tl(" مكالمة", " calls") })));
    if (hd.sampleRef && !studies.some((st) => st.ref === hd.sampleRef)) ss.append(h("option", { value: hd.sampleRef, text: hd.sampleRef + tl(" (جديدة)", " (new)") }));
    ss.value = hd.sampleRef || "";
    ss.disabled = !!current.edit;
    ss.addEventListener("input", async () => {
      if (ss.value === "__new") { await refreshRecordsQuietly(); hd.sampleRef = newGaugeRef(); } else hd.sampleRef = ss.value;
      for (const k of ["gCall", "trial"]) delete hd[k];
      if (own && hd.sampleRef) { hd.gCall = nextCall(hd.sampleRef); hd.trial = 0; }
      saveDraft(); renderHeader();
    });
    out.push(h("label", {}, tl("دراسة الجيج", "Gauge study") + " *", ss));
    if (!hd.sampleRef) {
      out.push(h("p", { class: "hint", text: own ? tl("اختار دراسة أو ابدأ واحدة جديدة. انت اللي بتحط المرجع (الحكم الصح) لكل مكالمة، ومحدش بيشوفه غيرك لحد ما الدراسة تتقفل.", "Pick a study or start a new one. You set the standard (the right ruling) for each call; nobody else sees it until the study is closed.")
        : studies.length ? tl("اختار الدراسة، وبعدين الأداة هتديك المكالمات واحدة واحدة بترتيب عشوائي.", "Pick the study; the tool then hands you the calls one at a time, in random order.") : tl("مفيش دراسة جيج مفتوحة دلوقتي.", "No Gauge study is open right now.") }));
      return out;
    }
    if (own) {
      if (!current.edit && !hd.gCall) { hd.gCall = nextCall(hd.sampleRef); hd.trial = 0; }
      const cid = h("input", { id: "hd_gCallId", value: hd.gCallId || "", dir: "ltr", placeholder: "Call ID" });
      cid.addEventListener("input", () => { hd.gCallId = cid.value.trim(); saveDraft(); });
      out.push(h("label", {}, tl("Call ID في سيستم التليفونات (اختياري)", "Call ID in the phone system (optional)"), cid),
        h("p", { class: "hint", text: tl("المرجع · مكالمة رقم ", "Standard · call no. ") + hd.gCall + tl(". اكتب بيانات المكالمة (الإيجنت، وقت المكالمة، رقم العميل) وقيّمها. ده الحكم اللي كل المقيّمين هيتقاسوا عليه. الأفضل 12 لـ 20 مكالمة: نصهم ناجح ونصهم راسب، وفيهم كريتيكال وحالات على الحد.",
          ". Enter the call details (agent, call time, customer number) and score it. This is the ruling every evaluator is measured against. Best is 12 to 20 calls: half pass, half fail, with criticals and borderline cases.") }));
      return out;
    }
    const st = gaugeStudies().get(hd.sampleRef), who = hd.evaluator || gaugeMe();
    const box = h("div", { class: "picker gauge-panel" });
    if (!st || !st.std.size) { box.append(h("p", { class: "hint", text: tl("الدراسة دي لسه مفيهاش مكالمات.", "This study has no calls yet.") })); out.push(box); return out; }
    const td = gaugeTodo(st, who);
    box.append(h("div", { class: "gauge-prog" },
      h("span", { class: "pill " + (td.d1 >= td.total ? "good" : "info"), text: tl("الجولة 1: ", "Round 1: ") + td.d1 + "/" + td.total }),
      h("span", { class: "pill " + (td.d2 >= td.total ? "good" : "info"), text: tl("الجولة 2: ", "Round 2: ") + td.d2 + "/" + td.total })));
    const cur = hd.gCall && td.due.find((x) => x.n === Number(hd.gCall) && x.trial === Number(hd.trial));
    if (hd.gCall && !cur) { for (const k of ["gCall", "trial"]) delete hd[k]; saveDraft(); }
    if (cur) {
      box.append(h("p", {}, h("b", { text: tl("الجولة ", "Round ") + cur.trial + tl(": قيّم المكالمة اللي بياناتها في الخانات فوق.", ": score the call whose details are in the fields above.") })),
        h("p", { class: "hint", text: tl("قيّمها لوحدك من غير ما تسأل حد أو ترجع لتقييم قديم. التقييم مش بيتعدّل بعد الحفظ، ومحدش بيشوف النتايج غير لما الدراسة تتقفل.", "Score it on your own, without asking anyone or looking at an earlier evaluation. It can't be changed after saving, and nobody sees results until the study is closed.") }));
    } else if (td.due.length) {
      const btn = h("button", { type: "button", class: "primary", text: "🎲 " + tl("هات المكالمة الجاية", "Give me the next call") + " (" + td.due.length + ")" });
      btn.onclick = () => {
        const x = td.due[Math.floor(Math.random() * td.due.length)], std = st.std.get(x.n);
        hd.gCall = x.n; hd.trial = x.trial;
        for (const k of GAUGE_COPY) { if (std[k] !== undefined && std[k] !== "") hd[k] = std[k]; else delete hd[k]; }
        a.nc.forEach((o) => Object.assign(o, { result: "", evidence: "", comment: "", locked: false })); a.crit.forEach((o) => Object.assign(o, { result: "", evidence: "", comment: "", locked: false }));
        saveDraft(); applyType(); renderHeader(); renderItems(); updateScore();
      };
      box.append(btn);
    } else {
      box.append(h("p", {}, h("b", { text: td.d2 >= td.total ? "✓ " + tl("خلصت الجولتين. النتايج هتظهر لما الدراسة تتقفل.", "Both rounds done. Results show once the study is closed.")
        : tl("خلصت اللي عليك دلوقتي. الجولة 2 بتفتح يوم ", "Nothing due now. Round 2 opens on ") + (td.waits[0] || "–") + tl(" (بعد " + gaugeGap() + " أيام من الجولة 1).", " (" + gaugeGap() + " days after round 1).") })));
    }
    out.push(box);
    return out;
  }
  async function saveGauge(rec, msg) {
    const edit = current.edit, fail = (m) => { msg.className = "msg err"; msg.textContent = m; toast("err", m); };
    if (!connected()) return fail(t("gauge_need_conn"));
    rec.test = false; delete rec.callId; delete rec.mailMode;
    if (edit) Object.assign(rec, { id: edit.id, savedAt: edit.savedAt, editedAt: new Date().toISOString(), editedBy: settings.evaluator || rec.evaluator });
    msg.className = "msg"; msg.textContent = t("saving");
    try { await apiPostJson(edit ? { action: "updateRecord", record: rec } : { record: rec }); }
    catch (e) { return fail(t("save_failed", { e: e.message })); }
    // An evaluator keeps no copy of the scores on this device, only a marker that the call is done.
    gaugeRecs.set(rec.id, isOwner() ? rec : { id: rec.id, form: rec.form, purpose: "gauge", sampleRef: rec.sampleRef, gCall: rec.gCall, trial: rec.trial || 1, evaluator: rec.evaluator, savedAt: rec.savedAt, hidden: true, items: [] });
    current = { form: current.form, answers: blankAnswers(current.form) };
    Object.assign(current.answers.header, { purpose: "gauge", sampleRef: rec.sampleRef, selection: "targeted" });
    store(LS_DRAFT, null);
    renderEvaluate();
    const m2 = $("#saveMsg"), text = tl("اتحفظ في دراسة الجيج ", "Saved in Gauge study ") + rec.sampleRef;
    if (m2) { m2.className = "msg ok"; m2.textContent = text; }
    toast("ok", "✓ " + text);
    refreshRecordsQuietly();
  }

  // --- the numbers ---
  const gPass = (r) => (r.result === "Pass" ? "P" : "F");
  // Cohen's kappa for two lists of labels (same length).
  function kappa2(a, b) {
    const n = a.length; if (!n) return null;
    const cats = [...new Set(a.concat(b))];
    let po = 0, pe = 0;
    for (let i = 0; i < n; i++) if (a[i] === b[i]) po++;
    po /= n;
    cats.forEach((c) => { pe += (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n); });
    return pe >= 1 ? (po >= 1 ? 1 : null) : (po - pe) / (1 - pe);
  }
  // Fleiss' kappa: rows = subjects, each row = list of labels from the same number of raters.
  function kappaFleiss(rows) {
    const N = rows.length; if (!N) return null;
    const m = rows[0].length; if (m < 2 || rows.some((r) => r.length !== m)) return null;
    const cats = [...new Set(rows.flat())];
    let pBar = 0; const pj = cats.map(() => 0);
    rows.forEach((r) => {
      let sum = 0;
      cats.forEach((c, j) => { const k = r.filter((x) => x === c).length; pj[j] += k; sum += k * (k - 1); });
      pBar += sum / (m * (m - 1));
    });
    pBar /= N;
    const pe = pj.reduce((x, k) => x + Math.pow(k / (N * m), 2), 0);
    return pe >= 1 ? (pBar >= 1 ? 1 : null) : (pBar - pe) / (1 - pe);
  }
  function gaugeStats(st) {
    const calls = [...st.std.keys()].sort((a, b) => a - b), full = st.recs.filter((r) => !r.hidden);
    const names = [...new Set(full.map((r) => r.evaluator).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const get = (who, n, tr) => full.find((r) => nameKey(r.evaluator) === nameKey(who) && Number(r.gCall) === n && Number(r.trial) === tr);
    const itemMap = (r) => { const m = new Map(); (r.items || []).forEach((i) => { if (i.result) m.set(i.id, i); }); return m; };
    const stdItems = new Map(calls.map((n) => [n, itemMap(st.std.get(n))]));
    const itemAgg = new Map(); // item id -> { text, kind, n, ok, rep, repOk }
    const per = names.map((who) => {
      let both = 0, within = 0, strict = 0, dec = 0, acc = 0, sf = 0, miss = 0, sp = 0, alarm = 0, it = 0, itOk = 0, cr = 0, crOk = 0, done1 = 0, done2 = 0;
      const mineL = [], stdL = [];
      calls.forEach((n) => {
        const std = st.std.get(n), r1 = get(who, n, 1), r2 = get(who, n, 2), S = gPass(std);
        if (r1) done1++; if (r2) done2++;
        [r1, r2].forEach((r) => {
          if (!r) return;
          dec++; mineL.push(gPass(r)); stdL.push(S);
          if (gPass(r) === S) acc++;
          if (S === "F") { sf++; if (gPass(r) === "P") miss++; } else { sp++; if (gPass(r) === "F") alarm++; }
          const mi = itemMap(r);
          stdItems.get(n).forEach((si, id) => {
            const x = mi.get(id); if (!x) return;
            const ok = x.result === si.result, g = itemAgg.get(id) || { id, text: si.text, kind: si.kind, n: 0, ok: 0, rep: 0, repOk: 0 };
            g.n++; if (ok) g.ok++; itemAgg.set(id, g);
            it++; if (ok) itOk++;
            if (si.kind !== "NC") { cr++; if (ok) crOk++; }
          });
        });
        if (r1 && r2) {
          both++;
          if (gPass(r1) === gPass(r2)) within++;
          if (gPass(r1) === S && gPass(r2) === S) strict++;
          const m1 = itemMap(r1), m2 = itemMap(r2);
          m1.forEach((x, id) => { const y = m2.get(id); if (!y) return; const g = itemAgg.get(id) || { id, text: x.text, kind: x.kind, n: 0, ok: 0, rep: 0, repOk: 0 }; g.rep++; if (x.result === y.result) g.repOk++; itemAgg.set(id, g); });
        }
      });
      const complete = calls.length > 0 && done1 === calls.length && done2 === calls.length;
      const vs = both ? strict / both : null;
      return { who, done1, done2, complete, both, within: both ? within / both : null, vs, acc: dec ? acc / dec : null, miss: sf ? miss / sf : null, alarm: sp ? alarm / sp : null,
        items: it ? itOk / it : null, crit: cr ? crOk / cr : null, kappa: kappa2(mineL, stdL),
        level: vs === null ? "" : vs >= GAUGE_OK ? "ok" : vs >= GAUGE_WATCH ? "watch" : "fail" };
    });
    // Between evaluators: only calls every finished evaluator scored in both rounds.
    const fin = per.filter((x) => x.complete).map((x) => x.who);
    let btw = null, allStd = null, fk = null;
    if (fin.length >= 2) {
      const rows = calls.map((n) => fin.flatMap((who) => [gPass(get(who, n, 1)), gPass(get(who, n, 2))]));
      btw = rows.filter((r) => r.every((x) => x === r[0])).length / rows.length;
      allStd = rows.filter((r, i) => r.every((x) => x === gPass(st.std.get(calls[i])))).length / rows.length;
      fk = kappaFleiss(rows);
    }
    const items = [...itemAgg.values()].filter((g) => g.n >= 2).map((g) => Object.assign(g, { agree: g.ok / g.n, repeat: g.rep ? g.repOk / g.rep : null })).sort((a, b) => a.agree - b.agree);
    const stdPass = calls.filter((n) => gPass(st.std.get(n)) === "P").length;
    return { calls, names, per, fin, btw, allStd, fk, items, stdPass, stdFail: calls.length - stdPass };
  }
  function gItemName(form, g) {
    const d = F.forms[form] || {}, it = g.kind === "NC" ? (d.nc || [])[+g.id - 1] : (d.crit || [])[+String(g.id).replace(/\D/g, "") - 1];
    const ar = (it && it.ar) || {};
    return String((lang === "en" ? (it && (it.label || it.item)) : ar.label || ar.item || (it && (it.label || it.item))) || g.text || "").slice(0, 90);
  }
  async function gaugeSet(body) {
    try { const j = await apiPostJson(Object.assign({ action: "gaugeSet" }, body)); teamCfg = Object.assign(teamCfg, j.config); store("qa_team_cfg", teamCfg); await refreshRecordsQuietly(); }
    catch (e) { alert(e.message); }
    renderGauge();
  }
  function renderGauge() {
    const box = $("#gaugeBox"); if (!box) return;
    const prev = ($("#gaugeStudy") || {}).value || "";
    box.innerHTML = "";
    const own = isOwner(), studies = [...gaugeStudies().values()].sort((x, y) => y.ref.localeCompare(x.ref, undefined, { numeric: true }));
    box.append(h("h2", { text: "🎯 Gauge R&R · " + tl("اختبار المقيّمين", "evaluators' test") }),
      h("p", { class: "hint", text: tl("الكاليبريشن بيوحّد الفهم بالنقاش. الجيج بيقيس: هل المقيّم بيدي نفس الحكم لو سمع نفس المكالمة تاني (ثبات)، وهل حكمه زي المرجع (دقة)، وهل المقيّمين زي بعض (اتفاق)؟ كل مكالمة بتتقيّم مرتين بينهم " + gaugeGap() + " أيام، ومحدش بيشوف تقييم حد (ولا تقييمه القديم) لحد ما الدراسة تتقفل. تقييمات الجيج مش بتتحسب في أي تارجت أو داشبورد ومش بتتبعت للإيجنت.",
        "Calibration aligns people by discussion. Gauge measures: does an evaluator give the same ruling on the same call again (repeatability), does it match the standard (accuracy), and do evaluators match each other (agreement)? Every call is scored twice, " + gaugeGap() + " days apart, and nobody sees anyone's scores (or their own earlier ones) until the study is closed. Gauge evaluations count in no target or dashboard and are never emailed to the agent.") }));
    if (!studies.length) {
      box.append(h("div", { class: "empty", text: own ? tl("مفيش دراسة لسه. ابدأ من صفحة «تقييم»: اختار الغرض Gauge R&R، ثم «دراسة جيج جديدة»، وقيّم أول مكالمة كمرجع.", "No study yet. Start from Evaluate: choose the purpose Gauge R&R, then New Gauge study, and score the first call as the standard.") : tl("مفيش دراسة جيج لسه.", "No Gauge study yet.") }));
      return;
    }
    const sel = h("select", { id: "gaugeStudy" }, studies.map((st) => h("option", { value: st.ref, text: st.ref + " · " + st.std.size + tl(" مكالمة", " calls") + (gaugeIsClosed(st.ref) ? tl(" · مقفولة", " · closed") : tl(" · مفتوحة", " · open")) })));
    if (studies.some((st) => st.ref === prev)) sel.value = prev;
    sel.addEventListener("change", renderGauge);
    box.append(h("div", { class: "grid" }, h("label", {}, h("span", { text: tl("الدراسة", "Study") }), sel)));
    const st = studies.find((x) => x.ref === sel.value), closed = gaugeIsClosed(st.ref), who = gaugeMe();
    if (own) {
      const gap = h("input", { type: "number", min: "0", max: "60", value: String(gaugeGap()), style: "width:80px" });
      box.append(h("div", { class: "toolbar gauge-tools" },
        h("label", { class: "inline" }, h("span", { text: tl("أيام بين الجولتين", "Days between rounds") + " " }), gap),
        h("button", { type: "button", text: tl("حفظ", "Save"), onclick: () => gaugeSet({ gapDays: Number(gap.value) }) }),
        h("button", { type: "button", class: closed ? "" : "primary", text: closed ? tl("افتح الدراسة تاني (النتايج تستخبى)", "Reopen the study (hide results)") : tl("اقفل الدراسة واعرض النتايج للكل", "Close the study and show results to everyone"),
          onclick: () => { if (confirm(closed ? tl("تفتح الدراسة تاني؟ النتايج هتستخبى من المقيّمين.", "Reopen the study? Results will be hidden from evaluators again.") : tl("تقفل الدراسة؟ كل المقيّمين هيشوفوا المرجع وتقييمات بعض، ومحدش هيقدر يقيّم فيها تاني.", "Close the study? Every evaluator will see the standard and each other's scores, and no more scoring is possible."))) gaugeSet({ study: st.ref, closed: !closed }); } })));
    }
    if (!own && !closed) {
      const td = gaugeTodo(st, who);
      box.append(h("div", { class: "tiles" },
        [[tl("الجولة 1", "Round 1"), td.d1 + "/" + td.total, ""], [tl("الجولة 2", "Round 2"), td.d2 + "/" + td.total, td.waits[0] ? tl("بتفتح ", "opens ") + td.waits[0] : ""], [tl("مستنياك دلوقتي", "Due now"), td.due.length, tl("من صفحة «تقييم»", "from Evaluate")]]
          .map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: String(v) }), h("div", { class: "tile-s", text: sub })))),
        h("p", { class: "msg", text: tl("النتايج هتظهر هنا لما الدراسة تتقفل.", "Results show here once the study is closed.") }));
      return;
    }
    const s = gaugeStats(st), P = { ok: "good", watch: "warn", fail: "bad" };
    const W = { ok: tl("معتمد", "Certified"), watch: tl("كاليبريشن موجّه", "Targeted calibration"), fail: tl("إعادة تدريب", "Retraining") };
    const band = (x) => (x === null ? "" : x >= GAUGE_OK ? "good" : x >= GAUGE_WATCH ? "warn" : "bad");
    const cell = (x) => h("td", { class: "num" }, x === null ? "–" : h("span", { class: "pill " + band(x), text: pct(x) }));
    const kap = (k) => (k === null || k === undefined ? "–" : (Math.round(k * 100) / 100).toFixed(2));
    box.append(h("div", { class: "tiles" },
      [[tl("المكالمات", "Calls"), s.calls.length, tl("ناجح ", "pass ") + s.stdPass + tl(" · راسب ", " · fail ") + s.stdFail],
        [tl("مقيّمين خلصوا الجولتين", "Evaluators done"), s.fin.length + "/" + s.names.length, ""],
        [tl("اتفاق المقيّمين مع بعض", "Between evaluators"), pct(s.btw), "Fleiss κ " + kap(s.fk)],
        [tl("الكل مع المرجع", "All vs standard"), pct(s.allStd), tl("كل المقيّمين في الجولتين", "every evaluator, both rounds")]]
        .map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: String(v) }), h("div", { class: "tile-s", text: sub })))));
    if (s.calls.length < GAUGE_MIN_CALLS) box.append(h("p", { class: "msg", text: tl("العدد لسه قليل (" + s.calls.length + " مكالمة). النتيجة يُعتمد عليها من " + GAUGE_MIN_CALLS + " مكالمات، والأفضل 12 لـ 20، نصهم ناجح ونصهم راسب.", "Few calls so far (" + s.calls.length + "). Results are dependable from " + GAUGE_MIN_CALLS + " calls; 12 to 20 is best, half pass and half fail.") }));
    if (!s.names.length) box.append(h("div", { class: "empty", text: tl("لسه مفيش مقيّم قيّم في الدراسة دي.", "No evaluator has scored in this study yet.") }));
    else {
      const head = [tl("المقيّم", "Evaluator"), tl("جولة 1", "Round 1"), tl("جولة 2", "Round 2"), tl("ثبات (مع نفسه)", "Repeatability"), tl("دقة (مع المرجع في الجولتين)", "Vs standard (both rounds)"), "κ", tl("عدّى مكالمة راسبة", "Missed a fail"), tl("سقّط مكالمة ناجحة", "False alarm"), tl("اتفاق البنود", "Items"), tl("بنود الكريتيكال", "Critical items"), tl("النتيجة", "Verdict")];
      const tb = h("table", {}, h("tr", {}, head.map((x) => h("th", { text: x }))));
      s.per.slice().sort((a, b) => (a.vs === null ? 2 : a.vs) - (b.vs === null ? 2 : b.vs)).forEach((x) => tb.append(h("tr", {},
        h("td", {}, h("b", { text: x.who })), h("td", { class: "num", text: x.done1 + "/" + s.calls.length }), h("td", { class: "num", text: x.done2 + "/" + s.calls.length }),
        cell(x.within), cell(x.vs), h("td", { class: "num", text: kap(x.kappa) }),
        h("td", { class: "num" }, x.miss === null ? "–" : h("span", { class: "pill " + (x.miss ? "bad" : "good"), text: pct(x.miss) })),
        h("td", { class: "num" }, x.alarm === null ? "–" : h("span", { class: "pill " + (x.alarm ? "warn" : "good"), text: pct(x.alarm) })),
        cell(x.items), cell(x.crit),
        h("td", {}, !x.complete ? h("span", { class: "pill na", text: tl("لسه مكمّلش", "Not finished") }) : h("span", { class: "pill " + P[x.level], text: W[x.level] })))));
      box.append(h("div", { class: "table-wrap" }, tb),
        h("p", { class: "hint", text: tl("الحدود: 90% أو أكتر معتمد، 80 لـ 90% كاليبريشن موجّه، أقل من 80% إعادة تدريب. كابا (κ): 0.9 أو أكتر ممتاز، أقل من 0.7 محتاج تصرّف. «عدّى مكالمة راسبة» أخطر من «سقّط مكالمة ناجحة».",
          "Bands: 90%+ certified, 80 to 90% targeted calibration, under 80% retraining. Kappa (κ): 0.9+ excellent, under 0.7 needs action. Missing a fail is worse than a false alarm.") }));
      const weak = s.items.filter((g) => g.agree < GAUGE_OK).slice(0, 12);
      box.append(h("h3", { text: tl("البنود اللي المقيّمين مختلفين فيها مع المرجع", "Items where evaluators differ from the standard") }));
      if (!weak.length) box.append(h("p", { class: "msg ok", text: tl("كل البنود اتفاقها 90% أو أكتر.", "Every item is at 90% agreement or more.") }));
      else {
        const it = h("table", {}, h("tr", {}, [tl("البند", "Item"), tl("النوع", "Kind"), tl("اتفاق مع المرجع", "Vs standard"), tl("ثبات المقيّم مع نفسه", "Repeatability"), tl("عدد الأحكام", "Rulings")].map((x) => h("th", { text: x }))));
        weak.forEach((g) => it.append(h("tr", {}, h("td", { text: (g.kind === "NC" ? "N" : "") + g.id + " · " + gItemName(st.form, g) }), h("td", { text: g.kind }), cell(g.agree), cell(g.repeat), h("td", { class: "num", text: String(g.n) }))));
        box.append(h("div", { class: "table-wrap" }, it), h("p", { class: "hint", text: tl("بند اتفاقه ضعيف عند كل المقيّمين معناه إن تعريف البند نفسه محتاج توضيح، مش إن المقيّمين غلطانين.", "An item that is weak for every evaluator means the item's definition needs clarifying, not that the evaluators are wrong.") }));
      }
    }
    if (own) {
      box.append(h("h3", { text: tl("مكالمات الدراسة (المرجع)", "Study calls (the standard)") }));
      const ct = h("table", {}, h("tr", {}, ["#", tl("الإيجنت", "Agent"), tl("وقت المكالمة", "Call time"), tl("العميل", "Customer"), tl("حكم المرجع", "Standard"), tl("اتقيّمت", "Scored"), ""].map((x) => h("th", { text: x }))));
      s.calls.forEach((n) => { const r = st.std.get(n), k = st.recs.filter((x) => Number(x.gCall) === n);
        ct.append(h("tr", {}, h("td", { class: "num", text: String(n) }), h("td", { text: r.agent || "–" }), h("td", { dir: "ltr", text: whenText(r) }), h("td", { dir: "ltr", text: r.phone || r.odooRef || "–" }),
          h("td", {}, h("span", { class: "pill " + (r.result === "Pass" ? "good" : "bad"), text: (r.result || "–") + " · " + pct(r.final) })),
          h("td", { class: "num", text: tl("ج1: ", "R1: ") + k.filter((x) => Number(x.trial) === 1).length + tl(" · ج2: ", " · R2: ") + k.filter((x) => Number(x.trial) === 2).length }),
          h("td", { class: "actions" }, closed ? null : h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }),
            closed || k.length ? null : h("button", { type: "button", class: "ghost", text: t("del"), onclick: async () => { await deleteRecord(r); renderGauge(); } })))); });
      box.append(h("div", { class: "table-wrap" }, ct));
    }
  }
  function renderCalibration() {
    renderGauge();
    renderCalTrack();
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

  // ---------- coaching: failed call → coaching session (within the SLA) → coaching call (first call after coaching) ----------
  // Clocks: the coaching SLA starts when the failed evaluation is saved (that's when the failure is known); the passed
  // call is the agent's first answered call after the coaching time and should be scored within its own SLA.
  const hoursBetween = (a, b) => { const x = new Date(a).getTime(), y = new Date(b).getTime(); return isNaN(x) || isNaN(y) ? null : Math.max(0, Math.round((y - x) / 36e5)); };
  const failStart = (r) => r.savedAt || (r.evalDate ? r.evalDate + "T12:00:00" : "");
  function coachState(r) {
    const sla = coachSlaHours(), psla = passedSlaHours(), fu = followUpOf(r), now = new Date().toISOString();
    const coached = isCoached(r), cAt = r.coachedAt || (r.feedback && r.feedback.coachedAt) || "";
    const toCoach = coached ? hoursBetween(failStart(r), cAt) : hoursBetween(failStart(r), now);
    const toPassed = fu ? hoursBetween(cAt, fu.savedAt || fu.interactionDate) : coached ? hoursBetween(cAt, now) : null;
    const step = !coached ? (toCoach > sla ? "c_late" : "c_due") : !fu ? (toPassed > psla ? "p_late" : "p_due") : fu.result === "Pass" ? "closed" : "refail";
    return { sla, psla, fu, coached, cAt, toCoach, toPassed, step, coachOnTime: coached && toCoach !== null && toCoach <= sla, open: step !== "closed" };
  }
  // Start scoring the coaching call for a coached evaluation: the form opens with the link, the agent and the rule filled in.
  function startPassedCall(r) {
    if ((dirty() || editChanged()) && !confirm(t("switch_confirm"))) return;
    current = { form: r.form, answers: blankAnswers(r.form) };
    Object.assign(current.answers.header, { purpose: "postcoach", selection: "targeted", followOf: r.id, followOfId: evalIdOf(r), agent: r.agent });
    saveDraft(); renderEvaluate();
    $('nav button[data-view="evaluate"]').click(); window.scrollTo(0, 0);
  }
  // One row per failed evaluation: the coaching tracker as a sheet (Excel export of the Coaching page).
  function coachTrackerRows(list) {
    const stWord = { c_due: "co_s_c_due", c_late: "co_s_c_late", p_due: "co_s_p_due", p_late: "co_s_p_late", closed: "co_s_closed", refail: "co_s_refail" };
    const head = ["Evaluation ID", "Agent", "Type", "Evaluator", "Call time", "Evaluation saved", "Final", "Critical errors",
      "Coaching due by", "Coaching session at", "Coached by", "Hours to coaching", "Within SLA", "Coaching points", "Agent agreed",
      "Coaching call ID", "Coaching call time", "Coaching call final", "Coaching call result", "Status"];
    return [head, ...list.map((r) => {
      const c = coachState(r), due = failStart(r) ? new Date(new Date(failStart(r)).getTime() + c.sla * 36e5) : null;
      return [evalIdOf(r), r.agent || "", purposeLabel(r), r.evaluator || "", whenText(r), dtText(failStart(r)), pct(r.final), r.critical || 0,
        due && !isNaN(due) ? dtText(due.toISOString()) : "", c.coached ? dtText(c.cAt) : "", r.coachedBy || "", c.coached ? c.toCoach : "",
        c.coached ? (c.coachOnTime ? "Yes" : "No") : "", (r.coachPoints || []).join(", "), c.coached ? (r.coachAck === false ? "No" : "Yes") : "",
        c.fu ? evalIdOf(c.fu) : "", c.fu ? whenText(c.fu) : "", c.fu ? pct(c.fu.final) : "", c.fu ? c.fu.result : "", t(stWord[c.step])];
    })];
  }
  function promiseStats(items) {
    const calls = items.filter((x) => x.kind === "call"), was = items.filter((x) => x.kind !== "call");
    const done = calls.filter((x) => ["ontime", "late", "early", "missed"].includes(x.status));
    const n = (st, list) => (list || calls).filter((x) => x.status === st).length;
    const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + "%" : "–");
    // A WhatsApp promise that couldn't be sent because our number was blocked is not the agent's miss: left out of the rate.
    const waDone = was.filter((x) => !["pending", "blocked"].includes(x.status));
    return { calls, was, done, n, pctOf, waDone };
  }
  // Dashboard card: the same promise numbers for the dashboard's agent and dates (by promise day).
  let prAt = 0;
  async function renderDbPromises(f) {
    const box = $("#dbPromises"); if (!box) return;
    if (!connected()) { box.hidden = true; return; }
    if (!prData || Date.now() - prAt > 5 * 60000) { if (prBusy) return; prBusy = true; try { prData = await apiGet({ action: "promises" }); prAt = Date.now(); } catch (e) { prData = null; } prBusy = false; }
    if (!prData || prData.error) { box.hidden = true; return; }
    const items = (prData.items || []).filter((x) => { const d = x.due || String(x.callAt).slice(0, 10); return (!f.agent || x.agent === f.agent) && (!f.from || d >= f.from) && (!f.to || d <= f.to); });
    box.hidden = !items.length; box.innerHTML = "";
    if (!items.length) return;
    const { done, was, n, pctOf, waDone } = promiseStats(items);
    const ok = done.length && n("ontime") / done.length >= 0.95;
    const tile = (k, v, sub, cls) => h("div", { class: "tile" + (cls ? " " + cls : "") }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), sub ? h("div", { class: "tile-s", text: sub }) : null);
    box.append(h("h2", { text: "🤝 " + t("pr_kpis") }), h("p", { class: "hint", text: t("pr_db_hint") }),
      h("div", { class: "tiles" },
        tile(t("pr_k_ontime"), pctOf(n("ontime"), done.length), t("pr_target95") + " · " + done.length, done.length ? (ok ? "good" : "bad") : ""),
        tile(t("pr_s_late") + " / " + t("pr_s_missed"), n("late") + " / " + n("missed")),
        tile(t("pr_s_pending"), String(n("pending"))),
        tile(t("pr_k_wa"), pctOf(n("sent", was), waDone.length), t("pr_k_wa_s", { n: n("pending", was) })),
        tile(t("pr_s_blocked"), String(n("blocked", was)), t("pr_blocked_s"))),
      h("button", { type: "button", class: "ghost", text: t("pr_open") + " ←", onclick: () => $('nav button[data-view="promises"]').click() }));
  }

  // ---------- Promises page: On Time for promised call backs (from the raw call data) and WhatsApp sent rate ----------
  let prData = null, prBusy = false;
  async function loadPromises() {
    if (!connected() || prBusy) return;
    prBusy = true;
    try { prData = await apiGet({ action: "promises" }); prAt = Date.now(); } catch (e) { prData = { error: e.message, items: [] }; }
    prBusy = false; renderPromises();
  }
  function renderPromises() {
    const out = $("#prOut"); if (!out) return;
    $("#prPeriod").onchange = renderPromises; $("#prAgent").onchange = renderPromises; $("#prReload").onclick = () => { prData = null; renderPromises(); };
    out.innerHTML = "";
    if (!prData) { out.append(h("div", { class: "empty", text: connected() ? "…" : t("pr_need_sheet") })); if (connected()) loadPromises(); return; }
    if (prData.error) { out.append(h("div", { class: "msg err", text: prData.error })); return; }
    const per = $("#prPeriod").value, ag = $("#prAgent").value, now = today();
    const inPer = (x) => { const d = x.due || x.callAt.slice(0, 10); if (per === "month") return d.slice(0, 7) === now.slice(0, 7); if (per === "last") { const lm = addDays(now.slice(0, 8) + "01", -1).slice(0, 7); return d.slice(0, 7) === lm; } if (per === "30") return d >= addDays(now, -30); return true; };
    const items = (prData.items || []).filter((x) => inPer(x) && (!ag || x.agent === ag));
    const agents = [...new Set((prData.items || []).map((x) => x.agent).filter(Boolean))].sort();
    const selA = $("#prAgent"); if (selA.options.length !== agents.length + 1) { const v = selA.value; selA.innerHTML = ""; selA.append(h("option", { value: "", text: t("f_all_agents") }), ...agents.map((n) => h("option", { value: n, text: n }))); selA.value = v; }
    const { calls, was, done, n, pctOf, waDone } = promiseStats(items);
    const tile = (k, v, s, cls) => h("div", { class: "tile" + (cls ? " " + cls : "") }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), s ? h("div", { class: "tile-s", text: s }) : null);
    out.append(h("div", { class: "card" }, h("h2", { text: t("pr_kpis") }),
      h("p", { class: "hint", text: t("pr_rule", { m: prData.tolMin || 60, d: prData.dataTo || "–" }) + (prData.callsError ? " ⚠️ " + (t(prData.callsError) !== prData.callsError ? t(prData.callsError) : prData.callsError) : "") }),
      h("div", { class: "tiles" },
        tile(t("pr_k_ontime"), pctOf(n("ontime"), done.length), t("pr_target95"), done.length && n("ontime") / done.length >= 0.95 ? "good" : done.length ? "bad" : ""),
        tile(t("pr_s_ontime"), String(n("ontime"))), tile(t("pr_s_late"), String(n("late"))), tile(t("pr_s_early"), String(n("early"))), tile(t("pr_s_missed"), String(n("missed"))), tile(t("pr_s_pending"), String(n("pending"))),
        tile(t("pr_k_wa"), pctOf(n("sent", was), waDone.length), t("pr_k_wa_s", { n: n("pending", was) })),
        tile(t("pr_s_blocked"), String(n("blocked", was)), t("pr_blocked_s")))));
    // by agent
    const rows = agents.filter((a) => !ag || a === ag).map((a) => { const c = calls.filter((x) => x.agent === a), dn = c.filter((x) => ["ontime", "late", "early", "missed"].includes(x.status)), w = was.filter((x) => x.agent === a), wd = w.filter((x) => !["pending", "blocked"].includes(x.status));
      return [a, c.length, pctOf(c.filter((x) => x.status === "ontime").length, dn.length), c.filter((x) => x.status === "late").length, c.filter((x) => x.status === "missed").length, w.length, pctOf(w.filter((x) => x.status === "sent").length, wd.length)]; }).filter((r) => r[1] || r[5]);
    if (rows.length) out.append(h("div", { class: "card" }, h("h2", { text: t("pr_by_agent") }), h("table", {}, h("thead", {}, h("tr", {}, [t("f_agent"), t("pr_c_calls"), "On Time", t("pr_s_late"), t("pr_s_missed"), t("pr_c_wa"), t("pr_k_wa")].map((x) => h("th", { text: x })))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((v, i) => h("td", { class: i ? "num" : "", text: String(v) }))))))));
    // list
    const order = { missed: 0, notsent: 1, late: 2, early: 3, pending: 4, blocked: 5, nophone: 6, nodate: 7, ontime: 8, sent: 9 };
    const list = items.slice().sort((x, y) => (order[x.status] - order[y.status]) || String(x.due).localeCompare(String(y.due)));
    const mark = async (x, sent, blocked) => { try { await apiPostJson({ action: "promiseMark", id: x.id, i: x.i, sent, blocked: !!blocked }); x.mark = { ok: sent, blocked: !!blocked, by: settings.who }; x.status = sent ? "sent" : blocked ? "blocked" : "notsent"; renderPromises(); } catch (e) { alert(e.message); } };
    out.append(h("div", { class: "card" }, h("h2", { text: t("pr_list") }),
      list.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, [t("pr_c_status"), t("f_agent"), t("pr_c_promise"), t("pr_c_due"), t("pr_c_match"), "ID"].map((x) => h("th", { text: x })))),
        h("tbody", {}, list.map((x) => h("tr", {},
          h("td", {}, h("span", { class: "pill pr-st " + x.status, text: t("pr_st_" + x.status) })),
          h("td", { text: x.agent || "–" }),
          h("td", { text: x.kind === "call" ? "📞 " + t("pr_call") : "💬 " + t("pr_what_" + (x.what || "other")) }),
          h("td", { dir: "ltr", text: (x.due || "–") + (x.time ? " " + hm12(x.time) : "") }),
          h("td", {}, x.match ? h("div", { dir: "auto", text: x.match.at.slice(5) + " · " + x.match.by + " · " + x.match.status }) : null,
            x.kind !== "call" ? h("div", { class: "pr-marks" },
              h("button", { type: "button", class: "ghost" + (x.status === "sent" ? " on-good" : ""), text: "✓ " + t("pr_sent"), onclick: () => mark(x, true) }),
              h("button", { type: "button", class: "ghost" + (x.status === "notsent" ? " on-bad" : ""), text: "✗ " + t("pr_notsent"), onclick: () => mark(x, false) }),
              h("button", { type: "button", class: "ghost" + (x.status === "blocked" ? " on-warn" : ""), text: "🚫 " + t("pr_blocked_btn"), title: t("pr_blocked_tip"), onclick: () => mark(x, false, true) }),
              x.mark ? h("span", { class: "meta", text: x.mark.by || "" }) : null) : null),
          h("td", { class: "eval-id-tag", text: x.evalId }))))))
      : h("div", { class: "empty", text: t("pr_none") })));
  }

  // ---------- repeated failure: critical errors ladder (chosen by Mohamed, 2026-11-09) ----------
  // Agent level critical errors only, in call-date order. Each critical moves the agent up one stage (max 4) and starts that
  // stage's clean window (stage 1: 2 months, 2: 3 months, 3 and 4: 4 months). A window that passes with no critical moves the
  // agent DOWN one stage, and the next stage's window starts where the last one ended. COPC 3.4.2: failing agents get more
  // monitoring and 1-on-1 coaching; repeat critical errors mean removal from customer contact until corrective action works.
  // The tool only shows the stage and the next step; warnings and decisions follow HR's rules.
  const RF_WIN = [0, 2, 3, 4, 4];
  const addMonths = (day, n) => { const d = new Date(day + "T12:00:00"), dd = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dd, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymdOf(d); };
  // Points (from Mohamed's earlier RF sheet): compliance critical 2, customer (end user) critical 1, business critical 0.5
  // for each error; the SAME non-critical item missed in 3 different evaluations within 60 days = 1 point (then that item's
  // count starts again). Every full point moves the agent up one stage; half points carry until the stage's clean window
  // passes. New agents aren't counted in their first 30 days after certification (coaching and weekly monitoring still apply).
  const RF_PTS = { CC: 2, EU: 1, BC: 0.5 }, RF_NC_REPEAT = 3, RF_NC_DAYS = 60, RF_GRACE_DAYS = 30;
  function rfLadder(list, graceUntil) {
    const evals = list.filter((r) => !r.test && purposeOf(r) === "live" && callDay(r) && (!graceUntil || callDay(r) > graceUntil)).sort((a, b) => callDay(a).localeCompare(callDay(b)));
    const ncSeen = {}, ev = [];
    evals.forEach((r) => {
      let p = 0; const why = [];
      (r.items || []).forEach((i) => {
        if (i.kind !== "NC" && i.result === "Error") { p += RF_PTS[i.kind] || 1; why.push(i.kind); }
        if (i.kind === "NC" && i.result === "Not met") {
          const k = r.form + "|" + i.id, from = addDays(callDay(r), -RF_NC_DAYS);
          const days = (ncSeen[k] = (ncSeen[k] || []).filter((d) => d >= from)); days.push(callDay(r));
          if (days.length >= RF_NC_REPEAT) { p += 1; why.push("N" + i.id + "×" + RF_NC_REPEAT); ncSeen[k] = []; }
        }
      });
      if (p > 0) ev.push({ r, p, why });
    });
    let stage = 0, until = "", carry = 0;
    const hist = [];
    const decay = (day) => {
      while (until && day > until) {
        const from = until; carry = 0;
        if (stage > 0) { stage--; hist.push({ kind: "down", day: from, stage }); }
        until = stage ? addMonths(from, RF_WIN[stage]) : "";
      }
    };
    ev.forEach(({ r, p, why }) => {
      decay(callDay(r));
      carry += p;
      const before = stage;
      while (carry >= 1 && stage < 4) { stage++; carry -= 1; }
      if (stage === 4) carry = 0;
      // Half a point with no stage change still opens a window, so it expires if nothing follows.
      until = addMonths(callDay(r), RF_WIN[Math.max(1, stage)]);
      hist.push({ kind: stage > before ? "up" : "pts", day: callDay(r), stage, r, p, why });
    });
    decay(today());
    const last = ev.length ? ev[ev.length - 1].r : null;
    return { stage, until: stage ? until : "", hist, last, n: ev.length, carry, pts: ev.reduce((sum, x) => sum + x.p, 0) };
  }
  const rfAction = (st) => [
    tl("نضيف. مفيش إجراء.", "Clean. No action."),
    tl("جلسة كوتشينج خلال 48 ساعة، وبعدها كوتشينج كول.", "Coaching session within 48 hours, then a coaching call."),
    tl("تقييمات زيادة (مثلاً 2 زيادة في الأسبوع) + خطة تحسين مكتوبة (PIP) مع الليدر.", "Extra evaluations (e.g. 2 more a week) + a written improvement plan (PIP) with the team leader."),
    tl("يتشال من المكالمات، ويتعمله ريترينينج وريسيرتيفيكيشن قبل ما يرجع.", "Off the phones: retraining and re-certification before returning."),
    tl("قعدة مع الليدر وHR ومدير الـ CX: فرصة أخيرة أو إنهاء.", "Meeting with the team leader, HR and the CX head: last chance or termination."),
  ][st];
  const rfName = (st) => (st ? tl("مرحلة ", "Stage ") + st : tl("نضيف", "Clean"));
  function renderRepeatFailure() {
    const box = $("#coRf"); if (!box) return;
    box.innerHTML = "";
    const all = allRecords().filter((r) => !r.test);
    const agents = [...new Set([...(roster.agents || []), ...all.filter((r) => purposeOf(r) === "live").map((r) => r.agent).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const pick = ($("#coAgent") || {}).value || "";
    const rows = agents.filter((a) => !pick || a === pick).map((a) => {
      const cd = (agentCertInfo(a, all) || {}).certDate || "", grace = cd ? addDays(cd, RF_GRACE_DAYS) : "";
      return Object.assign({ a, grace: grace && grace >= today() ? grace : "" }, rfLadder(all.filter((r) => nameKey(r.agent) === nameKey(a)), grace));
    }).sort((x, y) => y.stage - x.stage || y.n - x.n || x.a.localeCompare(y.a));
    const counts = [0, 1, 2, 3, 4].map((st) => rows.filter((r) => r.stage === st).length);
    const td = today();
    const left = (d) => Math.max(0, Math.round((new Date(d + "T12:00:00") - new Date(td + "T12:00:00")) / 864e5));
    box.append(h("h2", { text: tl("🔁 تكرار الأخطاء الكريتيكال (Repeated failure)", "🔁 Repeated failure (critical errors)") }),
      h("p", { class: "hint", text: tl("النقاط في Agent level: كومبلاينس كريتيكال = 2، End user كريتيكال = 1، بيزنس كريتيكال = 0.5، ونفس بند النون كريتيكال لو اتكرر في 3 مكالمات مختلفة خلال 60 يوم = 1. كل نقطة كاملة بتطلّع الإيجنت مرحلة، والنص نقطة بيستنى. الموظف الجديد مش بيتحسب أول 30 يوم بعد السرتيفيكيشن. كل مرحلة ليها مدة لازم يعدّيها نضيف: مرحلة 1 شهرين، مرحلة 2 تلات شهور، مرحلة 3 و4 أربع شهور. لو عدّى المدة نضيف بينزل مرحلة واحدة. البروجرام ليفل مش محسوب. الأداة بتوضح المرحلة والخطوة الجاية بس، والإنذارات والقرارات حسب لائحة HR.",
        "Agent level points: compliance critical 2, end user critical 1, business critical 0.5, the same non-critical item missed in 3 different calls within 60 days 1. Each full point moves the agent up a stage; half points wait. New agents aren't counted for 30 days after certification. Each stage has a clean window: stage 1 two months, stage 2 three, stages 3 and 4 four. A clean window moves the agent down one stage. Program level doesn't count. The tool shows the stage and next step only; warnings and decisions follow HR's rules.") }),
      h("div", { class: "rf-ladder" }, [0, 1, 2, 3, 4].map((st) => h("div", { class: "rf-step s" + st }, h("div", { class: "rf-step-n", text: String(counts[st]) }), h("div", { class: "rf-step-k", text: rfName(st) }), h("div", { class: "rf-step-a", text: rfAction(st) })))));
    const tb = h("table", {}, h("tr", {}, [tl("الإيجنت", "Agent"), tl("المرحلة", "Stage"), tl("المطلوب", "Next step"), tl("لازم يفضل نضيف لحد", "Clean until"), tl("آخر كريتيكال", "Last critical"), tl("السجل", "History")].map((x) => h("th", { text: x }))));
    rows.forEach((x) => {
      const last = x.last;
      const crit = last ? (last.items || []).filter((i) => i.kind !== "NC" && i.result === "Error").map((i) => "[" + i.kind + "] " + (i.text || "").slice(0, 40)).join("، ") : "";
      tb.append(h("tr", { class: x.stage ? "" : "muted" },
        h("td", {}, h("b", { text: x.a })),
        h("td", {}, h("span", { class: "rf-pill s" + x.stage, text: rfName(x.stage) }), x.carry ? h("div", { class: "meta", text: "+" + x.carry + tl(" نقطة مستنية", " pt pending") }) : null, x.grace ? h("div", { class: "meta", text: tl("جديد، مش بيتحسب لحد ", "New, not counted until ") + x.grace }) : null),
        h("td", { class: "rf-act", text: x.stage ? rfAction(x.stage) : "–" }),
        h("td", { dir: "ltr", class: "num" }, x.stage ? h("div", {}, h("div", { text: x.until }), h("div", { class: "meta", text: tl("فاضل ", "") + left(x.until) + tl(" يوم", " days left") })) : "–"),
        h("td", {}, last ? h("div", {}, h("div", { dir: "ltr", text: callDay(last) + " · " + evalIdOf(last) }), h("div", { class: "meta", text: crit })) : "–"),
        h("td", {}, h("div", { class: "rf-hist" }, x.hist.slice(-8).map((e) => h("span", { class: "pill " + (e.kind === "up" ? "bad" : e.kind === "pts" ? "warn" : "good"), dir: "ltr", title: e.r ? evalIdOf(e.r) + " · +" + e.p + tl(" نقطة", " pt") + " (" + (e.why || []).join(", ") + ")" : tl("عدّى المدة نضيف", "Clean window passed"), text: (e.kind === "up" ? "▲ " : e.kind === "pts" ? "+" + e.p + " " : "▼ ") + (e.kind === "pts" ? "" : e.stage + " · ") + e.day.slice(5) }))))));
    });
    box.append(h("div", { class: "table-wrap" }, tb));
    lastLists.repeat = rows;
  }
  function renderCoachingView() {
    const out = $("#coOut"); if (!out) return;
    renderRepeatFailure();
    const all = allRecords().filter((r) => !r.test);
    const days = Number($("#coPeriod").value) || 30, since = addDays(today(), -days);
    const failed = all.filter((r) => needsCoaching(r) && String(failStart(r)).slice(0, 10) >= since);
    const agents = [...new Set(failed.map((r) => r.agent).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const ag = $("#coAgent"), prev = ag.value;
    ag.innerHTML = ""; ag.append(h("option", { value: "", text: t("f_all_agents") }), ...agents.map((a) => {
      const n = failed.filter((r) => r.agent === a && coachState(r).open).length;
      return h("option", { value: a, text: a + (n ? " (" + t("co_open_n", { n }) + ")" : "") });
    }));
    ag.value = agents.includes(prev) ? prev : "";
    const ty = $("#coType"), prevTy = ty.value, types = [...new Set(failed.map(purposeOf))];
    ty.innerHTML = ""; ty.append(h("option", { value: "", text: t("f_all") }), ...types.map((p) => h("option", { value: p, text: t("p_" + p) })));
    ty.value = types.includes(prevTy) ? prevTy : "";
    const st = $("#coStatus").value;
    const rows = failed.map((r) => [r, coachState(r)]).filter(([r, c]) => (!ag.value || r.agent === ag.value) && (!ty.value || purposeOf(r) === ty.value) &&
      (st === "all" || (st === "open" && c.open) || (st === "late" && (c.step === "c_late" || c.step === "p_late")) || (st === "closed" && !c.open)))
      .sort((a, b) => (a[1].open === b[1].open ? String(failStart(b[0])).localeCompare(String(failStart(a[0]))) : a[1].open ? -1 : 1));
    out.innerHTML = "";
    // Tiles over the whole period (not the status filter), for the agent picked.
    const scope = failed.filter((r) => (!ag.value || r.agent === ag.value) && (!ty.value || purposeOf(r) === ty.value)).map(coachState);
    lastLists.coaching = rows.map(([r]) => r);
    const coached = scope.filter((c) => c.coached), withFu = scope.filter((c) => c.fu);
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const tiles = [
      [t("co_k_failed"), scope.length, t("co_k_days", { n: days })],
      [t("co_k_open"), scope.filter((c) => c.open).length, t("co_k_late", { n: scope.filter((c) => c.step === "c_late" || c.step === "p_late").length })],
      [t("co_k_sla"), coached.length ? pct(coached.filter((c) => c.coachOnTime).length / coached.length) : "–", t("co_k_sla_s", { h: coachSlaHours(), a: avg(coached.map((c) => c.toCoach)) ?? "–" })],
      [t("co_k_passed"), withFu.length ? pct(withFu.filter((c) => c.fu.result === "Pass").length / withFu.length) : "–", t("co_k_passed_s", { n: withFu.length, m: coached.length })]];
    out.append(h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: String(v) }), h("div", { class: "tile-s", text: sub })))));
    if (!rows.length) { out.append(h("div", { class: "empty", text: failed.length ? t("db_nomatch") : t("co_none") })); return; }
    const hrs = (n) => (n === null ? "–" : n < 48 ? t("co_h", { n }) : t("co_d", { n: Math.round(n / 24) }));
    const tbl = h("table", { class: "co-table" }, h("tr", {}, ["co_c_failed", "co_c_coach", "co_c_passed", "co_c_status", ""].map((k) => h("th", { text: k ? t(k) : "" }))));
    rows.forEach(([r, c]) => {
      const crit = r.critical ? " · " + t("co_crit", { n: r.critical }) : "";
      const failCell = h("td", {}, h("div", {}, h("b", { text: r.agent || "–" }), " · ", h("span", { class: "pill bad", text: pct(r.final) }), crit),
        h("span", { class: "pill na", style: "font-size:11px", text: t("p_" + purposeOf(r)).split(" (")[0] }),
        h("div", { class: "meta", dir: "auto", text: t("co_call_at", { d: whenText(r) }) }), phoneDiv(r),
        h("div", { class: "meta", text: t("co_eval_by", { e: r.evaluator || "–", d: dtText(failStart(r)) }) }),
        h("div", { class: "meta eval-id-tag", text: evalIdOf(r) }));
      const coachCell = h("td", {}, c.coached
        ? [h("span", { class: "pill " + (c.coachOnTime ? "good" : "warn"), text: (c.coachOnTime ? "✓ " : "⚠ ") + t(c.coachOnTime ? "co_on_time" : "co_late_by", { h: hrs(c.toCoach), sla: c.sla }) }),
          h("div", { class: "meta", text: t("co_coached_at", { d: dtText(c.cAt), b: r.coachedBy || "–" }) }),
          (r.coachPoints || []).length ? h("div", { class: "meta", text: t("co_points_n", { n: r.coachPoints.length }) }) : null]
        : [h("span", { class: "pill " + (c.step === "c_late" ? "bad" : "warn"), text: c.step === "c_late" ? t("co_overdue", { h: hrs(c.toCoach - c.sla) }) : t("co_left", { h: hrs(c.sla - c.toCoach) }) })]);
      const passedCell = h("td", {}, c.fu
        ? [h("span", { class: "pill " + (c.fu.result === "Pass" ? "good" : "bad"), text: (c.fu.result === "Pass" ? "✓ " : "✗ ") + pct(c.fu.final) }),
          h("div", { class: "meta", dir: "auto", text: t("co_call_at", { d: whenText(c.fu) }) + " · " + t("co_after", { h: hrs(hoursBetween(c.cAt, c.fu.interactionDate)) }) }), phoneDiv(c.fu),
          h("div", { class: "meta eval-id-tag", text: evalIdOf(c.fu) })]
        : c.coached ? [h("span", { class: "pill " + (c.step === "p_late" ? "bad" : "warn"), text: c.step === "p_late" ? t("co_p_overdue", { h: hrs(c.toPassed) }) : t("co_p_wait", { h: hrs(c.toPassed) }) }),
          h("div", { class: "meta", text: t("co_p_rule", { d: dtText(c.cAt) }) })]
        : h("span", { class: "meta", text: t("co_p_after") }));
      const stTxt = { c_due: "co_s_c_due", c_late: "co_s_c_late", p_due: "co_s_p_due", p_late: "co_s_p_late", closed: "co_s_closed", refail: "co_s_refail" }[c.step];
      const statusCell = h("td", {}, h("span", { class: "pill " + (c.step === "closed" ? "good" : /late|refail/.test(c.step) ? "bad" : "warn"), text: t(stTxt) }));
      const act = h("td", { class: "actions" },
        !c.coached && connected() ? h("button", { type: "button", text: t("coach_btn"), onclick: () => openCoaching(r) }) : null,
        c.coached && !c.fu ? h("button", { type: "button", text: t("co_btn_passed"), onclick: () => startPassedCall(r) }) : null,
        c.coached ? h("button", { type: "button", class: "ghost", text: t("co_btn_edit"), onclick: () => openCoaching(r) }) : null,
        c.step === "refail" && connected() ? h("button", { type: "button", text: t("coach_btn"), onclick: () => openCoaching(c.fu) }) : null,
        canChange(r) ? h("button", { type: "button", class: "ghost", text: t("open_edit"), onclick: () => openRecord(r) }) : null);
      tbl.append(h("tr", { class: c.open ? "" : "muted" }, failCell, coachCell, passedCell, statusCell, act));
    });
    out.append(h("div", { class: "table-wrap" }, tbl));
  }

  // COPC R8.0 (Item 3.4.2) Mandatory Action Alerts:
  // (a/c) 100% of failed evaluations must receive 1-on-1 coaching within SLA + increased monitoring frequency;
  // (b) a sample of passing evaluations must receive 1-on-1 coaching;
  // (d) repeat critical error offenders must be temporarily removed from handling transactions until corrective action is completed.
  function renderCopcAlerts(boxId, recs, allLive) {
    const box = $(boxId); if (!box) return;
    box.innerHTML = "";
    const valid = (recs || []).filter((r) => !r.test && ["live", "certcall", "postcoach"].includes(purposeOf(r)));
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
          !done && (canChange(r) || connected()) ? h("button", { type: "button", class: "ghost", style: "margin-inline-start:6px;padding:2px 8px;font-size:12px", text: t("coach_btn"), onclick: () => openCoaching(r) }) : null);
        const fu = followUpOf(r);
        const fCell = h("td", {}, fu
          ? h("span", { class: "pill " + (fu.result === "Pass" ? "good" : "bad"), text: t(fu.result === "Pass" ? "fu_passed" : "fu_failed", { id: evalIdOf(fu) }) })
          : done ? h("span", { class: "pill warn", text: t("fu_waiting") })
          : nextEval && !coachTime(r) ? h("span", { class: "pill good", text: t("copc_followup_done", { d: callDay(nextEval) }) })
          : h("span", { class: "pill na", text: t("fu_after_coach") }));
        tb.append(h("tr", {}, h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), phoneDiv(r), h("div", { class: "meta eval-id-tag", text: evalIdOf(r) })), h("td", { text: r.agent || "–" }), h("td", { text: r.evaluator || "–" }),
          h("td", { class: "num" }, h("span", { class: "pill bad", text: pct(r.final) })), cCell, fCell));
      });
      kids.push(h("h3", { text: t("copc_fail_followup_head") }), h("div", { class: "table-wrap" }, tb),
        h("button", { type: "button", class: "ghost", text: t("co_open_page"), onclick: () => { $('nav button[data-view="coaching"]').click(); window.scrollTo(0, 0); } }));
    }
    kids.push(h("p", { class: "copc-pass-stat", text: t("copc_pass_coached_stat", { a: passedCoached, b: passed.length, p: passed.length ? pct(passedCoached / passed.length) : "0%" }) }));
    box.append(...kids);
    box.hidden = false;
  }

  // COPC 3.4.1 monitoring coverage per agent:
  //   (a) every agent monitored at least once a month;
  //   (b) every quarter at least one side-by-side and one remote (recording) session;
  //   (c) new agents monitored at least once a week for their first month on the task (counted from the certification date).
  // Calibration copies, role plays and test evaluations are not monitoring of real interactions, so they don't count.
  function renderCoverage(boxId, allRecs, onlyAgent) {
    const box = $(boxId); if (!box) return;
    box.innerHTML = "";
    const mon = (allRecs || []).filter((r) => !r.test && r.agent && !["calibration", "roleplay"].includes(purposeOf(r)) && callDay(r));
    const agents = [...new Set([...(roster.agents || []), ...mon.map((r) => r.agent)])].filter((a) => !onlyAgent || a === onlyAgent).sort((a, b) => a.localeCompare(b));
    if (!agents.length) { box.hidden = true; return; }
    const now = today(), month = now.slice(0, 7);
    const qStartM = Math.floor((+now.slice(5, 7) - 1) / 3) * 3 + 1, qStart = now.slice(0, 4) + "-" + String(qStartM).padStart(2, "0") + "-01";
    const qName = "Q" + ((qStartM + 2) / 3) + " " + now.slice(0, 4);
    const ok = (x) => h("span", { class: "pill good", text: "✓ " + x }), bad = (x) => h("span", { class: "pill bad", text: "✗ " + x }), wait = (x) => h("span", { class: "pill warn", text: "⏳ " + x });
    let gaps = 0, todo = 0;
    const tbl = h("table", {}, h("tr", {}, [tx("الإيجنت", "Agent"), tx("الشهر ده", "This month"), tx("ريكوردنج (", "Recording (") + qName + ")", tx("سايد باي سايد (", "Side by side (") + qName + ")", tx("أول شهر بعد السيرتيفيكيشن: كل أسبوع", "First month after certification: weekly")].map((x) => h("th", { text: x }))));
    agents.forEach((a) => {
      const mine = mon.filter((r) => r.agent === a);
      const m = mine.filter((r) => callDay(r).slice(0, 7) === month).length;
      const q = mine.filter((r) => callDay(r) >= qStart);
      const rec = q.filter((r) => (r.method || "recording") === "recording").length, sbs = q.filter((r) => r.method === "sidebyside").length;
      // Weekly in the first 4 weeks after the certification date.
      const ci = agentCertInfo(a, allRecs), start = ci.certDate;
      let weekCell = h("span", { class: "meta", text: start ? tx("خلص أول شهر", "First month done") : tx("مفيش تاريخ سيرتيفيكيشن", "No certification date") });
      if (start && start <= now && now < addDays(start, 28)) {
        const marks = [];
        for (let i = 0; i < 4; i++) {
          const from = addDays(start, 7 * i), to = addDays(start, 7 * i + 7);
          if (from > now) { marks.push(h("span", { class: "pill na", text: tx("أسبوع ", "W") + (i + 1) })); continue; }
          const n = mine.filter((r) => callDay(r) >= from && callDay(r) < to).length;
          if (n) marks.push(ok(tx("أسبوع ", "W") + (i + 1)));
          else if (now < to) marks.push(wait(tx("أسبوع ", "W") + (i + 1)));
          else { marks.push(bad(tx("أسبوع ", "W") + (i + 1))); gaps++; }
        }
        weekCell = h("div", {}, ...marks, h("div", { class: "meta", text: tx("من ", "from ") + start }));
      }
      if (!m) todo++; if (!rec) todo++; if (!sbs) todo++;
      tbl.append(h("tr", {}, h("td", {}, h("b", { text: a })),
        h("td", {}, m ? ok(m) : wait(tx("لسه متقيّمش", "Not yet"))),
        h("td", {}, rec ? ok(rec) : wait(tx("لسه", "Not yet"))),
        h("td", {}, sbs ? ok(sbs) : wait(tx("لسه", "Not yet"))),
        h("td", {}, weekCell)));
    });
    box.append(h("h2", { text: tx("تغطية المونيتورنج (COPC 3.4.1)", "Monitoring coverage (COPC 3.4.1)") }),
      h("p", { class: "hint", text: tx("COPC بيطلب: كل إيجنت يتقيّم مرة في الشهر على الأقل، وكل ربع سنة جلسة سايد باي سايد وجلسة ريكوردنج على الأقل، والإيجنت الجديد يتقيّم كل أسبوع في أول شهر (من تاريخ السيرتيفيكيشن). الكاليبريشن والرول بلاي والتجريبي مش محسوبين. ⏳ = لسه مطلوب والفترة لسه شغالة، ✗ = أسبوع فات من غير تقييم.",
        "COPC requires: every agent monitored at least monthly; each quarter at least one side-by-side and one recording session; new agents monitored weekly in their first month (from the certification date). Calibration, role plays and test evaluations don't count. ⏳ = still needed, period running; ✗ = a week passed with no evaluation.") }),
      h("p", { class: gaps ? "msg err" : "msg", text: (gaps ? tx("✗ فيه ", "✗ ") + gaps + tx(" أسبوع فات من غير تقييم لإيجنت جديد. ", " missed weeks for new agents. ") : "") +
        (todo ? tx("⏳ فيه ", "⏳ ") + todo + tx(" حاجة لسه مطلوبة في الشهر أو الربع ده.", " still needed this month or quarter.") : tx("✓ الشهر والربع متغطيين.", "✓ Month and quarter covered.")) }),
      h("div", { class: "table-wrap" }, tbl));
    box.hidden = false;
  }
  // ---------- knowledge base quiz numbers (agents' daily quiz on the knowledge base) ----------
  let KBQ = null, KBQ_M = "", KBQ_AT = 0, KBQ_ERR = "";
  async function loadKbQuiz(force) {
    if (!connected()) return;
    // Also throttled after a failed reply: renderKbQuiz calls this again while there are no numbers, which used to loop.
    if (!force && Date.now() - KBQ_AT < (KBQ ? 5 * 60 * 1000 : 60 * 1000)) return;
    KBQ_AT = Date.now(); KBQ_ERR = "";
    try { const j = await apiPostJson(Object.assign({ action: "kbDash" }, KBQ_M ? { month: KBQ_M } : {})); if (!Array.isArray(j.people)) throw new Error("Bad reply"); KBQ = j; }
    catch (e) { KBQ_ERR = e.message || "error"; }
    renderKbQuiz();
  }
  function renderKbQuiz() {
    const box = $("#dbQuiz"); if (!box) return;
    box.innerHTML = "";
    box.append(h("h3", { text: tx("📚 كويز النولدج بيز", "📚 Knowledge base quiz") }));
    if (!connected()) { box.append(h("div", { class: "hint", text: tx("اتصل بالشيت الأول علشان تظهر أرقام الكويز.", "Connect to the sheet to see the quiz numbers.") })); return; }
    if (!KBQ) { box.append(h("div", { class: "hint", text: KBQ_ERR ? tx("الأرقام مش متاحة: ", "Numbers not available: ") + KBQ_ERR + tx(" (لازم Code.gs الجديد يترفع كـ New version)", " (the new Code.gs must be published as a new version)") : tx("بيحمّل…", "Loading…") })); loadKbQuiz(); return; }
    const X = KBQ, pctTxt = (v) => v == null ? "–" : v + "%";
    const m = h("input", { type: "month", value: X.month, style: "max-width:180px" });
    m.addEventListener("change", () => { KBQ_M = m.value; KBQ = null; renderKbQuiz(); loadKbQuiz(true); });
    box.append(h("div", { class: "toolbar" }, h("label", {}, tx("الشهر", "Month") + " ", m), h("button", { type: "button", class: "ghost", text: tx("↻ تحديث", "↻ Refresh"), onclick: () => loadKbQuiz(true) })));
    const ag = X.people.filter((p) => !p.staff), took = ag.filter((p) => p.days > 0);
    const avgAcc = took.length ? Math.round(took.reduce((s, p) => s + (p.pct || 0), 0) / took.length) : 0;
    const part = ag.length ? Math.round(ag.reduce((s, p) => s + p.rate, 0) / ag.length) : 0;
    box.append(h("div", { class: "tiles" }, [[tx("حلّوا النهارده", "Done today"), X.doneToday + "/" + X.agents], [tx("متوسط الدقة", "Avg accuracy"), avgAcc + "%"], [tx("متوسط الالتزام", "Avg participation"), part + "%"], [tx("أيام الكويز", "Quiz days"), X.days.length]]
      .map(([k, v]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: String(v) })))));
    // Best and the ones who need follow-up: accuracy, then participation (at least 2 quiz days to be ranked).
    const ranked = took.filter((p) => p.days >= 2).sort((a, b) => (b.pct || 0) - (a.pct || 0) || b.rate - a.rate);
    const never = ag.filter((p) => !p.days).map((p) => p.name), nb = Math.min(3, Math.ceil(ranked.length / 2));
    const line = (p) => p.name + " · " + pctTxt(p.pct) + tx(" دقة · ", " accuracy · ") + p.rate + tx("% التزام", "% participation");
    if (ranked.length) box.append(h("div", { class: "kbq-two" },
      h("div", {}, h("b", { text: tx("🏆 الأفضل", "🏆 Best") }), h("ol", {}, ranked.slice(0, nb).map((p) => h("li", { text: line(p) })))),
      h("div", {}, h("b", { text: tx("⚠️ محتاجين متابعة", "⚠️ Need follow-up") }), h("ol", {}, ranked.slice(nb).reverse().slice(0, 3).map((p) => h("li", { text: line(p) }))),
        never.length ? h("div", { class: "hint", text: tx("ما حلّوش ولا مرة الشهر ده: ", "Haven't taken it this month: ") + never.join("، ") }) : null)));
    // Most missed questions
    const top = (X.top || []).slice(0, 10);
    box.append(h("h4", { text: tx("أكتر الأسئلة اللي اتغلط فيها", "Most missed questions") }));
    if (!top.length) box.append(h("div", { class: "hint", text: tx("لسه مفيش بيانات.", "No data yet.") }));
    top.forEach((q) => { const r = q.asked ? q.wrong / q.asked : 0;
      box.append(h("div", { class: "bar-row" }, h("span", { class: "bar-label", title: q.text, text: q.text }), h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: "width:" + Math.round(100 * r) + "%;background:var(--bad,#c0392b)" })), h("span", { text: tx(q.wrong + " غلط من " + q.asked, q.wrong + " wrong of " + q.asked) }))); });
    // Per agent
    box.append(h("h4", { text: tx("كل إيجنت", "Per agent") }));
    const tbl = h("table", { class: "rec-table" }, h("tr", {}, [tx("الاسم", "Name"), tx("أيام", "Days"), tx("الالتزام", "Participation"), tx("الدقة", "Accuracy"), "5/5", tx("ستريك", "Streak"), tx("الشهري", "Monthly"), tx("آخر كويز", "Last quiz"), tx("بيغلط في", "Gets wrong")].map((x) => h("th", { text: x }))));
    X.people.slice().sort((a, b) => a.staff - b.staff || (b.pct || 0) - (a.pct || 0) || b.days - a.days).forEach((p) => tbl.append(h("tr", { class: p.staff ? "muted" : "" },
      h("td", { text: (p.staff ? "🛡 " : "") + p.name }), h("td", { text: String(p.days) }), h("td", { text: p.rate + "%" }), h("td", { text: pctTxt(p.pct) }), h("td", { text: String(p.perfect) }),
      h("td", { text: p.streak ? "🔥 " + p.streak : "–" }), h("td", { text: pctTxt(p.monthly) }), h("td", { text: p.last || "–" }),
      h("td", { style: "white-space:normal;min-width:220px", text: (p.weak || []).map((w) => w.text + (w.n > 1 ? " (" + w.n + ")" : "")).join(" · ") || "–" }))));
    box.append(h("div", { style: "overflow-x:auto" }, tbl));
  }

  // ---------- dashboard ----------
  // Weeks follow the month (agreed with Mohamed): week 1 = days 1-7, week 2 = 8-14, week 3 = 15-21, week 4 = 22 to the
  // month's end. Everything here is by CALL date (the day of the call that was evaluated), not the day it was heard.
  const tl = (ar, en) => (lang === "en" ? en : ar);
  const LS_DB = "qa_db";
  let dbState = Object.assign({ level: "agent", preset: "month", ym: "", w: 0 }, store(LS_DB) || {});
  const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = (ym) => (lang === "en" ? MONTHS_EN : MONTHS_AR)[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
  const monthEnd = (ym) => ymdOf(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0));
  const shiftMonth = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return ymdOf(d).slice(0, 7); };
  const mWeekOf = (day) => { const n = +String(day).slice(8, 10); return n <= 7 ? 1 : n <= 14 ? 2 : n <= 21 ? 3 : 4; };
  function mWeekRange(ym, w) {
    const from = ym + "-" + String((w - 1) * 7 + 1).padStart(2, "0");
    return [from, w === 4 ? monthEnd(ym) : ym + "-" + String(w * 7).padStart(2, "0")];
  }
  const prevMWeek = (ym, w) => (w > 1 ? [ym, w - 1] : [shiftMonth(ym, -1), 4]);
  const wkName = (w) => tl("الأسبوع " + w, "Week " + w);
  const wkDays = (w) => (w === 4 ? tl("22–آخر الشهر", "22–end") : ((w - 1) * 7 + 1) + "–" + w * 7);
  // [from, to, previous from, previous to] for the dashboard's period.
  function dbRange() {
    const td = today(), ym = td.slice(0, 7), s = dbState;
    if (s.preset === "week" || s.preset === "lastweek" || s.preset === "mw") {
      let wym = ym, w = mWeekOf(td);
      if (s.preset === "lastweek") [wym, w] = prevMWeek(ym, w);
      if (s.preset === "mw" && /^\d{4}-\d{2}$/.test(s.ym) && s.w >= 1 && s.w <= 4) { wym = s.ym; w = s.w; }
      const [a, b] = mWeekRange(wym, w), [pym, pw] = prevMWeek(wym, w), [pa, pb] = mWeekRange(pym, pw);
      return [a, b, pa, pb];
    }
    if (s.preset === "month") {
      const pym = shiftMonth(ym, -1), pe = monthEnd(pym), sameDay = pym + "-" + td.slice(8, 10);
      return [ym + "-01", monthEnd(ym), pym + "-01", sameDay < pe ? sameDay : pe];
    }
    if (s.preset === "lastmonth") { const p = shiftMonth(ym, -1), pp = shiftMonth(ym, -2); return [p + "-01", monthEnd(p), pp + "-01", monthEnd(pp)]; }
    if (s.preset === "q3") { const a = shiftMonth(ym, -2) + "-01"; return [a, monthEnd(ym), shiftMonth(ym, -5) + "-01", monthEnd(shiftMonth(ym, -3))]; }
    if (s.preset === "custom") { const a = $("#dbFrom").value, b = $("#dbTo").value; const [pa, pb] = a && b ? rpPrevRange(a, b) : ["", ""]; return [a, b, pa, pb]; }
    return ["", "", "", ""];
  }
  const dbRefMonth = () => { const b = dbRange()[1]; return (b && b < today() ? b : today()).slice(0, 7); };
  const fmtDay = (d) => (d ? +d.slice(8, 10) + " " + (lang === "en" ? MONTHS_EN : MONTHS_AR)[+d.slice(5, 7) - 1] : "");
  const levelOk = (r, level) => {
    const p = purposeOf(r);
    if (level === "program") return p === "program";
    if (level === "both") return p === "program" || (p === "live" && selectionOf(r) === "random");
    return p === "live" && selectionOf(r) === "random";
  };
  function dbControls() {
    const saveState = () => store(LS_DB, dbState);
    const levels = [["agent", tl("Agent level", "Agent level"), tl("تقييمات الليدرز · محسوبة على الإيجنت", "Team leaders · counted for the agent")],
      ["program", tl("Program level", "Program level"), tl("عينة الكواليتي · جودة الأكاونت", "Quality sample · account quality")],
      ["both", tl("الاتنين مع بعض", "Both together"), tl("صورة الأكاونت كلها", "The whole account")]];
    const lv = $("#dbLevels"); lv.innerHTML = "";
    levels.forEach(([k, name, sub]) => lv.append(h("button", { type: "button", role: "tab", "aria-selected": String(dbState.level === k), class: "db-level" + (dbState.level === k ? " active" : ""),
      onclick: () => { dbState.level = k; $("#dbCal").value = k === "both" ? "all" : k; saveState(); renderDashboard(); } },
      h("span", { class: "db-level-name", text: name }), h("span", { class: "db-level-sub", text: sub }))));
    $("#dbCal").value = dbState.level === "both" ? "all" : dbState.level;
    const presets = [["week", tl("الأسبوع ده", "This week")], ["lastweek", tl("الأسبوع اللي فات", "Last week")], ["month", tl("الشهر ده", "This month")],
      ["lastmonth", tl("الشهر اللي فات", "Last month")], ["q3", tl("آخر 3 شهور", "Last 3 months")], ["all", tl("كل الفترات", "All time")], ["custom", tl("تواريخ أختارها", "Custom dates")]];
    const pr = $("#dbPresets"); pr.innerHTML = "";
    presets.forEach(([k, name]) => pr.append(h("button", { type: "button", class: "chip" + (dbState.preset === k ? " active" : ""), text: name,
      onclick: () => { dbState.preset = k; if (k === "custom") $("#dbMore").open = true; saveState(); renderDashboard(); } })));
    // Week chips for the month in view.
    const ym = dbState.preset === "lastmonth" ? shiftMonth(today().slice(0, 7), -1) : dbState.preset === "mw" && dbState.ym ? dbState.ym : today().slice(0, 7);
    const [cf, ct] = dbRange();
    const wk = $("#dbWeeks"); wk.innerHTML = "";
    wk.append(h("button", { type: "button", class: "chip ghost", title: tl("الشهر اللي قبله", "Previous month"), text: lang === "en" ? "‹" : "›", onclick: () => { dbState = Object.assign(dbState, { preset: "mw", ym: shiftMonth(ym, -1), w: 4 }); saveState(); renderDashboard(); } }),
      h("span", { class: "db-weeks-month", text: monthLabel(ym) }));
    for (let w = 1; w <= 4; w++) {
      const [a, b] = mWeekRange(ym, w), on = cf === a && ct === b;
      wk.append(h("button", { type: "button", class: "chip wk" + (on ? " active" : "") + (a > today() ? " future" : ""),
        onclick: () => { dbState = Object.assign(dbState, { preset: "mw", ym, w }); saveState(); renderDashboard(); } },
        h("b", { text: wkName(w) }), h("small", { text: wkDays(w) })));
    }
    if (ym < today().slice(0, 7)) wk.append(h("button", { type: "button", class: "chip ghost", title: tl("الشهر اللي بعده", "Next month"), text: lang === "en" ? "›" : "‹", onclick: () => { const n = shiftMonth(ym, 1); dbState = Object.assign(dbState, { preset: "mw", ym: n, w: n === today().slice(0, 7) ? mWeekOf(today()) : 1 }); saveState(); renderDashboard(); } }));
    if (dbState.preset !== "custom") { $("#dbFrom").value = cf; $("#dbTo").value = ct; }
    $("#dbRangeText").textContent = (cf || ct ? (cf ? fmtDay(cf) : "…") + " ← " + (ct ? fmtDay(ct) + " " + ct.slice(0, 4) : "…") : tl("كل الفترات", "All time")).replace("←", lang === "en" ? "→" : "←") +
      " · " + tl("حسب تاريخ المكالمة", "by call date");
  }
  // One tile: value, sub line, and the change against the previous period (better = green).
  function kpiTile(k, v, sub, delta, opts = {}) {
    let d = null;
    if (delta !== null && delta !== undefined && !isNaN(delta)) {
      const up = delta > 0.0005, down = delta < -0.0005, good = opts.lowerBetter ? down : up, bad = opts.lowerBetter ? up : down;
      const txt = opts.count ? (delta > 0 ? "+" : "") + Math.round(delta) : (delta > 0 ? "+" : "") + Math.round(delta * 1000) / 10 + " " + t("pts");
      d = h("span", { class: "tile-d" + (good ? " up" : bad ? " down" : ""), dir: "ltr", title: tl("مقارنة بالفترة اللي قبلها", "vs the previous period"), text: (up ? "▲ " : down ? "▼ " : "■ ") + (up || down ? txt : tl("زي ما هو", "same")) });
    }
    return h("div", { class: "tile" + (opts.state ? " " + opts.state : "") }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }),
      h("div", { class: "tile-s" }, sub ? h("span", { text: sub }) : null, d));
  }
  const ringSvg = (frac, cls) => {
    const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("class", "ring " + (cls || ""));
    svg.innerHTML = '<circle cx="32" cy="32" r="' + r + '" class="ring-bg"/><circle cx="32" cy="32" r="' + r + '" class="ring-fg" stroke-dasharray="' + (f * c).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>';
    return svg;
  };
  // Weekly targets for the month in view: team leaders (Agent level, N per agent per week) and Quality (Program level, random).
  function renderTargets(all) {
    const box = $("#dbTargets"); if (!box) return;
    box.innerHTML = "";
    const ym = dbRefMonth(), td = today();
    const perAgent = Number(teamCfg.leaderWeekly) || 4, qWeek = Number(teamCfg.qualityWeekly) || 40;
    const live = all.filter((r) => !r.test && purposeOf(r) === "live" && callDay(r).slice(0, 7) === ym);
    const prog = all.filter((r) => !r.test && purposeOf(r) === "program" && callDay(r).slice(0, 7) === ym);
    const agents = [...new Set([...(roster.agents || []), ...live.map((r) => r.agent).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const nAg = (roster.agents || []).length || agents.length;
    const lWeek = perAgent * nAg;
    // Week state: done / running (with the pace expected by today) / missed / not started.
    const wkState = (w, n, target) => {
      const [a, b] = mWeekRange(ym, w);
      if (n >= target) return { cls: "good", text: "✓ " + tl("تم", "Done") };
      if (a > td) return { cls: "na", text: tl("لسه مبدأش", "Not started") };
      if (b < td) return { cls: "bad", text: "✗ " + tl("ناقص ", "Short ") + (target - n) };
      const days = (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5 + 1, gone = (new Date(td + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5 + 1;
      const pace = Math.ceil(target * gone / days);
      return { cls: n >= pace ? "info" : "warn", text: "⏳ " + tl("المفروض لحد النهارده ", "Pace by today ") + pace };
    };
    const block = (title, sub, list, target, monthTarget, cls) => {
      const total = list.length;
      const head = h("div", { class: "tg-head" }, h("div", { class: "tg-ring" }, ringSvg(total / monthTarget, cls), h("div", { class: "tg-ring-txt" }, h("b", { text: Math.round(total / monthTarget * 100) + "%" }))),
        h("div", {}, h("h3", { text: title }), h("div", { class: "hint", text: sub }), h("div", { class: "tg-total", dir: "ltr" }, h("b", { text: String(total) }), " / " + monthTarget + " " + tl("في الشهر", "this month"))));
      const weeks = h("div", { class: "tg-weeks" });
      for (let w = 1; w <= 4; w++) {
        const [a, b] = mWeekRange(ym, w), n = list.filter((r) => callDay(r) >= a && callDay(r) <= b).length, st = wkState(w, n, target);
        const now = td >= a && td <= b;
        weeks.append(h("div", { class: "tg-week" + (now ? " now" : "") },
          h("div", { class: "tg-wk-name" }, h("b", { text: wkName(w) }), h("small", { text: wkDays(w) })),
          h("div", { class: "tg-wk-num", dir: "ltr" }, h("b", { text: String(n) }), " / " + target),
          h("div", { class: "tg-bar" }, h("div", { class: "tg-fill " + st.cls, style: "width:" + Math.min(100, n / target * 100).toFixed(1) + "%" })),
          h("span", { class: "pill " + st.cls, text: st.text })));
      }
      return h("div", { class: "tg-block" }, head, weeks);
    };
    // Agent × week grid: leaders need perAgent each week; Quality is random (no per-agent target), shown for coverage.
    const grid = (list, need) => {
      const tb = h("table", { class: "tg-grid" }, h("tr", {}, h("th", { text: t("c_agent") }), ...[1, 2, 3, 4].map((w) => h("th", { class: "num" }, wkName(w), h("div", { class: "meta", text: wkDays(w) }))), h("th", { class: "num", text: tl("الشهر", "Month") })));
      agents.forEach((ag) => {
        const mine = list.filter((r) => nameKey(r.agent) === nameKey(ag));
        const cells = [1, 2, 3, 4].map((w) => {
          const [a, b] = mWeekRange(ym, w), n = mine.filter((r) => callDay(r) >= a && callDay(r) <= b).length;
          if (!need) return h("td", { class: "num" }, h("span", { class: "pill " + (n ? "info" : a > td ? "na" : "warn"), text: a > td && !n ? "–" : String(n) }));
          const cls = n >= need ? "good" : a > td ? "na" : b < td ? "bad" : n ? "warn" : "warn";
          return h("td", { class: "num" }, h("span", { class: "pill " + cls, dir: "ltr", text: a > td && !n ? "–" : n + " / " + need }));
        });
        tb.append(h("tr", {}, h("td", { text: ag }), ...cells, h("td", { class: "num", dir: "ltr", text: need ? mine.length + " / " + need * 4 : String(mine.length) })));
      });
      return h("div", { class: "table-wrap" }, tb);
    };
    const tabs = h("div", { class: "tg-tabs" });
    const body = h("div", {});
    const show = (k) => { store("qa_db_tg", k); [...tabs.children].forEach((b) => b.classList.toggle("active", b.dataset.k === k)); body.innerHTML = ""; body.append(k === "q" ? grid(prog, 0) : grid(live, perAgent)); };
    tabs.append(h("button", { type: "button", class: "chip", "data-k": "l", text: tl("الليدرز: كل إيجنت ", "Team leaders: each agent ") + perAgent + tl(" في الأسبوع", " a week"), onclick: () => show("l") }),
      h("button", { type: "button", class: "chip", "data-k": "q", text: tl("الكواليتي: كل إيجنت اتسمع كام مرة", "Quality: how often each agent was heard"), onclick: () => show("q") }));
    box.append(h("div", { class: "tg-top" }, h("h2", { text: tl("التارجت الأسبوعي · ", "Weekly targets · ") + monthLabel(ym) }),
        h("span", { class: "meta", text: tl("الأسبوع بتاريخ المكالمة: 1–7 · 8–14 · 15–21 · 22–آخر الشهر", "Week = call date: 1–7 · 8–14 · 15–21 · 22–end") })),
      h("div", { class: "tg-two" },
        block(tl("الليدرز · Agent level", "Team leaders · Agent level"), tl(perAgent + " لكل إيجنت × " + nAg + " إيجنت = " + lWeek + " في الأسبوع", perAgent + " per agent × " + nAg + " agents = " + lWeek + " a week"), live, lWeek, lWeek * 4, "c1"),
        block(tl("الكواليتي · Program level", "Quality · Program level"), tl(qWeek + " في الأسبوع، راندوم مش إيجنت معيّن", qWeek + " a week, random, not a set agent"), prog, qWeek, qWeek * 4, "c2")),
      tabs, body);
    show(store("qa_db_tg") === "q" ? "q" : "l");
  }
  function renderDashboard() {
    renderKbQuiz();
    dbControls();
    const qb = $("#dbQualityReport");
    if (qb) { const ym = dbRefMonth(); qb.textContent = "📊 " + tl("ريبورت الجودة الشهري (Excel) · ", "Monthly quality report (Excel) · ") + monthLabel(ym);
      qb.onclick = async () => { qb.disabled = true; try { await exportQualityReport(dbRefMonth()); } finally { qb.disabled = false; } }; }
    const all = allRecords();
    fillSelect($("#dbAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), t("f_all_agents"));
    fillSelect($("#dbEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), t("f_all_evaluators"));
    fillSelect($("#dbType"), [...new Set(all.map((r) => r.type).filter(Boolean))].sort(), t("f_all_types"), (v) => typeLabel(all.find((r) => r.type === v).form, v));
    const [from, to, pFrom, pTo] = dbRange();
    renderDbPromises({ agent: $("#dbAgent").value || "", from, to });
    const f = { form: $("#dbForm").value, agent: $("#dbAgent").value, ev: $("#dbEvaluator").value, type: $("#dbType").value, level: dbState.level };
    const base = all.filter((r) => !r.test && (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) && (!f.type || r.type === f.type) && levelOk(r, f.level));
    const inR = (a, b) => (r) => (!a || callDay(r) >= a) && (!b || callDay(r) <= b);
    const recs = base.filter(inR(from, to));
    const prev = pFrom && pTo ? base.filter(inR(pFrom, pTo)) : null;
    const more = [f.form, f.agent, f.ev, f.type].filter(Boolean).length;
    $("#dbMore").querySelector("summary").textContent = t("db_more_filters") + (more ? " (" + more + ")" : "");

    // What this level means.
    const note = $("#dbLevelNote"); note.innerHTML = "";
    const notes = {
      agent: tl("Agent level: تقييمات الليدرز (عشوائي) اللي بتتحسب في سكور الإيجنت. الموجّه والسرتيفيكيشن والكاليبريشن مش هنا.", "Agent level: team leaders' random evaluations that count in the agent's score. Targeted, certification and calibration are not here."),
      program: tl("Program level: عينة الكواليتي العشوائية للأكاونت. بتقيس جودة البرنامج كله، ومش محسوبة على الإيجنت.", "Program level: Quality's random account sample. It measures the whole program and is not counted for the agent."),
      both: tl("الاتنين مع بعض: Agent level + Program level، عشان تشوف صورة الأكاونت كلها.", "Both: Agent level + Program level, for the whole account picture."),
    };
    note.append(h("span", { class: "db-dot " + f.level }), h("span", { text: notes[f.level] }),
      prev ? h("span", { class: "meta", text: " · " + tl("المقارنة مع ", "Compared with ") + fmtDay(pFrom) + " – " + fmtDay(pTo) }) : null);

    renderTargets(all.filter((r) => (!f.agent || r.agent === f.agent)));

    lastLists.dashboard = recs;
    const ids = ["#dbKpis", "#dbTrend", "#dbAgentsChart", "#dbAgents", "#dbItems", "#dbCrit", "#dbSections", "#dbEvaluators"];
    if (!recs.length) {
      ids.forEach((i) => ($(i).innerHTML = ""));
      $("#dbKpis").append(h("div", { class: "empty", text: all.length ? t("db_nomatch") : t("db_empty") }));
      if ($("#dbAlerts")) $("#dbAlerts").hidden = true;
      if ($("#dbCoverage")) $("#dbCoverage").hidden = true;
      ids.slice(1).forEach((i) => ($(i).style.display = "none"));
      return;
    }
    ids.forEach((i) => ($(i).style.display = ""));

    // KPI tiles, each with the change against the previous period.
    const fin = (l) => avg(l.map((r) => r.final).filter((x) => x !== null && x !== undefined));
    const passOf = (l) => (l.length ? l.filter((r) => r.result === "Pass").length / l.length : null);
    const ncOf = (l) => avg(l.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined));
    const critN = (l) => l.filter((r) => r.critical > 0).length;
    const accOf = (l, k) => avg(l.map((r) => r[k]).filter((x) => x !== null && x !== undefined));
    const dl = (fn) => (prev && prev.length ? (fn(recs) === null || fn(prev) === null ? null : fn(recs) - fn(prev)) : null);
    const A = fin(recs), P = passOf(recs);
    const tiles = [
      kpiTile(t("k_evals"), recs.length, t("k_agents", { n: new Set(recs.map((r) => r.agent)).size }), prev ? recs.length - prev.length : null, { count: true }),
      kpiTile(t("k_avg"), pct(A), t("k_target"), dl(fin), { state: A === null ? "" : A >= PASS ? "good" : "bad" }),
      kpiTile(t("k_pass"), pct(P), t("k_passed", { a: recs.filter((r) => r.result === "Pass").length, b: recs.length }), dl(passOf)),
      kpiTile(t("k_crit"), critN(recs), t("k_of_evals", { p: pct(critN(recs) / recs.length) }), prev && prev.length ? critN(recs) - critN(prev) : null, { count: true, lowerBetter: true, state: critN(recs) ? "bad" : "good" }),
      kpiTile(t("k_nc"), pct(ncOf(recs)), t("k_before"), dl(ncOf)),
      kpiTile(t("eu_acc"), pct(accOf(recs, "eu")), t("k_eu"), dl((l) => accOf(l, "eu")), { state: accOf(recs, "eu") >= 0.98 ? "good" : "bad" }),
      kpiTile(t("bc_acc"), pct(accOf(recs, "bc")), t("k_bc"), dl((l) => accOf(l, "bc")), { state: accOf(recs, "bc") >= 0.95 ? "good" : "bad" }),
      kpiTile(t("cc_acc"), pct(accOf(recs, "cc")), t("k_cc"), dl((l) => accOf(l, "cc"))),
    ];
    section("#dbKpis", t("overview"), null, h("div", { class: "tiles db-tiles" }, tiles));
    renderCopcAlerts("#dbAlerts", recs, all);
    if (f.level === "program") $("#dbCoverage").hidden = true; else renderCoverage("#dbCoverage", all, f.agent || "");

    // Trend by month-week: the last 8 weeks up to the end of the period (other filters apply, dates don't).
    const endDay = to && to < today() ? to : today();
    let [wym, ww] = [endDay.slice(0, 7), mWeekOf(endDay)];
    const wkList = [];
    for (let i = 0; i < 8; i++) { wkList.unshift([wym, ww]); [wym, ww] = prevMWeek(wym, ww); }
    section("#dbTrend", tl("الاتجاه الأسبوعي", "Weekly trend"), tl("متوسط السكور النهائي لكل أسبوع (آخر 8 أسابيع لحد آخر الفترة). الخط = 85%.", "Average final score per week (last 8 weeks up to the period's end). Line = 85%."),
      bars(wkList.map(([m, w]) => {
        const [a, b] = mWeekRange(m, w), l = base.filter(inR(a, b)), v = fin(l);
        return { label: monthLabel(m).split(" ")[0] + " · " + wkName(w) + " (" + l.length + ")", value: v || 0, display: l.length ? pct(v) : "–", flag: l.length && v < PASS, title: t("trend_tip", { n: l.length, p: pct(passOf(l)) }) };
      }), { max: 1, target: PASS }));

    // Agents
    const by = new Map();
    recs.forEach((r) => { const k = r.agent || "–"; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const agents = [...by.entries()].map(([agent, list]) => {
      const fa = fin(list), crit = list.reduce((s, r) => s + (r.critical || 0), 0);
      const pl = prev ? prev.filter((r) => (r.agent || "–") === agent) : [];
      return { agent, list, fin: fa, pass: passOf(list), nc: ncOf(list), cc: accOf(list, "cc"), eu: accOf(list, "eu"), bc: accOf(list, "bc"), crit, ok: fa !== null && fa >= PASS && crit === 0, delta: pl.length && fa !== null ? fa - fin(pl) : null };
    }).sort((a, b) => (b.fin || 0) - (a.fin || 0));
    section("#dbAgentsChart", t("by_agent"), t("by_agent_hint"),
      bars(agents.map((a) => ({ label: a.agent, value: a.fin || 0, display: pct(a.fin), flag: (a.fin || 0) < PASS, title: t("agent_tip", { n: a.list.length, c: a.crit }) })), { max: 1, target: PASS }));
    const head = [t("c_agent"), t("c_evals"), t("c_avg_final"), tl("التغيير", "Change"), t("k_pass"), t("c_avg_nc"), t("c_cc"), t("c_eu"), t("c_bc"), t("c_crit"), t("c_status")];
    const rows = [head];
    const tbl = h("table", {}, h("tr", {}, head.map((x, i) => h("th", { class: i && i < 10 ? "num" : "", text: x }))));
    agents.forEach((a, i) => {
      const status = a.ok ? t("st_ok") : t("st_bad");
      const dTxt = a.delta === null ? "–" : (a.delta > 0 ? "▲ +" : a.delta < 0 ? "▼ " : "■ ") + Math.round(a.delta * 1000) / 10;
      tbl.append(h("tr", {}, h("td", {}, h("span", { class: "rank", text: String(i + 1) }), h("a", { href: "#", text: a.agent, onclick: (e) => { e.preventDefault(); $("#dbAgent").value = a.agent; $("#dbMore").open = true; renderDashboard(); } })),
        h("td", { class: "num", text: a.list.length }), h("td", { class: "num" }, h("b", { text: pct(a.fin) })),
        h("td", { class: "num " + (a.delta > 0 ? "up" : a.delta < 0 ? "down" : ""), dir: "ltr", text: dTxt }), h("td", { class: "num", text: pct(a.pass) }), h("td", { class: "num", text: pct(a.nc) }),
        h("td", { class: "num", text: pct(a.cc) }), h("td", { class: "num", text: pct(a.eu) }), h("td", { class: "num", text: pct(a.bc) }), h("td", { class: "num", text: a.crit }),
        h("td", {}, h("span", { class: "pill " + (a.ok ? "good" : "bad"), text: status }))));
      rows.push([a.agent, a.list.length, pct(a.fin), dTxt, pct(a.pass), pct(a.nc), pct(a.cc), pct(a.eu), pct(a.bc), a.crit, status]);
    });
    section("#dbAgents", t("agents_tbl"), t("agents_tbl_hint"), h("div", { class: "table-wrap" }, tbl),
      h("p", {}, h("button", { text: t("download"), onclick: () => download("QA_Dashboard_" + f.level + "_" + today() + ".csv", toCsv(rows), "text/csv") })));

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
    const teamAvg = A;
    const et = h("table", {}, h("tr", {}, ["evaluator", "c_evals", "e_avg", "e_gap", "e_crit"].map((k, i) => h("th", { class: i ? "num" : "", text: t(k) }))));
    [...evs.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([ev, list]) => {
      const a = fin(list);
      const gap = a === null || teamAvg === null ? null : a - teamAvg;
      et.append(h("tr", {}, h("td", { text: ev }), h("td", { class: "num", text: list.length }), h("td", { class: "num", text: pct(a) }),
        h("td", { class: "num", text: gap === null ? "–" : (gap >= 0 ? "+" : "") + (Math.round(gap * 1000) / 10) + " " + t("pts") }),
        h("td", { class: "num", text: list.reduce((s, r) => s + (r.critical || 0), 0) })));
    });
    section("#dbEvaluators", t("evaluators"), t("evaluators_hint"), h("div", { class: "table-wrap" }, et));
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
      aht: ahtOf(list), cc: avg(list.map((r) => r.cc).filter((x) => x !== null && x !== undefined)), eu: avg(list.map((r) => r.eu).filter((x) => x !== null && x !== undefined)), bc: avg(list.map((r) => r.bc).filter((x) => x !== null && x !== undefined)) };
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
    syncChips();
    const f = { form: $("#rpForm").value, agent: $("#rpAgent").value, ev: $("#rpEvaluator").value, type: $("#rpType").value, level: $("#rpLevel").value || "agent", method: $("#rpMethod").value, from: $("#rpFrom").value, to: $("#rpTo").value };
    const pick = (from, to) => all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) && (!f.type || r.type === f.type) &&
      (!f.method || (r.method || "recording") === f.method) && (!from || callDay(r) >= from) && (!to || callDay(r) <= to) &&
      (f.level === "all" ? !["calibration", "roleplay"].includes(purposeOf(r)) : levelOk(r, f.level)));
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
      const tiles = [[t("rp_evals"), S.n, t("k_agents", { n: new Set(recs.map((r) => r.agent)).size })], [t("rp_avg"), pct(S.avg), t("k_target")], [t("rp_pass"), pct(S.pass), ""], [t("rp_withcrit"), S.crit, pct(S.crit / S.n)], ["AHT", ahtText(S.aht), tl("متوسط مدة المكالمات المتقيّمة", "average talk time of evaluated calls")]];
      out.append(rpCard(t("rp_s_summary"), pr ? t("rp_vs", { a: pr[0], b: pr[1] }) + (P ? "" : " " + t("rp_prev_empty")) : t("rp_prev_na"),
        h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), h("div", { class: "tile-s", text: sub })))),
        rpTable([t("rp_metric"), t("rp_this"), t("rp_prev"), t("rp_change")], [
          row(t("rp_evals"), S.n, P && P.n), row(t("rp_avg"), S.avg, P && P.avg, true), row(t("rp_pass"), S.pass, P && P.pass, true), row(t("rp_nc"), S.nc, P && P.nc, true),
          row(t("cc_acc"), S.cc, P && P.cc, true), row(t("eu_acc"), S.eu, P && P.eu, true), row(t("bc_acc"), S.bc, P && P.bc, true), row(t("rp_withcrit"), S.crit, P && P.crit, false, true),
          ["AHT (mm:ss)", ahtText(S.aht), P ? ahtText(P.aht) : "–", !P || S.aht === null || P.aht === null ? "–" : (S.aht - P.aht > 0 ? "+" : "") + (S.aht - P.aht) + "s"]], [1, 2, 3])));
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
        return [a, s.n, pct(s.avg), ps && ps.n ? signed(s.avg - ps.avg) : "–", pct(s.pass), pct(s.nc), pct(s.cc), pct(s.eu), pct(s.bc), l.reduce((x, r) => x + (r.critical || 0), 0), ahtText(s.aht), top ? iname(top) + " (" + top.miss + ")" : "–", { text: ok ? t("st_ok") : t("st_bad"), class: ok ? "good-txt" : "bad-txt" }]; });
      out.append(rpCard(t("rp_s_agents"), t("rp_agents_hint"),
        rpTable([t("c_agent"), t("rp_evals"), t("rp_avg"), t("rp_change"), t("rp_pass"), t("rp_nc"), t("cc_acc"), t("eu_acc"), t("bc_acc"), t("c_crit"), "AHT", t("rp_top_miss"), t("c_status")], rows, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])));
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
    // Weeks follow the month: 1-7, 8-14, 15-21, 22-end (same as the dashboard and the weekly targets).
    if (p === "week") return mWeekRange(ymd(d).slice(0, 7), mWeekOf(ymd(d)));
    if (p === "lastweek") { const [m, w] = prevMWeek(ymd(d).slice(0, 7), mWeekOf(ymd(d))); return mWeekRange(m, w); }
    return ["", ""];
  }
  const PURPOSE_KEYS = ["live", "certcall", "program", "coaching", "postcoach", "calibration", "roleplay"];
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
  // "My work" target card: this week's and this month's numbers against the weekly targets, by CALL date.
  // Team leaders see the team's Agent level count (target per agent × agents) and which agents still need calls this week;
  // Quality sees the Program level count against its weekly target and who hasn't been heard yet this week.
  function renderMyTarget(who, all) {
    const box = $("#mwTarget"); if (!box) return;
    box.innerHTML = "";
    const td = today(), ym = td.slice(0, 7), w = mWeekOf(td), [wa, wb] = mWeekRange(ym, w);
    const perAgent = Number(teamCfg.leaderWeekly) || 4, qWeek = Number(teamCfg.qualityWeekly) || 40;
    const agents = (roster.agents || []).slice().sort((a, b) => a.localeCompare(b));
    const inWeek = (r) => callDay(r) >= wa && callDay(r) <= wb, inMonth = (r) => callDay(r).slice(0, 7) === ym;
    const mineOf = (l) => (who ? l.filter((r) => nameKey(r.evaluator) === nameKey(who)) : l);
    const days = (new Date(wb + "T12:00:00") - new Date(wa + "T12:00:00")) / 864e5 + 1, gone = (new Date(td + "T12:00:00") - new Date(wa + "T12:00:00")) / 864e5 + 1;
    const mDays = +monthEnd(ym).slice(8, 10), mGone = +td.slice(8, 10);
    const meter = (title, n, target, sub, cls, month) => {
      const pace = Math.ceil(target * (month ? mGone / mDays : gone / days)), f = target ? Math.min(1, n / target) : 0;
      const st = n >= target ? ["good", "✓ " + tl("التارجت اتحقق", "Target met")] : n >= pace ? ["info", tl("ماشي في الميعاد", "On pace")] : ["warn", tl("المفروض لحد النهارده ", "Pace by today ") + pace];
      return h("div", { class: "mt-meter" },
        h("div", { class: "mt-k", text: title }),
        h("div", { class: "mt-v", dir: "ltr" }, h("b", { text: String(n) }), " / " + target),
        h("div", { class: "tg-bar" }, h("div", { class: "tg-fill " + (cls || st[0]), style: "width:" + (f * 100).toFixed(1) + "%" })),
        h("div", { class: "mt-s" }, h("span", { class: "pill " + st[0], text: st[1] }), sub ? h("span", { class: "meta", text: sub }) : null));
    };
    const isQ = who && isQualityName(who), showL = !isQ, showQ = !who || isQ;
    const kids = [h("div", { class: "tg-top" }, h("h2", { text: tl("التارجت · ", "Targets · ") + wkName(w) + " (" + wkDays(w) + ") · " + monthLabel(ym) }),
      h("span", { class: "meta", text: tl("بتاريخ المكالمة", "by call date") }))];
    const grid = h("div", { class: "mt-grid" });
    if (showL) {
      const live = all.filter((r) => purposeOf(r) === "live");
      const wk = live.filter(inWeek), mo = live.filter(inMonth), lw = perAgent * (agents.length || 1);
      grid.append(meter(tl("الليدرز · الأسبوع ده", "Team leaders · this week"), wk.length, lw, who ? tl("منهم بتوعك: ", "Yours: ") + mineOf(wk).length : ""),
        meter(tl("الليدرز · الشهر ده", "Team leaders · this month"), mo.length, lw * 4, who ? tl("منهم بتوعك: ", "Yours: ") + mineOf(mo).length : "", "", true));
      const need = agents.map((a) => [a, wk.filter((r) => nameKey(r.agent) === nameKey(a)).length]).filter(([, n]) => n < perAgent);
      const noSbs = agents.filter((a) => !wk.some((r) => r.method === "sidebyside" && nameKey(r.agent) === nameKey(a)));
      kids.push(grid);
      kids.push(h("div", { class: "mt-need" }, h("b", { text: need.length ? tl("لسه محتاجين الأسبوع ده:", "Still needed this week:") : "✓ " + tl("كل الإيجنتس خدوا " + perAgent + " الأسبوع ده", "Every agent has " + perAgent + " this week") }),
        ...need.map(([a, n]) => h("span", { class: "pill " + (n ? "warn" : "bad"), dir: "auto", text: a + " · " + n + "/" + perAgent }))));
      kids.push(h("div", { class: "mt-need" }, h("b", { text: noSbs.length ? tl("لسه من غير سايد باي سايد الأسبوع ده:", "No side by side yet this week:") : "✓ " + tl("كل الإيجنتس خدوا سايد باي سايد الأسبوع ده", "Every agent had a side by side this week") }),
        ...noSbs.map((a) => h("span", { class: "pill info", dir: "auto", text: a }))));
      if (td === mWeekStartOf(td)) kids.push(h("p", { class: "hint", text: tl("أول يوم في الأسبوع: النهارده للسايد باي سايد، والسحب العشوائي بيجيب مكالمات آخر يوم في الأسبوع اللي فات عشان اليوم ده يتسمع هو كمان. من بكره السحب من الأسبوع الحالي بس.", "First day of the week: today is for side by side, and random picks come from last week's last day so that day is heard too. From tomorrow picks come from this week only.") }));
    }
    if (showQ) {
      const prog = all.filter((r) => purposeOf(r) === "program");
      const wk = mineOf(prog.filter(inWeek)), mo = mineOf(prog.filter(inMonth));
      const g2 = showL ? h("div", { class: "mt-grid" }) : grid;
      g2.append(meter(tl("الكواليتي · الأسبوع ده", "Quality · this week"), wk.length, qWeek, "", "c2"), meter(tl("الكواليتي · الشهر ده", "Quality · this month"), mo.length, qWeek * 4, "", "c2", true));
      if (!showL) kids.push(g2); else kids.push(g2);
      const heard = new Set(prog.filter(inWeek).map((r) => nameKey(r.agent)));
      const left = agents.filter((a) => !heard.has(nameKey(a)));
      kids.push(h("div", { class: "mt-need" }, h("b", { text: left.length ? tl("لسه متسمعوش في عينة الأسبوع ده:", "Not heard in this week's sample yet:") : "✓ " + tl("كل الإيجنتس اتسمعوا الأسبوع ده", "Every agent heard this week") }),
        ...left.map((a) => h("span", { class: "pill info", dir: "auto", text: a }))));
    }
    box.append(...kids);
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
    renderMyTarget(who, all);

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
    recent.forEach((r) => rt.append(h("tr", {}, h("td", { dir: "ltr" }, h("div", { text: whenText(r) }), phoneDiv(r), h("div", { class: "meta eval-id-tag", text: evalIdOf(r) })), h("td", { text: r.agent || "–" }), who ? null : h("td", { text: r.evaluator || "–" }),
      h("td", {}, h("span", { class: "pill " + (purposeOf(r) === "live" ? "good" : "info"), text: t("p_" + purposeOf(r)).replace(/\s*\(.*\)$/, "") }), r.method === "sidebyside" ? h("div", { class: "meta", text: t("m_sidebyside").replace(/\s*\(.*\)$/, "") }) : null),
      h("td", { class: "num" }, h("span", { class: "pill " + (r.result === "Pass" ? "good" : "bad"), text: pct(r.final) })),
      h("td", { class: "actions" }, canChange(r) ? h("button", { type: "button", text: t("open_edit"), onclick: () => openRecord(r) }) : null))));
    section("#mwRecent", t("mw_recent"), null, recent.length ? rt : h("div", { class: "empty", text: t("mw_none") }));
  }

  // ---------- monthly Quality Performance Dashboard (the Excel layout the CX head asked for) ----------
  // Same sections as his "Quality Performance Dashboard" sheet: Quality adherence (Program level vs the Quality weekly
  // target), Operation adherence (Agent level vs leaders' target, capped per agent like his sheet), Program and Agent
  // level quality figures, the whole project, coaching fulfilment, adherence and scores per agent, and the raw data.
  // Weeks are month weeks by CALL date. Values are written, not formulas, so the file opens the same everywhere.
  let excelJsLib = null;
  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelJsLib) excelJsLib = new Promise((ok, bad) => {
      const sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      sc.onload = () => ok(window.ExcelJS); sc.onerror = () => { excelJsLib = null; bad(new Error("Excel library")); };
      document.head.append(sc);
    });
    return excelJsLib;
  }
  // Talk time of the evaluated call in seconds: exact from the phone system, else the duration typed in the form.
  const durSec = (r) => {
    if (r && Number(r.callTalk) > 0) return Math.round(Number(r.callTalk));
    const m = /^(\d{1,3}):(\d{2})$/.exec(String((r && r.duration) || "").trim());
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const ahtOf = (list) => { const s = list.map(durSec).filter((x) => x !== null && x > 0); return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null; };
  const ahtText = (sec) => (sec === null || sec === undefined ? "–" : mmss(sec));
  function qualityFigures(list) {
    const n = list.length, has = (k) => list.filter((r) => (r.items || []).some((i) => i.kind === k && i.result === "Error")).length;
    const ncItems = list.reduce((x, r) => x + (r.items || []).filter((i) => i.kind === "NC" && i.result && i.result !== "N/A").length, 0);
    const ncMiss = list.reduce((x, r) => x + (r.items || []).filter((i) => i.kind === "NC" && i.result === "Not met").length, 0);
    const eu = has("EU"), bc = has("BC"), cc = has("CC");
    return { n, eu, bc, cc, nc: ncMiss, euA: n ? 1 - eu / n : null, bcA: n ? 1 - bc / n : null, ccA: n ? 1 - cc / n : null, ncA: ncItems ? 1 - ncMiss / ncItems : null,
      avg: avg(list.map((r) => r.final).filter((x) => x !== null && x !== undefined)), aht: ahtOf(list) };
  }
  function qualityReportData(ym) {
    const all = allRecords().filter((r) => !r.test && callDay(r).slice(0, 7) === ym);
    const prog = all.filter((r) => purposeOf(r) === "program"), live = all.filter((r) => purposeOf(r) === "live");
    const agents = (roster.agents || []).slice().sort((a, b) => a.localeCompare(b));
    const perAgent = Number(teamCfg.leaderWeekly) || 4, qWeek = Number(teamCfg.qualityWeekly) || 40;
    const weeks = [1, 2, 3, 4].map((w) => { const [a, b] = mWeekRange(ym, w); const inW = (r) => callDay(r) >= a && callDay(r) <= b; return { w, a, b, prog: prog.filter(inW), live: live.filter(inW) }; });
    const capped = (l) => agents.reduce((x, a) => x + Math.min(perAgent, l.filter((r) => nameKey(r.agent) === nameKey(a)).length), 0);
    const sla = (Number(teamCfg.coachingSlaHours) || 48) * 36e5;
    const failed = all.filter(needsCoaching), done = failed.filter(isCoached);
    const onTime = done.filter((r) => coachTime(r) && coachTime(r) - (new Date(r.savedAt).getTime() || 0) <= sla);
    const monthEndDay = monthEnd(ym);
    const status = (a) => { const cd = (agentCertInfo(a, allRecords()) || {}).certDate || ""; return cd && cd >= addDays(monthEndDay, -30) ? "New" : "Old"; };
    const ext = (a) => { const r = all.filter((x) => nameKey(x.agent) === nameKey(a) && x.callExt).pop(); return r ? r.callExt : ""; };
    return { ym, all, prog, live, agents, perAgent, qWeek, weeks, capped, failed, done, onTime, status, ext };
  }
  async function exportQualityReport(ym) {
    let EJ;
    try { EJ = await loadExcelJs(); } catch (e) { alert(t("xlsx_failed")); return; }
    const D = qualityReportData(ym), wb = new EJ.Workbook();
    wb.creator = "QA Scorecard"; wb.created = new Date();
    const NAVY = "FF4F81BD", LIGHT = "FFDCE6F1", MID = "FFA7BFDE", WHITE = "FFFFFFFF";
    const border = { top: { style: "thin", color: { argb: "FF9DB3D6" } }, left: { style: "thin", color: { argb: "FF9DB3D6" } }, bottom: { style: "thin", color: { argb: "FF9DB3D6" } }, right: { style: "thin", color: { argb: "FF9DB3D6" } } };
    const head = (c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.font = { bold: true, color: { argb: WHITE } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = border; };
    const body = (c, fill, fmt) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill || LIGHT } }; c.alignment = { vertical: "middle", horizontal: "center" }; c.border = border; if (fmt) c.numFmt = fmt; };
    const PCT = "0.0%";
    const ws = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 3 }, { width: 42 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }];
    ws.mergeCells("B1:G2"); const t1 = ws.getCell("B1"); t1.value = "Quality Performance Dashboard · " + monthLabelEn(ym); head(t1); t1.font = { bold: true, size: 16, color: { argb: WHITE } };
    let row = 4;
    const weekHdr = () => { const r = ws.getRow(row++); ["Week", "Week 1", "Week 2", "Week 3", "Week 4", "MTD"].forEach((v, i) => { const c = r.getCell(i + 2); c.value = v; head(c); }); };
    const section = (title) => { ws.mergeCells("B" + row + ":G" + row); const c = ws.getCell("B" + row); c.value = title; head(c); c.font = { bold: true, size: 12, color: { argb: WHITE } }; row++; weekHdr(); };
    const line = (label, vals, fmt, fill) => { const r = ws.getRow(row++); const c0 = r.getCell(2); c0.value = label; head(c0); c0.alignment = { horizontal: "left", vertical: "middle" };
      vals.forEach((v, i) => { const c = r.getCell(i + 3); c.value = v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? "-" : v; body(c, fill || (i === 4 ? MID : LIGHT), typeof v === "number" ? fmt : undefined); if (i === 4) c.font = { bold: true }; }); };
    const sum = (a) => a.reduce((x, y) => x + y, 0), ratio = (a, b) => (b ? a / b : null);
    // Quality adherence
    section("Quality Adherence (Program level · Quality team)");
    const qT = D.weeks.map(() => D.qWeek), qN = D.weeks.map((w) => w.prog.length);
    line("QA Monitoring Target", [...qT, sum(qT)]);
    line("No. of Monitored Calls QA", [...qN, sum(qN)]);
    line("% QA Monitoring Achievement", [...qN.map((n, i) => ratio(n, qT[i])), ratio(sum(qN), sum(qT))], PCT);
    row++;
    section("Operation Adherence (Agent level · team leaders)");
    const lT = D.weeks.map(() => D.perAgent * (D.agents.length || 0)), lN = D.weeks.map((w) => D.capped(w.live)), lAll = D.weeks.map((w) => w.live.length);
    line("TL Monitoring Target", [...lT, sum(lT)]);
    line("No. of Monitored Calls TL (counted up to " + D.perAgent + " per agent)", [...lN, sum(lN)]);
    line("% TL Monitoring Achievement", [...lN.map((n, i) => ratio(n, lT[i])), ratio(sum(lN), sum(lT))], PCT);
    line("All Agent level evaluations (no cap)", [...lAll, sum(lAll)]);
    row++;
    const figs = (title, key) => {
      section(title);
      const F = D.weeks.map((w) => qualityFigures(w[key])), M = qualityFigures(key === "prog" ? D.prog : D.live);
      const all5 = (fn) => [...F.map(fn), fn(M)];
      line("# Evaluations", all5((x) => x.n));
      line("# End user Critical Errors", all5((x) => x.eu));
      line("# Business Critical Errors", all5((x) => x.bc));
      line("# Compliance Critical Errors", all5((x) => x.cc));
      line("# Non-Critical errors", all5((x) => x.nc));
      line("% End user Critical Accuracy", all5((x) => x.euA), PCT);
      line("% Business Critical Accuracy", all5((x) => x.bcA), PCT);
      line("% Compliance Critical Accuracy", all5((x) => x.ccA), PCT);
      line("% Non-Critical Accuracy", all5((x) => x.ncA), PCT);
      line("Average final score", all5((x) => x.avg), PCT);
      line("AHT of evaluated calls (mm:ss)", all5((x) => ahtText(x.aht)));
      row++;
    };
    figs("Program Level Quality Figures", "prog");
    figs("Agent Level Quality Figures", "live");
    // Coaching
    ws.mergeCells("B" + row + ":G" + row); { const c = ws.getCell("B" + row); c.value = "Coaching Fulfillment"; head(c); c.font = { bold: true, size: 12, color: { argb: WHITE } }; } row++;
    const kv = (k, v, fmt) => { const r = ws.getRow(row); const c0 = r.getCell(2); c0.value = k; head(c0); c0.alignment = { horizontal: "left", vertical: "middle" }; ws.mergeCells("C" + row + ":G" + row); const c = r.getCell(3); c.value = v === null || v === undefined ? "-" : v; body(c, LIGHT, typeof v === "number" ? fmt : undefined); row++; };
    kv("Failed Transaction", D.failed.length);
    kv("Fulfilled Coaching Sessions", D.done.length);
    kv("Missed / Pending coaching session", D.failed.length - D.done.length);
    kv("On Time Sessions (within " + (Number(teamCfg.coachingSlaHours) || 48) + "h)", D.onTime.length);
    kv("Fulfillment %", ratio(D.done.length, D.failed.length), PCT);
    kv("On time %", ratio(D.onTime.length, D.failed.length), PCT);
    kv("Content Management Fulfillment %", "NA");
    kv("Content Management On time %", "NA");
    row++;
    const note = ws.getCell("B" + row); note.value = "Weeks by call date: 1-7, 8-14, 15-21, 22-end. Accuracy = evaluations without that error type. Non-critical accuracy = met items / items checked. Calibration, role plays, Gauge and tests are left out. Made " + new Date().toLocaleString("en-GB") + " by " + (settings.who || settings.evaluator || "") + ".";
    note.font = { italic: true, size: 9, color: { argb: "FF555555" } }; ws.mergeCells("B" + row + ":G" + (row + 1)); note.alignment = { wrapText: true, vertical: "top" };

    // Project figures
    const pf = wb.addWorksheet("Project figures", { views: [{ showGridLines: false }] });
    pf.columns = [{ width: 34 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
    const pfRow = (vals, isHead, fmt) => { const r = pf.addRow(vals.map((v) => (v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? "-" : v))); r.eachCell((c, i) => { if (isHead || i === 1) head(c); else body(c, i === 6 ? MID : LIGHT, typeof c.value === "number" ? fmt : undefined); }); };
    pfRow(["Week", "Week 1", "Week 2", "Week 3", "Week 4", "MTD"], true);
    const PF = D.weeks.map((w) => qualityFigures(w.prog.concat(w.live))), PM = qualityFigures(D.prog.concat(D.live)), p5 = (fn) => [...PF.map(fn), fn(PM)];
    pfRow(["No. Of Calls", ...p5((x) => x.n)]);
    pfRow(["No. Of End User criticals", ...p5((x) => x.eu)]); pfRow(["EUC%", ...p5((x) => x.euA)], false, PCT);
    pfRow(["No. Of Business criticals", ...p5((x) => x.bc)]); pfRow(["BC%", ...p5((x) => x.bcA)], false, PCT);
    pfRow(["No. Of Compliance criticals", ...p5((x) => x.cc)]); pfRow(["CC%", ...p5((x) => x.ccA)], false, PCT);
    pfRow(["No. Of Non-criticals", ...p5((x) => x.nc)]); pfRow(["NC%", ...p5((x) => x.ncA)], false, PCT);
    pfRow(["AHT of evaluated calls", ...p5((x) => ahtText(x.aht))]);

    // Adherence per agent
    const ad = wb.addWorksheet("Adherence per agent", { views: [{ showGridLines: false, state: "frozen", ySplit: 1, xSplit: 1 }] });
    const adHead = ["Agent Name", "PBX ext", "Status"]; [1, 2, 3, 4].forEach((w) => adHead.push("Week" + w + " Target", "Week" + w + " Achievement", "Achievement %"));
    ad.addRow(adHead).eachCell(head); ad.getRow(1).height = 32;
    ad.columns = adHead.map((_, i) => ({ width: i === 0 ? 30 : 12 }));
    const tot = [0, 0, 0, 0, 0, 0, 0, 0];
    D.agents.forEach((a) => {
      const vals = [a, D.ext(a), D.status(a)];
      D.weeks.forEach((w, i) => { const n = Math.min(D.perAgent, w.live.filter((r) => nameKey(r.agent) === nameKey(a)).length); vals.push(D.perAgent, n, ratio(n, D.perAgent)); tot[i * 2] += D.perAgent; tot[i * 2 + 1] += n; });
      const r = ad.addRow(vals); r.eachCell((c, i) => { if (i === 1) { body(c, WHITE); c.alignment = { horizontal: "left" }; } else body(c, i % 3 === 0 && i > 3 ? MID : LIGHT, (i - 3) % 3 === 0 && i > 3 ? PCT : undefined); });
    });
    { const vals = ["Total", "", ""]; [0, 1, 2, 3].forEach((i) => vals.push(tot[i * 2], tot[i * 2 + 1], ratio(tot[i * 2 + 1], tot[i * 2]))); const r = ad.addRow(vals); r.eachCell((c, i) => { head(c); if (i > 3 && (i - 3) % 3 === 0) c.numFmt = PCT; }); }

    // Score per agent
    const sp = wb.addWorksheet("Score per agent", { views: [{ showGridLines: false, state: "frozen", ySplit: 1, xSplit: 1 }] });
    const spHead = ["Agent Name", "Agent level evals", "W1 avg", "W2 avg", "W3 avg", "W4 avg", "Agent level MTD avg", "Program level evals", "Program level MTD avg", "Critical errors (Agent level)", "AHT of evaluated calls"];
    sp.addRow(spHead).eachCell(head); sp.getRow(1).height = 32; sp.columns = spHead.map((_, i) => ({ width: i === 0 ? 30 : 14 }));
    D.agents.forEach((a) => {
      const mine = (l) => l.filter((r) => nameKey(r.agent) === nameKey(a));
      const L = mine(D.live), P = mine(D.prog), fin = (l) => avg(l.map((r) => r.final).filter((x) => x !== null && x !== undefined));
      const r = sp.addRow([a, L.length, ...D.weeks.map((w) => fin(mine(w.live))), fin(L), P.length, fin(P), L.reduce((x, y) => x + (y.critical || 0), 0), ahtText(ahtOf(L.concat(P)))].map((v) => (v === null || v === undefined ? "-" : v)));
      r.eachCell((c, i) => { if (i === 1) { body(c, WHITE); c.alignment = { horizontal: "left" }; } else body(c, LIGHT, [3, 4, 5, 6, 7, 9].includes(i) && typeof c.value === "number" ? PCT : undefined); });
    });

    // Raw data
    const rd = wb.addWorksheet("Raw Data", { views: [{ state: "frozen", ySplit: 1 }] });
    const srcList = D.all.slice().sort((x, y) => callDay(x).localeCompare(callDay(y)));
    const rows = recordRows(srcList), hd = rows[0].concat(["Level", "Week"]);
    rd.addRow(hd).eachCell(head); rd.getRow(1).height = 30;
    rows.slice(1).forEach((r, i) => { const rec = srcList[i];
      rd.addRow(r.map((c) => (c && typeof c === "object" ? c.v : c)).concat([purposeOf(rec) === "program" ? "Program level" : purposeOf(rec) === "live" ? "Agent level" : purposeLabel(rec), "Week " + mWeekOf(callDay(rec))])); });
    rows[0].forEach((k, i) => { if (/score|accuracy/i.test(k)) rd.getColumn(i + 1).numFmt = PCT; });
    rd.columns.forEach((c, i) => (c.width = Math.min(40, Math.max(12, String(hd[i] || "").length + 2))));
    rd.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hd.length } };

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = h("a", { href: url, download: "Quality_Performance_Dashboard_" + ym + ".xlsx" }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const monthLabelEn = (ym) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
  // ---------- PDF and Excel downloads for the main pages ----------
  const lastLists = {};
  const EXPORT_VIEWS = { coaching: "nav_coaching", mywork: "mw_title", dashboard: "db_title", reports: "rp_title", calibration: "cal_title", certification: "cert_title", records: "rec_title", evaluate: "nav_evaluate" };
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
  const phoneCell = (r) => (r.phone ? { v: normPhone(r.phone), t: "s" } : ""); // text, so Excel does not show 9.71E+11
  function recordRows(list) {
    const head = ["Evaluation ID", "Call date/time", "Agent", "Evaluator", "Form", "Interaction type", "Purpose", "How heard", "How chosen", "Call tag", "Customer number", "Odoo ref", "Ended on (Odoo stage)", "Odoo tag", "Call duration (AHT, mm:ss)", "Call duration (seconds)",
      "NC score", "CC accuracy", "EU accuracy", "BC accuracy", "Critical errors", "Final score", "Result", "Missed items", "Strengths", "Areas to improve", "Coaching", "Coached 1-on-1", "Coached at", "Coached by", "Coaching points", "Coaching agreed", "Follow-up of", "Post-coaching result", "KB version", "Evaluation date", "Edited by", "Random pick history"];
    return [head, ...list.map((r) => [evalIdOf(r), whenText(r), r.agent || "", r.evaluator || "", F.forms[r.form] ? F.forms[r.form].name : r.form, r.type || "", purposeLabel(r),
      short(t("m_" + (r.method || "recording"))), short(t("sel_" + selectionOf(r))), r.callTag ? short(t("tag_" + r.callTag)) : "", phoneCell(r), r.odooRef || "", r.outcome || "", r.odooTag || "", durSec(r) === null ? "" : mmss(durSec(r)), durSec(r) === null ? "" : { v: durSec(r), t: "n" },
      ...[r.ncScore, r.cc, r.eu, r.bc].map((x) => (x === null || x === undefined ? "" : { v: x, t: "n", z: "0.0%" })), r.critical || 0,
      r.final === null || r.final === undefined ? "" : { v: r.final, t: "n", z: "0.0%" }, r.result || "",
      (r.items || []).filter((i) => i.result === "Not met" || i.result === "Error").map((i) => (i.kind === "NC" ? "N" : "") + i.id + " " + i.text).join(" | "),
      (r.feedback || {}).strengths || "", (r.feedback || {}).improve || "", (r.feedback || {}).coaching || "", isCoached(r) ? "Yes" : (needsCoaching(r) ? "Pending" : ""), r.coachedAt || "", r.coachedBy || "", (r.coachPoints || []).join(", "), r.coachNote || "", r.followOfId || "", (followUpOf(r) || {}).result ? evalIdOf(followUpOf(r)) + " " + followUpOf(r).result : "", r.kbVersion || "", r.evalDate || "", r.editedBy || "", pickTrail(r)])];
  }
  // One column per scorecard item (critical and non-critical), one sheet per form, plus an error-rate summary per item.
  const itemKey = (i) => (i.kind === "NC" ? "N" : "") + i.id;
  const itemCat = (i) => (i.kind === "NC" ? "Non-critical" : "Critical " + i.kind);
  function itemSheets(list) {
    const out = [];
    [...new Set(list.map((r) => r.form))].forEach((form) => {
      const recs = list.filter((r) => r.form === form), cols = [];
      [...recs].sort((x, y) => String(x.savedAt || "").localeCompare(String(y.savedAt || ""))).forEach((r) => (r.items || []).forEach((i) => { const c = cols.find((c) => c.k === itemKey(i)); if (c) c.i = i; else cols.push({ k: itemKey(i), i }); })); // newest wording wins
      const head = ["Evaluation ID", "Call date/time", "Agent", "Evaluator", "Customer number", "Purpose", "Final score", "Result", "Critical errors", "Non-critical missed", ...cols.map((c) => c.k + " [" + itemCat(c.i) + "] " + c.i.text)];
      const rows = recs.map((r) => { const by = {}; (r.items || []).forEach((i) => (by[itemKey(i)] = i));
        return [evalIdOf(r), whenText(r), r.agent || "", r.evaluator || "", phoneCell(r), purposeLabel(r), r.final === null || r.final === undefined ? "" : { v: r.final, t: "n", z: "0.0%" }, r.result || "",
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
    if (name === "coaching") add(t("co_sheet"), coachTrackerRows(lastLists.coaching || []));
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

  // Where an agent is in certification. Worked out from the evaluations, unless an owner set a status in the Roster
  // (column G): Exception (on the floor without passing, with who approved it and why), Retraining (off the floor until
  // the next attempt) or Dropped (left the account). Passing certification always wins over Exception and Retraining.
  // Attempt 1 = the first set of certification calls; anything after it is recertification. After a failed
  // recertification the tool asks for a decision: an exception or drop.
  function agentStage(agent, allRecs) {
    const all = allRecs || allRecords(), man = (roster.certStatus || {})[agent] || null, ci = agentCertInfo(agent, all);
    const mk = (key, cls, floor, extra) => Object.assign({ key, cls, floor, label: t("st_" + key), note: man ? man.note : "", manual: !!man }, extra || {});
    if (man && man.s === "dropped") return mk("dropped", "na", false);
    if (ci.certified) return mk("certified", "good", true, { manual: false, note: "" });
    if (man && man.s === "exception") return mk("exception", "warn", true);
    const mine = all.filter((r) => !r.test && !r.sampleRef && r.agent === agent && selectionOf(r) === "random");
    const calls = mine.filter((r) => !r.rolePlay && purposeOf(r) === "certcall"), rps = mine.filter((r) => r.rolePlay);
    if (man && man.s === "retrain") return mk("retrain", "warn", false);
    if (!calls.length && !rps.length) return mk("none", "na", true, { label: "–" });
    let best = null;
    [...new Set([...calls, ...rps].map((r) => r.form))].forEach((f) => {
      const fc = calls.filter((r) => r.form === f), c = Object.assign(evalAgentCert(agent, fc, rps.filter((r) => r.form === f)), { total: fc.length });
      if (!best || c.total > best.total) best = c;
    });
    const attempt = Math.max(1, Math.ceil(best.total / CERT.minCalls)), n = { n: attempt };
    if (best.decision === "Pending") return mk(attempt > 1 ? "recert" : "incert", "info", false, { attempt });
    if (attempt > 1) return mk("decide", "bad", false, { attempt, label: t("st_decide", n) });
    return mk("failed", "bad", false, { attempt });
  }

  async function setCertStatus(name, status, note) {
    if (!connected()) { alert(t("email_needs_sheet")); return false; }
    try {
      const j = await apiPostJson({ action: "setCertStatus", name, status, note, by: settings.evaluator || "" });
      roster.certStatus = Object.assign({}, roster.certStatus);
      if (j.status) roster.certStatus[name] = { s: j.status, note: j.note || note }; else delete roster.certStatus[name];
      store(LS_ROSTER, roster); renderSettings(); renderMyWork(); renderCertification(); renderHeader();
      return true;
    } catch (e) { alert(t("name_failed", { e: e.message })); return false; }
  }
  // Small form under the agent's name: pick a status, write who approved it and why.
  function certStatusForm(name, li) {
    const old = li.querySelector(".cs-form"); if (old) { old.remove(); return; }
    const st = agentStage(name), cur = ((roster.certStatus || {})[name] || {}).s || "";
    const sel = h("select", { "aria-label": t("st_btn") }, ["", "exception", "retrain", "dropped"].map((k) => h("option", { value: k, text: t("st_opt_" + (k || "auto")) })));
    sel.value = cur;
    const why = h("input", { placeholder: t("st_why_ph"), "aria-label": t("st_why_ph") });
    const tip = h("div", { class: "hint" });
    const sync = () => { tip.textContent = t("st_tip_" + (sel.value || "auto")); why.hidden = !sel.value; };
    sel.onchange = sync; sync();
    const save = h("button", { type: "button", text: t("save") || "Save", onclick: async () => {
      if (sel.value && !why.value.trim()) { why.focus(); tip.textContent = t("st_need_why"); return; }
      if (sel.value === "dropped" && !confirm(t("st_drop_confirm", { n: name }))) return;
      save.disabled = true; if (!(await setCertStatus(name, sel.value, why.value.trim()))) save.disabled = false;
    } });
    li.append(h("div", { class: "cs-form" }, h("div", { class: "hint", text: t("st_now", { s: st.label }) + (st.note ? " · " + st.note : "") }), sel, why, save, tip));
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
      useOdoo ? th(t("c_odoo"), 1) : null, rpIdx.map((i) => th(t("c_rp", { n: i + 1 }), 1)), mode === "annual" ? th(t("c_last_cert")) : null, mode === "annual" ? th(t("c_annual_status")) : null, th(t("c_decision")), th(t("st_col")), th(t("c_notes"))));
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
        ((st) => h("td", {}, h("span", { class: "pill " + st.cls, title: st.note || "", text: st.label })))(agentStage(c.agent)),
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
    { const ao = mm.querySelector('option[value="auto"]'); if (ao) ao.disabled = teamManual(); if (teamManual() && mm.value === "auto") mm.value = "outlook"; }
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
    $("#setLeaderWeekly").value = teamCfg.leaderWeekly || 4; $("#setQualityWeekly").value = teamCfg.qualityWeekly || 40;
    if ($("#setCoachSla")) $("#setCoachSla").value = teamCfg.coachingSlaHours || 48;
    if ($("#setPassedSla")) $("#setPassedSla").value = teamCfg.passedSlaHours || 48;
    $("#setPickMode").value = teamCfg.pickMode === "manual" ? "manual" : "auto";
    const pmSync = () => { const auto = $("#setPickMode").value !== "manual", w = pickWindow(today()); $("#setPickFrom").disabled = $("#setPickTo").disabled = auto; if (auto) { $("#setPickFrom").value = w[0]; $("#setPickTo").value = w[1]; } else { $("#setPickFrom").value = teamCfg.pickFrom || "08:00"; $("#setPickTo").value = teamCfg.pickTo || "18:00"; } };
    $("#setPickMode").onchange = pmSync; pmSync(); $("#setPickDays").value = teamCfg.pickDays || 3;
    $("#setCcResults").value = teamCfg.ccResults || ""; $("#setClosedDays").value = teamCfg.closedDays === undefined ? "Fri" : teamCfg.closedDays;
    $("#setSenderName").value = teamCfg.senderName || "Quality Team"; $("#setCcMode").value = teamCfg.ccMode === "digest" ? "digest" : "each"; $("#setMailSend").value = teamManual() ? "manual" : "auto";
    $("#setCallsSource").value = teamCfg.callsSource ? "https://docs.google.com/spreadsheets/d/" + teamCfg.callsSource + "/edit" : "";
    $("#btnCallsCheck").onclick = async () => {
      const box = $("#callsInfo"); box.textContent = "…";
      try {
        const j = await apiPostJson({ action: "callsInfo" });
        const un = j.agents.filter((x) => !x.name && x.good).map((x) => x.pbx + (x.ext ? " <" + x.ext + ">" : "") + " (" + x.good + ")");
        box.innerHTML = "";
        box.append(h("div", { text: t("own_calls_info", { rows: j.rows, from: j.from || "–", to: j.to || "–", good: j.good }) }),
          h("div", { dir: "auto", text: j.agents.filter((x) => x.name).map((x) => x.name + " ← " + x.pbx + (x.ext ? " <" + x.ext + ">" : "") + " (" + x.good + ")").join("، ") }),
          un.length ? h("div", { class: "warn", text: t("own_calls_unmatched", { list: un.join("، ") }) }) : null,
          (j.rosterMissing || []).length ? h("div", { class: "warn", text: t("own_calls_missing", { list: j.rosterMissing.join("، ") }) }) : null);
      } catch (e) { box.textContent = e.message; }
    };
    const fq = $("#btnFixLevels");
    if (fq) fq.onclick = async () => {
      const box = $("#fixLevelsInfo"); box.className = "hint"; box.textContent = "…";
      try {
        const d = await apiPostJson({ action: "fixQualityLevels", dry: true });
        if (!d.n) { box.textContent = tl("✓ مفيش تقييمات كواليتي متسجلة Agent level.", "✓ No Quality evaluations saved as Agent level."); return; }
        if (!confirm(tl("هيتحوّل " + d.n + " تقييم للكواليتي من Agent level لـ Program level. نكمل؟", d.n + " Quality evaluations will change from Agent level to Program level. Go ahead?"))) { box.textContent = ""; return; }
        const j = await apiPostJson({ action: "fixQualityLevels" });
        box.className = "msg ok";
        box.textContent = tl("✓ اتحوّل " + j.n + " تقييم لـ Program level: ", "✓ " + j.n + " evaluations moved to Program level: ") + j.list.map((x) => x.id + " (" + x.agent + ")").join("، ");
        await refreshRecordsQuietly(); refreshViews();
      } catch (e) { box.className = "msg err"; box.textContent = e.message; }
    };
    $("#btnSaveTarget").onclick = async () => {
      const m = $("#ownMsg"), n = Math.round(Number($("#setTarget").value));
      if (!(n >= 0 && n <= 100)) { m.className = "msg err"; m.textContent = t("own_bad"); return; }
      const pf = $("#setPickFrom").value || "10:00", pt = $("#setPickTo").value || "21:30", pd = Math.round(Number($("#setPickDays").value) || 3);
      if (pt <= pf || pd < 1 || pd > 31) { m.className = "msg err"; m.textContent = t("own_bad"); return; }
      const cc = $("#setCcResults").value.split(/[,;\s]+/).filter(Boolean);
      if (cc.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) { m.className = "msg err"; m.textContent = t("own_bad_cc"); return; }


      const sn = $("#setSenderName").value.trim() || "Quality Team";
      const sla = Math.max(1, Math.min(720, Math.round(Number(($("#setCoachSla") || {}).value) || 48)));
      try { const j = await apiPostJson({ action: "setConfig", config: { monthlyTarget: n, leaderWeekly: Math.round(Number($("#setLeaderWeekly").value) || 4), qualityWeekly: Math.round(Number($("#setQualityWeekly").value) || 40), coachingSlaHours: sla, passedSlaHours: Math.round(Number(($("#setPassedSla") || {}).value) || 48), pickMode: $("#setPickMode").value === "manual" ? "manual" : "auto", pickFrom: pf, pickTo: pt, pickDays: pd, closedDays: $("#setClosedDays").value.trim(), ccResults: cc.join(", "), ccMode: $("#setCcMode").value === "digest" ? "digest" : "each", mailSend: $("#setMailSend").value === "manual" ? "manual" : "auto", senderName: sn, callsSource: $("#setCallsSource").value.trim() } }); teamCfg = Object.assign(teamCfg, j.config); store("qa_team_cfg", teamCfg); m.className = "msg ok"; m.textContent = t("set_saved"); renderMyWork(); renderDashboard(); }
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
          role === "agents" && agentStage(name).key !== "none" ? h("span", { class: "pill " + agentStage(name).cls, style: "margin-inline-start:4px", title: agentStage(name).note || "", text: agentStage(name).label }) : null,
          role === "agents" && agentCertInfo(name).isNew ? h("span", { class: "pill info", style: "margin-inline-start:4px", title: t("newhire_tip", { d: agentCertInfo(name).certDate }), text: t("newhire_days_tag", { n: agentCertInfo(name).newDaysLeft }) }) : null,
          own ? h("small", { class: "meta email", dir: "ltr", text: (emailsFor(role)[name] || t("no_email")) + (role === "agents" ? " · " + t("off_tag") + ": " + ((roster.daysOff || {})[name] || t("off_none")) + (agentCertInfo(name).certDate ? " · ✓ " + t("certdate_tag") + ": " + agentCertInfo(name).certDate : "") : "") }) : null,
          null),
        own && role === "agents" ? h("button", { type: "button", class: "ghost", text: t("newhire_btn"), onclick: () => setCertDate(name) }) : null,
        own && role === "agents" ? h("button", { type: "button", class: "ghost", text: t("st_btn"), onclick: (e) => certStatusForm(name, e.target.closest("li")) }) : null,
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
    ["#dbForm", "#dbAgent", "#dbEvaluator", "#dbType"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    // Typing a date switches the period to custom dates.
    ["#dbFrom", "#dbTo"].forEach((s) => $(s).addEventListener("input", () => { dbState.preset = "custom"; store(LS_DB, dbState); renderDashboard(); }));
    wireReports();
    $("#calSample").addEventListener("input", renderCalibration);
    $("#kbAdd").onclick = addKbUpdate;
    ["#coAgent", "#coType", "#coStatus", "#coPeriod"].forEach((x) => $(x) && $(x).addEventListener("input", renderCoachingView));
    ["#recEvaluator", "#recAgent", "#recPurpose", "#recTag", "#recMethod", "#recSel", "#recSearch", "#recPeriod"].forEach((s) => $(s).addEventListener("input", renderRecords));
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

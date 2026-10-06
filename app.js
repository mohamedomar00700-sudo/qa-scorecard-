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
    if (near && (nameKey(near) === nameKey(name) || confirm('"' + near + '" is already on the list. Use "' + near + '" instead of "' + name + '"?'))) return near;
    list.push(name); list.sort((a, b) => a.localeCompare(b)); store(LS_ROSTER, roster);
    if (connected()) {
      try { await apiPost({ action: "addPerson", role, name }); }
      catch (e) { alert("Added on this device only. It could not be added to the shared list: " + e.message); }
    }
    return name;
  }

  // ---------- evaluate view ----------
  let current = { form: "calls", answers: null };
  const HEADER = [
    ["agent", "Agent name", "person", true],
    ["evaluator", "Evaluator", "person", true],
    ["evalDate", "Evaluation date", "date", true],
    ["interactionDate", "Interaction date / time", "datetime-local"],
    ["odooRef", "Odoo lead ref", "text"],
    ["type", "Interaction type", "select", true],
    ["duration", "Duration", "text"],
    ["outcome", "Outcome", "select"],
    ["kbVersion", "KB / offers version", "text"],
    ["sampleRef", "Calibration sample ref (only for calibration)", "text"],
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
        class: current.form === k ? "active" : "", text: d.name + " form",
        onclick: () => {
          if (current.form === k) return;
          if (dirty() && !confirm("Switch form? The current answers will be cleared.")) return;
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
      const lab = key === "duration" ? d.durationLabel : label;
      if (kind === "select") {
        const opts = key === "type" ? Object.keys(d.types) : d.outcomes;
        input = h("select", {}, h("option", { value: "", text: "– select –" }), opts.map((o) => h("option", { value: o, text: o })));
      } else if (kind === "person") {
        const role = key === "agent" ? "agents" : "evaluators";
        const opts = roster[role].slice();
        if (a.header[key] && !opts.includes(a.header[key])) opts.push(a.header[key]);
        input = h("select", {}, h("option", { value: "", text: "– select –" }), opts.map((o) => h("option", { value: o, text: o })),
          h("option", { value: "__new", text: "+ Add a new name…" }));
      } else input = h("input", { type: kind });
      input.value = a.header[key] || "";
      input.id = "hd_" + key;
      input.addEventListener("input", async () => {
        if (input.value === "__new") {
          const role = key === "agent" ? "agents" : "evaluators";
          const name = await addPerson(role, prompt(key === "agent" ? "New agent's full name:" : "Evaluator's full name:") || "");
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
      class: (ans.result === v ? "on " : "") + cls, text: v, type: "button",
      onclick: () => {
        if (ans.locked) return;
        ans.result = ans.result === v ? "" : v;
        row.replaceWith(itemRow(kind, it, i, ans)); saveDraft(); updateScore();
      },
    })));
    const meta = h("div", { class: "meta" },
      h("span", { class: "tag", text: it.section || it.bucket }),
      it.applies.map((x) => h("span", { class: "tag", text: x })),
      isNc ? h("span", {}, "Weight ", h("b", { text: it.weight }), " · Not met if: " + it.guide) : h("span", { text: "Example: " + it.example }));
    const ev = h("input", { placeholder: isNc ? "Timestamp" : "Timestamp", value: ans.evidence || "" });
    ev.addEventListener("input", () => { ans.evidence = ev.value; autoFeedback(); saveDraft(); });
    const cm = h("input", { placeholder: "Comment", value: ans.comment || "" });
    cm.addEventListener("input", () => { ans.comment = cm.value; autoFeedback(); saveDraft(); });
    const showExtra = ans.result === "Not met" || ans.result === "Error" || ans.evidence || ans.comment;
    const row = h("div", { class: "item" + (ans.locked ? " locked" : ""), "data-kind": kind, "data-i": i },
      h("div", { class: "num", text: isNc ? i + 1 : "C" + (i + 1) }),
      h("div", {}, h("div", { class: "title", text: it.item }), meta, ans.locked ? h("div", { class: "meta", text: "Not applicable to this interaction type." }) : null),
      seg,
      showExtra ? h("div", { class: "extra" }, ev, cm) : null);
    return row;
  }

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
    const strengths = met.slice(0, 4).map((o) => "- " + o.it.label).join("\n");
    const improve = misses.length
      ? misses.map((o) => "- " + (o.crit ? "[Critical " + o.it.bucket + "] " + o.it.item : o.it.label + ": " + o.it.item) + note(o.x)).join("\n")
      : "No improvement areas on this interaction.";
    const coaching = misses.length
      ? misses.map((o, n) => n + 1 + ". " + o.it.coach).join("\n")
      : "Keep the same approach. Consider sharing this interaction with the team as a good example.";
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
      if (Object.values(current.answers.feedbackEdited || {}).some(Boolean) && !confirm("Replace your edits with fresh feedback?")) return;
      autoFeedback(true); saveDraft();
    };
    $("#btnCopyFb").onclick = async () => {
      const a = current.answers, sc = score(current.form, a), fb = a.feedback;
      const text = [
        "QA feedback – " + F.forms[current.form].name + (a.header.type ? " (" + a.header.type + ")" : ""),
        "Agent: " + (a.header.agent || "") + " | Date: " + (a.header.interactionDate || a.header.evalDate || "") + (a.header.odooRef ? " | Odoo: " + a.header.odooRef : ""),
        "Score: " + pct(sc.final) + " – " + (sc.result || "") + (sc.critical ? " (" + sc.critical + " critical error" + (sc.critical > 1 ? "s" : "") + ")" : ""),
        "", "Strengths:", fb.strengths || "-", "", "Areas to improve:", fb.improve || "-", "", "Coaching:", fb.coaching || "-",
      ].join("\n");
      const m = $("#fbMsg");
      try { await navigator.clipboard.writeText(text); m.textContent = " Copied."; }
      catch (e) { download("QA_feedback_" + (a.header.agent || "agent") + ".txt", text, "text/plain"); m.textContent = " Downloaded as a text file."; }
    };
  }

  function updateScore() {
    const s = score(current.form, current.answers);
    $("#sFinal").textContent = pct(s.final);
    const r = $("#sResult"); r.textContent = s.result; r.className = "result " + (s.result === "Pass" ? "pass" : s.result === "Fail" ? "fail" : "");
    $("#sNC").textContent = pct(s.nc);
    $("#sCC").textContent = pct(s.cc); $("#sEU").textContent = pct(s.eu); $("#sBC").textContent = pct(s.bc);
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
    for (const [key, label, , req] of HEADER) if (req && !a.header[key]) problems.push(label);
    $$(".item").forEach((el) => {
      const ans = a[el.dataset.kind][+el.dataset.i];
      el.classList.toggle("missing", !ans.result);
      if (!ans.result) problems.push("item " + $(".num", el).textContent);
      else if ((ans.result === "Not met" || ans.result === "Error") && !ans.evidence) problems.push("evidence for item " + $(".num", el).textContent);
    });
    return problems;
  }

  function recordCsv(rec) {
    const rows = [["Field", "Value"]];
    for (const [k, label] of HEADER) rows.push([label, rec[k] || ""]);
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
    if (problems.length) { msg.className = "msg err"; msg.textContent = "Missing: " + problems.slice(0, 8).join(", ") + (problems.length > 8 ? " …" : ""); return; }
    const rec = buildRecord();
    const local = store(LS_EVALS) || []; local.push(rec); store(LS_EVALS, local);
    if (settings.url) {
      msg.textContent = "Saving…";
      try {
        const how = await postRecord(rec);
        msg.className = "msg ok"; msg.textContent = how === "saved" ? "Saved to the Google Sheet." : "Sent to the Google Sheet (check the sheet to confirm).";
      } catch (e) {
        msg.className = "msg err"; msg.textContent = "Could not save to the sheet: " + e.message + "\nA copy was downloaded instead.";
        download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      }
    } else {
      download(fileName(rec, "json"), JSON.stringify(rec, null, 1), "application/json");
      msg.className = "msg ok"; msg.textContent = "Saved in this browser and downloaded as a file (no Google Sheet link in Settings).";
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
        info.textContent = n + " evaluations imported."; ev.target.value = ""; refreshViews();
      };
    });
  }

  let sheetLoaded = false;
  async function loadFromSheet() {
    const say = (t) => $$(".loadInfo").forEach((i) => (i.textContent = t));
    if (!connected()) { say("Not connected to the Google Sheet yet (open the setup link or Settings)."); return; }
    say("Loading from the Google Sheet…");
    try {
      const j = await apiGet({});
      addRecords(j.records); sheetLoaded = true;
      say(j.records.length + " evaluations loaded · " + new Date().toLocaleTimeString());
      refreshViews();
    } catch (e) { say("Could not load: " + e.message); }
  }

  function refreshViews() { renderCalibration(); renderDashboard(); }

  // ---------- calibration ----------
  function renderCalibration() {
    const recs = allRecords().filter((r) => r.sampleRef);
    const sel = $("#calSample"), prev = sel.value;
    const samples = [...new Set(recs.map((r) => r.sampleRef))].sort();
    sel.innerHTML = "";
    if (!samples.length) sel.append(h("option", { value: "", text: "No calibration samples yet" }));
    samples.forEach((s) => sel.append(h("option", { value: s, text: s })));
    if (samples.includes(prev)) sel.value = prev;
    const out = $("#calOut"); out.innerHTML = "";
    const group = recs.filter((r) => r.sampleRef === sel.value).sort((a, b) => (a.evaluator || "").localeCompare(b.evaluator || ""));
    if (!group.length) { out.append(h("div", { class: "empty", text: "Load or import evaluations that have a calibration sample ref." })); return; }
    const forms = new Set(group.map((r) => r.form));
    if (forms.size > 1) out.append(h("p", { class: "msg err", text: "This sample ref was scored on different forms; only the first form is compared." }));
    const g = group.filter((r) => r.form === group[0].form);

    const ncs = g.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    const median = ncs.length ? (ncs.length % 2 ? ncs[(ncs.length - 1) / 2] : (ncs[ncs.length / 2 - 1] + ncs[ncs.length / 2]) / 2) : null;
    const agreedIn = $("#calAgreed").value;
    const agreed = agreedIn === "" ? median : Number(agreedIn) / 100;

    const sum = h("table", {}, h("tr", {}, h("th", { text: "Evaluator" }), h("th", { class: "num", text: "NC score" }), h("th", { class: "num", text: "Gap vs agreed" }), h("th", { text: "Within ±5?" }), h("th", { class: "num", text: "Critical errors" }), h("th", { class: "num", text: "Final" })));
    g.forEach((r) => {
      const gap = r.ncScore === null || agreed === null ? null : Math.abs(r.ncScore - agreed);
      sum.append(h("tr", {}, h("td", { text: r.evaluator || "–" }), h("td", { class: "num", text: pct(r.ncScore) }), h("td", { class: "num", text: gap === null ? "–" : (Math.round(gap * 1000) / 10) + " pts" }),
        h("td", {}, gap === null ? "–" : h("span", { class: "pill " + (gap <= 0.05 ? "good" : "bad"), text: gap <= 0.05 ? "Yes" : "No" })),
        h("td", { class: "num", text: r.critical }), h("td", { class: "num", text: pct(r.final) })));
    });
    out.append(h("h2", { text: "Sample " + sel.value + " · " + F.forms[g[0].form].name + " · agreed NC " + pct(agreed) + (agreedIn === "" ? " (median)" : "") }), sum);

    const itemsTbl = h("table", {}, h("tr", {}, h("th", { text: "#" }), h("th", { text: "Item" }), g.map((r) => h("th", { text: r.evaluator || "–" }))));
    let diffs = 0;
    g[0].items.forEach((it, idx) => {
      const vals = g.map((r) => (r.items[idx] || {}).result || "");
      const differ = new Set(vals).size > 1; if (differ) diffs++;
      itemsTbl.append(h("tr", { class: differ ? "diff" : "" }, h("td", { text: it.id }), h("td", { text: it.text }),
        g.map((r) => { const x = r.items[idx] || {}; const v = x.result || "";
          return h("td", {}, h("span", { class: "pill " + (v === "Met" || v === "No error" ? "good" : v === "N/A" || !v ? "na" : "bad"), text: v || "–" }), x.comment ? h("div", { class: "meta", text: x.comment }) : null); })));
    });
    out.append(h("h2", { text: "Items where evaluators differ: " + diffs }), h("p", { class: "hint", text: "Highlighted rows need a ruling. Record the agreed ruling in the Calibration Log." }), itemsTbl,
      h("p", {}, h("button", { text: "Download comparison (CSV)", onclick: () => {
        const rows = [["#", "Item", ...g.map((r) => r.evaluator || "")]];
        g[0].items.forEach((it, idx) => rows.push([it.id, it.text, ...g.map((r) => (r.items[idx] || {}).result || "")]));
        rows.push([], ["", "NC score", ...g.map((r) => pct(r.ncScore))], ["", "Final", ...g.map((r) => pct(r.final))]);
        download("Calibration_" + sel.value + ".csv", toCsv(rows), "text/csv");
      } })));
  }

  // ---------- dashboard ----------
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  function fillSelect(sel, values, allLabel) {
    const prev = sel.value;
    sel.innerHTML = "";
    sel.append(h("option", { value: "", text: allLabel }), values.map((v) => h("option", { value: v, text: v })));
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
          opts.target ? h("div", { class: "bar-target", style: "left:" + (opts.target / max * 100) + "%" }) : null),
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
    fillSelect($("#dbAgent"), [...new Set(all.map((r) => r.agent).filter(Boolean))].sort(), "All agents");
    fillSelect($("#dbEvaluator"), [...new Set(all.map((r) => r.evaluator).filter(Boolean))].sort(), "All evaluators");
    fillSelect($("#dbType"), [...new Set(all.map((r) => r.type).filter(Boolean))].sort(), "All types");
    const f = { form: $("#dbForm").value, agent: $("#dbAgent").value, ev: $("#dbEvaluator").value, type: $("#dbType").value, from: $("#dbFrom").value, to: $("#dbTo").value, cal: $("#dbCal").value === "yes" };
    const recs = all.filter((r) => (!f.form || r.form === f.form) && (!f.agent || r.agent === f.agent) && (!f.ev || r.evaluator === f.ev) &&
      (!f.type || r.type === f.type) && (!f.from || (r.evalDate || "") >= f.from) && (!f.to || (r.evalDate || "") <= f.to) && (f.cal || !r.sampleRef));

    const ids = ["#dbKpis", "#dbTrend", "#dbAgentsChart", "#dbAgents", "#dbItems", "#dbCrit", "#dbSections", "#dbEvaluators"];
    if (!recs.length) {
      ids.forEach((i) => ($(i).innerHTML = ""));
      $("#dbKpis").append(h("div", { class: "empty", text: all.length ? "No evaluations match these filters." : "No evaluations yet. They appear here once evaluations are saved to the Google Sheet (or imported as files)." }));
      ids.slice(1).forEach((i) => ($(i).style.display = "none"));
      return;
    }
    ids.forEach((i) => ($(i).style.display = ""));

    // KPI tiles
    const finals = recs.map((r) => r.final).filter((x) => x !== null && x !== undefined);
    const passRate = recs.filter((r) => r.result === "Pass").length / recs.length;
    const withCrit = recs.filter((r) => r.critical > 0).length;
    const tiles = [
      ["Evaluations", recs.length, new Set(recs.map((r) => r.agent)).size + " agents"],
      ["Average final score", pct(avg(finals)), "target 85%"],
      ["Pass rate", pct(passRate), recs.filter((r) => r.result === "Pass").length + " of " + recs.length + " passed"],
      ["Average NC score", pct(avg(recs.map((r) => r.ncScore).filter((x) => x !== null && x !== undefined))), "before critical errors"],
      ["With a critical error", withCrit, pct(withCrit / recs.length) + " of evaluations"],
      ["CC accuracy", pct(avg(recs.map((r) => r.cc))), "compliance"],
      ["EU accuracy", pct(avg(recs.map((r) => r.eu))), "customer"],
      ["BC accuracy", pct(avg(recs.map((r) => r.bc))), "business"],
    ];
    section("#dbKpis", "Overview", null, h("div", { class: "tiles" }, tiles.map(([k, v, sub]) => h("div", { class: "tile" }, h("div", { class: "tile-k", text: k }), h("div", { class: "tile-v", text: v }), h("div", { class: "tile-s", text: sub })))));

    // Weekly trend
    const weeks = new Map();
    recs.forEach((r) => { const w = weekStart(r.evalDate); if (!w) return; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); });
    const wk = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    section("#dbTrend", "Average final score by week", "Week starting Monday. Hover a bar for the number of evaluations.",
      bars(wk.map(([w, l]) => { const v = avg(l.map((r) => r.final || 0)); return { label: "Week of " + w, value: v, display: pct(v), flag: v < PASS, title: l.length + " evaluations · pass rate " + pct(l.filter((r) => r.result === "Pass").length / l.length) }; }), { max: 1, target: PASS }));

    // Agents
    const by = new Map();
    recs.forEach((r) => { const k = r.agent || "–"; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const agents = [...by.entries()].map(([agent, list]) => {
      const fin = avg(list.map((r) => r.final).filter((x) => x !== null));
      const crit = list.reduce((s, r) => s + (r.critical || 0), 0);
      return { agent, list, fin, nc: avg(list.map((r) => r.ncScore).filter((x) => x !== null)), cc: avg(list.map((r) => r.cc)), eu: avg(list.map((r) => r.eu)), bc: avg(list.map((r) => r.bc)), crit, ok: fin !== null && fin >= PASS && crit === 0 };
    }).sort((a, b) => (b.fin || 0) - (a.fin || 0));
    section("#dbAgentsChart", "Average final score by agent", "The line marks the 85% target. Highlighted bars are below it.",
      bars(agents.map((a) => ({ label: a.agent, value: a.fin || 0, display: pct(a.fin), flag: (a.fin || 0) < PASS, title: a.list.length + " evaluations · " + a.crit + " critical errors" })), { max: 1, target: PASS }));
    const rows = [["Agent", "Evaluations", "Avg final", "Avg NC", "CC accuracy", "EU accuracy", "BC accuracy", "Critical errors", "Status"]];
    const tbl = h("table", {}, h("tr", {}, rows[0].map((t, i) => h("th", { class: i && i < 8 ? "num" : "", text: t }))));
    agents.forEach((a) => {
      const status = a.ok ? "Meets 85% & no critical" : "Below standard";
      tbl.append(h("tr", {}, h("td", {}, h("a", { href: "#", text: a.agent, onclick: (e) => { e.preventDefault(); $("#dbAgent").value = a.agent; renderDashboard(); } })),
        h("td", { class: "num", text: a.list.length }), h("td", { class: "num", text: pct(a.fin) }), h("td", { class: "num", text: pct(a.nc) }),
        h("td", { class: "num", text: pct(a.cc) }), h("td", { class: "num", text: pct(a.eu) }), h("td", { class: "num", text: pct(a.bc) }), h("td", { class: "num", text: a.crit }),
        h("td", {}, h("span", { class: "pill " + (a.ok ? "good" : "bad"), text: status }))));
      rows.push([a.agent, a.list.length, pct(a.fin), pct(a.nc), pct(a.cc), pct(a.eu), pct(a.bc), a.crit, status]);
    });
    section("#dbAgents", "Agents table", "Click a name to see that agent only.", tbl,
      h("p", {}, h("button", { text: "Download (CSV)", onclick: () => download("QA_Dashboard_" + today() + ".csv", toCsv(rows), "text/csv") })));

    // Item-level analysis: miss rate = misses / evaluations where the item applied.
    const stat = new Map();
    recs.forEach((r) => r.items.forEach((it) => {
      if (!it.result || it.result === "N/A") return;
      const key = r.form + "|" + it.id;
      if (!stat.has(key)) {
        const def = it.kind === "NC" ? F.forms[r.form].nc[+it.id - 1] : F.forms[r.form].crit[+it.id.slice(1) - 1];
        stat.set(key, { form: r.form, id: it.id, kind: it.kind, text: (def && def.label) || it.text, full: it.text, section: def && def.section, coach: def && def.coach, n: 0, miss: 0 });
      }
      const s = stat.get(key); s.n++;
      if (it.result === "Not met" || it.result === "Error") s.miss++;
    }));
    const multiForm = new Set(recs.map((r) => r.form)).size > 1;
    const nm = (s) => (multiForm ? F.forms[s.form].name + " · " : "") + s.id + " " + s.text;
    const ncMiss = [...stat.values()].filter((s) => s.kind === "NC" && s.miss).sort((a, b) => b.miss / b.n - a.miss / a.n || b.miss - a.miss).slice(0, 10);
    section("#dbItems", "Most missed items (coaching focus)", "Share of evaluations where the item applied and was not met. Hover for the coaching tip.",
      ncMiss.length ? bars(ncMiss.map((s) => ({ label: nm(s), value: s.miss / s.n, display: pct(s.miss / s.n) + " (" + s.miss + "/" + s.n + ")", title: s.full + "\nTip: " + (s.coach || "") })), { max: 1 }) : h("div", { class: "empty", text: "No missed non-critical items in this selection." }));

    const crMiss = [...stat.values()].filter((s) => s.kind !== "NC" && s.miss).sort((a, b) => b.miss - a.miss).slice(0, 10);
    section("#dbCrit", "Critical errors", "Number of evaluations with each critical error. Hover for the coaching tip.",
      crMiss.length ? bars(crMiss.map((s) => ({ label: (multiForm ? F.forms[s.form].name + " · " : "") + "[" + s.kind + "] " + s.full, value: s.miss, display: String(s.miss), flag: true, title: "Tip: " + (s.coach || "") }))) : h("div", { class: "empty", text: "No critical errors in this selection." }));

    const secs = new Map();
    [...stat.values()].filter((s) => s.kind === "NC").forEach((s) => { const k = s.section || "Other"; const v = secs.get(k) || { n: 0, miss: 0 }; v.n += s.n; v.miss += s.miss; secs.set(k, v); });
    const secRows = [...secs.entries()].map(([k, v]) => ({ k, rate: v.n ? v.miss / v.n : 0, v })).sort((a, b) => b.rate - a.rate);
    section("#dbSections", "Misses by skill area", "Share of applicable items not met in each area.",
      bars(secRows.map((x) => ({ label: x.k, value: x.rate, display: pct(x.rate), title: x.v.miss + " misses out of " + x.v.n + " applicable items" })), { max: Math.max(0.05, ...secRows.map((x) => x.rate)) }));

    // Evaluators: spot scoring that is much stricter or softer than the team.
    const evs = new Map();
    recs.forEach((r) => { const k = r.evaluator || "–"; if (!evs.has(k)) evs.set(k, []); evs.get(k).push(r); });
    const teamAvg = avg(finals);
    const et = h("table", {}, h("tr", {}, ["Evaluator", "Evaluations", "Avg final given", "Gap vs team", "Critical errors marked"].map((t, i) => h("th", { class: i ? "num" : "", text: t }))));
    [...evs.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([ev, list]) => {
      const a = avg(list.map((r) => r.final).filter((x) => x !== null));
      const gap = a === null || teamAvg === null ? null : a - teamAvg;
      et.append(h("tr", {}, h("td", { text: ev }), h("td", { class: "num", text: list.length }), h("td", { class: "num", text: pct(a) }),
        h("td", { class: "num", text: gap === null ? "–" : (gap >= 0 ? "+" : "") + (Math.round(gap * 1000) / 10) + " pts" }),
        h("td", { class: "num", text: list.reduce((s, r) => s + (r.critical || 0), 0) })));
    });
    section("#dbEvaluators", "Evaluators", "A large gap vs the team average can mean an evaluator scores more strictly or softly; bring it to calibration.", et);
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
    status.textContent = connected() ? "Connected to the team's Google Sheet." : "Not connected: evaluations are downloaded as files.";
    status.className = "msg " + (connected() ? "ok" : "err");
    $("#btnSaveSettings").onclick = async () => {
      settings.url = $("#setUrl").value.trim(); settings.key = $("#setKey").value;
      store(LS_SETTINGS, settings);
      await loadRoster(); renderSettings(); renderHeader();
      const m = $("#setMsg"); m.className = "msg ok"; m.textContent = "Settings saved in this browser.";
    };
    $("#btnTest").onclick = async () => {
      const m = $("#setMsg"); m.className = "msg"; m.textContent = "Testing…";
      try {
        const j = await apiGet({});
        m.className = "msg ok"; m.textContent = "Connected. The sheet has " + j.records.length + " evaluations.";
      } catch (e) { m.className = "msg err"; m.textContent = "Could not connect: " + e.message; }
    };
    $("#btnSetupLink").onclick = async () => {
      const m = $("#setMsg");
      if (!connected()) { m.className = "msg err"; m.textContent = "Save the link and access key first."; return; }
      const link = setupLink();
      try { await navigator.clipboard.writeText(link); m.className = "msg ok"; m.textContent = "Setup link copied. Send it privately to each evaluator; opening it once connects their browser."; }
      catch (e) { m.className = "msg"; m.textContent = link; }
    };
    const rl = $("#rosterList"); rl.innerHTML = "";
    for (const [role, label] of [["agents", "Agents"], ["evaluators", "Evaluators"]]) {
      rl.append(h("div", {}, h("b", { text: label + " (" + roster[role].length + "): " }), roster[role].join(", ") || "none yet"));
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
    for (const [k, d] of Object.entries(F.forms)) $("#dbForm").append(h("option", { value: k, text: d.name }));
    ["#dbForm", "#dbAgent", "#dbEvaluator", "#dbType", "#dbFrom", "#dbTo", "#dbCal"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    $("#calSample").addEventListener("input", renderCalibration);
    $("#calAgreed").addEventListener("input", renderCalibration);
    $("#btnSave").onclick = onSave;
    $("#btnCsv").onclick = () => { const r = buildRecord(); download(fileName(r, "csv"), recordCsv(r), "text/csv"); };
    $("#btnReset").onclick = () => { if (!dirty() || confirm("Clear all answers?")) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } };
    const draft = store(LS_DRAFT);
    if (draft && F.forms[draft.form] && draft.answers && draft.answers.nc && draft.answers.nc.length === F.forms[draft.form].nc.length && draft.answers.crit.length === F.forms[draft.form].crit.length) current = draft;
    const fromLink = readSetupLink();
    setupLoaders(); renderSettings(); renderEvaluate();
    if (fromLink) {
      const m = $("#saveMsg"); m.className = "msg ok";
      m.textContent = connected() ? "This browser is now connected to the team's Google Sheet. Pick your name as evaluator." : "The setup link was incomplete.";
    }
    loadRoster().then(() => { renderHeader(); renderSettings(); });
  }
  boot();
})();

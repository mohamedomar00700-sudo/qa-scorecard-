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
  const settings = Object.assign({ url: "", key: "", evaluator: "" }, store(LS_SETTINGS) || {});

  // ---------- evaluate view ----------
  let current = { form: "calls", answers: null };
  const HEADER = [
    ["agent", "Agent name", "text", true],
    ["evaluator", "Evaluator", "text", true],
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
      } else input = h("input", { type: kind });
      input.value = a.header[key] || "";
      input.id = "hd_" + key;
      input.addEventListener("input", () => {
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

  async function postRecord(rec) {
    const body = JSON.stringify({ key: settings.key, record: rec });
    try {
      const r = await fetch(settings.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Rejected");
      return "saved";
    } catch (e) {
      if (String(e.message).match(/key|Rejected/i)) throw e;
      // Some browsers block reading the reply; send again without reading it.
      await fetch(settings.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
      return "sent";
    }
  }

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
      $(".loadSheet", box).onclick = async () => {
        if (!settings.url) { info.textContent = "Add the Google Sheet link in Settings first."; return; }
        info.textContent = "Loading…";
        try {
          const u = new URL(settings.url); u.searchParams.set("key", settings.key);
          const j = await (await fetch(u)).json();
          if (!j.ok) throw new Error(j.error || "Rejected");
          addRecords(j.records); info.textContent = j.records.length + " evaluations loaded."; refreshViews();
        } catch (e) { info.textContent = "Could not load: " + e.message; }
      };
      $(".loadFiles", box).onchange = async (ev) => {
        let n = 0;
        for (const f of ev.target.files) {
          try { const j = JSON.parse(await f.text()); const arr = Array.isArray(j) ? j : [j]; addRecords(arr); n += arr.length; } catch (e) { /* skip bad file */ }
        }
        info.textContent = n + " evaluations imported."; ev.target.value = ""; refreshViews();
      };
    });
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
  function renderDashboard() {
    const form = $("#dbForm").value, from = $("#dbFrom").value, to = $("#dbTo").value, withCal = $("#dbCal").value === "yes";
    const recs = allRecords().filter((r) => (!form || r.form === form) && (!from || (r.evalDate || "") >= from) && (!to || (r.evalDate || "") <= to) && (withCal || !r.sampleRef));
    const box = $("#dbAgents"); box.innerHTML = "";
    if (!recs.length) { box.append(h("div", { class: "empty", text: "No evaluations yet. Load them from the Google Sheet or import files." })); $("#dbItems").innerHTML = ""; return; }
    const by = new Map();
    recs.forEach((r) => { const k = r.agent || "–"; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const tbl = h("table", {}, h("tr", {}, ["Agent", "Evaluations", "Avg final", "Avg NC", "CC acc.", "EU acc.", "BC acc.", "Critical errors", "Status"].map((t, i) => h("th", { class: i && i < 8 ? "num" : "", text: t }))));
    const rows = [["Agent", "Evaluations", "Avg final", "Avg NC", "CC accuracy", "EU accuracy", "BC accuracy", "Critical errors", "Status"]];
    [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([agent, list]) => {
      const fin = avg(list.map((r) => r.final).filter((x) => x !== null));
      const nc = avg(list.map((r) => r.ncScore).filter((x) => x !== null));
      const cc = avg(list.map((r) => r.cc)), eu = avg(list.map((r) => r.eu)), bc = avg(list.map((r) => r.bc));
      const crit = list.reduce((s, r) => s + (r.critical || 0), 0);
      const ok = fin !== null && fin >= PASS && crit === 0;
      const status = ok ? "Meets 85% & no critical" : "Below standard";
      tbl.append(h("tr", {}, h("td", { text: agent }), h("td", { class: "num", text: list.length }), h("td", { class: "num", text: pct(fin) }), h("td", { class: "num", text: pct(nc) }),
        h("td", { class: "num", text: pct(cc) }), h("td", { class: "num", text: pct(eu) }), h("td", { class: "num", text: pct(bc) }), h("td", { class: "num", text: crit }),
        h("td", {}, h("span", { class: "pill " + (ok ? "good" : "bad"), text: status }))));
      rows.push([agent, list.length, pct(fin), pct(nc), pct(cc), pct(eu), pct(bc), crit, status]);
    });
    box.append(h("h2", { text: "Agents (" + recs.length + " evaluations)" }), tbl,
      h("p", {}, h("button", { text: "Download (CSV)", onclick: () => download("QA_Dashboard_" + today() + ".csv", toCsv(rows), "text/csv") })));

    const counts = new Map();
    recs.forEach((r) => r.items.forEach((it) => {
      if (it.result !== "Not met" && it.result !== "Error") return;
      const k = F.forms[r.form].name + " · " + it.id + " · " + it.text;
      counts.set(k, (counts.get(k) || 0) + 1);
    }));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ib = $("#dbItems"); ib.innerHTML = "";
    ib.append(h("h2", { text: "Most missed items (coaching focus)" }));
    if (!top.length) ib.append(h("div", { class: "empty", text: "No missed items in this selection." }));
    else ib.append(h("table", {}, h("tr", {}, h("th", { text: "Item" }), h("th", { class: "num", text: "Times missed" })), top.map(([k, n]) => h("tr", {}, h("td", { text: k }), h("td", { class: "num", text: n })))));
  }

  // ---------- settings view ----------
  function renderSettings() {
    $("#setUrl").value = settings.url; $("#setKey").value = settings.key; $("#setEvaluator").value = settings.evaluator;
    $("#btnSaveSettings").onclick = () => {
      settings.url = $("#setUrl").value.trim(); settings.key = $("#setKey").value; settings.evaluator = $("#setEvaluator").value.trim();
      store(LS_SETTINGS, settings);
      const m = $("#setMsg"); m.className = "msg ok"; m.textContent = "Settings saved in this browser.";
    };
    $("#btnTest").onclick = async () => {
      const m = $("#setMsg"); m.className = "msg"; m.textContent = "Testing…";
      try {
        const u = new URL($("#setUrl").value.trim()); u.searchParams.set("key", $("#setKey").value);
        const j = await (await fetch(u)).json();
        if (!j.ok) throw new Error(j.error || "Rejected");
        m.className = "msg ok"; m.textContent = "Connected. The sheet has " + j.records.length + " evaluations.";
      } catch (e) { m.className = "msg err"; m.textContent = "Could not connect: " + e.message; }
    };
  }

  // ---------- boot ----------
  function boot() {
    $("#ver").textContent = F.version;
    $$("nav button").forEach((b) => b.onclick = () => {
      $$("nav button").forEach((x) => x.classList.toggle("active", x === b));
      $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
      if (b.dataset.view !== "evaluate") refreshViews();
    });
    for (const [k, d] of Object.entries(F.forms)) $("#dbForm").append(h("option", { value: k, text: d.name }));
    ["#dbForm", "#dbFrom", "#dbTo", "#dbCal"].forEach((s) => $(s).addEventListener("input", renderDashboard));
    $("#calSample").addEventListener("input", renderCalibration);
    $("#calAgreed").addEventListener("input", renderCalibration);
    $("#btnSave").onclick = onSave;
    $("#btnCsv").onclick = () => { const r = buildRecord(); download(fileName(r, "csv"), recordCsv(r), "text/csv"); };
    $("#btnReset").onclick = () => { if (!dirty() || confirm("Clear all answers?")) { current = { form: current.form, answers: blankAnswers(current.form) }; store(LS_DRAFT, null); renderEvaluate(); } };
    const draft = store(LS_DRAFT);
    if (draft && F.forms[draft.form] && draft.answers && draft.answers.nc && draft.answers.nc.length === F.forms[draft.form].nc.length && draft.answers.crit.length === F.forms[draft.form].crit.length) current = draft;
    setupLoaders(); renderSettings(); renderEvaluate();
  }
  boot();
})();

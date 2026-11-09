/**
 * QA Scorecard – Google Sheet storage.
 * Paste this into Extensions > Apps Script of the evaluations Google Sheet,
 * change ACCESS_KEY, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). Put the web app link and the key
 * in the tool's Settings page.
 * After changing this code later: Deploy > Manage deployments > Edit (pencil)
 * > Version: New version > Deploy. The link stays the same.
 */
const ACCESS_KEY = 'CHANGE-ME';
// Email each agent their result right after a real or feedback-only evaluation is saved (not tests,
// calibration or role-plays). Only agents with an email in the Roster tab (column D) get one.
// The email carries the evaluator's name; replies go to the evaluator's email (Roster column D), who also gets a copy.
// Set to false to stop all emails.
const EMAIL_AGENTS = true;
const SHEET_NAME = 'Evaluations';
const ROSTER_NAME = 'Roster';
const COLUMNS = ['Saved at', 'ID', 'Form', 'Agent', 'Evaluator', 'Evaluation date', 'Interaction date',
  'Odoo ref', 'Interaction type', 'Outcome', 'Duration', 'KB version', 'Calibration sample',
  'NC score', 'CC accuracy', 'EU accuracy', 'BC accuracy', 'Critical errors', 'Final score', 'Result',
  'Missed items', 'Strengths', 'Areas to improve', 'Coaching', 'Record (JSON)', 'Purpose', 'Test', 'Customer phone', 'Edited at', 'Edited by', 'Emailed to agent'];
const DELETED_NAME = 'Deleted';
const KB_NAME = 'KB Log';
const KB_COLUMNS = ['No', 'Logged at', 'Effective from', 'Type', 'What changed', 'Logged by'];
const JSON_COL = 25; // 'Record (JSON)'; newer columns are added after it so older sheets keep working

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sh;
}

function roster_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ROSTER_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROSTER_NAME);
    sh.appendRow(['Name', 'Role (Agent / Evaluator)', 'Active (Yes / No)', 'Email']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  if (!sh.getRange(1, 4).getValue()) sh.getRange(1, 4).setValue('Email').setFontWeight('bold');
  if (!sh.getRange(1, 5).getValue()) sh.getRange(1, 5).setValue('Days off (e.g. Fri, Sat)').setFontWeight('bold');
  if (!sh.getRange(1, 6).getValue() || sh.getRange(1, 6).getValue() === 'New hire (Yes / No)') sh.getRange(1, 6).setValue('Certified date (YYYY-MM-DD)').setFontWeight('bold');
  if (!sh.getRange(1, 10).getValue()) sh.getRange(1, 10).setValue('Old names (comma-separated, matched to this name)').setFontWeight('bold');
  if (!sh.getRange(1, 7).getValue()) sh.getRange(1, 7).setValue('Cert status (Exception / Retraining / Dropped, blank = from evaluations)').setFontWeight('bold');
  if (!sh.getRange(1, 8).getValue()) sh.getRange(1, 8).setValue('Cert status note (date · approved by · reason)').setFontWeight('bold');
  if (!sh.getRange(1, 9).getValue()) sh.getRange(1, 9).setValue('PBX ext (raw call data, e.g. 5006)').setFontWeight('bold');
  return sh;
}

// Role column: 'Evaluator (Owner)' or 'Owner' (full control, also scores), 'Evaluator (Quality)', 'Evaluator (Operations)', 'Evaluator (Chief)' (Hussein: also sees evaluators' quiz results) or 'Agent'. Owners count as evaluators everywhere.
// Quality evaluators score Program level (never Agent level); the other evaluators (Operations) score Agent level (never Program level).
function isEvalRole_(v) { return /^(eval|owner)/i.test(String(v || '').trim()); }
function isQualityRole_(v) { return /quality|\bqa\b|كواليتي|جودة/i.test(String(v || '')); }
// Program level is for Quality, Agent level for operations: fix the level from who scored it.
function levelFix_(r, ro) {
  if (!r || r.test || r.sampleRef || r.rolePlay) return r;
  const p = r.purpose || 'live', ev = nameKey_(r.evaluator);
  const isQ = (ro.quality || []).some(function (n) { return nameKey_(n) === ev; });
  const isOwner = (ro.owners || []).some(function (n) { return nameKey_(n) === ev; });
  if (isQ && p === 'live') r.purpose = 'program';
  else if (!isQ && !isOwner && p === 'program') r.purpose = 'live';
  return r;
}
function roleMatches_(v, role) { return role === 'evaluators' ? isEvalRole_(v) : /^a/i.test(String(v || '').trim()); }

function nameKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

// Put a record under the current names when it carries an old (renamed) agent or evaluator name.
function aliasFix_(r, ro) {
  const a = (ro && ro.aliases) || {};
  let hit = false;
  ['agent', 'evaluator'].forEach(function (f) { const to = r && r[f] && a[nameKey_(r[f])]; if (to && to !== r[f]) { r[f] = to; hit = true; } });
  return hit;
}

function readRoster_() {
  const sh = roster_();
  const out = { agents: [], evaluators: [], owners: [], quality: [], emails: {}, evalEmails: {}, daysOff: {}, certDates: {}, certStatus: {}, exts: {}, inactive: [], aliases: {} };
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().forEach(function (r) {
    const name = String(r[0] || '').trim();
    // Old names (after a rename) point to the current name, so records saved under them group with it.
    if (name) String(r[9] || '').split(/[,;\n]+/).forEach(function (x) { x = x.trim(); if (x && nameKey_(x) !== nameKey_(name)) out.aliases[nameKey_(x)] = name; });
    if (name && String(r[2]).toLowerCase() === 'no') out.inactive.push(name);
    if (!name || String(r[2]).toLowerCase() === 'no') return;
    if (/owner/i.test(String(r[1]).trim())) out.owners.push(name);
    if (isEvalRole_(r[1]) && isQualityRole_(r[1])) out.quality.push(name);
    if (isEvalRole_(r[1])) { out.evaluators.push(name); if (String(r[3] || '').trim()) out.evalEmails[name] = String(r[3]).trim(); }
    else {
      out.agents.push(name);
      if (String(r[3] || '').trim()) out.emails[name] = String(r[3]).trim();
      if (String(r[4] || '').trim()) out.daysOff[name] = String(r[4]).trim();
      const cd = r[5] instanceof Date ? Utilities.formatDate(r[5], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[5] || '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(cd)) out.certDates[name] = cd;
      const cs = certStatusKey_(r[6]);
      if (cs) out.certStatus[name] = { s: cs, note: String(r[7] || '').trim() };
      String(r[8] || '').split(/[^0-9]+/).filter(String).forEach(function (x) { out.exts[x] = name; });
    }
  });
  out.agents.sort(); out.evaluators.sort();
  return out;
}

function addPerson_(role, name) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) return { ok: false, error: 'Bad name' };
  const label = role === 'evaluators' ? 'Evaluator' : 'Agent';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = roster_();
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
    const exists = rows.some(function (r) {
      return nameKey_(r[0]) === nameKey_(name) && roleMatches_(r[1], role === 'evaluators' ? 'evaluators' : 'agents');
    });
    if (!exists) sh.appendRow([name, label, 'Yes']);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Rename a person in the list and in every saved evaluation, so reports stay grouped under one name.
function renamePerson_(role, from, to) {
  to = String(to || '').trim().replace(/\s+/g, ' ');
  if (!from || !to || to.length > 80) return { ok: false, error: 'Bad name' };
  const field = role === 'evaluators' ? 'evaluator' : 'agent';
  const col = role === 'evaluators' ? 5 : 4;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ro = roster_();
    let kept = false;
    if (ro.getLastRow() > 1) {
      const rng = ro.getRange(2, 1, ro.getLastRow() - 1, 3), rows = rng.getValues();
      rows.forEach(function (r) {
        if (!roleMatches_(r[1], role)) return;
        if (nameKey_(r[0]) === nameKey_(from) || nameKey_(r[0]) === nameKey_(to)) {
          if (!kept) { r[0] = to; r[2] = 'Yes'; kept = true; r.at = true; } else { r[2] = 'No'; }
        }
      });
      rng.setValues(rows.map(function (r) { return r.slice(0, 3); }));
      // Remember the old name next to the new one: devices that still hold it, and saves made with it, are mapped to the new name.
      rows.forEach(function (r, i) {
        if (!r.at || nameKey_(from) === nameKey_(to)) return;
        const c = ro.getRange(i + 2, 10), old = String(c.getValue() || '').split(/\s*,\s*/).filter(String);
        if (!old.some(function (x) { return nameKey_(x) === nameKey_(from); })) c.setValue(old.concat([from]).join(', '));
      });
    }
    if (!kept) ro.appendRow([to, role === 'evaluators' ? 'Evaluator' : 'Agent', 'Yes']);
    const sh = sheet_();
    const n = sh.getLastRow() - 1;
    if (n > 0) {
      const names = sh.getRange(2, col, n, 1).getValues();
      const json = sh.getRange(2, JSON_COL, n, 1).getValues();
      names.forEach(function (v, i) {
        if (String(v[0]) !== from) return;
        v[0] = to;
        try { const r = JSON.parse(json[i][0]); r[field] = to; json[i][0] = JSON.stringify(r); } catch (err) {}
      });
      sh.getRange(2, col, n, 1).setValues(names);
      sh.getRange(2, JSON_COL, n, 1).setValues(json);
    }
    // The same name in the other tabs, so totals and lists don't split between the old and new name.
    renameIn_(PICKS_NAME, [4, 5], from, to);
    renameIn_(BK_NAME, [3, 5], from, to);
    renameIn_(QUIZ_NAME, [5], from, to);
    renameIn_(ASK_NAME, [2], from, to);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Replace an exact name in the given columns of one tab (skipped if the tab doesn't exist).
function renameIn_(tab, cols, from, to) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!sh || sh.getLastRow() < 2) return;
  const n = sh.getLastRow() - 1;
  cols.forEach(function (c) {
    if (c > sh.getLastColumn()) return;
    const rng = sh.getRange(2, c, n, 1), v = rng.getValues();
    let hit = false;
    v.forEach(function (x) { if (String(x[0]) === from) { x[0] = to; hit = true; } });
    if (hit) rng.setValues(v);
  });
}

// Take a person off the list (Active = No). Past evaluations keep the name.
function removePerson_(role, name) {
  const ro = roster_();
  if (ro.getLastRow() < 2) return { ok: true };
  const rng = ro.getRange(2, 1, ro.getLastRow() - 1, 3), rows = rng.getValues();
  rows.forEach(function (r) {
    if (roleMatches_(r[1], role) && nameKey_(r[0]) === nameKey_(name)) r[2] = 'No';
  });
  rng.setValues(rows);
  return { ok: true };
}

// Save (or clear) an agent's or evaluator's email in the Roster tab.
function setEmail_(role, name, email) {
  email = String(email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Bad email' };
  const ro = roster_();
  if (ro.getLastRow() > 1) {
    const rows = ro.getRange(2, 1, ro.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (roleMatches_(rows[i][1], role) && nameKey_(rows[i][0]) === nameKey_(name)) {
        ro.getRange(i + 2, 4).setValue(email);
        return { ok: true };
      }
    }
  }
  ro.appendRow([String(name || '').trim(), role === 'evaluators' ? 'Evaluator' : 'Agent', 'Yes', email]);
  return { ok: true };
}

// Weekly days off: 'Fri, Sat' or Arabic day names. Stored as short English names in Roster column E.
const DAY_NAMES_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_AR_ = [['احد', 'حد'], ['اثنين', 'اتنين', 'تنين'], ['ثلاث', 'تلات', 'ثلاثاء'], ['اربع', 'ربع'], ['خميس'], ['جمع'], ['سبت']];
function daysList_(v) {
  const out = [];
  String(v || '').split(/[,،;\s]+/).filter(String).forEach(function (w) {
    const k = w.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^و/, '').replace(/^ال/, '');
    if (!k || k === 'and' || k === '&') return;
    let i = DAY_NAMES_.findIndex(function (d) { return k.indexOf(d.toLowerCase()) === 0; });
    if (i < 0) i = DAY_AR_.findIndex(function (ds) { return ds.some(function (d) { return k.indexOf(d) === 0; }); });
    if (i < 0) throw new Error('Bad day: ' + w);
    if (out.indexOf(DAY_NAMES_[i]) < 0) out.push(DAY_NAMES_[i]);
  });
  return out.join(', ');
}
function setDaysOff_(name, days) {
  let v;
  try { v = daysList_(days); } catch (err) { return { ok: false, error: err.message }; }
  const ro = roster_();
  if (ro.getLastRow() > 1) {
    const rows = ro.getRange(2, 1, ro.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (roleMatches_(rows[i][1], 'agents') && nameKey_(rows[i][0]) === nameKey_(name)) {
        ro.getRange(i + 2, 5).setValue(v);
        return { ok: true, days: v };
      }
    }
  }
  return { ok: false, error: 'Agent not found' };
}

// Certification lifecycle set by an owner. Blank = worked out from the evaluations (in certification, failed, recertification, certified).
const CERT_STATUS_ = { exception: 'Exception', retrain: 'Retraining', dropped: 'Dropped' };
function certStatusKey_(v) {
  const x = String(v || '').trim().toLowerCase();
  if (!x) return '';
  if (/^exc|استثن/.test(x)) return 'exception';
  if (/^re-?train|تدريب/.test(x)) return 'retrain';
  if (/^drop|exit|left|دروب|اتشال|مشي/.test(x)) return 'dropped';
  return '';
}
function setCertStatus_(name, status, note, me) {
  const key = certStatusKey_(status);
  if (status && !key) return { ok: false, error: 'Bad status' };
  note = String(note || '').trim().slice(0, 300);
  if (key && !note) return { ok: false, error: 'A reason is needed' };
  const ro = roster_();
  if (ro.getLastRow() > 1) {
    const rows = ro.getRange(2, 1, ro.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (roleMatches_(rows[i][1], 'agents') && nameKey_(rows[i][0]) === nameKey_(name)) {
        const stamp = key ? Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd') + ' · ' + ((me && me.name) || '') + ' · ' + note : '';
        ro.getRange(i + 2, 7, 1, 2).setValues([[key ? CERT_STATUS_[key] : '', stamp]]);
        return { ok: true, status: key, note: stamp };
      }
    }
  }
  return { ok: false, error: 'Agent not found' };
}

function setCertDate_(name, certDate) {
  const cd = String(certDate || '').trim().slice(0, 10);
  if (cd && !/^\d{4}-\d{2}-\d{2}$/.test(cd)) return { ok: false, error: 'Bad date (use YYYY-MM-DD)' };
  const ro = roster_();
  if (ro.getLastRow() > 1) {
    const rows = ro.getRange(2, 1, ro.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (roleMatches_(rows[i][1], 'agents') && nameKey_(rows[i][0]) === nameKey_(name)) {
        ro.getRange(i + 2, 6).setValue(cd ? "'" + cd : '');
        return { ok: true, certDate: cd };

      }
    }
  }
  return { ok: false, error: 'Agent not found' };
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function evalId_(r) {
  if (!r) return '';
  if (r.evalId) return r.evalId;
  const id = String(r.id || '');
  if (/^QA-\d{6}-[A-Z0-9]{4,}$/i.test(id)) return id.toUpperCase();
  const d = String(r.evalDate || r.savedAt || r.interactionDate || '').replace(/\D/g, '').slice(2, 8) || '000000';
  const suf = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase().padStart(4, '0');
  return 'QA-' + d + '-' + suf;
}
function pct_(x) {
  return x === null || x === undefined || x === '' ? '–' : Math.round(Number(x) * 1000) / 10 + '%';
}

// Score split by category for the result email: Part A met/applicable, then each critical bucket with % view.
function catRows_(r, row) {
  const its = r.items || [];
  const nc = its.filter(function (i) { return i.kind === 'NC' && i.result && i.result !== 'N/A'; });
  let out = row('Non-critical (NC)', pct_(r.ncScore) + ' (' + nc.filter(function (i) { return i.result === 'Met'; }).length + ' of ' + nc.length + ')');
  const buckets = [
    ['CC', 'Compliance accuracy (CC)', r.cc],
    ['EU', 'End-user accuracy (EU)', r.eu],
    ['BC', 'Business critical accuracy (BC)', r.bc]
  ];
  buckets.forEach(function (b) {
    const list = its.filter(function (i) { return i.kind === b[0] && i.result && i.result !== 'N/A'; });
    const errs = list.filter(function (i) { return i.result === 'Error'; }).length;
    if (!list.length) {
      out += row(b[1], 'not applicable');
    } else {
      const scorePct = pct_(b[2] !== undefined && b[2] !== null && b[2] !== '' ? b[2] : (errs ? 0 : 1));
      const status = errs ? '<span style="color:#c62828">' + scorePct + ' (✗ ' + errs + ' ' + (errs === 1 ? 'error' : 'errors') + ')</span>' : '<span style="color:#1a7f37">' + scorePct + ' (✓ no errors)</span>';
      out += row(b[1], status);
    }
  });
  return out;
}

// ---------- result email (HTML, built from tables + inline styles so Gmail and Outlook show it the same) ----------
const MAIL_ = { navy: '#1e3a6e', ink: '#1f2937', soft: '#6b7280', line: '#e5e7eb', bg: '#f1f4f9', card: '#ffffff',
  green: '#15803d', greenBg: '#ecfdf3', red: '#b91c1c', redBg: '#fef2f2', amber: '#b45309', amberBg: '#fffbeb',
  blue: '#1d4ed8', blueBg: '#eff6ff', gray: '#475569', grayBg: '#f1f5f9' };
const MAIL_FONT_ = "'Segoe UI',Tahoma,Arial,sans-serif";

function mailShell_(accent, kicker, title, inner, footer) {
  const c = MAIL_;
  return '<div dir="ltr" style="margin:0;padding:0;background:' + c.bg + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + c.bg + ';font-family:' + MAIL_FONT_ + '"><tr><td align="center" style="padding:22px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:' + c.card + ';border-radius:14px;overflow:hidden;border:1px solid ' + c.line + '">' +
    '<tr><td style="background:' + c.navy + ';padding:18px 24px;color:#ffffff">' +
      '<div style="font-size:12px;letter-spacing:.5px;color:#c7d2fe">' + kicker + '</div>' +
      '<div style="font-size:20px;font-weight:bold;margin-top:2px">' + title + '</div></td></tr>' +
    '<tr><td style="height:5px;background:' + accent + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:22px 24px;color:' + c.ink + ';font-size:14px;line-height:1.7">' + inner + '</td></tr>' +
    '<tr><td style="background:' + c.grayBg + ';padding:14px 24px;color:' + c.soft + ';font-size:12px;line-height:1.6;border-top:1px solid ' + c.line + '">' + footer + '</td></tr>' +
    '</table></td></tr></table></div>';
}

function mailSection_(title, body) {
  return '<div style="margin:22px 0 8px;font-size:15px;font-weight:bold;color:' + MAIL_.navy + '">' + title + '</div>' + body;
}

function mailNote_(bg, border, color, title, body) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="background:' + bg + ';border-left:4px solid ' + border + ';border-radius:8px;padding:12px 14px;color:' + color + '">' +
    (title ? '<div style="font-weight:bold;margin-bottom:4px">' + title + '</div>' : '') + '<div style="color:' + MAIL_.ink + '" dir="auto">' + body + '</div></td></tr></table>';
}

function resultMailHtml_(r, o) {
  const c = MAIL_, its = r.items || [], fb = r.feedback || {};
  const score = Math.max(0, Math.min(1, Number(r.final) || 0)), pctTxt = pct_(r.final);
  // Look of the result: Wow / Program (not counted) / Extra target / passed / failed.
  const look = o.isWow ? { accent: c.amber, bg: c.amberBg, pill: '🌟 WOW CALL', head: 'Outstanding call!', msg: 'This call was selected as a "Wow call" and a standout example for the training library. Proud of your great work 👏' }
    : o.prog ? { accent: c.gray, bg: c.grayBg, pill: 'NOT COUNTED', head: 'Program quality sample', msg: 'This call was heard in Quality\'s sample for the whole account. The result is for your information and learning only and does not count in your score.' }
    : o.coaching ? { accent: c.blue, bg: c.blueBg, pill: 'NOT COUNTED', head: 'Extra target', msg: 'This is an extra evaluation for learning and does not count in your score.' }
    : o.pass ? { accent: c.green, bg: c.greenBg, pill: '✓ PASSED', head: o.isGood ? 'Very good call 👍' : 'Congratulations, you passed 🎉', msg: o.isGood ? 'This call was added as a good example to the training library. Keep it up!' : 'Good performance in line with the quality standards. Keep it up!' }
    : { accent: c.red, bg: c.redBg, pill: '✗ FAILED', head: 'Needs improvement', msg: r.critical ? 'There is a critical error in this call, so the evaluation cannot pass. Please review the points below to avoid it next time.' : 'The score is below the pass mark (85%). Please review the items to work on below.' };
  const kind = o.post ? 'Coaching call (first call after the coaching session)' : o.coaching ? 'Extra target' : o.prog ? 'Program sample' : o.cert ? 'Certification evaluation' : 'Quality evaluation';
  const scoreColor = o.prog || o.coaching ? (o.pass ? c.green : c.red) : look.accent;

  // Hero: big score, pill, short message and a score bar with the 85% pass line.
  const barW = Math.round(score * 100);
  let inner = '<p style="margin:0 0 14px">Hi <b>' + esc_(r.agent) + '</b>,<br>' +
    (o.post ? 'This is the evaluation of your first call after coaching' + (r.followOfId ? ' on evaluation <span dir="ltr">' + esc_(r.followOfId) + '</span>' : '') + ': your '
      : o.coaching ? 'This is an extra-target evaluation of your ' : o.prog ? 'This is a program quality sample evaluation of your ' : o.cert ? 'This is the certification evaluation of your ' : 'This is the quality evaluation of your ') +
    o.form + ' on <span dir="ltr">' + esc_(o.when) + '</span>.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + look.bg + ';border-radius:12px;border:1px solid ' + c.line + '"><tr>' +
      '<td width="130" align="center" valign="middle" style="padding:18px 8px">' +
        '<div style="font-size:38px;font-weight:bold;line-height:1;color:' + scoreColor + '" dir="ltr">' + pctTxt + '</div>' +
        '<div style="display:inline-block;margin-top:8px;padding:3px 12px;border-radius:999px;background:' + look.accent + ';color:#fff;font-size:12px;font-weight:bold" dir="ltr">' + look.pill + '</div></td>' +
      '<td valign="middle" style="padding:18px 6px 18px 16px">' +
        '<div style="font-size:17px;font-weight:bold;color:' + c.ink + '">' + look.head + '</div>' +
        '<div style="font-size:13px;color:' + c.soft + ';margin-top:4px">' + look.msg + '</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;direction:ltr"><tr>' +
          (barW > 0 ? '<td width="' + barW + '%" style="height:8px;background:' + scoreColor + ';border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' : '') +
          (barW < 100 ? '<td style="height:8px;background:#dfe3ea;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>' : '') +
        '</tr></table>' +
        '<div style="font-size:11px;color:' + c.soft + ';margin-top:4px;direction:ltr;text-align:left">0% · pass 85% · 100%</div>' +
      '</td></tr></table>';

  // Category tiles: Part A (NC) and the three critical buckets.
  const nc = its.filter(function (i) { return i.kind === 'NC' && i.result && i.result !== 'N/A'; });
  const tiles = [['Non-critical', 'NC', pct_(r.ncScore), nc.filter(function (i) { return i.result === 'Met'; }).length + ' of ' + nc.length, null]];
  [['CC', 'Compliance'], ['EU', 'End user'], ['BC', 'Business']].forEach(function (b) {
    const list = its.filter(function (i) { return i.kind === b[0] && i.result && i.result !== 'N/A'; });
    const errs = list.filter(function (i) { return i.result === 'Error'; }).length;
    tiles.push([b[1], b[0], list.length ? (errs ? '✗ ' + errs : '✓') : '–', list.length ? (errs ? (errs === 1 ? 'critical error' : 'critical errors') : 'no errors') : 'not applicable', list.length ? !errs : null]);
  });
  inner += mailSection_('Score by category', '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + tiles.map(function (t, k) {
    const col = t[4] === null ? c.ink : t[4] ? c.green : c.red;
    return '<td width="25%" valign="top" style="padding:' + (k ? '0 0 0 6px' : '0') + '"><div style="border:1px solid ' + c.line + ';border-radius:10px;padding:10px 6px;text-align:center">' +
      '<div style="font-size:11px;color:' + c.soft + '">' + t[0] + ' <span dir="ltr">(' + t[1] + ')</span></div>' +
      '<div style="font-size:20px;font-weight:bold;color:' + col + ';margin:2px 0" dir="ltr">' + t[2] + '</div>' +
      '<div style="font-size:11px;color:' + c.soft + '">' + t[3] + '</div></div></td>';
  }).join('') + '</tr></table>');

  // What needs fixing: critical errors first, each with the evaluator's comment.
  const missed = its.filter(function (i) { return i.result === 'Not met' || i.result === 'Error'; })
    .sort(function (a, b) { return (b.result === 'Error') - (a.result === 'Error'); });
  if (missed.length) inner += mailSection_('Items to work on (' + missed.length + ')', missed.map(function (i) {
    const crit = i.result === 'Error';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr><td style="border:1px solid ' + c.line + ';border-left:4px solid ' + (crit ? c.red : c.amber) + ';border-radius:8px;padding:10px 12px">' +
      '<div style="font-size:11px;font-weight:bold;color:' + (crit ? c.red : c.amber) + '">' + (crit ? 'Critical error · ' + esc_(i.kind) : 'Non-critical') + ' · <span dir="ltr">' + esc_(i.id) + '</span></div>' +
      '<div dir="auto" style="color:' + c.ink + '">' + esc_(i.text) + '</div>' +
      (i.comment ? '<div dir="auto" style="color:' + c.soft + ';font-size:13px;margin-top:3px">💬 ' + enHtml_(i.comment) + '</div>' : '') + '</td></tr></table>';
  }).join(''));
  else inner += mailSection_('Items', mailNote_(c.greenBg, c.green, c.green, '', 'All items were done right 👌'));

  // Feedback.
  if (fb.strengths || fb.improve || fb.coaching) {
    let f = '';
    if (fb.strengths) f += mailNote_(c.greenBg, c.green, c.green, '💪 Strengths', enHtml_(fb.strengths));
    if (fb.improve) f += mailNote_(c.amberBg, c.amber, c.amber, '🎯 Areas to improve', enHtml_(fb.improve));
    if (fb.coaching) f += mailNote_(c.blueBg, c.blue, c.blue, '💡 Tip for next time', enHtml_(fb.coaching));
    inner += mailSection_('Feedback', f);
  }

  // Call details.
  const phone = String(r.phone || '').replace(/\D/g, '');
  const det = [
    ['Evaluation ID', '<span dir="ltr">' + esc_(evalId_(r)) + '</span>'],
    r.callId ? ['Call ID', '<span dir="ltr">' + esc_(r.callId) + '</span>'] : null,
    ['Type', kind + ' · ' + o.form],
    ['Date and time', '<span dir="ltr">' + esc_(o.when) + '</span>'],
    r.callTalk ? ['Talk time', '<span dir="ltr">' + Math.floor(r.callTalk / 60) + ':' + ('0' + Math.round(r.callTalk % 60)).slice(-2) + '</span>'] : (r.duration ? ['Duration', '<span dir="ltr">' + esc_(r.duration) + '</span>'] : null),
    r.callPbx || r.callExt ? ['On the phone system', '<span dir="ltr">' + esc_(r.callPbx || r.agent) + (r.callExt ? ' · User ID ' + esc_(r.callExt) : '') + '</span>'] : null,
    phone ? ['Customer number', '<span dir="ltr">' + esc_(String(r.phone).trim()) + '</span>'] : null,
    r.odooRef ? ['Odoo', /^https?:\/\//.test(String(r.odooRef)) ? '<a href="' + esc_(r.odooRef) + '" style="color:' + c.blue + '">Open the lead</a>' : '<span dir="ltr">' + esc_(r.odooRef) + '</span>'] : null,
    o.isWow ? ['Call tag', '🌟 Wow call'] : o.isGood ? ['Call tag', '👍 Very good call'] : null,
    ['Evaluator', esc_(r.evaluator)]
  ].filter(Boolean);
  inner += mailSection_(o.form === 'WhatsApp chat' ? 'Chat details' : 'Call details', '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + c.line + ';border-radius:10px;border-collapse:separate">' +
    det.map(function (d, k) {
      return '<tr><td width="40%" style="padding:8px 12px;color:' + c.soft + ';font-size:13px' + (k ? ';border-top:1px solid ' + c.line : '') + '">' + d[0] + '</td>' +
        '<td style="padding:8px 12px;font-weight:bold;font-size:13px' + (k ? ';border-top:1px solid ' + c.line : '') + '">' + d[1] + '</td></tr>';
    }).join('') + '</table>');

  const footer = 'If you have any question about this evaluation, reply to this email or talk to <b>' + esc_(r.evaluator || 'the Quality team') + '</b>.<br>' +
    '<span dir="ltr">' + esc_(evalId_(r)) + '</span> · ' + esc_(String(config_().senderName || 'Quality Team')) + ' · Tres Jolie';
  return mailShell_(look.accent, esc_(kind), (o.prog || o.coaching ? '📊 ' : '📋 ') + 'Evaluation result · ' + esc_(r.agent), inner, footer);
}

// Send the agent their result. Returns what goes in the 'Emailed to agent' column ('' = not sent).
function emailAgent_(r) {
  const purpose = r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live');
  // Evaluators who send from their own Outlook (mailMode 'outlook' / 'outlookweb') get no automatic email.
  if (!EMAIL_AGENTS || r.test || (purpose !== 'live' && purpose !== 'certcall' && purpose !== 'coaching' && purpose !== 'postcoach' && purpose !== 'program') || (r.mailMode && r.mailMode !== 'auto')) return '';
  const ro = readRoster_();
  const to = ro.emails[r.agent];
  if (!to) return '';
  const evEmail = ro.evalEmails[r.evaluator] || '';
  const coaching = purpose === 'coaching', cert = purpose === 'certcall', post = purpose === 'postcoach', prog = purpose === 'program';
  // Program level (Quality's account sample) is emailed too, so it's on record and the agent knows the call was heard; it says clearly it doesn't count.
  try {
    const form = r.form === 'whatsapp' ? 'WhatsApp chat' : 'call';
    const when = String(r.interactionDate || '').replace('T', ' ');
    const pass = r.result === 'Pass';
    const isWow = r.callTag === 'wow', isGood = r.callTag === 'good';
    const html = resultMailHtml_(r, { form: form, when: when, pass: pass, isWow: isWow, isGood: isGood, coaching: coaching, cert: cert, post: post, prog: prog });
    const senderName = String(config_().senderName || 'Quality Team').trim() || 'Quality Team';
    const subjPrefix = (isWow ? '🌟🏆 WOW CALL! – ' : isGood ? '👍 Good Call – ' : '') + (coaching ? '💡 Extra target – ' : prog ? '📊 Program sample (not counted) – ' : post ? 'Coaching call – ' : cert ? 'Certification evaluation – ' : 'Quality evaluation – ');
    const statusTag = coaching ? '' : (isWow ? ' – 🌟 Passed (' + pct_(r.final) + ')' : pass ? ' – ✅ Passed (' + pct_(r.final) + ')' : ' – ⚠️ Failed (' + pct_(r.final) + ')');
    const mail = { to: to, subject: subjPrefix + form + ' – ' + when.slice(0, 10) + statusTag + ' [' + evalId_(r) + ']',
      htmlBody: html, name: senderName };
    const cc = [evEmail].concat(String(config_().ccResults || '').split(/[,;\s]+/)).filter(function (x, i, a) { return /@/.test(x) && a.indexOf(x) === i && x !== to; });
    if (evEmail) mail.replyTo = evEmail;
    if (cc.length) mail.cc = cc.join(',');
    MailApp.sendEmail(mail);
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' → ' + to;
  } catch (err) {
    return 'Not sent: ' + String(err).slice(0, 200);
  }
}

// Record a coaching session on an evaluation. Any evaluator can (team leaders coach on evaluations done by Quality),
// so only the coaching fields are changed, never the score.
function saveCoaching_(id, c, me) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const at = findRow_(sh, id);
    if (at === -1) return { ok: false, error: 'Not found' };
    const r = JSON.parse(sh.getRange(at, JSON_COL).getValue());
    const when = new Date(c.coachedAt);
    if (isNaN(when.getTime()) || when.getTime() > Date.now() + 10 * 60000) return { ok: false, error: 'Bad coaching time' };
    r.coached = true; r.coachedAt = when.toISOString(); r.coachedBy = me.owner && c.coachedBy ? String(c.coachedBy).slice(0, 80) : (me.name || c.coachedBy || '');
    r.coachPoints = Array.isArray(c.coachPoints) ? c.coachPoints.map(String).slice(0, 60) : [];
    r.coachNote = String(c.coachNote || '').slice(0, 2000); r.coachAck = !!c.coachAck;
    if (c.coachMailedAt) r.coachMailedAt = String(c.coachMailedAt).slice(0, 40);
    r.feedback = r.feedback || {}; r.feedback.coached = true; r.feedback.coachedAt = r.coachedAt;
    r.editedAt = new Date().toISOString(); r.editedBy = r.coachedBy;
    const savedAt = sh.getRange(at, 1).getValue();
    const vals = row_(r, savedAt);
    vals[COLUMNS.length - 1] = sh.getRange(at, COLUMNS.length).getValue();
    sh.getRange(at, 1, 1, COLUMNS.length).setValues([vals]);
    format_(sh, at);
    return { ok: true, record: r };
  } finally {
    lock.releaseLock();
  }
}

// Coaching session summary to the agent (points coached, what was agreed), sent after the coach saves the session.
function sendCoaching_(id) {
  const sh = sheet_();
  const at = findRow_(sh, id);
  if (at === -1) return { ok: false, error: 'Not found' };
  let r;
  try { r = JSON.parse(sh.getRange(at, JSON_COL).getValue()); } catch (err) { return { ok: false, error: 'Bad record' }; }
  if (!r.coachedAt) return { ok: false, error: 'Not coached yet' };
  const ro = readRoster_();
  const to = ro.emails[r.agent];
  if (!to) return { ok: false, error: 'No email for ' + r.agent + ' in the Names list' };
  const coachEmail = ro.evalEmails[r.coachedBy] || ro.evalEmails[r.evaluator] || '';
  const tz = Session.getScriptTimeZone();
  const when = Utilities.formatDate(new Date(r.coachedAt), tz, 'yyyy-MM-dd HH:mm');
  const pts = (r.items || []).filter(function (i) { return (r.coachPoints || []).indexOf((i.kind === 'NC' ? 'N' : '') + i.id) !== -1; });
  let html = '<div dir="ltr" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6">' +
    '<div style="background:#e8f0fe;border:1px solid #b6d4fe;border-left:5px solid #1a73e8;color:#084298;padding:12px 16px;border-radius:8px;margin-bottom:14px"><b>📝 Coaching session summary</b></div>' +
    '<p>Hi ' + esc_(r.agent) + ',</p><p>Here is a summary of our coaching session on <b dir="ltr">' + when + '</b> about evaluation <b dir="ltr">' + esc_(evalId_(r)) + '</b> (' + esc_(String(r.interactionDate || '').replace('T', ' ')) + ').</p>';
  if (pts.length) html += '<p><b>What we worked on:</b></p><ul>' + pts.map(function (i) { return '<li dir="auto">' + esc_(i.text) + (i.comment ? ' – <i>' + enHtml_(i.comment) + '</i>' : '') + '</li>'; }).join('') + '</ul>';
  if (r.coachNote) html += '<p><b>What we agreed:</b><br>' + enHtml_(r.coachNote) + '</p>';
  html += '<p>We will listen to your first call after this session to make sure these points are in place.</p><p>' + esc_(r.coachedBy || r.evaluator || '') + ' – Quality Team</p></div>';
  const mail = { to: to, subject: '📝 Coaching session summary – ' + when.slice(0, 10) + ' [' + evalId_(r) + ']', htmlBody: html,
    name: String(config_().senderName || 'Quality Team').trim() || 'Quality Team' };
  const cc = [coachEmail].concat(String(config_().ccResults || '').split(/[,;\s]+/)).filter(function (x, i, a) { return /@/.test(x) && a.indexOf(x) === i && x !== to; });
  if (coachEmail) mail.replyTo = coachEmail;
  if (cc.length) mail.cc = cc.join(',');
  try { MailApp.sendEmail(mail); } catch (err) { return { ok: false, error: String(err).slice(0, 200) }; }
  return { ok: true };
}

function row_(r, savedAt) {
  const missed = r.items.filter(function (i) { return i.result === 'Not met' || i.result === 'Error'; })
    .map(function (i) { return i.id + ' ' + i.text; }).join(' | ');
  const fb = r.feedback || {};
  // Phone numbers are stored as text so Sheets keeps the leading + and zeros.
  return [savedAt, r.id, r.form, r.agent, r.evaluator, r.evalDate, r.interactionDate, r.odooRef,
    r.type, r.outcome, r.duration, r.kbVersion, r.sampleRef, r.ncScore, r.cc, r.eu, r.bc, r.critical,
    r.final, r.result, missed, fb.strengths, fb.improve, fb.coaching, JSON.stringify(r),
    purposeLabel_(r), r.test ? 'Yes' : 'No',
    r.phone ? "'" + r.phone : '', r.editedAt || '', r.editedBy || '', ''];
}

function format_(sh, row) {
  sh.getRange(row, 14, 1, 4).setNumberFormat('0%');
  sh.getRange(row, 19).setNumberFormat('0%');
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat();
  const i = ids.indexOf(id);
  return i === -1 ? -1 : i + 2;
}

// Correct a saved evaluation in place (same ID), keeping its original save time.
function updateRecord_(r) {
  if (!r || !r.id || !Array.isArray(r.items)) return { ok: false, error: 'Bad record' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const row = findRow_(sh, r.id);
    if (row === -1) { sh.appendRow(row_(r, new Date())); format_(sh, sh.getLastRow()); syncItems_(r, new Date()); return { ok: true, added: true }; }
    const savedAt = sh.getRange(row, 1).getValue();
    const vals = row_(r, savedAt);
    vals[COLUMNS.length - 1] = sh.getRange(row, COLUMNS.length).getValue(); // keep the email note
    sh.getRange(row, 1, 1, COLUMNS.length).setValues([vals]);
    format_(sh, row);
    syncItems_(r, savedAt);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Delete an evaluation: the row moves to the 'Deleted' tab (with who and when), so nothing is lost.
function deleteRecord_(id, by) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const row = findRow_(sh, id);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let del = ss.getSheetByName(DELETED_NAME);
    if (!del) {
      del = ss.insertSheet(DELETED_NAME);
      del.appendRow(['Deleted at', 'Deleted by'].concat(COLUMNS));
      del.setFrozenRows(1);
      del.getRange(1, 1, 1, COLUMNS.length + 2).setFontWeight('bold');
    }
    const values = row === -1 ? [id] : sh.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
    del.appendRow([new Date(), by || ''].concat(row === -1 ? ['', id] : values));
    if (row !== -1) sh.deleteRow(row);
    removeItems_(id);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Item tabs: one tab per form ('Items - calls', 'Items - whatsapp'), one row per evaluation and one column per
// scorecard item (Met / Not met / N/A for non-critical, Error / No error / N/A for critical), so every error
// is listed under its own header. Kept in step with the Evaluations tab on save, edit and delete.
// To fill them for evaluations saved before this existed, run rebuildItemTabs() once from the editor.
const ITEM_FIXED = ['Saved at', 'ID', 'Agent', 'Evaluator', 'Interaction date', 'Purpose', 'Test', 'Final score', 'Result', 'Critical errors', 'Non-critical missed'];
function itemTab_(form) {
  const name = 'Items - ' + (form || 'calls');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, ITEM_FIXED.length).setValues([ITEM_FIXED]).setFontWeight('bold');
    sh.setFrozenRows(1); sh.setFrozenColumns(4);
    const rules = [['Error', '#f8d7da', '#842029'], ['Not met', '#fff3cd', '#7a5a00']].map(function (x) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith(x[0]).setBackground(x[1]).setFontColor(x[2])
        .setRanges([sh.getRange('L2:ZZ')]).build();
    });
    sh.setConditionalFormatRules(rules);
  }
  return sh;
}
function itemHeader_(i) {
  return (i.kind === 'NC' ? 'N' + i.id : i.id) + ' [' + (i.kind === 'NC' ? 'Non-critical' : 'Critical ' + i.kind) + '] ' + i.text;
}
function itemRowValues_(sh, r, savedAt) {
  const lastCol = Math.max(sh.getLastColumn(), ITEM_FIXED.length);
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const keys = head.map(function (h) { return h.split(' [')[0]; });
  const add = [];
  (r.items || []).forEach(function (i) {
    const k = i.kind === 'NC' ? 'N' + i.id : i.id;
    if (keys.indexOf(k) === -1) { keys.push(k); head.push(itemHeader_(i)); add.push(itemHeader_(i)); }
  });
  if (add.length) sh.getRange(1, lastCol + 1, 1, add.length).setValues([add]).setFontWeight('bold').setWrap(true);
  const row = new Array(head.length).fill('');
  const ncMissed = (r.items || []).filter(function (i) { return i.kind === 'NC' && i.result === 'Not met'; }).length;
  [savedAt, r.id, r.agent, r.evaluator, r.interactionDate, purposeLabel_(r),
    r.test ? 'Yes' : 'No', r.final, r.result, r.critical || 0, ncMissed].forEach(function (v, n) { row[n] = v; });
  (r.items || []).forEach(function (i) {
    const at = keys.indexOf(i.kind === 'NC' ? 'N' + i.id : i.id);
    row[at] = i.result + (i.result === 'Not met' || i.result === 'Error' ? (i.comment ? ': ' + i.comment : '') : '');
  });
  return row;
}
function syncItems_(r, savedAt) {
  try {
    const sh = itemTab_(r.form);
    const vals = itemRowValues_(sh, r, savedAt);
    const at = findRow_(sh, r.id);
    if (at === -1) sh.appendRow(vals); else sh.getRange(at, 1, 1, vals.length).setValues([vals]);
    const row = at === -1 ? sh.getLastRow() : at;
    sh.getRange(row, 8).setNumberFormat('0%');
  } catch (e) { /* the item tab is a copy for reading; never block a save */ }
}
function removeItems_(id) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
      if (sh.getName().indexOf('Items - ') !== 0) return;
      const at = findRow_(sh, id); if (at !== -1) sh.deleteRow(at);
    });
  } catch (e) {}
}
// Run once from the Apps Script editor (select it, press Run) to rebuild the item tabs from all saved evaluations.
function rebuildItemTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (sh) { if (sh.getName().indexOf('Items - ') === 0) ss.deleteSheet(sh); });
  const sh = sheet_();
  if (sh.getLastRow() < 2) return;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, JSON_COL).getValues();
  const byForm = {};
  data.forEach(function (d) {
    let r; try { r = JSON.parse(d[JSON_COL - 1]); } catch (e) { return; }
    if (!r || !r.id) return;
    (byForm[r.form || 'calls'] = byForm[r.form || 'calls'] || []).push([r, d[0]]);
  });
  Object.keys(byForm).forEach(function (f) {
    const tab = itemTab_(f);
    const rows = byForm[f].map(function (x) { return itemRowValues_(tab, x[0], x[1]); });
    const w = tab.getLastColumn();
    const out = rows.map(function (r) { while (r.length < w) r.push(''); return r.slice(0, w); });
    tab.getRange(2, 1, out.length, w).setValues(out);
    tab.getRange(2, 8, out.length, 1).setNumberFormat('0%');
  });
}

function deletedIds_() {
  const del = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DELETED_NAME);
  if (!del || del.getLastRow() < 2) return [];
  return del.getRange(2, 4, del.getLastRow() - 1, 1).getValues().flat().filter(String);
}

// KB / offers updates: each one keeps the exact time it takes effect and the time it was logged.
function kbSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(KB_NAME);
  if (!sh) {
    sh = ss.insertSheet(KB_NAME);
    sh.appendRow(KB_COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, KB_COLUMNS.length).setFontWeight('bold');
  }
  return sh;
}

function addKb_(u) {
  if (!u || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(u.effective || '')) || !String(u.text || '').trim()) return { ok: false, error: 'Bad update' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = kbSheet_();
    const no = sh.getLastRow(); // header is row 1, so the first update is No 1
    sh.appendRow([no, new Date(), "'" + String(u.effective).slice(0, 16), String(u.category || 'other'), String(u.text).slice(0, 2000), String(u.by || '')]);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function readKb_() {
  const sh = kbSheet_();
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, KB_COLUMNS.length).getValues().map(function (r) {
    const logged = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, "yyyy-MM-dd'T'HH:mm:ss") : String(r[1]);
    return { no: r[0], recordedAt: logged, effective: String(r[2]), category: String(r[3]), text: String(r[4]), by: String(r[5]) };
  }).filter(function (u) { return u.effective && u.text; });
}

// ---------- sign-in with a code sent by email ----------
// Evaluators sign in with the email saved next to their name in the Roster tab (Role = Evaluator, Active = Yes).
// The code is valid for 10 minutes; a sign-in lasts 30 days on that device. Removing someone from the Roster,
// marking them Active = No or clearing their email signs them out on their next request.
const OTP_MINUTES = 10;
const SESSION_DAYS = 30;

function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)));
}

function evaluatorByEmail_(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Roster');
  if (!sh || sh.getLastRow() < 2) return null;
  const row = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().find(function (r) {
    return String(r[0] || '').trim() && isEvalRole_(r[1]) &&
      String(r[2]).toLowerCase() !== 'no' && String(r[3] || '').trim().toLowerCase() === em;
  });
  return row ? { name: String(row[0]).trim(), email: em, owner: /owner/i.test(String(row[1]).trim()) } : null;
}

function otpRequest_(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: 'bad_email' };
  const who = evaluatorByEmail_(em);
  if (!who) return { ok: false, error: 'not_allowed' };
  const cache = CacheService.getScriptCache();
  const old = JSON.parse(cache.get('otp_' + em) || 'null');
  if (old && Date.now() - old.at < 45 * 1000) return { ok: true, wait: true };
  // Asking again sends the SAME code while it is still valid, so whichever email arrives first works.
  const props = PropertiesService.getScriptProperties();
  const live = JSON.parse(props.getProperty('otpc_' + hash_(em)) || 'null');
  const code = live && live.exp > Date.now() + 60 * 1000 ? live.c : String(Math.floor(100000 + Math.random() * 900000));
  if (!live || live.c !== code) props.setProperty('otpc_' + hash_(em), JSON.stringify({ c: code, exp: Date.now() + OTP_MINUTES * 60 * 1000 }));
  cache.put('otp_' + em, JSON.stringify({ h: hash_(em + ':' + code), at: Date.now(), tries: old && old.h === hash_(em + ':' + code) ? old.tries : 0 }), OTP_MINUTES * 60);
  MailApp.sendEmail({
    to: em, name: 'QA Scorecard', subject: 'QA Scorecard sign-in code: ' + code,
    htmlBody: '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:15px">Hi ' + String(who.name).replace(/[<>&]/g, '') + ',<br><br>' +
      'Your QA Scorecard sign-in code: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
      'It works for ' + OTP_MINUTES + ' minutes. If you did not ask for it, ignore this email.</div>'
  });
  return { ok: true };
}

function otpVerify_(email, code) {
  const em = String(email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const o = JSON.parse(cache.get('otp_' + em) || 'null');
  if (!o) return { ok: false, error: 'code_expired' };
  if (o.tries >= 5) { cache.remove('otp_' + em); return { ok: false, error: 'too_many_tries' }; }
  if (hash_(em + ':' + String(code || '').replace(/\D/g, '')) !== o.h) {
    o.tries++; cache.put('otp_' + em, JSON.stringify(o), OTP_MINUTES * 60);
    return { ok: false, error: 'wrong_code' };
  }
  cache.remove('otp_' + em);
  PropertiesService.getScriptProperties().deleteProperty('otpc_' + hash_(em));
  const who = evaluatorByEmail_(em);
  if (!who) return { ok: false, error: 'not_allowed' };
  const session = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ses_' + hash_(session),
    JSON.stringify({ email: em, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return { ok: true, session: session, email: em, name: who.name, owner: who.owner };
}

// Who is asking: the access key counts as the owner; a sign-in counts while the person is still an active evaluator or owner.
function who_(o) {
  if (o.key && o.key === ACCESS_KEY) return { owner: true, name: '', email: '', key: true };
  if (!o.session) return null;
  const props = PropertiesService.getScriptProperties();
  const k = 'ses_' + hash_(o.session);
  const s = JSON.parse(props.getProperty(k) || 'null');
  const who = s && s.exp >= Date.now() ? evaluatorByEmail_(s.email) : null;
  if (!who) { if (s) props.deleteProperty(k); return null; }
  return who;
}

// Team settings shared by everyone (only the owner can change them).
function config_() {
  return Object.assign({ monthlyTarget: 4, leaderWeekly: 4, qualityWeekly: 40, coachingSlaHours: 48, passedSlaHours: 48, pickFrom: '10:00', pickTo: '21:30', pickDays: 3, closedDays: 'Fri', ccResults: '', senderName: 'Quality Team', callsSource: '', promiseTolMin: 60 }, JSON.parse(PropertiesService.getScriptProperties().getProperty('cfg') || '{}'));
}
function setConfig_(c) {
  const cur = config_();
  const n = Number(c && c.monthlyTarget);
  if (!(n >= 0 && n <= 100)) return { ok: false, error: 'Bad target' };
  cur.monthlyTarget = Math.round(n);
  if (c.coachingSlaHours !== undefined) {
    const sla = Number(c.coachingSlaHours);
    if (sla >= 1 && sla <= 720) cur.coachingSlaHours = Math.round(sla);
  }
  if (c.passedSlaHours !== undefined) {
    const psla = Number(c.passedSlaHours);
    if (psla >= 1 && psla <= 720) cur.passedSlaHours = Math.round(psla);
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (c.pickFrom && hhmm.test(c.pickFrom)) cur.pickFrom = c.pickFrom;
  if (c.pickTo && hhmm.test(c.pickTo)) cur.pickTo = c.pickTo;
  const d = Number(c.pickDays); if (d >= 1 && d <= 31) cur.pickDays = Math.round(d);
  if (c.pickMode === 'auto' || c.pickMode === 'manual') cur.pickMode = c.pickMode;
  if (c.closedDays !== undefined) {
    try { cur.closedDays = daysList_(c.closedDays); } catch (err) { return { ok: false, error: err.message }; }
  }
  if (c.ccResults !== undefined) {
    const cc = String(c.ccResults).split(/[,;\s]+/).filter(String);
    if (cc.length > 10 || cc.some(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); })) return { ok: false, error: 'Bad CC' };
    cur.ccResults = cc.join(', ');
  }
  if (c.senderName !== undefined) {
    const sn = String(c.senderName).trim().slice(0, 60);
    cur.senderName = sn || 'Quality Team';
  }
  // Weekly evaluation targets (by call date; weeks 1-7, 8-14, 15-21, 22-end): team leaders per agent, Quality in total.
  if (c.leaderWeekly !== undefined) { const lw = Number(c.leaderWeekly); if (lw >= 0 && lw <= 50) cur.leaderWeekly = Math.round(lw); }
  if (c.qualityWeekly !== undefined) { const qw = Number(c.qualityWeekly); if (qw >= 0 && qw <= 500) cur.qualityWeekly = Math.round(qw); }
  if (c.promiseTolMin !== undefined) { const tm = Number(c.promiseTolMin); if (tm >= 5 && tm <= 720) cur.promiseTolMin = Math.round(tm); }
  if (c.callsSource !== undefined) {
    const src = String(c.callsSource || '').trim();
    if (!src) cur.callsSource = '';
    else {
      const id = sheetIdOf_(src);
      if (!id) return { ok: false, error: 'calls_bad_link' };
      try { SpreadsheetApp.openById(id).getName(); } catch (err) { return { ok: false, error: 'calls_no_access' }; }
      cur.callsSource = id;
    }
  }
  PropertiesService.getScriptProperties().setProperty('cfg', JSON.stringify(cur));
  return { ok: true, config: cur };
}

// Evaluators may correct or delete only their own evaluations; the owner may change any.
function recordOwnerOk_(me, id) {
  if (me.owner) return true;
  const sh = sheet_();
  const row = findRow_(sh, id);
  if (row === -1) return true;
  try { return nameKey_(JSON.parse(sh.getRange(row, JSON_COL).getValue()).evaluator) === nameKey_(me.name); } catch (err) { return false; }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'quiz') return reply_(saveQuiz_(body)); // knowledge base quiz (needs a KB sign-in)
    if (body.action === 'kbOtpRequest') return reply_(kbOtpRequest_(body.email, body.via));
    if (body.action === 'kbOtpVerify') return reply_(kbOtpVerify_(body.email, body.code));
    if (body.action === 'translate') return reply_(translateTexts_(body)); // English for Arabic typed text in emails
    if (body.action === 'kbAsk') return reply_(kbAsk_(body)); // knowledge base: an agent's question or suggestion for the client
    if (body.action === 'kbAskVote') return reply_(kbAskVote_(body));
    if (body.action === 'kbMiss') return reply_(kbMiss_(body)); // knowledge base: a search / Noor question that found nothing
    if (body.action === 'kbAvatar') return reply_(kbAvatar_(body)); // knowledge base: the agent's chosen character
    if (body.action === 'kbBook') return reply_(kbBook_(body)); // knowledge base: a booking, for the 3 follow-up calls
    if (body.action === 'kbCall') return reply_(kbCall_(body));
    if (body.action === 'kbAssign') return reply_(kbAssign_(body));
    if (body.action === 'otpRequest') return reply_(otpRequest_(body.email));
    if (body.action === 'otpVerify') return reply_(otpVerify_(body.email, body.code));
    const me = who_(body);
    if (!me) return reply_({ ok: false, error: body.session ? 'signed_out' : 'Wrong access key' });
    const ownerOnly = { renamePerson: 1, removePerson: 1, setEmail: 1, setDaysOff: 1, setCertDate: 1, setCertStatus: 1, setConfig: 1 };
    if ((ownerOnly[body.action] || (body.action === 'addPerson' && body.role === 'evaluators')) && !me.owner) return reply_({ ok: false, error: 'not_owner' });
    if (body.action === 'addPerson') return reply_(addPerson_(body.role, body.name));
    if (body.action === 'renamePerson') return reply_(renamePerson_(body.role, body.from, body.to));
    if (body.action === 'removePerson') return reply_(removePerson_(body.role, body.name));
    if (body.action === 'setEmail') return reply_(setEmail_(body.role, body.name, body.email));
    if (body.action === 'setDaysOff') return reply_(setDaysOff_(body.name, body.days));
    if (body.action === 'setCertDate') return reply_(setCertDate_(body.name, body.certDate));
    if (body.action === 'setCertStatus') return reply_(setCertStatus_(body.name, body.status, body.note, { name: me.name || String(body.by || '').slice(0, 80) }));
    if (body.action === 'setConfig') return reply_(setConfig_(body.config));
    if (body.action === 'kbDash') return reply_(kbDashForEval_(body, me)); // knowledge base quiz numbers on the scorecard dashboard
    if (body.action === 'pickCall') return reply_(pickCall_(body, me)); // random call from the raw call data
    if (body.action === 'promiseMark') return reply_(promiseMark_(body, me)); // WhatsApp promise sent / not sent
    if (body.action === 'callsInfo') return reply_(me.owner ? callsInfo_() : { ok: false, error: 'not_owner' });
    if (body.action === 'addKb') return reply_(addKb_(body.update));
    if (body.action === 'updateRecord') {
      if (!body.record || !recordOwnerOk_(me, body.record.id)) return reply_({ ok: false, error: 'not_yours' });
      if (!me.owner) body.record.editedBy = me.name;
      { const ro = readRoster_(); aliasFix_(body.record, ro); levelFix_(body.record, ro); }
      return reply_(updateRecord_(body.record));
    }
    if (body.action === 'sendCoaching') {
      return reply_(sendCoaching_(body.id));
    }
    if (body.action === 'saveCoaching') return reply_(saveCoaching_(body.id, body.coaching || {}, me));
    if (body.action === 'deleteRecord') {
      if (!recordOwnerOk_(me, body.id)) return reply_({ ok: false, error: 'not_yours' });
      return reply_(deleteRecord_(body.id, me.name || body.by));
    }
    const r = body.record;
    if (!r || !r.id || !Array.isArray(r.items)) return reply_({ ok: false, error: 'Bad record' });
    if (!me.owner) r.evaluator = me.name; // a signed-in evaluator always saves under their own name
    const fixedFrom = r.purpose || 'live';
    const ro0 = readRoster_();
    aliasFix_(r, ro0);
    levelFix_(r, ro0);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const sh = sheet_();
    try {
      if (sh.getLastColumn() < COLUMNS.length) sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat() : [];
      if (ids.indexOf(r.id) !== -1) return reply_({ ok: true, duplicate: true });
      if (deletedIds_().indexOf(r.id) !== -1) return reply_({ ok: true, deleted: true });
      const twin = sameEvaluatorTwin_(sh, r);
      if (twin) return reply_({ ok: true, duplicateOf: twin });
      const takenBy = callTakenBy_(sh, r);
      if (takenBy) return reply_({ ok: false, error: 'call_taken', takenBy: takenBy });
      sh.appendRow(row_(r, new Date()));
      if (r.callId && !r.test) markPick_(r.callId, evalId_(r));
      format_(sh, sh.getLastRow());
      syncItems_(r, new Date());
    } finally {
      lock.releaseLock();
    }
    const note = emailAgent_(r);
    if (note) { const at = findRow_(sh, r.id); if (at !== -1) sh.getRange(at, COLUMNS.length).setValue(note); }
    return reply_({ ok: true, emailed: note && note.indexOf('Not sent') !== 0 ? true : false, emailNote: note, purpose: (r.purpose || 'live') !== fixedFrom ? r.purpose : undefined });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'kbAsks') return reply_(kbAsks_(p));
  if (p.action === 'kbMisses') return reply_(kbMisses_(p)); // signed-in evaluators only: what agents searched for and didn't find
  if (p.action === 'kbCalls') return reply_(kbCalls_(p)); // signed-in: my follow-up calls (team leads: everyone's)
  if (p.action === 'kbDash') return reply_(kbDash_(p)); // signed-in evaluators only // public list, no names: questions waiting for / answered by the client
  if (p.action === 'pulse') return reply_(pulse_(p)); // public: knowledge base quiz board + team's most missed items (no names, no customers)
  const me = who_(p);
  if (!me) return reply_({ ok: false, error: p.session ? 'signed_out' : 'Wrong access key' });
  if (p.action === 'config') return reply_({ ok: true, config: config_() });
  if (p.action === 'promises') return reply_(promises_());
  if (p.action === 'kb') return reply_({ ok: true, updates: readKb_() });
  if (p.action === 'roster') {
    const ro = readRoster_();
    return reply_({ ok: true, agents: ro.agents, evaluators: ro.evaluators, owners: ro.owners, quality: ro.quality, emails: ro.emails, evalEmails: ro.evalEmails, daysOff: ro.daysOff, certDates: ro.certDates, certStatus: ro.certStatus, inactive: ro.inactive, aliases: ro.aliases,
      config: config_(), me: { name: me.name, email: me.email, owner: !!me.owner } });
  }
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return reply_({ ok: true, records: [], deleted: deletedIds_(), now: Date.now() });
  const json = sh.getRange(2, JSON_COL, n, 1).getValues().flat();
  // With ?since=<ms>, send only evaluations saved or corrected since then (the page asks for this every minute).
  const since = Number(p.since) || 0;
  const savedAt = since ? sh.getRange(2, 1, n, 1).getValues().flat() : [];
  const editCol = COLUMNS.indexOf('Edited at') + 1;
  const editedAt = since && sh.getLastColumn() >= editCol ? sh.getRange(2, editCol, n, 1).getValues().flat() : [];
  const records = [], ro = readRoster_();
  json.forEach(function (s, i) {
    if (since) {
      const t1 = new Date(savedAt[i]).getTime() || 0, t2 = new Date(editedAt[i] || 0).getTime() || 0;
      if (Math.max(t1, t2) < since) return;
    }
    try { const r = JSON.parse(s); aliasFix_(r, ro); records.push(r); } catch (err) {}
  });
  return reply_({ ok: true, records: records, deleted: deletedIds_(), now: Date.now(), partial: !!since });
}

// Run once from the editor (select it, then Run) if Google asks again for permission to send email.
function authorizeMail() {
  MailApp.getRemainingDailyQuota();
}

// The evaluation type as the scorecard names it, for the sheet's Purpose column (the app reads the Record JSON, not this).
function purposeLabel_(r) {
  const p = r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live');
  if (p === 'calibration' && /(^|-)RECAL-/.test(r.sampleRef || '')) return 'Recalibration';
  return ({ live: 'Agent level', certcall: 'Certification call', program: 'Program level', coaching: 'Extra target',
    postcoach: 'Coaching call', calibration: 'Calibration', roleplay: 'Certification role-play' })[p] || p;
}

// A double save: the same evaluator already saved this interaction (same form, agent, call time and purpose).
// Checks the newest 300 rows' Record JSON. Tests and calibration samples are never treated as doubles.
function sameEvaluatorTwin_(sh, r) {
  if (r.test || r.sampleRef || !r.agent || !r.interactionDate) return '';
  const last = sh.getLastRow(); if (last < 2) return '';
  const from = Math.max(2, last - 299);
  const json = sh.getRange(from, JSON_COL, last - from + 1, 1).getValues();
  const purpose = function (x) { return x.purpose || (x.rolePlay ? 'roleplay' : x.sampleRef ? 'calibration' : 'live'); };
  for (let i = json.length - 1; i >= 0; i--) {
    let x; try { x = JSON.parse(json[i][0]); } catch (e) { continue; }
    if (!x || x.id === r.id || x.test || x.sampleRef) continue;
    if (x.form === r.form && x.agent === r.agent && (x.evaluator || '') === (r.evaluator || '') &&
        String(x.interactionDate) === String(r.interactionDate) && purpose(x) === purpose(r)) return x.id;
  }
  return '';
}


// ---------- Knowledge base: daily / monthly quiz and the team pulse ----------
// The knowledge base page (no access key) posts quiz scores and reads the leaderboard and the
// team's most missed scorecard items. Only agents in the Roster, or a company email, can save.
const QUIZ_NAME = 'Quiz';
const QUIZ_COLS = ['Saved at', 'Date', 'Kind', 'Period', 'Name', 'Email', 'Score', 'Total', 'Wrong questions', 'Questions asked'];
function quizSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(QUIZ_NAME);
  if (!sh) { sh = ss.insertSheet(QUIZ_NAME); sh.getRange(1, 1, 1, QUIZ_COLS.length).setValues([QUIZ_COLS]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
// ---------- knowledge base sign-in (agents) ----------
// Agents sign in to the quiz with their work email: a Roster agent's email, or any @techsource-gds.com address.
// The name always comes from the email (Roster name when it matches), so nobody can save a score under someone else.
// One sign-in lasts 180 days on that device, so the daily email quota is barely used.
const KB_SESSION_DAYS = 180;
const KB_DOMAIN = /^[^@\s]+@techsource-gds\.com$/i;
function quizWhoEmail_(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return null;
  const ro = readRoster_();
  const pick = function (list, emails, staff) {
    for (let i = 0; i < list.length; i++) if (String(emails[list[i]] || '').trim().toLowerCase() === em) return { name: list[i], email: em, staff: staff };
    return null;
  };
  const hit = pick(ro.agents, ro.emails, false) || pick(ro.evaluators, ro.evalEmails || {}, true);
  if (hit) return hit;
  if (!KB_DOMAIN.test(em)) return null;
  // Name from the address (Margret.Ebady → Margret Ebady), matched to a Roster name when one is the same.
  const guess = em.split('@')[0].split(/[._-]+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  const same = ro.agents.filter(function (a) { return nameKey_(a) === nameKey_(guess); })[0];
  return { name: same || guess, email: em, staff: false };
}
// via = 'lead': the agent's work email isn't working yet (new batch), so the code goes to the operations team leaders,
// who read it to the agent in person. The score is still saved under the agent's own email.
function kbLeadEmails_() {
  const sh = roster_(), out = [], own = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const role = String(r[1] || ''), em = String(r[3] || '').trim();
    if (!em || String(r[2]).toLowerCase() === 'no' || !isEvalRole_(role)) return;
    if (/operation|اوبريشن|أوبريشن/i.test(role)) out.push(em); else if (/owner/i.test(role)) own.push(em);
  });
  return out.length ? out : own;
}
function kbOtpRequest_(email, via) {
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: 'bad_email' };
  const who = quizWhoEmail_(em);
  if (!who) return { ok: false, error: 'not_allowed' };
  const cache = CacheService.getScriptCache();
  const old = JSON.parse(cache.get('kotp_' + em) || 'null');
  if (old && Date.now() - old.at < 45 * 1000 && via !== 'lead') return { ok: true, wait: true };
  const props = PropertiesService.getScriptProperties();
  const live = JSON.parse(props.getProperty('kotpc_' + hash_(em)) || 'null');
  const code = live && live.exp > Date.now() + 60 * 1000 ? live.c : String(Math.floor(100000 + Math.random() * 900000));
  if (!live || live.c !== code) props.setProperty('kotpc_' + hash_(em), JSON.stringify({ c: code, exp: Date.now() + OTP_MINUTES * 60 * 1000 }));
  cache.put('kotp_' + em, JSON.stringify({ h: hash_(em + ':' + code), at: Date.now(), tries: old && old.h === hash_(em + ':' + code) ? old.tries : 0 }), OTP_MINUTES * 60);
  if (via === 'lead') {
    const leads = kbLeadEmails_();
    if (!leads.length) return { ok: false, error: 'no_leads' };
    const nm = String(who.name).replace(/[<>&]/g, '');
    MailApp.sendEmail({
      to: leads.join(','), name: 'Knowledge Base', subject: 'Knowledge Base quiz code for ' + nm + ': ' + code,
      htmlBody: '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:15px">' + nm + ' (' + em + ') is asking to sign in to the Knowledge Base quiz, and their email is not working yet.<br><br>' +
        'Code: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
        'Give them the code yourself after you check it is really them. It works for ' + OTP_MINUTES + ' minutes; if nobody asked for it, ignore this email.</div>'
    });
    return { ok: true, via: 'lead' };
  }
  MailApp.sendEmail({
    to: em, name: 'Knowledge Base', subject: 'Knowledge Base quiz code: ' + code,
    htmlBody: '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:15px">Hi ' + String(who.name).replace(/[<>&]/g, '') + ',<br><br>' +
      'Your Knowledge Base quiz code: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
      'It works for ' + OTP_MINUTES + ' minutes. If you did not ask for it, ignore this email.</div>'
  });
  return { ok: true };
}
function kbOtpVerify_(email, code) {
  const em = String(email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const o = JSON.parse(cache.get('kotp_' + em) || 'null');
  if (!o) return { ok: false, error: 'code_expired' };
  if (o.tries >= 5) { cache.remove('kotp_' + em); return { ok: false, error: 'too_many_tries' }; }
  if (hash_(em + ':' + String(code || '').replace(/\D/g, '')) !== o.h) {
    o.tries++; cache.put('kotp_' + em, JSON.stringify(o), OTP_MINUTES * 60);
    return { ok: false, error: 'wrong_code' };
  }
  cache.remove('kotp_' + em);
  PropertiesService.getScriptProperties().deleteProperty('kotpc_' + hash_(em));
  const who = quizWhoEmail_(em);
  if (!who) return { ok: false, error: 'not_allowed' };
  const session = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('kses_' + hash_(session), JSON.stringify({ email: em, exp: Date.now() + KB_SESSION_DAYS * 864e5 }));
  return { ok: true, session: session, email: em, name: who.name };
}
function kbWho_(session) {
  if (!session) return null;
  const props = PropertiesService.getScriptProperties(), k = 'kses_' + hash_(session);
  const s = JSON.parse(props.getProperty(k) || 'null');
  const who = s && s.exp >= Date.now() ? quizWhoEmail_(s.email) : null;
  if (!who) { if (s) props.deleteProperty(k); return null; }
  return who;
}
function saveQuiz_(b) {
  const kind = b.kind === 'monthly' ? 'monthly' : 'daily';
  const total = Math.floor(Number(b.total)), score = Math.floor(Number(b.score));
  if (!(total >= 1 && total <= 30 && score >= 0 && score <= total)) return { ok: false, error: 'Bad score' };
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const name = who.name;
  const tz = Session.getScriptTimeZone(), now = new Date();
  const date = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), period = kind === 'monthly' ? date.slice(0, 7) : date;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = quizSheet_(), n = sh.getLastRow() - 1;
    if (n > 0) {
      const rows = sh.getRange(2, 3, n, 3).getValues(); // Kind, Period, Name
      for (let i = 0; i < rows.length; i++) if (rows[i][0] === kind && String(rows[i][1]) === period && nameKey_(rows[i][2]) === nameKey_(name)) return { ok: true, duplicate: true, name: name };
    }
    const wrong = (Array.isArray(b.wrong) ? b.wrong : []).slice(0, 30).map(function (x) { return String(x).replace(/\s*\|\s*/g, ' ').slice(0, 140); }).join(' | ');
    const asked = (Array.isArray(b.asked) ? b.asked : []).slice(0, 30).map(function (x) { return String(x).replace(/\s*\|\s*/g, ' ').slice(0, 140); }).join(' | ');
    if (!sh.getRange(1, 10).getValue()) sh.getRange(1, 10).setValue('Questions asked').setFontWeight('bold');
    sh.appendRow([now, date, kind, "'" + period, name, who.email, score, total, wrong, asked]);
  } finally { lock.releaseLock(); }
  return { ok: true, name: name };
}
// Each agent picks a character for the quiz and the leaderboard. Only a picture id is kept (no photos).
function kbAvatars_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('kbAvatars') || '{}'); }
function kbAvatar_(b) {
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const id = String(b.avatar || '');
  if (!/^[a-z0-9_]{1,16}$/.test(id)) return { ok: false, error: 'bad_avatar' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const all = kbAvatars_(); all[nameKey_(who.name)] = id; PropertiesService.getScriptProperties().setProperty('kbAvatars', JSON.stringify(all)); }
  finally { lock.releaseLock(); }
  return { ok: true, avatar: id };
}
// Streak: days in a row with the daily quiz. Fridays and Saturdays never break it (days off), and today
// doesn't break it until the day is over.
function streak_(dates, today) {
  const set = {}; dates.forEach(function (d) { set[d] = 1; });
  const d = new Date(today + 'T12:00:00Z');
  let n = 0;
  if (!set[today]) d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 400; i++) {
    const k = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), wd = d.getUTCDay();
    if (set[k]) n++; else if (wd !== 5 && wd !== 6) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
function pulse_(p) {
  const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? String(p.month) : today.slice(0, 7);
  const ro = readRoster_(), staff = {};
  (ro.evaluators || []).concat(ro.owners || []).forEach(function (n) { staff[nameKey_(n)] = 1; });
  const me = p.session ? kbWho_(p.session) : null, meK = me ? nameKey_(me.name) : '';
  // Leaderboard for the month: daily points + monthly quiz points. Evaluators can try the quiz but aren't ranked.
  const board = {}, doneToday = [], days = {}, mine = { points: 0, right: 0, asked: 0, perfect: 0, monthlies: 0, bestMonthly: 0, dates: [] };
  const qs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUIZ_NAME);
  if (qs && qs.getLastRow() > 1) {
    qs.getRange(2, 2, qs.getLastRow() - 1, 7).getValues().forEach(function (r) { // Date, Kind, Period, Name, Email, Score, Total
      const date = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]);
      const per = String(r[2]), name = String(r[3]), k = nameKey_(name), sc = Number(r[5]) || 0, tot = Number(r[6]) || 0;
      if (r[1] === 'daily') (days[k] = days[k] || []).push(date);
      if (k === meK) {
        mine.points += sc; mine.right += sc; mine.asked += tot;
        if (r[1] === 'daily') { mine.dates.push(date); if (tot && sc === tot) mine.perfect++; }
        else { mine.monthlies++; mine.bestMonthly = Math.max(mine.bestMonthly, Math.round(100 * sc / (tot || 1))); }
      }
      if (staff[k]) return;
      if (r[1] === 'daily' && date === today) doneToday.push(name);
      if (per.slice(0, 7) !== month) return;
      const b = board[k] || (board[k] = { name: name, points: 0, days: 0, right: 0, asked: 0, monthly: null });
      b.points += sc; b.right += sc; b.asked += tot;
      if (r[1] === 'daily') b.days++; else b.monthly = Math.round(100 * sc / (tot || 1));
    });
  }
  const avs = kbAvatars_();
  const list = Object.keys(board).map(function (k) { const b = board[k]; return { name: b.name, points: b.points, days: b.days, pct: b.asked ? Math.round(100 * b.right / b.asked) : 0, monthly: b.monthly, streak: streak_(days[k] || [], today), av: avs[k] || '' }; })
    .sort(function (a, b) { return b.points - a.points || b.pct - a.pct || a.name.localeCompare(b.name); });
  const out = { ok: true, today: today, month: month, board: list.slice(0, 30), doneToday: doneToday, top: topMissed_(14), hard: quizHard_(today) };
  if (p.session) {
    if (!me) out.signedOut = true;
    else {
      // Best streak ever, for the badges.
      const ds = mine.dates.slice().sort(), have = {}; let best = 0, run = 0;
      ds.forEach(function (d) { have[d] = 1; });
      if (ds.length) for (let d = new Date(ds[0] + 'T12:00:00Z'), i = 0; i < 800; i++, d.setUTCDate(d.getUTCDate() + 1)) {
        const k = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
        if (have[k]) best = Math.max(best, ++run); else if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) run = 0;
        if (k >= ds[ds.length - 1]) break;
      }
      const rank = list.findIndex(function (b) { return nameKey_(b.name) === meK; });
      const acc = kbAccess_(me.email);
      out.me = { name: me.name, av: avs[meK] || '', staff: !!staff[meK], dash: acc.dash, seeStaff: acc.seeStaff, streak: streak_(mine.dates, today), best: best, points: mine.points, pct: mine.asked ? Math.round(100 * mine.right / mine.asked) : 0,
        days: mine.dates.length, perfect: mine.perfect, monthlies: mine.monthlies, bestMonthly: mine.bestMonthly, rank: rank < 0 ? null : rank + 1,
        week: mine.dates.filter(function (d) { return d > Utilities.formatDate(new Date(Date.now() - 14 * 864e5), tz, 'yyyy-MM-dd'); }), doneToday: mine.dates.indexOf(today) >= 0 };
    }
  }
  return out;
}
// The team's most missed call items over the last N days (counted evaluations only: no tests, calibration or role play).
function topMissed_(days) {
  const cache = CacheService.getScriptCache(), hit = cache.get('topMissed' + days);
  if (hit) return JSON.parse(hit);
  const sh = sheet_(), n = sh.getLastRow() - 1, out = [];
  if (n < 1) return { days: days, evals: 0, items: [] };
  const from = Utilities.formatDate(new Date(Date.now() - days * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const take = Math.min(n, 500), del = deletedIds_();
  const json = sh.getRange(2 + n - take, JSON_COL, take, 1).getValues().flat();
  const stat = {}; let evals = 0;
  json.forEach(function (j) {
    let r; try { r = JSON.parse(j); } catch (e) { return; }
    if (!r || r.form !== 'calls' || r.test || r.sampleRef || r.rolePlay || del.indexOf(r.id) !== -1) return;
    const purpose = r.purpose || 'live';
    if (['live', 'program', 'certcall', 'coaching', 'postcoach'].indexOf(purpose) === -1) return;
    if (String(r.evalDate || '').slice(0, 10) < from) return;
    evals++;
    (r.items || []).forEach(function (it) {
      if (it.result === 'N/A' || !it.id) return;
      const s = stat[it.id] || (stat[it.id] = { id: it.id, kind: it.kind, missed: 0, of: 0 });
      s.of++; if (it.result === 'Not met' || it.result === 'Error') s.missed++;
    });
  });
  Object.keys(stat).forEach(function (k) { if (stat[k].missed) out.push(stat[k]); });
  out.sort(function (a, b) { return b.missed - a.missed || b.missed / b.of - a.missed / a.of; });
  const res = { days: days, evals: evals, items: out.slice(0, 5) };
  cache.put('topMissed' + days, JSON.stringify(res), 600);
  return res;
}

// ---------- agents' questions and suggestions for the client ----------
// Agents send them from the knowledge base (signed in with their work email). Mohamed fills Status and Answer in the
// "Agent questions" tab; answered ones show in the knowledge base for everyone. Names are kept in the sheet only.
const ASK_NAME = 'Agent questions';
const ASK_COLS = ['Saved at', 'Name', 'Email', 'Type', 'Topic', 'Question / suggestion', 'Customer said (optional)', 'Status (New / Asked client / Answered / Not needed)', 'Answer', 'Answered at', 'Same question from', 'Sent to the floor'];
function askSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ASK_NAME);
  if (!sh) { sh = ss.insertSheet(ASK_NAME); sh.getRange(1, 1, 1, ASK_COLS.length).setValues([ASK_COLS]).setFontWeight('bold'); sh.setFrozenRows(1); sh.setColumnWidth(6, 380); sh.setColumnWidth(9, 380); }
  return sh;
}
function kbAsk_(b) {
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const text = String(b.text || '').trim().slice(0, 1500);
  if (text.length < 5) return { ok: false, error: 'too_short' };
  const type = b.type === 'suggestion' ? 'Suggestion' : 'Question';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    askSheet_().appendRow([new Date(), who.name, who.email, type, String(b.topic || '').slice(0, 60), text, String(b.context || '').slice(0, 600), 'New', '', '', '']);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function kbAskVote_(b) {
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const sh = askSheet_(), row = Math.floor(Number(b.id));
  if (!(row >= 2 && row <= sh.getLastRow())) return { ok: false, error: 'not_found' };
  const c = sh.getRange(row, 11), list = String(c.getValue() || '').split(/\s*,\s*/).filter(Boolean);
  if (String(sh.getRange(row, 3).getValue()).toLowerCase() !== who.email && list.indexOf(who.email) < 0) { list.push(who.email); c.setValue(list.join(', ')); }
  return { ok: true, votes: list.length + 1 };
}
function kbAsks_(p) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASK_NAME), tz = Session.getScriptTimeZone();
  if (!sh || sh.getLastRow() < 2) return { ok: true, items: [] };
  const me = p.session ? kbWho_(p.session) : null, n = sh.getLastRow() - 1, from = Math.max(0, n - 300);
  const fmt = function (d) { return d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d || '').slice(0, 10); };
  const items = sh.getRange(2 + from, 1, n - from, ASK_COLS.length).getValues().map(function (r, i) {
    const st = String(r[7] || 'New').toLowerCase(), voters = String(r[10] || '').split(/\s*,\s*/).filter(Boolean);
    const status = /answer|اتجاوب|تم/.test(st) ? 'answered' : /asked|client|اتسأل|كلاينت/.test(st) ? 'asked' : /not|no need|مش محتاج|ملغي/.test(st) ? 'closed' : 'new';
    return { id: 2 + from + i, date: fmt(r[0]), type: String(r[3]) === 'Suggestion' ? 'suggestion' : 'question', topic: String(r[4] || ''), text: String(r[5] || ''),
      status: status, answer: status === 'answered' ? String(r[8] || '') : '', answeredAt: fmt(r[9]), votes: 1 + voters.length,
      mine: !!me && String(r[2]).toLowerCase() === me.email, voted: !!me && voters.indexOf(me.email) >= 0 };
  }).filter(function (x) { return x.text && x.status !== 'closed'; }).reverse();
  return { ok: true, items: items };
}

// ---------- knowledge base: searches that found nothing ----------
// Every search or Noor question in the knowledge base that finds nothing is saved here (no customer data: long numbers are
// masked before saving), so the team can see what content is missing. Team leads see the top ones in the KB "📊" tab.
const MISS_NAME = 'KB misses';
const MISS_COLS = ['Saved at', 'Searched for', 'Where (search / Noor)', 'Language', 'Agent email (if signed in)'];
function missSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(MISS_NAME);
  if (!sh) { sh = ss.insertSheet(MISS_NAME); sh.getRange(1, 1, 1, MISS_COLS.length).setValues([MISS_COLS]).setFontWeight('bold'); sh.setFrozenRows(1); sh.setColumnWidth(2, 320); }
  return sh;
}
function kbMiss_(b) {
  const q = String(b.q || '').replace(/[0-9٠-٩]{5,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (q.length < 2) return { ok: false, error: 'too_short' };
  const who = b.session ? kbWho_(b.session) : null;
  const src = b.src === 'noor' ? 'Noor' : 'Search', lang = b.lang === 'en' ? 'en' : 'ar';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { missSheet_().appendRow([new Date(), q, src, lang, who ? who.email : '']); } finally { lock.releaseLock(); }
  return { ok: true };
}
function kbMisses_(p) {
  const who = kbWho_(p.session);
  if (!who) return { ok: false, error: 'signed_out' };
  if (!kbAccess_(who.email).dash) return { ok: false, error: 'forbidden' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MISS_NAME);
  if (!sh || sh.getLastRow() < 2) return { ok: true, items: [], total: 0 };
  const since = new Date(Date.now() - 30 * 864e5), n = sh.getLastRow() - 1, from = Math.max(0, n - 3000), map = {};
  let total = 0;
  sh.getRange(2 + from, 1, n - from, 4).getValues().forEach(function (r) {
    if (!(r[0] instanceof Date) || r[0] < since) return;
    const q = String(r[1] || '').trim(); if (!q) return;
    const k = q.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9\u0600-\u06ff ]/g, '').replace(/\s+/g, ' ').trim();
    const e = map[k] || (map[k] = { q: q, n: 0, noor: 0, last: r[0] });
    e.n++; total++; if (String(r[2]) === 'Noor') e.noor++; if (r[0] > e.last) { e.last = r[0]; e.q = q; }
  });
  const tz = Session.getScriptTimeZone();
  const items = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n || b.last - a.last; }).slice(0, 25)
    .map(function (e) { return { q: e.q, n: e.n, noor: e.noor, last: Utilities.formatDate(e.last, tz, 'yyyy-MM-dd') }; });
  return { ok: true, items: items, total: total };
}

// ---------- emails to the floor and to the team leads ----------
// Run setupKbEmails() once from the Apps Script editor (Run ▶). It adds two daily triggers:
//  • kbDailyDigest at 9 am: ONE email to everyone in the Roster (only when there is something new): new knowledge base
//    updates (the "التحديثات" tab of the KB sheet), newly answered client questions, yesterday's quiz stars, and on the
//    first days of a month the monthly champions.
//  • kbCallsReminder at 10 am: each agent with booking follow-up calls today gets a short list (see Bookings below).
//  • kbLeadsReport at 3 pm: to the operations team leads (and the owner): who did today's quiz, who didn't yet, and on
//    Thursdays the quiz questions the team got wrong most this week, for coaching.
// Fridays are skipped. Emails go from the account that owns this script, with the sender name below.
const KB_SHEET_ID = '1kKXesKcnse3ofMTc0_FbuUWOz6I6fPf7';
const KB_LINK = 'https://hidden-hat-5831.mohamed-omar00700.workers.dev/';
const KB_SENDER = 'H&P Knowledge Base';
function setupKbEmails() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['kbDailyDigest', 'kbLeadsReport', 'kbCallsReminder'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('kbDailyDigest').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger('kbCallsReminder').timeBased().everyDays(1).atHour(10).create();
  ScriptApp.newTrigger('kbLeadsReport').timeBased().everyDays(1).atHour(15).create();
  kbNewsNew_(true); // what's already in the updates tab counts as sent
  return 'ok';
}
function rosterPeople_() { // active Roster rows with an email: {name, email, role}
  const sh = roster_(), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const em = String(r[3] || '').trim();
    if (String(r[0] || '').trim() && em && String(r[2]).toLowerCase() !== 'no') out.push({ name: String(r[0]).trim(), email: em, role: String(r[1] || '') });
  });
  return out;
}
function kbNewsNew_(markOnly) {
  let rows = [];
  try {
    const url = 'https://docs.google.com/spreadsheets/d/' + KB_SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('التحديثات');
    rows = Utilities.parseCsv(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText()).slice(1).filter(function (r) { return String(r[1] || r[2] || '').trim(); });
  } catch (e) { return []; }
  const props = PropertiesService.getScriptProperties(), seen = JSON.parse(props.getProperty('kbNewsSeen') || '[]');
  const fresh = rows.filter(function (r) { return seen.indexOf(hash_(r.join('|')).slice(0, 16)) < 0; });
  if (fresh.length || markOnly) props.setProperty('kbNewsSeen', JSON.stringify(rows.map(function (r) { return hash_(r.join('|')).slice(0, 16); }).slice(-300)));
  return markOnly ? [] : fresh.map(function (r) { return { date: String(r[0] || ''), ar: String(r[1] || ''), en: String(r[2] || '') }; });
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
// Emails are English-only (Hussein's request). Arabic is kept only as someone's own words, shown as a quote.
const AR_RE_ = /[\u0600-\u06FF]/;
function quoteAr_(s) { return '<div style="margin:0 0 8px">' + enHtml_(s) + '</div>'; }
// Arabic typed text (comments, feedback, notes, questions) is machine-translated to English with the original kept small under it.
function trEn_(s) {
  s = String(s || '').trim();
  if (!s || !AR_RE_.test(s)) return s;
  const cache = CacheService.getScriptCache(), key = 'tr_' + hash_(s).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return hit;
  try { const t = LanguageApp.translate(s, 'ar', 'en'); if (t) { if (t.length < 90000) cache.put(key, t, 21600); return t; } } catch (e) {}
  return '';
}
// HTML: English translation, then the Arabic original as a small quote. Text with no Arabic is shown as is.
function enHtml_(s) {
  s = String(s || '');
  if (!AR_RE_.test(s)) return esc_(s);
  const t = trEn_(s);
  return (t ? esc_(t) + ' <span style="color:#9ca3af;font-size:11px">(auto-translated)</span>' : '') +
    '<div dir="rtl" style="border-right:3px solid #d1d5db;padding:2px 8px;margin-top:4px;color:#6b7280;font-size:12px">' + esc_(s) + '</div>';
}
function translateTexts_(b) { // knowledge base and scorecard: translate up to 8 short texts before opening a ready email
  const list = (Array.isArray(b.texts) ? b.texts : []).slice(0, 8).map(function (x) { return String(x || '').slice(0, 2000); });
  return { ok: true, en: list.map(trEn_) };
}
function bkPh_(r) { const p = String(r[BK_C.phone] || '').replace(/^'/, '').trim(); return p ? ' · 📞 <span dir="ltr">' + esc_(p) + '</span>' : ''; } // customer number in follow-up emails (Mohamed, 2026-11-08)
function brEn_(b) { b = String(b || '').trim(); return /أبوظبي|ابوظبي/.test(b) ? 'Abu Dhabi' : /الفجيرة|الفجيره/.test(b) ? 'Fujairah' : b; }
function mailBox_(title, body) {
  return '<div style="border:1px solid #eadbe2;border-radius:14px;padding:14px 16px;margin:12px 0;background:#fff"><div style="font-size:17px;font-weight:bold;color:#A63D63;margin-bottom:8px">' + title + '</div>' + body + '</div>';
}
function mailWrap_(title, inner) {
  return '<div dir="ltr" style="font-family:Tahoma,Arial,sans-serif;background:#f7f2f4;padding:18px;color:#1d2731;font-size:15px;line-height:1.7">' +
    '<div style="max-width:620px;margin:0 auto"><div style="background:#1d2731;color:#fff;border-radius:14px;padding:16px 18px;font-size:20px;font-weight:bold">' + title + '</div>' + inner +
    '<div style="text-align:center;margin:18px 0"><a href="' + KB_LINK + '" style="background:#2F7565;color:#fff;text-decoration:none;padding:11px 22px;border-radius:12px;font-weight:bold">Open the Knowledge Base</a></div>' +
    '<div style="color:#7a8590;font-size:12px;text-align:center">Automatic email from the H&P account Knowledge Base.</div></div></div>';
}
function quizRows_() { // [{date, kind, period, name, score, total, wrong}]
  const qs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QUIZ_NAME), tz = Session.getScriptTimeZone();
  if (!qs || qs.getLastRow() < 2) return [];
  return qs.getRange(2, 2, qs.getLastRow() - 1, 9).getValues().map(function (r) {
    return { date: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]), kind: String(r[1]), period: String(r[2]).replace(/^'/, ''), name: String(r[3]), score: Number(r[5]) || 0, total: Number(r[6]) || 0, wrong: String(r[7] || ''), asked: String(r[8] || '') };
  });
}
function kbDailyDigest() {
  const tz = Session.getScriptTimeZone(), now = new Date();
  if (Utilities.formatDate(now, tz, 'u') === '5') return 'friday';
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), parts = [];
  // 1) knowledge base updates
  const news = kbNewsNew_(false);
  if (news.length) parts.push(mailBox_('📢 New in the Knowledge Base', news.map(function (n) { return '<p style="margin:0 0 10px">' + (n.date ? '<b>' + esc_(n.date) + ':</b> ' : '') + (n.en ? esc_(n.en) : enHtml_(n.ar)) + '</p>'; }).join('')));
  // 2) client answers to agents' questions
  const ask = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASK_NAME), done = [];
  if (ask && ask.getLastRow() > 1) {
    if (!ask.getRange(1, 12).getValue()) ask.getRange(1, 12).setValue('Sent to the floor').setFontWeight('bold');
    const vals = ask.getRange(2, 1, ask.getLastRow() - 1, 12).getValues();
    vals.forEach(function (r, i) { if (/answer|اتجاوب|تم/i.test(String(r[7])) && String(r[8]).trim() && !r[11]) done.push({ row: i + 2, q: r[5], a: r[8] }); });
    if (done.length) parts.push(mailBox_('✅ The client answered your questions', done.slice(0, 15).map(function (x) { return '<p style="margin:0 0 4px"><b>Q:</b></p>' + quoteAr_(x.q) + '<p style="margin:0 0 12px;background:#E0F0EB;border-radius:10px;padding:8px 10px"><b>A:</b> ' + enHtml_(x.a) + '</p>'; }).join('')));
  }
  // 3) yesterday's quiz stars (the last day with daily quizzes before today)
  const rows = quizRows_(), staff = {};
  rosterPeople_().forEach(function (p) { if (isEvalRole_(p.role)) staff[nameKey_(p.name)] = 1; });
  const days = rows.filter(function (r) { return r.kind === 'daily' && r.date < today && !staff[nameKey_(r.name)]; }).map(function (r) { return r.date; }).sort();
  const last = days[days.length - 1], props = PropertiesService.getScriptProperties();
  if (last && last >= Utilities.formatDate(new Date(now.getTime() - 4 * 864e5), tz, 'yyyy-MM-dd') && props.getProperty('kbStarDay') !== last) {
    const d = rows.filter(function (r) { return r.kind === 'daily' && r.date === last && !staff[nameKey_(r.name)]; }), best = Math.max.apply(null, d.map(function (r) { return r.score; }));
    const stars = d.filter(function (r) { return r.score === best; }).map(function (r) { return r.name; });
    const all = {}; rows.forEach(function (r) { if (r.kind === 'daily') (all[nameKey_(r.name)] = all[nameKey_(r.name)] || { name: r.name, d: [] }).d.push(r.date); });
    const streaks = Object.keys(all).filter(function (k) { return !staff[k]; }).map(function (k) { return { name: all[k].name, n: streak_(all[k].d, last) }; }).filter(function (x) { return x.n >= 3; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
    if (best >= 4) parts.push(mailBox_('🌟 Quiz stars of ' + last, '<p style="margin:0 0 8px">Well done <b>' + esc_(stars.join(', ')) + '</b>: ' + best + ' of ' + (d[0].total || 5) + ' in the quiz of ' + last + '. Thank you for the effort, it shows in your calls 👏</p>' +
      '<p style="margin:0;color:#555">' + d.length + ' team members did the quiz.' + (streaks.length ? ' 🔥 Longest streaks: ' + streaks.map(function (s) { return esc_(s.name) + ' (' + s.n + ' days)'; }).join(', ') + '.' : '') + '</p>'));
    props.setProperty('kbStarDay', last);
  }
  // 4) monthly champions, once, in the first days of the month
  const lastMonth = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 15), tz, 'yyyy-MM');
  if (Number(Utilities.formatDate(now, tz, 'd')) <= 5 && props.getProperty('kbChampMonth') !== lastMonth) {
    const b = pulse_({ month: lastMonth }).board.slice(0, 3);
    if (b.length) {
      parts.unshift(mailBox_('🏆 Quiz champions of ' + lastMonth, b.map(function (x, i) { return '<p style="margin:0 0 6px;font-size:16px">' + ['🥇', '🥈', '🥉'][i] + ' <b>' + esc_(x.name) + '</b>: ' + x.points + ' points, accuracy ' + x.pct + '%' + (x.monthly != null ? ', monthly quiz ' + x.monthly + '%' : '') + '</p>'; }).join('') +
        '<p style="margin:8px 0 0">Congratulations, and thank you for studying every day. The new month has started and the league is reset. Let\'s go! 💪</p>'));
      props.setProperty('kbChampMonth', lastMonth);
    }
  }
  if (!parts.length) return 'nothing new';
  const to = rosterPeople_().map(function (p) { return p.email; });
  if (!to.length) return 'no emails';
  const q = rosterPeople_().filter(function (p) { return isQualityRole_(p.role); })[0];
  MailApp.sendEmail({ to: to.join(','), name: KB_SENDER, replyTo: q ? q.email : undefined, subject: 'Knowledge Base: what\'s new today ' + today, htmlBody: mailWrap_('Good morning, H&P team 🌸', parts.join('')) });
  if (ask) done.forEach(function (x) { ask.getRange(x.row, 12).setValue(new Date()); });
  return 'sent to ' + to.length;
}
function kbLeadsReport() {
  const tz = Session.getScriptTimeZone(), now = new Date(), wd = Utilities.formatDate(now, tz, 'u');
  if (wd === '5') return 'friday';
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), people = rosterPeople_(), rows = quizRows_();
  const leads = people.filter(function (p) { return isEvalRole_(p.role) && /operation|اوبريشن|أوبريشن|owner/i.test(p.role); }).map(function (p) { return p.email; });
  if (!leads.length) return 'no leads';
  const ro = readRoster_(), doneMap = {};
  rows.forEach(function (r) { if (r.kind === 'daily' && r.date === today) doneMap[nameKey_(r.name)] = r; });
  const done = ro.agents.filter(function (a) { return doneMap[nameKey_(a)]; }), notYet = ro.agents.filter(function (a) { return !doneMap[nameKey_(a)]; });
  const parts = [mailBox_('📝 Today\'s quiz', '<p style="margin:0 0 6px"><b>Done (' + done.length + '):</b> ' + (done.map(function (a) { return esc_(a) + ' ' + doneMap[nameKey_(a)].score + '/' + doneMap[nameKey_(a)].total; }).join(', ') || '–') + '</p>' +
    '<p style="margin:0"><b>Not yet (' + notYet.length + '):</b> ' + (esc_(notYet.join(', ')) || 'Everyone did it 👏') + '</p><p style="margin:6px 0 0;color:#777;font-size:13px">Anyone off today shows under "Not yet"; ignore them.</p>')];
  // Thursdays (or whenever asked): the questions the team got wrong most in the last 7 days
  if (wd === '4') {
    const from = Utilities.formatDate(new Date(now.getTime() - 7 * 864e5), tz, 'yyyy-MM-dd'), cnt = {}, asked = rows.filter(function (r) { return r.date >= from; }).length;
    rows.forEach(function (r) { if (r.date < from || !r.wrong) return; r.wrong.split(/\s*\|\s*/).forEach(function (w) { const k = w.replace(/^[^—]*—\s*/, '').trim() || w; if (k) cnt[k] = (cnt[k] || 0) + 1; }); });
    const top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 7);
    if (top.length) parts.push(mailBox_('🎯 Most missed questions this week (' + asked + ' quizzes)', '<ol style="margin:0;padding-inline-start:20px">' + top.map(function (k) { return '<li>' + enHtml_(k) + ' <span style="color:#A63D63">(' + cnt[k] + ' times)</span></li>'; }).join('') + '</ol><p style="margin:8px 0 0">These are the coaching priorities for next week.</p>'));
  }
  const calls = bkLeadsBox_(today);
  if (calls) parts.unshift(calls);
  const ask = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASK_NAME);
  if (ask && ask.getLastRow() > 1) {
    const waiting = ask.getRange(2, 8, ask.getLastRow() - 1, 1).getValues().filter(function (r) { const s = String(r[0] || 'New'); return !/answer|اتجاوب|تم|not|no need|مش محتاج|ملغي/i.test(s); }).length;
    if (waiting) parts.push(mailBox_('❓ Questions waiting for the client', '<p style="margin:0">There are ' + waiting + ' questions/suggestions from the agents in the "Agent questions" tab of the QA Evaluations sheet.</p>'));
  }
  MailApp.sendEmail({ to: leads.join(','), name: KB_SENDER, subject: 'Quiz report ' + today, htmlBody: mailWrap_('Knowledge Base report for team leads', parts.join('')) });
  return 'sent';
}

// ---------- quiz analytics for the owner, team leads, quality and Hussein ----------
// Everyone with an Evaluator / Owner role in the Roster can open the dashboard (signed in on the knowledge base).
// Evaluators' own quiz results are shown only to the owner and to roles with "Chief" (Hussein); the rest see agents only.
function kbAccess_(email) {
  const em = String(email || '').toLowerCase(), p = rosterPeople_().filter(function (x) { return x.email.toLowerCase() === em; })[0];
  const role = p ? p.role : '';
  return { dash: !!p && isEvalRole_(role), seeStaff: !!p && /owner|chief|head/i.test(role) };
}
function splitQs_(v) { return String(v || '').split(/\s*\|\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
function qKey_(x) { const m = /^(\S+)\s+—\s+(.*)$/.exec(x); return m ? { id: m[1], text: m[2] } : { id: x, text: x }; }
// The questions the team got wrong most in the last 14 days (agents only, up to yesterday), so tomorrow's quiz brings
// them back. Cached for the day, so everyone gets the same quiz.
function quizHard_(today) {
  const cache = CacheService.getScriptCache(), k = 'quizHard' + today, hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  const staff = {}; rosterPeople_().forEach(function (p) { if (isEvalRole_(p.role)) staff[nameKey_(p.name)] = 1; });
  const from = Utilities.formatDate(new Date(Date.now() - 14 * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd'), asked = {}, wrong = {};
  quizRows_().forEach(function (r) {
    if (r.date < from || r.date >= today || staff[nameKey_(r.name)]) return;
    splitQs_(r.asked).forEach(function (x) { const id = qKey_(x).id; asked[id] = (asked[id] || 0) + 1; });
    splitQs_(r.wrong).forEach(function (x) { const id = qKey_(x).id; wrong[id] = (wrong[id] || 0) + 1; });
  });
  const out = Object.keys(wrong).map(function (id) { return { id: id, w: wrong[id], a: Math.max(asked[id] || 0, wrong[id]) }; })
    .filter(function (x) { return x.w >= 2 || x.w / x.a >= 0.5; }).sort(function (a, b) { return b.w / b.a - a.w / a.a || b.w - a.w; }).slice(0, 12).map(function (x) { return x.id; });
  cache.put(k, JSON.stringify(out), 21600);
  return out;
}
function kbDash_(p) {
  const who = kbWho_(p.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const acc = kbAccess_(who.email);
  if (!acc.dash) return { ok: false, error: 'forbidden' };
  return kbDashData_(p, who, acc);
}
// The same numbers inside the QA scorecard dashboard (any signed-in evaluator, or the access key).
function kbDashForEval_(p, me) {
  const acc = { dash: true, seeStaff: !!me.owner || (me.email ? kbAccess_(me.email).seeStaff : false) };
  return kbDashData_(p, { name: me.name || '', email: me.email || '' }, acc);
}
function kbDashData_(p, who, acc) {
  const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? String(p.month) : today.slice(0, 7);
  const people = rosterPeople_(), staff = {}, ro = readRoster_();
  people.forEach(function (x) { if (isEvalRole_(x.role)) staff[nameKey_(x.name)] = 1; });
  const rows = quizRows_().filter(function (r) { return r.period.slice(0, 7) === month || r.date.slice(0, 7) === month; });
  const persons = {}, days = {}, qs = {};
  const P = function (name) { const k = nameKey_(name); return persons[k] || (persons[k] = { name: name, staff: !!staff[k], days: 0, right: 0, asked: 0, perfect: 0, last: '', monthly: null, dates: [], weak: {} }); };
  ro.agents.forEach(P);
  rows.forEach(function (r) {
    const isStaff = !!staff[nameKey_(r.name)];
    if (isStaff && !acc.seeStaff && nameKey_(r.name) !== nameKey_(who.name)) return;
    const x = P(r.name);
    if (r.kind === 'daily') {
      x.days++; x.right += r.score; x.asked += r.total; if (r.total && r.score === r.total) x.perfect++; if (r.date > x.last) x.last = r.date; x.dates.push(r.date);
      if (!isStaff) {
        const d = days[r.date] || (days[r.date] = { date: r.date, done: 0, right: 0, asked: 0, q: {} });
        d.done++; d.right += r.score; d.asked += r.total;
        const wr = {}; splitQs_(r.wrong).forEach(function (w) { wr[qKey_(w).id] = 1; });
        splitQs_(r.asked).forEach(function (a) { const q = qKey_(a), e = d.q[q.id] || (d.q[q.id] = { id: q.id, text: q.text, asked: 0, wrong: 0 }); e.asked++; if (wr[q.id]) e.wrong++; });
        Object.keys(wr).forEach(function (id) { if (!d.q[id]) { const t = qKey_(splitQs_(r.wrong).filter(function (w) { return qKey_(w).id === id; })[0] || id); d.q[id] = { id: id, text: t.text, asked: 1, wrong: 1 }; } });
      }
    } else x.monthly = Math.round(100 * r.score / (r.total || 1));
    splitQs_(r.wrong).forEach(function (w) { const q = qKey_(w), e = x.weak[q.id] || (x.weak[q.id] = { text: q.text, n: 0 }); e.n++; });
    if (!isStaff) {
      splitQs_(r.asked).forEach(function (a) { const q = qKey_(a), e = qs[q.id] || (qs[q.id] = { id: q.id, text: q.text, asked: 0, wrong: 0 }); e.asked++; });
      splitQs_(r.wrong).forEach(function (w) { const q = qKey_(w), e = qs[q.id] || (qs[q.id] = { id: q.id, text: q.text, asked: 0, wrong: 0 }); e.wrong++; if (e.asked < e.wrong) e.asked = e.wrong; });
    }
  });
  const workDays = Object.keys(days).length;
  const list = Object.keys(persons).map(function (k) { const x = persons[k]; return { name: x.name, staff: x.staff, days: x.days, pct: x.asked ? Math.round(100 * x.right / x.asked) : null, perfect: x.perfect, last: x.last, monthly: x.monthly, streak: streak_(x.dates, today), rate: workDays ? Math.round(100 * Math.min(x.days, workDays) / workDays) : 0,
      weak: Object.keys(x.weak).map(function (i) { return x.weak[i]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3) }; })
    .filter(function (x) { return !x.staff || acc.seeStaff || nameKey_(x.name) === nameKey_(who.name); })
    .sort(function (a, b) { return a.staff - b.staff || b.days - a.days || (b.pct || 0) - (a.pct || 0); });
  const dayList = Object.keys(days).sort().reverse().map(function (k) { const d = days[k]; return { date: d.date, done: d.done, pct: d.asked ? Math.round(100 * d.right / d.asked) : 0, qs: Object.keys(d.q).map(function (i) { return d.q[i]; }).sort(function (a, b) { return b.wrong / b.asked - a.wrong / a.asked; }) }; });
  const top = Object.keys(qs).map(function (i) { return qs[i]; }).filter(function (q) { return q.wrong; }).sort(function (a, b) { return b.wrong - a.wrong || b.wrong / b.asked - a.wrong / a.asked; }).slice(0, 15);
  const agentsN = ro.agents.length, doneToday = rows.filter(function (r) { return r.kind === 'daily' && r.date === today && !staff[nameKey_(r.name)]; }).length;
  return { ok: true, month: month, today: today, seeStaff: acc.seeStaff, agents: agentsN, doneToday: doneToday, people: list, days: dayList, top: top, hard: quizHard_(today) };
}

// ---------- booking follow-up calls (knowledge base) ----------
// Every booking email sent from the knowledge base is also saved here, so the agent is reminded of the 3 follow-up calls:
//  1) confirm: the working day before the appointment (Fridays are off, so a Saturday appointment is confirmed on Thursday)
//  2) same day: on the appointment day, before the appointment
//  3) after the visit: the next working day (did they go, how was it)
// A call is skipped when the booking itself was made that day (the booking call already covers it).
// Team leads (any Evaluator / Owner) see everyone's calls, see who is off today and can give a call to someone else.
// Result columns can also be edited by hand: the first word is the result (confirmed, noanswer, rescheduled, cancelled, went, noshow, n/a).
const BK_NAME = 'Bookings';
const BK_COLS = ['ID', 'Saved at', 'Booked by', 'Booked by email', 'Assigned to', 'Assigned email', 'Customer', 'Phone', 'Branch', 'Offer / service', 'Doctor',
  'Booking for', 'Appointment date', 'Appointment time', 'Odoo', 'Status (Active / Cancelled / No-show / Done)',
  'Call 1 due (confirm)', 'Call 1 result', 'Call 2 due (same day)', 'Call 2 result', 'Call 3 due (after visit)', 'Call 3 result', 'Feedback / notes', 'Log'];
const BK_C = { id: 0, saved: 1, by: 2, byEmail: 3, to: 4, toEmail: 5, cust: 6, phone: 7, branch: 8, svc: 9, doc: 10, kind: 11, date: 12, time: 13, odoo: 14, status: 15, d1: 16, r1: 17, d2: 18, r2: 19, d3: 20, r3: 21, notes: 22, log: 23 };
function bkSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BK_NAME);
  if (!sh) { sh = ss.insertSheet(BK_NAME); sh.getRange(1, 1, 1, BK_COLS.length).setValues([BK_COLS]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function ymdOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').replace(/^'/, '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function hmOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  const m = /(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
function addDays_(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
function workDay_(ymd, step) { // the nearest working day before (step -1) or after (step 1); Friday is off for everyone
  let d = addDays_(ymd, step);
  while (new Date(d + 'T12:00:00Z').getUTCDay() === 5) d = addDays_(d, step);
  return d;
}
function bkDues_(appt, booked) {
  const c1 = workDay_(appt, -1);
  const fri = new Date(appt + 'T12:00:00Z').getUTCDay() === 5; // a Friday appointment: nobody works, the Thursday call covers it
  return { d1: c1 <= booked ? 'n/a' : c1, d2: appt <= booked || fri ? 'n/a' : appt, d3: workDay_(appt, 1) };
}
function bkNow_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM HH:mm'); }
function bkRes_(v) { // 'confirmed · Nada · 03 Nov 14:20' → {key, tries}
  const s = String(v || '').trim().toLowerCase(); if (!s) return { key: '', tries: 0 };
  const m = /^([a-z/]+)(?:\s*\((\d+)\))?/.exec(s);
  return { key: m ? m[1] : 'other', tries: m && m[2] ? Number(m[2]) : (m && m[1] === 'noanswer' ? 1 : 0) };
}
const BK_DONE_ = { confirmed: 1, rescheduled: 1, cancelled: 1, went: 1, noshow: 1, 'n/a': 1, other: 1 };
function bkLead_(who) { return !!who && kbAccess_(who.email).dash; }
function bkMine_(r, who) { return String(r[BK_C.toEmail]).toLowerCase() === who.email || nameKey_(r[BK_C.to]) === nameKey_(who.name); }
// mode: 'new' (a new booking), 'move' (the customer changed the day of an existing booking), 'cancel' (the customer cancelled).
// For move/cancel the open booking is found by the customer's number (last 9 digits); a move with no saved booking is saved as a booking.
function bkPhoneKey_(v) { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : ''; }
function kbBook_(b) {
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const x = b.booking || {}, tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const mode = x.mode === 'move' || x.mode === 'cancel' ? x.mode : 'new';
  const appt = ymdOf_(x.date), time = hmOf_(x.time), id = String(x.id || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!id || (mode !== 'cancel' && !appt) || !String(x.name || '').trim()) return { ok: false, error: 'bad_booking' };
  if (mode !== 'cancel' && appt < today) return { ok: false, error: 'past_date' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = bkSheet_(), n = sh.getLastRow() - 1, cut = function (v, k) { return String(v || '').trim().slice(0, k || 120); };
    const rows = n > 0 ? sh.getRange(2, 1, n, BK_COLS.length).getValues() : [];
    if (rows.some(function (r) { return String(r[0]) === id; })) return { ok: true, duplicate: true };
    if (mode !== 'new') { // the customer's open booking, newest first
      const pk = bkPhoneKey_(x.phone);
      let at = -1;
      if (pk) for (let i = rows.length - 1; i >= 0; i--) if (bkPhoneKey_(rows[i][BK_C.phone]) === pk && !/cancel|done|no-?show/i.test(String(rows[i][BK_C.status]))) { at = i; break; }
      if (at >= 0) {
        const r = rows[at], old = ymdOf_(r[BK_C.date]) + ' ' + hmOf_(r[BK_C.time]), stamp = ' · ' + who.name + ' · ' + bkNow_();
        if (mode === 'cancel') {
          r[BK_C.status] = 'Cancelled';
          [1, 2, 3].forEach(function (j) { if (!BK_DONE_[bkRes_(r[BK_C['r' + j]]).key]) r[BK_C['r' + j]] = 'n/a · cancelled'; });
          r[BK_C.log] = String(r[BK_C.log] || '') + ' | cancelled (booking email)' + stamp;
        } else {
          const d = bkDues_(appt, today);
          r[BK_C.date] = "'" + appt; r[BK_C.time] = "'" + time; r[BK_C.status] = 'Active';
          if (x.branch) r[BK_C.branch] = cut(x.branch); if (x.svc) r[BK_C.svc] = cut(x.svc, 200); if (x.doc) r[BK_C.doc] = cut(x.doc);
          [1, 2, 3].forEach(function (j) { r[BK_C['d' + j]] = "'" + d['d' + j]; r[BK_C['r' + j]] = d['d' + j] === 'n/a' ? 'n/a · rescheduled' : ''; });
          r[BK_C.log] = String(r[BK_C.log] || '') + ' | moved from ' + old + ' to ' + appt + ' ' + time + ' (booking email)' + stamp;
        }
        if (cut(x.notes)) r[BK_C.notes] = (String(r[BK_C.notes] || '') ? r[BK_C.notes] + '\n' : '') + cut(x.notes, 600) + ' (' + who.name + ')';
        sh.getRange(2 + at, 1, 1, BK_COLS.length).setValues([r]);
        return { ok: true, updated: mode };
      }
      if (mode === 'cancel') return { ok: true, none: true }; // nothing saved to cancel (booked before this, or by another way)
    }
    const d = bkDues_(appt, today), was = mode === 'move' && x.oldDate ? 'Moved from ' + ymdOf_(x.oldDate) + ' ' + hmOf_(x.oldTime) + '. ' : '';
    const row = [id, new Date(), who.name, who.email, who.name, who.email, cut(x.name), "'" + cut(x.phone, 30), cut(x.branch), cut(x.svc, 200), cut(x.doc), cut(x.kind, 40),
      "'" + appt, "'" + time, "'" + cut(x.odoo, 40), 'Active', "'" + d.d1, d.d1 === 'n/a' ? 'n/a · booked the same day' : '', "'" + d.d2, d.d2 === 'n/a' ? 'n/a · booked the same day' : '', "'" + d.d3, '', (was + cut(x.notes, 600)).trim(), (mode === 'move' ? 'Saved from a date change ' : 'Booked ') + bkNow_()];
    sh.appendRow(row);
    return { ok: true, dues: d, created: true };
  } finally { lock.releaseLock(); }
}
// One row → the calls that still matter. state: due (today), late (past its day, still worth calling), soon (coming), missed (its moment passed)
function bkCalls_(r, today) {
  const st = String(r[BK_C.status] || 'Active').toLowerCase();
  if (/cancel|no-?show|done|ملغي/.test(st)) return [];
  const appt = ymdOf_(r[BK_C.date]), out = [];
  [1, 2, 3].forEach(function (k) {
    const due = ymdOf_(r[BK_C['d' + k]]), res = bkRes_(r[BK_C['r' + k]]);
    if (!due || BK_DONE_[res.key]) return;
    let state = due > today ? 'soon' : due === today ? 'due' : 'late';
    if (k < 3 && state === 'late' && appt <= today) state = appt === today && k === 2 ? 'due' : 'missed';
    if (k === 1 && appt <= today) state = 'missed';
    out.push({ call: k, due: due, state: state, tries: res.tries });
  });
  return out;
}
function bkItem_(r, row, c, full) {
  const o = { id: row, call: c.call, due: c.due, state: c.state, tries: c.tries, to: String(r[BK_C.to]), cust: String(r[BK_C.cust]), branch: String(r[BK_C.branch]), svc: String(r[BK_C.svc]),
    doc: String(r[BK_C.doc]), kind: String(r[BK_C.kind]), date: ymdOf_(r[BK_C.date]), time: hmOf_(r[BK_C.time]), notes: String(r[BK_C.notes] || '') };
  if (full) { o.phone = String(r[BK_C.phone]).replace(/^'/, ''); o.odoo = String(r[BK_C.odoo]).replace(/^'/, ''); }
  return o;
}
function bkAll_(today) { // every open call, with the Roster days off of whoever has it
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BK_NAME), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  const n = sh.getLastRow() - 1, from = Math.max(0, n - 600);
  sh.getRange(2 + from, 1, n - from, BK_COLS.length).getValues().forEach(function (r, i) {
    bkCalls_(r, today).forEach(function (c) { if (c.state !== 'missed' || c.due >= addDays_(today, -2)) out.push({ r: r, row: 2 + from + i, c: c }); });
  });
  return out;
}
function bkOffOn_(name, ymd, ro) {
  const days = String((ro.daysOff || {})[name] || ''), wd = DAY_NAMES_[new Date(ymd + 'T12:00:00Z').getUTCDay()];
  return days.split(/\s*,\s*/).indexOf(wd) >= 0;
}
function kbCalls_(p) {
  const who = kbWho_(p.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), lead = bkLead_(who), ro = readRoster_();
  const items = bkAll_(today).filter(function (x) { return lead || bkMine_(x.r, who); }).map(function (x) {
    const o = bkItem_(x.r, x.row, x.c, true); o.mine = bkMine_(x.r, who); o.off = bkOffOn_(o.to, x.c.due > today ? x.c.due : today, ro); return o;
  });
  return { ok: true, today: today, lead: lead, agents: lead ? ro.agents : [], items: items };
}
function kbCall_(b) {
  const who = kbWho_(b.session);
  if (!who) return { ok: false, error: 'signed_out' };
  const sh = bkSheet_(), row = Math.floor(Number(b.id)), k = Math.floor(Number(b.call));
  if (!(row >= 2 && row <= sh.getLastRow()) || [1, 2, 3].indexOf(k) < 0) return { ok: false, error: 'not_found' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const rg = sh.getRange(row, 1, 1, BK_COLS.length), r = rg.getValues()[0];
    if (!bkMine_(r, who) && !bkLead_(who)) return { ok: false, error: 'not_yours' };
    const res = String(b.result || ''), ok = { confirmed: 1, noanswer: 1, rescheduled: 1, cancelled: 1, went: 1, noshow: 1 };
    if (!ok[res]) return { ok: false, error: 'bad_result' };
    const stamp = ' · ' + who.name + ' · ' + bkNow_(), note = String(b.note || '').trim().slice(0, 500);
    const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const set = function (c, v) { r[c] = v; };
    if (res === 'noanswer') set(BK_C['r' + k], 'noanswer (' + (bkRes_(r[BK_C['r' + k]]).tries + 1) + ')' + stamp);
    else if (res === 'rescheduled') {
      const nd = ymdOf_(b.date), nt = hmOf_(b.time);
      if (!nd || nd < today) return { ok: false, error: 'bad_date' };
      const old = ymdOf_(r[BK_C.date]) + ' ' + hmOf_(r[BK_C.time]), d = bkDues_(nd, today);
      set(BK_C.date, "'" + nd); set(BK_C.time, "'" + nt);
      // all 3 calls start again for the new day; the move is kept in the Log column
      [1, 2, 3].forEach(function (j) { set(BK_C['d' + j], "'" + d['d' + j]); set(BK_C['r' + j], d['d' + j] === 'n/a' ? 'n/a · rescheduled' : ''); });
      set(BK_C.log, String(r[BK_C.log] || '') + ' | call ' + k + ': moved from ' + old + ' to ' + nd + ' ' + nt + stamp);
      set(BK_C.status, 'Active');
    } else {
      set(BK_C['r' + k], res + (b.rating ? ' ' + Math.max(1, Math.min(5, Math.floor(Number(b.rating)))) + '/5' : '') + stamp);
      if (res === 'cancelled') { set(BK_C.status, 'Cancelled'); [1, 2, 3].forEach(function (j) { if (j !== k && !BK_DONE_[bkRes_(r[BK_C['r' + j]]).key]) set(BK_C['r' + j], 'n/a · cancelled'); }); }
      if (res === 'noshow') set(BK_C.status, 'No-show');
      if (res === 'went') { set(BK_C.status, 'Done'); [1, 2].forEach(function (j) { if (!BK_DONE_[bkRes_(r[BK_C['r' + j]]).key]) set(BK_C['r' + j], 'n/a · visit done'); }); }
    }
    if (note) set(BK_C.notes, (String(r[BK_C.notes] || '') ? r[BK_C.notes] + '\n' : '') + 'Call ' + k + ': ' + note + ' (' + who.name + ')');
    rg.setValues([r]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function kbAssign_(b) {
  const who = kbWho_(b.session);
  if (!who || !bkLead_(who)) return { ok: false, error: who ? 'forbidden' : 'signed_out' };
  const sh = bkSheet_(), row = Math.floor(Number(b.id)), ro = readRoster_(), to = String(b.to || '').trim();
  if (!(row >= 2 && row <= sh.getLastRow())) return { ok: false, error: 'not_found' };
  if (ro.agents.indexOf(to) < 0) return { ok: false, error: 'bad_agent' };
  const log = sh.getRange(row, BK_C.log + 1);
  sh.getRange(row, BK_C.to + 1, 1, 2).setValues([[to, String(ro.emails[to] || '').toLowerCase()]]);
  log.setValue(String(log.getValue() || '') + ' | given to ' + to + ' · ' + who.name + ' · ' + bkNow_());
  // tell the new agent right away, with the customer's number
  const em = String(ro.emails[to] || '').trim();
  if (em) {
    const r = sh.getRange(row, 1, 1, BK_COLS.length).getValues()[0];
    try {
      MailApp.sendEmail({ to: em, name: KB_SENDER, subject: 'New follow-up call for you: ' + String(r[BK_C.cust]),
        htmlBody: mailWrap_('A follow-up call was given to you', mailBox_('📞 From ' + esc_(who.name), '<p style="margin:0 0 6px">' + esc_(who.name) + ' gave you the booking follow-up of <b>' + esc_(r[BK_C.cust]) + '</b>' + bkPh_(r) + ', appointment ' + esc_(ymdOf_(r[BK_C.date])) + ' ' + esc_(hmOf_(r[BK_C.time])) + (r[BK_C.branch] ? ', ' + esc_(brEn_(r[BK_C.branch])) + ' branch' : '') + (r[BK_C.svc] && !AR_RE_.test(String(r[BK_C.svc])) ? ' (' + esc_(r[BK_C.svc]) + ')' : '') + '.</p>' +
          '<p style="margin:0;color:#555">All details are in the "📞 Follow-up calls" tab of the Knowledge Base. After the call, press the result.</p>')) });
    } catch (e) {}
  }
  return { ok: true, emailed: !!em };
}
// 10 am: each agent with calls today gets one short email, with the customers' numbers.
// Agents who are off today (Roster days off) get nothing; the 3 pm team leads report shows their calls to give to someone else.
function kbCallsReminder() {
  const tz = Session.getScriptTimeZone(), now = new Date();
  if (Utilities.formatDate(now, tz, 'u') === '5') return 'friday';
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), ro = readRoster_(), by = {};
  bkAll_(today).forEach(function (x) { if ((x.c.state === 'due' || x.c.state === 'late') && !bkOffOn_(String(x.r[BK_C.to]), today, ro)) { const em = String(x.r[BK_C.toEmail] || ro.emails[x.r[BK_C.to]] || '').trim(); if (em) (by[em] = by[em] || []).push(x); } });
  const names = ['', 'Confirm the appointment (the day before)', 'Reminder on the day', 'After the visit: did they go, and how was it?'];
  let sent = 0;
  Object.keys(by).forEach(function (em) {
    const L = by[em].sort(function (a, b) { return a.c.call - b.c.call; });
    const body = mailBox_('📞 Your follow-up calls today (' + L.length + ')', '<ol style="margin:0;padding-inline-start:20px">' + L.map(function (x) {
      return '<li style="margin-bottom:6px"><b>' + esc_(names[x.c.call]) + '</b>: ' + esc_(x.r[BK_C.cust]) + bkPh_(x.r) + ' · ' + esc_(ymdOf_(x.r[BK_C.date])) + ' ' + esc_(hmOf_(x.r[BK_C.time])) + (x.r[BK_C.branch] ? ' · ' + esc_(brEn_(x.r[BK_C.branch])) : '') + (x.c.state === 'late' ? ' <span style="color:#A63D63">(late)</span>' : '') + '</li>';
    }).join('') + '</ol><p style="margin:8px 0 0;color:#555">All details are in the "📞 Follow-up calls" tab of the Knowledge Base. After each call, press the result so the reminder stops.</p>');
    MailApp.sendEmail({ to: em, name: KB_SENDER, subject: 'Your follow-up calls today: ' + L.length, htmlBody: mailWrap_('Good morning 🌸', body) }); sent++;
  });
  // the management copy: every call for today, per agent, with who is off (Operations team leads, Owner, Chief)
  const mgmt = rosterPeople_().filter(function (p) { return isEvalRole_(p.role) && /operation|اوبريشن|أوبريشن|owner|chief/i.test(p.role); }).map(function (p) { return p.email; });
  const all = bkAll_(today).filter(function (x) { return x.c.state === 'due' || x.c.state === 'late'; });
  if (mgmt.length && all.length) {
    const per = {}; all.forEach(function (x) { const n = String(x.r[BK_C.to]); (per[n] = per[n] || []).push(x); });
    const cnt = [0, 0, 0, 0]; all.forEach(function (x) { cnt[x.c.call]++; });
    const late = all.filter(function (x) { return x.c.state === 'late'; }).length;
    const sum = '<p style="margin:0 0 10px">' + all.length + ' calls today: ' + cnt[1] + ' confirmations, ' + cnt[2] + ' same-day reminders, ' + cnt[3] + ' after-visit calls' + (late ? ', of which <b style="color:#A63D63">' + late + ' late</b>' : '') + '.</p>';
    const list = Object.keys(per).sort().map(function (n) {
      const off = bkOffOn_(n, today, ro);
      return '<p style="margin:10px 0 4px"><b>' + esc_(n) + '</b> (' + per[n].length + ')' + (off ? ' <span style="color:#A63D63;font-weight:bold">· Off today: give the calls to someone else from the Knowledge Base</span>' : '') + '</p><ul style="margin:0;padding-inline-start:20px">' +
        per[n].sort(function (a, b) { return a.c.call - b.c.call; }).map(function (x) { return '<li>' + esc_(names[x.c.call]) + ': ' + esc_(x.r[BK_C.cust]) + bkPh_(x.r) + ' · ' + esc_(ymdOf_(x.r[BK_C.date])) + ' ' + esc_(hmOf_(x.r[BK_C.time])) + (x.r[BK_C.branch] ? ' · ' + esc_(brEn_(x.r[BK_C.branch])) : '') + (x.c.state === 'late' ? ' <span style="color:#A63D63">(late)</span>' : '') + (x.c.tries ? ' · no answer ' + x.c.tries + 'x' : '') + '</li>'; }).join('') + '</ul>';
    }).join('');
    MailApp.sendEmail({ to: mgmt.join(','), name: KB_SENDER, subject: 'Booking follow-up calls today: ' + all.length, htmlBody: mailWrap_('Follow-up calls today', mailBox_('📞 Plan of the day', sum + list) + '<p style="color:#555;font-size:13px">At 3 pm the team leads report will show which calls are still open.</p>') });
    sent++;
  }
  return 'sent ' + sent;
}
// For the 3 pm team leads report: calls still open today, late ones, and agents who are off with calls.
function bkLeadsBox_(today) {
  const ro = readRoster_(), open = bkAll_(today).filter(function (x) { return x.c.state === 'due' || x.c.state === 'late'; });
  if (!open.length) return '';
  const per = {}; open.forEach(function (x) { const n = String(x.r[BK_C.to]); (per[n] = per[n] || []).push(x); });
  return mailBox_('📞 Booking follow-up calls still open (' + open.length + ')', Object.keys(per).sort().map(function (n) {
    const off = bkOffOn_(n, today, ro), late = per[n].filter(function (x) { return x.c.state === 'late'; }).length;
    return '<p style="margin:0 0 6px"><b>' + esc_(n) + '</b>: ' + per[n].length + ' calls' + (late ? ', ' + late + ' late' : '') + (off ? ' <span style="color:#A63D63">· off today, give them to someone else</span>' : '') + '</p>';
  }).join('') + '<p style="margin:6px 0 0;color:#777;font-size:13px">Details, and giving a call to someone else, are in the "📞 Follow-up calls" tab of the Knowledge Base.</p>');
}


// ---------- Raw call data: random calls straight from the phone system's call log ----------
// The owner puts the link of the raw call data Google Sheet (the phone system export, updated every working day) in
// Settings. The tool then picks a real call at random on the server: ANSWERED calls with 1 minute or more of talk time
// for that agent, never a call that was already evaluated, picked in the last 3 days, or turned down with a reason.
// Every pick is written to the 'Call picks' tab, so who picked what, and why a call was skipped, can always be checked.
// Agents are matched to the Roster by their extension (Roster column I), else by name.
const PICKS_NAME = 'Call picks';
const PICK_COLS = ['Picked at', 'Call ID', 'Call time', 'Agent', 'Picked by', 'Status', 'Reason', 'Evaluation ID'];
const PICK_HOLD_DAYS = 3; // a call picked but not evaluated goes back into the pool after this
const CALL_MIN_TALK = 60;

function sheetIdOf_(s) {
  s = String(s || '').trim();
  const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}
function picksSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PICKS_NAME);
  if (!sh) {
    sh = ss.insertSheet(PICKS_NAME);
    sh.appendRow(PICK_COLS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PICK_COLS.length).setFontWeight('bold');
  }
  return sh;
}
// "04/11/2026 06:33:32 PM", "2026-11-04 18:33:32" or a date cell → { day: '2026-11-04', time: '18:33' }
function callWhen_(v, tz) {
  if (v instanceof Date) return { day: Utilities.formatDate(v, tz, 'yyyy-MM-dd'), time: Utilities.formatDate(v, tz, 'HH:mm') };
  const s = String(v || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i.exec(s);
  if (m) {
    let hh = +m[4];
    if (m[6]) { const pm = /p/i.test(m[6]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
    return { day: m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2), time: ('0' + hh).slice(-2) + ':' + m[5] };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})/.exec(s);
  if (m) return { day: m[1] + '-' + m[2] + '-' + m[3], time: ('0' + m[4]).slice(-2) + ':' + m[5] };
  return null;
}
// Matches "Yara Mohamed<5006>" to a Roster agent: by extension (Roster column I) first, then by name.
function callAgent_(from, ro) {
  const m = /^(.*?)\s*<\s*(\d+)\s*>\s*$/.exec(String(from || ''));
  const pbx = (m ? m[1] : String(from || '')).trim(), ext = m ? m[2] : '';
  if (ext && ro.exts[ext]) return { name: ro.exts[ext], pbx: pbx, ext: ext };
  const k = nameKey_(pbx);
  if (!k) return { name: '', pbx: pbx, ext: ext };
  let hit = ro.agents.filter(function (n) { return nameKey_(n) === k; });
  if (!hit.length && k.length >= 4) hit = ro.agents.filter(function (n) { const y = nameKey_(n); return y.length >= 4 && (y.indexOf(k) === 0 || k.indexOf(y) === 0); });
  return { name: hit.length === 1 ? hit[0] : '', pbx: pbx, ext: ext };
}
// The raw call data, read fresh every time (it is updated at the end of every working day).
function readCalls_() {
  const id = sheetIdOf_(config_().callsSource);
  if (!id) throw new Error('calls_off');
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (err) { throw new Error('calls_no_access'); }
  const sh = ss.getSheets()[0], tz = ss.getSpreadsheetTimeZone();
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const col = function (names) { for (let i = 0; i < names.length; i++) { const at = head.indexOf(names[i]); if (at !== -1) return at; } return -1; };
  const c = { id: col(['id', 'call id']), time: col(['time', 'start time', 'date']), from: col(['call from', 'from']), to: col(['call to', 'to']),
    status: col(['last status', 'status']), talk: col(['handling duration', 'talk duration', 'talk time']), type: col(['communication type', 'type']) };
  if (c.id < 0 || c.time < 0 || c.from < 0 || c.status < 0 || c.talk < 0) throw new Error('calls_bad_columns');
  const width = Math.max(c.id, c.time, c.from, c.to, c.status, c.talk, c.type) + 1;
  const out = [];
  sh.getRange(2, 1, lastRow - 1, width).getValues().forEach(function (r) {
    const when = callWhen_(r[c.time], tz), cid = String(r[c.id] || '').trim();
    if (!when || !cid) return;
    out.push({ id: cid, day: when.day, time: when.time, from: String(r[c.from] || ''), to: c.to >= 0 ? String(r[c.to] || '').replace(/[^\d+]/g, '') : '',
      status: String(r[c.status] || '').trim().toUpperCase(), talk: Number(r[c.talk]) || 0, type: c.type >= 0 ? String(r[c.type] || '') : '' });
  });
  return out;
}
// Calls that can't be picked again: evaluated, turned down with a reason, or picked in the last few days.
function usedCalls_() {
  const used = {};
  const ph = picksSheet_();
  if (ph.getLastRow() > 1) {
    const hold = Date.now() - PICK_HOLD_DAYS * 864e5;
    ph.getRange(2, 1, ph.getLastRow() - 1, PICK_COLS.length).getValues().forEach(function (r) {
      const st = String(r[5]), at = new Date(r[0]).getTime() || 0;
      if (st === 'evaluated' || st === 'skipped' || (st === 'picked' && at >= hold)) used[String(r[1])] = st;
    });
  }
  const sh = sheet_(), n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, JSON_COL, n, 1).getValues().forEach(function (x) {
    const m = /"callId":"([^"]+)"/.exec(String(x[0]));
    if (m && !/"test":true/.test(String(x[0]))) used[m[1]] = 'evaluated';
  });
  return used;
}
// Another (non-test) evaluation already has this call → its evaluation ID.
function callTakenBy_(sh, r) {
  if (!r.callId || r.test) return '';
  const n = sh.getLastRow() - 1; if (n < 1) return '';
  const json = sh.getRange(2, JSON_COL, n, 1).getValues();
  for (let i = 0; i < json.length; i++) {
    const s = String(json[i][0]);
    if (s.indexOf('"callId":"' + r.callId + '"') === -1) continue;
    let x; try { x = JSON.parse(s); } catch (e) { continue; }
    if (x && x.id !== r.id && !x.test && x.callId === r.callId) return evalId_(x);
  }
  return '';
}
function markPick_(callId, evalId) {
  const ph = picksSheet_(), n = ph.getLastRow() - 1;
  if (n < 1) return;
  const ids = ph.getRange(2, 2, n, 1).getValues();
  for (let i = n - 1; i >= 0; i--) if (String(ids[i][0]) === String(callId)) { ph.getRange(i + 2, 6, 1, 3).setValues([['evaluated', '', evalId]]); return; }
}
// Today and the last n working days before it (closed days skipped), in the script's time zone: { from, to } as YYYY-MM-DD.
function pickWindow_(n, closed) {
  const tz = Session.getScriptTimeZone() || 'Africa/Cairo';
  const off = (Array.isArray(closed) ? closed : String(closed === undefined ? 'Fri' : closed).split(/[,\s]+/)).map(String);
  const d = new Date(), to = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  let left = n, from = to, guard = 0;
  while (left > 0 && guard++ < 40) {
    d.setTime(d.getTime() - 864e5);
    if (off.indexOf(Utilities.formatDate(d, tz, 'EEE')) !== -1) continue;
    from = Utilities.formatDate(d, tz, 'yyyy-MM-dd'); left--;
  }
  return { from: from, to: to };
}
// body: { agent, from, to (YYYY-MM-DD, inclusive; clamped to the pick window), prev, why }
function pickCall_(b, me) {
  const ro = readRoster_();
  const agent = String(b.agent || '').trim();
  if (!agent) return { ok: false, error: 'pick_need_agent' };
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  let from = ymd.test(b.from) ? b.from : '', to = ymd.test(b.to) ? b.to : '';
  if (!from || !to) return { ok: false, error: 'Bad range' };
  let calls;
  try { calls = readCalls_(); } catch (err) { return { ok: false, error: err.message }; }
  const dataTo = calls.reduce(function (m, x) { return x.day > m ? x.day : m; }, '');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ph = picksSheet_();
    // A re-pick turns the previous call down, with its reason, so it never comes back.
    if (b.prev && b.why) {
      const n = ph.getLastRow() - 1;
      if (n > 0) {
        const rows = ph.getRange(2, 1, n, PICK_COLS.length).getValues();
        for (let i = n - 1; i >= 0; i--) if (String(rows[i][1]) === String(b.prev) && String(rows[i][5]) === 'picked') { ph.getRange(i + 2, 6, 1, 2).setValues([['skipped', String(b.why).slice(0, 60)]]); break; }
      }
    }
    const used = usedCalls_(), key = nameKey_(agent), mine = {};
    const pool = function (f, t) {
      return calls.filter(function (x) {
        if (x.status !== 'ANSWERED' || x.talk < CALL_MIN_TALK || x.day < f || x.day > t || used[x.id]) return false;
        if (!(x.from in mine)) mine[x.from] = nameKey_(callAgent_(x.from, ro).name) === key;
        return mine[x.from];
      });
    };
    // Both levels (agreed with Mohamed): the call is at most N working days old (Settings pickDays, default 3),
    // counted back from today and skipping the closed days (Friday). Enforced here, whatever the page sends, and never widened.
    const cfg = config_(), wd = Math.max(1, Math.min(31, Math.round(Number(cfg.pickDays) || 3)));
    const win = pickWindow_(wd, cfg.closedDays);
    if (from < win.from) from = win.from;
    if (to > win.to) to = win.to;
    const list = from <= to ? pool(from, to) : [], wider = false;
    if (!list.length) return { ok: true, none: true, dataTo: dataTo, winFrom: win.from, winDays: wd, agentCalls: calls.filter(function (x) { return mine[x.from]; }).length };
    const x = list[Math.floor(Math.random() * list.length)];
    ph.appendRow([new Date(), x.id, x.day + ' ' + x.time, agent, me.name || 'Owner', 'picked', '', '']);
    return { ok: true, wider: wider, dataTo: dataTo, winFrom: win.from, winDays: wd, pool: list.length,
      call: { id: x.id, day: x.day, time: x.time, num: x.to, talk: x.talk, pbx: callAgent_(x.from, ro).pbx, ext: callAgent_(x.from, ro).ext } };
  } finally {
    lock.releaseLock();
  }
}
// Owner check in Settings: how much data there is and which phone system names aren't matched to the Roster.
function callsInfo_() {
  let calls;
  try { calls = readCalls_(); } catch (err) { return { ok: false, error: err.message }; }
  const ro = readRoster_(), agents = {};
  let from = '', to = '', ok = 0;
  calls.forEach(function (x) {
    if (!from || x.day < from) from = x.day;
    if (x.day > to) to = x.day;
    const good = x.status === 'ANSWERED' && x.talk >= CALL_MIN_TALK;
    if (good) ok++;
    const a = agents[x.from] || (agents[x.from] = Object.assign(callAgent_(x.from, ro), { calls: 0, good: 0 }));
    a.calls++; if (good) a.good++;
  });
  const list = Object.keys(agents).map(function (k) { return agents[k]; }).sort(function (p, q) { return q.good - p.good; });
  const matched = {}; list.forEach(function (a) { if (a.name) matched[nameKey_(a.name)] = 1; });
  return { ok: true, rows: calls.length, good: ok, from: from, to: to, agents: list,
    rosterMissing: ro.agents.filter(function (n) { return !matched[nameKey_(n)]; }) };
}
// Run once from the editor (select it, then Run) if Google asks for permission to open the raw call data sheet.
function authorizeCalls() {
  const id = sheetIdOf_(config_().callsSource);
  Logger.log(id ? SpreadsheetApp.openById(id).getName() : 'Put the raw call data link in the tool Settings first.');
}


// ---------- Promises to customers (call back at a time, send offers / location on WhatsApp) ----------
// The evaluator notes the promise in the evaluation; the call's own score never changes because of it. Promised calls
// are checked against the raw call data: any call to the same number (last 9 digits) from 30 minutes before the promised
// time to promiseTolMin after it is on time (no time given = any time that day). COPC: call backs are deferred
// interactions, measured On Time against a target cycle time. WhatsApp promises are marked sent / not sent by hand.
function phoneKey_(v) { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : ''; }
function promises_() {
  const sh = sheet_(), n = sh.getLastRow() - 1;
  const recs = [];
  if (n > 0) sh.getRange(2, JSON_COL, n, 1).getValues().forEach(function (x) {
    const s = String(x[0]); if (s.indexOf('"promises"') === -1) return;
    try { const r = JSON.parse(s); if (r && !r.test && Array.isArray(r.promises) && r.promises.length) recs.push(r); } catch (e) {}
  });
  let calls = [], dataTo = '', callsErr = '';
  if (recs.some(function (r) { return r.promises.some(function (q) { return q.kind === 'call'; }); })) {
    try { calls = readCalls_(); calls.forEach(function (c) { if (c.day > dataTo) dataTo = c.day; }); } catch (err) { callsErr = err.message; }
  }
  const byNum = {};
  calls.forEach(function (c) { const k = phoneKey_(c.to); if (k) (byNum[k] = byNum[k] || []).push(c); });
  const tol = Number(config_().promiseTolMin) || 60, ro = readRoster_();
  const mins = function (day, hm) { const t = String(hm || '00:00').split(':'); return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +t[0] || 0, +t[1] || 0) / 60000; };
  const lastDataMin = dataTo ? mins(dataTo, '23:59') : 0;
  const out = [];
  recs.forEach(function (r) {
    const evalCall = String(r.interactionDate || '').replace('T', ' ');
    const startMin = evalCall.length >= 16 ? mins(evalCall.slice(0, 10), evalCall.slice(11, 16)) + 1 : 0;
    r.promises.forEach(function (q, i) {
      const item = { evalId: evalId_(r), id: r.id, agent: r.agent, evaluator: r.evaluator, callAt: evalCall, i: i, kind: q.kind, what: q.what || '', due: q.due || '', time: q.time || '', mark: q.mark || null, status: 'pending' };
      if (q.kind === 'call') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.due)) { item.status = 'nodate'; out.push(item); return; }
        const from = item.time ? mins(item.due, item.time) - 30 : mins(item.due, '00:00');
        const to = item.time ? mins(item.due, item.time) + tol : mins(item.due, '23:59');
        const list = (byNum[phoneKey_(r.phone)] || []).map(function (c) { return { c: c, m: mins(c.day, c.time) }; })
          .filter(function (x) { return x.m >= startMin && x.c.id !== r.callId; }).sort(function (a, b) { return a.m - b.m; });
        const inWin = list.filter(function (x) { return x.m >= from && x.m <= to; })[0];
        const after = list.filter(function (x) { return x.m > to; })[0], before = list.filter(function (x) { return x.m < from; })[0];
        const hit = inWin || after || before;
        if (!phoneKey_(r.phone)) item.status = 'nophone';
        else if (inWin) item.status = 'ontime';
        else if (!dataTo || lastDataMin < to) item.status = after ? 'late' : 'pending';
        else item.status = after ? 'late' : before ? 'early' : 'missed';
        if (hit) item.match = { id: hit.c.id, at: hit.c.day + ' ' + hit.c.time, by: callAgent_(hit.c.from, ro).name || callAgent_(hit.c.from, ro).pbx, status: hit.c.status, talk: hit.c.talk };
      } else item.status = q.mark ? (q.mark.ok ? 'sent' : q.mark.blocked ? 'blocked' : 'notsent') : 'pending';
      out.push(item);
    });
  });
  return { ok: true, items: out, dataTo: dataTo, callsError: callsErr, tolMin: tol };
}
function promiseMark_(b, me) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(), at = findRow_(sh, b.id);
    if (at === -1) return { ok: false, error: 'Not found' };
    const r = JSON.parse(sh.getRange(at, JSON_COL).getValue());
    const q = (r.promises || [])[Number(b.i)];
    if (!q) return { ok: false, error: 'Not found' };
    // blocked = our WhatsApp number was blocked, so the agent couldn't send it (not the agent's fault; counted apart)
    q.mark = b.clear ? null : { ok: !!b.sent, blocked: !b.sent && !!b.blocked, by: me.name || 'Owner', at: new Date().toISOString() };
    sh.getRange(at, JSON_COL).setValue(JSON.stringify(r));
    return { ok: true, record: r };
  } finally {
    lock.releaseLock();
  }
}

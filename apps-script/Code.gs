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
const SHEET_NAME = 'Evaluations';
const ROSTER_NAME = 'Roster';
const COLUMNS = ['Saved at', 'ID', 'Form', 'Agent', 'Evaluator', 'Evaluation date', 'Interaction date',
  'Odoo ref', 'Interaction type', 'Outcome', 'Duration', 'KB version', 'Calibration sample',
  'NC score', 'CC accuracy', 'EU accuracy', 'BC accuracy', 'Critical errors', 'Final score', 'Result',
  'Missed items', 'Strengths', 'Areas to improve', 'Coaching', 'Record (JSON)', 'Purpose', 'Test', 'Customer phone', 'Edited at', 'Edited by'];
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
    sh.appendRow(['Name', 'Role (Agent / Evaluator)', 'Active (Yes / No)']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
  return sh;
}

function nameKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

function readRoster_() {
  const sh = roster_();
  const out = { agents: [], evaluators: [] };
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    const name = String(r[0] || '').trim();
    if (!name || String(r[2]).toLowerCase() === 'no') return;
    if (String(r[1]).toLowerCase().indexOf('eval') === 0) out.evaluators.push(name); else out.agents.push(name);
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
      return nameKey_(r[0]) === nameKey_(name) && String(r[1]).charAt(0).toLowerCase() === label.charAt(0).toLowerCase();
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
  const first = role === 'evaluators' ? 'e' : 'a';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ro = roster_();
    let kept = false;
    if (ro.getLastRow() > 1) {
      const rng = ro.getRange(2, 1, ro.getLastRow() - 1, 3), rows = rng.getValues();
      rows.forEach(function (r) {
        if (String(r[1]).charAt(0).toLowerCase() !== first) return;
        if (nameKey_(r[0]) === nameKey_(from) || nameKey_(r[0]) === nameKey_(to)) {
          if (!kept) { r[0] = to; r[2] = 'Yes'; kept = true; } else { r[2] = 'No'; }
        }
      });
      rng.setValues(rows);
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
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// Take a person off the list (Active = No). Past evaluations keep the name.
function removePerson_(role, name) {
  const first = role === 'evaluators' ? 'e' : 'a';
  const ro = roster_();
  if (ro.getLastRow() < 2) return { ok: true };
  const rng = ro.getRange(2, 1, ro.getLastRow() - 1, 3), rows = rng.getValues();
  rows.forEach(function (r) {
    if (String(r[1]).charAt(0).toLowerCase() === first && nameKey_(r[0]) === nameKey_(name)) r[2] = 'No';
  });
  rng.setValues(rows);
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
    r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live'), r.test ? 'Yes' : 'No',
    r.phone ? "'" + r.phone : '', r.editedAt || '', r.editedBy || ''];
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
    if (row === -1) { sh.appendRow(row_(r, new Date())); format_(sh, sh.getLastRow()); return { ok: true, added: true }; }
    const savedAt = sh.getRange(row, 1).getValue();
    sh.getRange(row, 1, 1, COLUMNS.length).setValues([row_(r, savedAt)]);
    format_(sh, row);
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
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
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

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== ACCESS_KEY) return reply_({ ok: false, error: 'Wrong access key' });
    if (body.action === 'addPerson') return reply_(addPerson_(body.role, body.name));
    if (body.action === 'renamePerson') return reply_(renamePerson_(body.role, body.from, body.to));
    if (body.action === 'removePerson') return reply_(removePerson_(body.role, body.name));
    if (body.action === 'updateRecord') return reply_(updateRecord_(body.record));
    if (body.action === 'addKb') return reply_(addKb_(body.update));
    if (body.action === 'deleteRecord') return reply_(deleteRecord_(body.id, body.by));
    const r = body.record;
    if (!r || !r.id || !Array.isArray(r.items)) return reply_({ ok: false, error: 'Bad record' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_();
      if (sh.getLastColumn() < COLUMNS.length) sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat() : [];
      if (ids.indexOf(r.id) !== -1) return reply_({ ok: true, duplicate: true });
      if (deletedIds_().indexOf(r.id) !== -1) return reply_({ ok: true, deleted: true });
      sh.appendRow(row_(r, new Date()));
      format_(sh, sh.getLastRow());
    } finally {
      lock.releaseLock();
    }
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.key !== ACCESS_KEY) return reply_({ ok: false, error: 'Wrong access key' });
  if (p.action === 'kb') return reply_({ ok: true, updates: readKb_() });
  if (p.action === 'roster') {
    const ro = readRoster_();
    return reply_({ ok: true, agents: ro.agents, evaluators: ro.evaluators });
  }
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return reply_({ ok: true, records: [], deleted: deletedIds_() });
  const json = sh.getRange(2, JSON_COL, n, 1).getValues().flat();
  const records = [];
  json.forEach(function (s) { try { records.push(JSON.parse(s)); } catch (err) {} });
  return reply_({ ok: true, records: records, deleted: deletedIds_() });
}

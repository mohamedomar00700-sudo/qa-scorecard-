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
  'Missed items', 'Strengths', 'Areas to improve', 'Coaching', 'Record (JSON)'];

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

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== ACCESS_KEY) return reply_({ ok: false, error: 'Wrong access key' });
    if (body.action === 'addPerson') return reply_(addPerson_(body.role, body.name));
    const r = body.record;
    if (!r || !r.id || !Array.isArray(r.items)) return reply_({ ok: false, error: 'Bad record' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_();
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat() : [];
      if (ids.indexOf(r.id) !== -1) return reply_({ ok: true, duplicate: true });
      const missed = r.items.filter(function (i) { return i.result === 'Not met' || i.result === 'Error'; })
        .map(function (i) { return i.id + ' ' + i.text; }).join(' | ');
      const fb = r.feedback || {};
      sh.appendRow([new Date(), r.id, r.form, r.agent, r.evaluator, r.evalDate, r.interactionDate, r.odooRef,
        r.type, r.outcome, r.duration, r.kbVersion, r.sampleRef, r.ncScore, r.cc, r.eu, r.bc, r.critical,
        r.final, r.result, missed, fb.strengths, fb.improve, fb.coaching, JSON.stringify(r)]);
      const row = sh.getLastRow();
      sh.getRange(row, 14, 1, 4).setNumberFormat('0%');
      sh.getRange(row, 19).setNumberFormat('0%');
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
  if (p.action === 'roster') {
    const ro = readRoster_();
    return reply_({ ok: true, agents: ro.agents, evaluators: ro.evaluators });
  }
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return reply_({ ok: true, records: [] });
  const json = sh.getRange(2, COLUMNS.length, n, 1).getValues().flat();
  const records = [];
  json.forEach(function (s) { try { records.push(JSON.parse(s)); } catch (err) {} });
  return reply_({ ok: true, records: records });
}

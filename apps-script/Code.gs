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
  return sh;
}

// Role column: 'Evaluator (Owner)' or 'Owner' (full control, also scores), 'Evaluator' or 'Agent'. Owners count as evaluators everywhere.
function isEvalRole_(v) { return /^(eval|owner)/i.test(String(v || '').trim()); }
function roleMatches_(v, role) { return role === 'evaluators' ? isEvalRole_(v) : /^a/i.test(String(v || '').trim()); }

function nameKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}

function readRoster_() {
  const sh = roster_();
  const out = { agents: [], evaluators: [], owners: [], emails: {}, evalEmails: {} };
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const name = String(r[0] || '').trim();
    if (!name || String(r[2]).toLowerCase() === 'no') return;
    if (/owner/i.test(String(r[1]).trim())) out.owners.push(name);
    if (isEvalRole_(r[1])) { out.evaluators.push(name); if (String(r[3] || '').trim()) out.evalEmails[name] = String(r[3]).trim(); }
    else { out.agents.push(name); if (String(r[3] || '').trim()) out.emails[name] = String(r[3]).trim(); }
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

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function pct_(x) {
  return x === null || x === undefined || x === '' ? '–' : Math.round(Number(x) * 1000) / 10 + '%';
}

// Send the agent their result. Returns what goes in the 'Emailed to agent' column ('' = not sent).
function emailAgent_(r) {
  const purpose = r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live');
  // Evaluators who send from their own Outlook (mailMode 'outlook' / 'outlookweb') get no automatic email.
  if (!EMAIL_AGENTS || r.test || (purpose !== 'live' && purpose !== 'certcall' && purpose !== 'coaching') || (r.mailMode && r.mailMode !== 'auto')) return '';
  const ro = readRoster_();
  const to = ro.emails[r.agent];
  if (!to) return '';
  const evEmail = ro.evalEmails[r.evaluator] || '';
  const coaching = purpose === 'coaching', cert = purpose === 'certcall';
  try {
    const form = r.form === 'whatsapp' ? 'واتساب' : 'مكالمة';
    const when = String(r.interactionDate || '').replace('T', ' ');
    const phone = String(r.phone || '').replace(/\D/g, '');
    const ref = [r.odooRef ? 'Odoo: ' + r.odooRef : '', phone ? 'رقم العميل بينتهي بـ ' + phone.slice(-4) : ''].filter(String).join(' · ');
    const pass = r.result === 'Pass';
    const missed = (r.items || []).filter(function (i) { return i.result === 'Not met' || i.result === 'Error'; });
    const fb = r.feedback || {};
    const row = function (k, v) { return '<tr><td style="padding:4px 10px;color:#555">' + k + '</td><td style="padding:4px 10px"><b>' + v + '</b></td></tr>'; };
    let html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6">' +
      '<p>أهلاً ' + esc_(r.agent) + '،</p><p>' + (coaching ? 'ده فيدباك (مش محسوب في تقييمك) على ' : cert ? 'ده تقييم السرتيفيكيشن لـ' : 'ده تقييم الجودة لـ') + form + ' بتاريخ <span dir="ltr">' + esc_(when) + '</span>' + (ref ? ' (' + esc_(ref) + ')' : '') + '.</p>' +
      '<table style="border-collapse:collapse;background:#f6f6f6;border-radius:6px">' +
      row('النتيجة النهائية', '<span style="color:' + (pass ? '#1a7f37' : '#c62828') + '">' + pct_(r.final) + ' – ' + (pass ? 'ناجح' : 'محتاج تحسين') + '</span>') +
      row('درجة البنود العادية', pct_(r.ncScore)) +
      row('أخطاء حرجة', esc_(r.critical || 0)) +
      row('المقيّم', esc_(r.evaluator)) + '</table>';
    if (r.callTag === 'wow') html += '<p style="background:#fff4d6;padding:8px 12px;border-radius:6px">🌟 <b>مكالمة Wow!</b> المكالمة دي اتختارت كمثال مميز في مكتبة التدريب. برافو عليك.</p>';
    if (r.callTag === 'good') html += '<p style="background:#e3f4e8;padding:8px 12px;border-radius:6px">👍 <b>مكالمة كويسة جداً</b> واتحطت كمثال في مكتبة التدريب. استمر.</p>';
    if (missed.length) html += '<p><b>البنود اللي محتاجة تتظبط:</b></p><ul>' + missed.map(function (i) {
      return '<li dir="auto">' + esc_(i.text) + (i.comment ? ' – <i>' + esc_(i.comment) + '</i>' : '') + '</li>'; }).join('') + '</ul>';
    if (fb.strengths) html += '<p><b>نقاط القوة:</b><br><span dir="auto">' + esc_(fb.strengths) + '</span></p>';
    if (fb.improve) html += '<p><b>محتاج تحسين:</b><br><span dir="auto">' + esc_(fb.improve) + '</span></p>';
    if (fb.coaching) html += '<p><b>نصيحة للمرة الجاية:</b><br><span dir="auto">' + esc_(fb.coaching) + '</span></p>';
    html += '<p>لو عندك أي سؤال على التقييم كلّم ' + esc_(r.evaluator || 'فريق الجودة') + '.</p></div>';
    const mail = { to: to, subject: (coaching ? 'فيدباك – ' : cert ? 'تقييم السرتيفيكيشن – ' : 'تقييم الجودة – ') + form + ' – ' + when.slice(0, 10) + (coaching ? '' : ' – ' + pct_(r.final)),
      htmlBody: html, name: (r.evaluator ? r.evaluator + ' – ' : '') + 'Quality' };
    if (evEmail) { mail.replyTo = evEmail; mail.cc = evEmail; }
    MailApp.sendEmail(mail);
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' → ' + to;
  } catch (err) {
    return 'Not sent: ' + String(err).slice(0, 200);
  }
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
    if (row === -1) { sh.appendRow(row_(r, new Date())); format_(sh, sh.getLastRow()); return { ok: true, added: true }; }
    const savedAt = sh.getRange(row, 1).getValue();
    const vals = row_(r, savedAt);
    vals[COLUMNS.length - 1] = sh.getRange(row, COLUMNS.length).getValue(); // keep the email note
    sh.getRange(row, 1, 1, COLUMNS.length).setValues([vals]);
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
    htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px">أهلاً ' + String(who.name).replace(/[<>&]/g, '') + '،<br><br>' +
      'كود الدخول على السكور كارد: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
      'الكود شغال ' + OTP_MINUTES + ' دقايق. لو مش إنت اللي طلبته تجاهل الإيميل ده.</div>' +
      '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:13px;color:#555;margin-top:12px">Your QA Scorecard sign-in code is ' + code + '. It works for ' + OTP_MINUTES + ' minutes.</div>'
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
  return Object.assign({ monthlyTarget: 4, pickFrom: '10:00', pickTo: '21:30', pickDays: 7 }, JSON.parse(PropertiesService.getScriptProperties().getProperty('cfg') || '{}'));
}
function setConfig_(c) {
  const cur = config_();
  const n = Number(c && c.monthlyTarget);
  if (!(n >= 0 && n <= 100)) return { ok: false, error: 'Bad target' };
  cur.monthlyTarget = Math.round(n);
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (c.pickFrom && hhmm.test(c.pickFrom)) cur.pickFrom = c.pickFrom;
  if (c.pickTo && hhmm.test(c.pickTo)) cur.pickTo = c.pickTo;
  const d = Number(c.pickDays); if (d >= 1 && d <= 31) cur.pickDays = Math.round(d);
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
    if (body.action === 'otpRequest') return reply_(otpRequest_(body.email));
    if (body.action === 'otpVerify') return reply_(otpVerify_(body.email, body.code));
    const me = who_(body);
    if (!me) return reply_({ ok: false, error: body.session ? 'signed_out' : 'Wrong access key' });
    const ownerOnly = { renamePerson: 1, removePerson: 1, setEmail: 1, setConfig: 1 };
    if ((ownerOnly[body.action] || (body.action === 'addPerson' && body.role === 'evaluators')) && !me.owner) return reply_({ ok: false, error: 'not_owner' });
    if (body.action === 'addPerson') return reply_(addPerson_(body.role, body.name));
    if (body.action === 'renamePerson') return reply_(renamePerson_(body.role, body.from, body.to));
    if (body.action === 'removePerson') return reply_(removePerson_(body.role, body.name));
    if (body.action === 'setEmail') return reply_(setEmail_(body.role, body.name, body.email));
    if (body.action === 'setConfig') return reply_(setConfig_(body.config));
    if (body.action === 'addKb') return reply_(addKb_(body.update));
    if (body.action === 'updateRecord') {
      if (!body.record || !recordOwnerOk_(me, body.record.id)) return reply_({ ok: false, error: 'not_yours' });
      if (!me.owner) body.record.editedBy = me.name;
      return reply_(updateRecord_(body.record));
    }
    if (body.action === 'deleteRecord') {
      if (!recordOwnerOk_(me, body.id)) return reply_({ ok: false, error: 'not_yours' });
      return reply_(deleteRecord_(body.id, me.name || body.by));
    }
    const r = body.record;
    if (!r || !r.id || !Array.isArray(r.items)) return reply_({ ok: false, error: 'Bad record' });
    if (!me.owner) r.evaluator = me.name; // a signed-in evaluator always saves under their own name
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const sh = sheet_();
    try {
      if (sh.getLastColumn() < COLUMNS.length) sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]).setFontWeight('bold');
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat() : [];
      if (ids.indexOf(r.id) !== -1) return reply_({ ok: true, duplicate: true });
      if (deletedIds_().indexOf(r.id) !== -1) return reply_({ ok: true, deleted: true });
      sh.appendRow(row_(r, new Date()));
      format_(sh, sh.getLastRow());
    } finally {
      lock.releaseLock();
    }
    const note = emailAgent_(r);
    if (note) { const at = findRow_(sh, r.id); if (at !== -1) sh.getRange(at, COLUMNS.length).setValue(note); }
    return reply_({ ok: true, emailed: note && note.indexOf('Not sent') !== 0 ? true : false, emailNote: note });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  const me = who_(p);
  if (!me) return reply_({ ok: false, error: p.session ? 'signed_out' : 'Wrong access key' });
  if (p.action === 'config') return reply_({ ok: true, config: config_() });
  if (p.action === 'kb') return reply_({ ok: true, updates: readKb_() });
  if (p.action === 'roster') {
    const ro = readRoster_();
    return reply_({ ok: true, agents: ro.agents, evaluators: ro.evaluators, owners: ro.owners, emails: ro.emails, evalEmails: ro.evalEmails,
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
  const records = [];
  json.forEach(function (s, i) {
    if (since) {
      const t1 = new Date(savedAt[i]).getTime() || 0, t2 = new Date(editedAt[i] || 0).getTime() || 0;
      if (Math.max(t1, t2) < since) return;
    }
    try { records.push(JSON.parse(s)); } catch (err) {}
  });
  return reply_({ ok: true, records: records, deleted: deletedIds_(), now: Date.now(), partial: !!since });
}

// Run once from the editor (select it, then Run) if Google asks again for permission to send email.
function authorizeMail() {
  MailApp.getRemainingDailyQuota();
}

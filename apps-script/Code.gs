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
  return sh;
}

// Role column: 'Evaluator (Owner)' or 'Owner' (full control, also scores), 'Evaluator (Quality)', 'Evaluator (Operations)' or 'Agent'. Owners count as evaluators everywhere.
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

function readRoster_() {
  const sh = roster_();
  const out = { agents: [], evaluators: [], owners: [], quality: [], emails: {}, evalEmails: {}, daysOff: {}, certDates: {} };
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
    const name = String(r[0] || '').trim();
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
  let out = row('البنود العادية (NC)', pct_(r.ncScore) + ' (' + nc.filter(function (i) { return i.result === 'Met'; }).length + ' من ' + nc.length + ')');
  const buckets = [
    ['CC', 'دقة الكومبلاينس (CC)', r.cc],
    ['EU', 'دقة العميل (EU)', r.eu],
    ['BC', 'دقة البيزنس (BC)', r.bc]
  ];
  buckets.forEach(function (b) {
    const list = its.filter(function (i) { return i.kind === b[0] && i.result && i.result !== 'N/A'; });
    const errs = list.filter(function (i) { return i.result === 'Error'; }).length;
    if (!list.length) {
      out += row(b[1], 'مش منطبق');
    } else {
      const scorePct = pct_(b[2] !== undefined && b[2] !== null && b[2] !== '' ? b[2] : (errs ? 0 : 1));
      const status = errs ? '<span style="color:#c62828">' + scorePct + ' (✗ ' + errs + ' ' + (errs === 1 ? 'غلطة' : 'أخطاء') + ')</span>' : '<span style="color:#1a7f37">' + scorePct + ' (✓ مفيش أخطاء)</span>';
      out += row(b[1], status);
    }
  });
  return out;
}

// Send the agent their result. Returns what goes in the 'Emailed to agent' column ('' = not sent).
function emailAgent_(r) {
  const purpose = r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live');
  // Evaluators who send from their own Outlook (mailMode 'outlook' / 'outlookweb') get no automatic email.
  if (!EMAIL_AGENTS || r.test || (purpose !== 'live' && purpose !== 'certcall' && purpose !== 'coaching' && purpose !== 'postcoach') || (r.mailMode && r.mailMode !== 'auto')) return '';
  const ro = readRoster_();
  const to = ro.emails[r.agent];
  if (!to) return '';
  const evEmail = ro.evalEmails[r.evaluator] || '';
  const coaching = purpose === 'coaching', cert = purpose === 'certcall', post = purpose === 'postcoach';
  try {
    const form = r.form === 'whatsapp' ? 'واتساب' : 'مكالمة';
    const when = String(r.interactionDate || '').replace('T', ' ');
    const phone = String(r.phone || '').replace(/\D/g, '');
    const ref = [r.odooRef ? 'Odoo: ' + r.odooRef : '', phone ? 'رقم العميل بينتهي بـ ' + phone.slice(-4) : ''].filter(String).join(' · ');
    const pass = r.result === 'Pass';
    const missed = (r.items || []).filter(function (i) { return i.result === 'Not met' || i.result === 'Error'; });
    const fb = r.feedback || {};
    const row = function (k, v) { return '<tr><td style="padding:4px 10px;color:#555">' + k + '</td><td style="padding:4px 10px"><b>' + v + '</b></td></tr>'; };
    const critPct = r.critical ? '<span style="color:#c62828">0% (' + r.critical + ' ' + (r.critical === 1 ? 'غلطة' : 'أخطاء') + ')</span>' : '<span style="color:#1a7f37">100% (مفيش أخطاء)</span>';
    const isWow = r.callTag === 'wow', isGood = r.callTag === 'good';
    const banner = isWow
      ? '<div style="background:linear-gradient(135deg,#fff8e1,#ffecb3);background-color:#fff8e1;border:2px solid #f59e0b;border-right:6px solid #d97706;color:#78350f;padding:14px 18px;border-radius:10px;margin-bottom:14px"><div style="font-size:18px;font-weight:bold;margin-bottom:6px">🌟🏆 WOW CALL! Outstanding Performance — مكالمة استثنائية! (' + pct_(r.final) + ')</div><div style="font-size:14px">🎉 <b>Congratulations!</b> المكالمة دي مش بس عدّت بنجاح، دي اتختارت كـ <b>"مكالمة Wow"</b> ومثال مميز يُحتذى به في مكتبة التدريب الخاصة بالفريق. فخورين جداً بأدائك الاحترافي! 👏</div></div>'
      : coaching
        ? '<div style="background:#e8f0fe;border:1px solid #b6d4fe;border-right:5px solid #1a73e8;color:#084298;padding:12px 16px;border-radius:8px;margin-bottom:14px"><div style="font-size:16px;font-weight:bold">💡 إكسترا تارجت (غير محسوب في السكور)</div></div>'
        : pass && isGood
          ? '<div style="background:#e6f4ea;border:1.5px solid #34a853;border-right:6px solid #1a7f37;color:#135c27;padding:13px 16px;border-radius:8px;margin-bottom:14px"><div style="font-size:17px;font-weight:bold;margin-bottom:4px">🎉👍 Congratulations! مكالمة كويسة جداً وعدّيت التقييم بنجاح (PASSED – ' + pct_(r.final) + ')</div><div style="font-size:13px">أداء ممتاز! المكالمة دي اتضافت كمثال كويس في مكتبة التدريب — استمر على نفس المستوى!</div></div>'
          : pass
            ? '<div style="background:#e6f4ea;border:1px solid #a8dab5;border-right:5px solid #1a7f37;color:#135c27;padding:12px 16px;border-radius:8px;margin-bottom:14px"><div style="font-size:17px;font-weight:bold;margin-bottom:4px">🎉 Congratulations! مبروك، عدّيت التقييم بنجاح (PASSED – ' + pct_(r.final) + ')</div><div style="font-size:13px">أداء كويس والتزام بمعايير الجودة — كمّل على نفس المستوى!</div></div>'
            : '<div style="background:#fce8e6;border:1px solid #f5c2c7;border-right:5px solid #c62828;color:#842029;padding:12px 16px;border-radius:8px;margin-bottom:14px"><div style="font-size:17px;font-weight:bold;margin-bottom:4px">⚠️ التقييم لم يجتز الحد المطلوب (FAILED – ' + pct_(r.final) + ')</div><div style="font-size:13px">' + (r.critical ? 'بسبب وجود خطأ حرج (Critical Error) في التقييم. راجع النقاط بالأسفل عشان تتفاداها المرة الجاية.' : 'السكور أقل من نسبة النجاح المطلوبة. راجع البنود اللي محتاجة تظبيط بالأسفل.') + '</div></div>';
    const tagRow = isWow
      ? row('تصنيف المكالمة', '<span style="color:#b45309">🌟🏆 مكالمة Wow (مثال مميز في مكتبة التدريب)</span>')
      : isGood
        ? row('تصنيف المكالمة', '<span style="color:#1a7f37">👍 مكالمة كويسة جداً (مكتبة التدريب)</span>')
        : '';
    let html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6">' +
      banner +
      '<p>أهلاً ' + esc_(r.agent) + '،</p><p>' + (post ? 'ده تقييم الباسد كول، أول مكالمة ليك بعد الكوتشينج كول على التقييم ' + esc_(r.followOfId || '') + '، لـ' : coaching ? 'ده تقييم إكسترا تارجت (مش محسوب في تقييمك) على ' : cert ? 'ده تقييم السرتيفيكيشن لـ' : 'ده تقييم الجودة لـ') + form + ' بتاريخ <span dir="ltr">' + esc_(when) + '</span>' + (ref ? ' (' + esc_(ref) + ')' : '') + '.</p>' +
      '<table style="border-collapse:collapse;background:#f6f6f6;border-radius:6px">' +
      row('رقم التقييم (Evaluation ID)', '<span dir="ltr">' + esc_(evalId_(r)) + '</span>') +
      row('النتيجة النهائية', '<span style="color:' + (pass ? '#1a7f37' : '#c62828') + '">' + pct_(r.final) + ' – ' + (pass ? 'ناجح' : 'محتاج تحسين') + '</span>') +
      tagRow +
      row('دقة البنود الحرجة', critPct) +
      catRows_(r, row) +
      row('المقيّم', esc_(r.evaluator)) + '</table>';
    if (missed.length) html += '<p><b>البنود اللي محتاجة تتظبط:</b></p><ul>' + missed.map(function (i) {
      return '<li dir="auto">' + esc_(i.text) + (i.comment ? ' – <i>' + esc_(i.comment) + '</i>' : '') + '</li>'; }).join('') + '</ul>';
    if (fb.strengths) html += '<p><b>نقاط القوة:</b><br><span dir="auto">' + esc_(fb.strengths) + '</span></p>';
    if (fb.improve) html += '<p><b>محتاج تحسين:</b><br><span dir="auto">' + esc_(fb.improve) + '</span></p>';
    if (fb.coaching) html += '<p><b>نصيحة للمرة الجاية:</b><br><span dir="auto">' + esc_(fb.coaching) + '</span></p>';
    html += '<p>لو عندك أي سؤال على التقييم كلّم ' + esc_(r.evaluator || 'فريق الجودة') + '.</p></div>';
    const senderName = String(config_().senderName || 'Quality Team').trim() || 'Quality Team';
    const subjPrefix = (isWow ? '🌟🏆 WOW CALL! – ' : isGood ? '👍 مكالمة مميزة – ' : '') + (coaching ? '💡 إكسترا تارجت – ' : post ? 'باسد كول بعد الكوتشينج – ' : cert ? 'تقييم السرتيفيكيشن – ' : 'تقييم الجودة – ');
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
  let html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6">' +
    '<div style="background:#e8f0fe;border:1px solid #b6d4fe;border-right:5px solid #1a73e8;color:#084298;padding:12px 16px;border-radius:8px;margin-bottom:14px"><b>📝 ملخص جلسة الكوتشينج</b></div>' +
    '<p>أهلاً ' + esc_(r.agent) + '،</p><p>ده ملخص جلسة الكوتشينج اللي عملناها مع بعض يوم <b dir="ltr">' + when + '</b> على التقييم <b dir="ltr">' + esc_(evalId_(r)) + '</b> (' + esc_(String(r.interactionDate || '').replace('T', ' ')) + ').</p>';
  if (pts.length) html += '<p><b>النقاط اللي اتكلمنا فيها:</b></p><ul>' + pts.map(function (i) { return '<li dir="auto">' + esc_(i.text) + (i.comment ? ' – <i>' + esc_(i.comment) + '</i>' : '') + '</li>'; }).join('') + '</ul>';
  if (r.coachNote) html += '<p><b>اتفقنا على:</b><br><span dir="auto">' + esc_(r.coachNote) + '</span></p>';
  html += '<p>هنسمع أول مكالمة ليك بعد الكوتشينج علشان نتأكد إن النقاط دي بقت تمام.</p><p>' + esc_(r.coachedBy || r.evaluator || '') + ' – فريق الجودة</p></div>';
  const mail = { to: to, subject: '📝 ملخص جلسة الكوتشينج – ' + when.slice(0, 10) + ' [' + evalId_(r) + ']', htmlBody: html,
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
  return Object.assign({ monthlyTarget: 4, coachingSlaHours: 48, passedSlaHours: 48, pickFrom: '10:00', pickTo: '21:30', pickDays: 7, closedDays: 'Fri', ccResults: '', senderName: 'Quality Team' }, JSON.parse(PropertiesService.getScriptProperties().getProperty('cfg') || '{}'));
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
    if (body.action === 'kbAsk') return reply_(kbAsk_(body)); // knowledge base: an agent's question or suggestion for the client
    if (body.action === 'kbAskVote') return reply_(kbAskVote_(body));
    if (body.action === 'otpRequest') return reply_(otpRequest_(body.email));
    if (body.action === 'otpVerify') return reply_(otpVerify_(body.email, body.code));
    const me = who_(body);
    if (!me) return reply_({ ok: false, error: body.session ? 'signed_out' : 'Wrong access key' });
    const ownerOnly = { renamePerson: 1, removePerson: 1, setEmail: 1, setDaysOff: 1, setCertDate: 1, setConfig: 1 };
    if ((ownerOnly[body.action] || (body.action === 'addPerson' && body.role === 'evaluators')) && !me.owner) return reply_({ ok: false, error: 'not_owner' });
    if (body.action === 'addPerson') return reply_(addPerson_(body.role, body.name));
    if (body.action === 'renamePerson') return reply_(renamePerson_(body.role, body.from, body.to));
    if (body.action === 'removePerson') return reply_(removePerson_(body.role, body.name));
    if (body.action === 'setEmail') return reply_(setEmail_(body.role, body.name, body.email));
    if (body.action === 'setDaysOff') return reply_(setDaysOff_(body.name, body.days));
    if (body.action === 'setCertDate') return reply_(setCertDate_(body.name, body.certDate));
    if (body.action === 'setConfig') return reply_(setConfig_(body.config));
    if (body.action === 'addKb') return reply_(addKb_(body.update));
    if (body.action === 'updateRecord') {
      if (!body.record || !recordOwnerOk_(me, body.record.id)) return reply_({ ok: false, error: 'not_yours' });
      if (!me.owner) body.record.editedBy = me.name;
      levelFix_(body.record, readRoster_());
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
    levelFix_(r, readRoster_());
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
      sh.appendRow(row_(r, new Date()));
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
  if (p.action === 'kbAsks') return reply_(kbAsks_(p)); // public list, no names: questions waiting for / answered by the client
  if (p.action === 'pulse') return reply_(pulse_(p)); // public: knowledge base quiz board + team's most missed items (no names, no customers)
  const me = who_(p);
  if (!me) return reply_({ ok: false, error: p.session ? 'signed_out' : 'Wrong access key' });
  if (p.action === 'config') return reply_({ ok: true, config: config_() });
  if (p.action === 'kb') return reply_({ ok: true, updates: readKb_() });
  if (p.action === 'roster') {
    const ro = readRoster_();
    return reply_({ ok: true, agents: ro.agents, evaluators: ro.evaluators, owners: ro.owners, quality: ro.quality, emails: ro.emails, evalEmails: ro.evalEmails, daysOff: ro.daysOff, certDates: ro.certDates,
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

// The evaluation type as the scorecard names it, for the sheet's Purpose column (the app reads the Record JSON, not this).
function purposeLabel_(r) {
  const p = r.purpose || (r.rolePlay ? 'roleplay' : r.sampleRef ? 'calibration' : 'live');
  if (p === 'calibration' && /(^|-)RECAL-/.test(r.sampleRef || '')) return 'Recalibration';
  return ({ live: 'Agent level', certcall: 'Certification call', program: 'Program level', coaching: 'Extra target',
    postcoach: 'Passed call', calibration: 'Calibration', roleplay: 'Certification role-play' })[p] || p;
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
const QUIZ_COLS = ['Saved at', 'Date', 'Kind', 'Period', 'Name', 'Email', 'Score', 'Total', 'Wrong questions'];
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
      to: leads.join(','), name: 'Knowledge Base', subject: 'كود دخول الكويز لـ ' + nm + ': ' + code,
      htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px">' + nm + ' (' + em + ') طالب يدخل كويز النولدج بيز، وإيميله لسه مش شغال.<br><br>' +
        'الكود: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
        'قوله الكود بنفسك بعد ما تتأكد إنه هو. الكود شغال ' + OTP_MINUTES + ' دقايق، ولو محدش طلبه تجاهل الإيميل.</div>'
    });
    return { ok: true, via: 'lead' };
  }
  MailApp.sendEmail({
    to: em, name: 'Knowledge Base', subject: 'Knowledge Base quiz code: ' + code,
    htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px">أهلاً ' + String(who.name).replace(/[<>&]/g, '') + '،<br><br>' +
      'كود الدخول على كويز النولدج بيز: <b style="font-size:22px;letter-spacing:3px">' + code + '</b><br>' +
      'الكود شغال ' + OTP_MINUTES + ' دقايق. لو مش إنتي/إنت اللي طلبته تجاهل الإيميل ده.</div>' +
      '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:13px;color:#555;margin-top:12px">Your Knowledge Base quiz code is ' + code + '. It works for ' + OTP_MINUTES + ' minutes.</div>'
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
    const wrong = (Array.isArray(b.wrong) ? b.wrong : []).slice(0, 30).map(function (x) { return String(x).slice(0, 40); }).join(', ');
    sh.appendRow([now, date, kind, "'" + period, name, who.email, score, total, wrong]);
  } finally { lock.releaseLock(); }
  return { ok: true, name: name };
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
  const list = Object.keys(board).map(function (k) { const b = board[k]; return { name: b.name, points: b.points, days: b.days, pct: b.asked ? Math.round(100 * b.right / b.asked) : 0, monthly: b.monthly, streak: streak_(days[k] || [], today) }; })
    .sort(function (a, b) { return b.points - a.points || b.pct - a.pct || a.name.localeCompare(b.name); });
  const out = { ok: true, today: today, month: month, board: list.slice(0, 30), doneToday: doneToday, top: topMissed_(14) };
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
      out.me = { name: me.name, staff: !!staff[meK], streak: streak_(mine.dates, today), best: best, points: mine.points, pct: mine.asked ? Math.round(100 * mine.right / mine.asked) : 0,
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
const ASK_COLS = ['Saved at', 'Name', 'Email', 'Type', 'Topic', 'Question / suggestion', 'Customer said (optional)', 'Status (New / Asked client / Answered / Not needed)', 'Answer', 'Answered at', 'Same question from'];
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

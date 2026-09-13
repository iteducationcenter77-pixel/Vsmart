/*
 * Business rules: fee ledgers, dues, receipts, attendance stats.
 *
 * Fee model
 *  • A student owes `monthlyFee` for every month from their admission month up to
 *    the current month — stopping at course end (admission + duration) or the date
 *    they left (status Completed / Dropped).
 *  • A payment holds line items: { type:'monthly', month:'2026-09', amount, full }
 *    or { type:'admission' | 'other', label, amount }. A month is settled when its
 *    items cover the fee (or were marked full when collected).
 *  • payment.discount reduces the cash received, not the months credited.
 */
(function () {
  let idx = null;
  let idxVersion = -1;

  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');

  function index() {
    if (idx && idxVersion === Store.version) return idx;
    const paid = new Map();       // studentId → Map(month → { amt, full })
    const admission = new Map();  // studentId → amount paid toward admission fee
    const payments = new Map();   // studentId → payments[] (newest first)
    const att = new Map();        // studentId → [{ date, st }]

    Store.all('payments').forEach((p) => {
      if (!payments.has(p.studentId)) payments.set(p.studentId, []);
      payments.get(p.studentId).push(p);
      (p.items || []).forEach((it) => {
        const amt = Number(it.amount) || 0;
        if (it.type === 'monthly' && it.month) {
          if (!paid.has(p.studentId)) paid.set(p.studentId, new Map());
          const m = paid.get(p.studentId);
          const cur = m.get(it.month) || { amt: 0, full: false };
          cur.amt += amt;
          cur.full = cur.full || !!it.full;
          m.set(it.month, cur);
        } else if (it.type === 'admission') {
          admission.set(p.studentId, (admission.get(p.studentId) || 0) + amt);
        }
      });
    });
    payments.forEach((list) => list.sort(byDateDesc));

    Store.all('attendance').forEach((a) => {
      Object.entries(a.records || {}).forEach(([sid, st]) => {
        if (!att.has(sid)) att.set(sid, []);
        att.get(sid).push({ date: a.date, st });
      });
    });

    idx = { paid, admission, payments, att };
    idxVersion = Store.version;
    return idx;
  }

  const courseOf = (s) => Store.get('courses', s && s.courseId);
  const batchOf = (s) => Store.get('batches', s && s.batchId);
  const students = () => Store.all('students').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const activeStudents = () => students().filter((s) => s.status === 'active');

  function endMonth(s) {
    const d = Number(s.durationMonths) || 0;
    return d > 0 && s.admissionDate ? UI.addMonths(UI.monthOf(s.admissionDate), d - 1) : null;
  }

  function lastBillable(s, upto) {
    let last = upto || UI.thisMonth();
    const end = endMonth(s);
    if (end && end < last) last = end;
    if (s.status !== 'active' && s.leftDate) {
      const lm = UI.monthOf(s.leftDate);
      if (lm < last) last = lm;
    }
    return last;
  }

  const billableMonths = (s, upto) => s.admissionDate ? UI.monthRange(UI.monthOf(s.admissionDate), lastBillable(s, upto)) : [];

  // Month-by-month fee ledger. Months paid in advance (after `upto`) are included too.
  function ledger(s, upto) {
    const fee = Number(s.monthlyFee) || 0;
    const pm = index().paid.get(s.id) || new Map();
    const months = billableMonths(s, upto);
    const last = months[months.length - 1] || '';
    [...pm.keys()].filter((k) => k > last).sort().forEach((k) => months.push(k));
    return months.map((month) => {
      const p = pm.get(month) || { amt: 0, full: false };
      const due = p.full ? 0 : Math.max(0, fee - p.amt);
      const status = due === 0 ? 'paid' : p.amt > 0 ? 'partial' : 'unpaid';
      return { month, fee, paid: p.amt, due, status, advance: month > (upto || UI.thisMonth()) };
    });
  }

  function dues(s, upto) {
    const limit = upto || UI.thisMonth();
    const rows = ledger(s, limit).filter((r) => r.month <= limit);
    const monthly = rows.reduce((a, r) => a + r.due, 0);
    const admission = Math.max(0, (Number(s.admissionFee) || 0) - (index().admission.get(s.id) || 0));
    return { months: rows.filter((r) => r.due > 0), monthly, admission, total: monthly + admission };
  }

  const admissionPaid = (s) => index().admission.get(s.id) || 0;
  const paymentsOf = (sid) => index().payments.get(sid) || [];
  const totalPaidBy = (sid) => paymentsOf(sid).reduce((a, p) => a + (Number(p.total) || 0), 0);

  // Every student billed for `month`, with what they owe/paid for it.
  function monthReport(month) {
    const rows = [];
    students().forEach((s) => {
      if (!billableMonths(s, month).includes(month)) return;
      const r = ledger(s, month).find((x) => x.month === month);
      if (r) rows.push({ s, ...r });
    });
    return rows;
  }

  const paymentsInMonth = (month) => Store.all('payments').filter((p) => UI.monthOf(p.date) === month).sort(byDateDesc);
  const collectedIn = (month) => paymentsInMonth(month).reduce((a, p) => a + (Number(p.total) || 0), 0);
  const expensesIn = (month) => Store.all('expenses').filter((e) => UI.monthOf(e.date) === month).reduce((a, e) => a + (Number(e.amount) || 0), 0);

  function nextCode(list, field, prefix) {
    let max = 0;
    list.forEach((o) => {
      const m = String(o[field] || '').match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return (prefix || '') + String(max + 1).padStart(4, '0');
  }
  const nextReceiptNo = () => nextCode(Store.all('payments'), 'receiptNo', Store.settings().receiptPrefix);
  const nextStudentCode = () => nextCode(Store.all('students'), 'code', Store.settings().studentPrefix);

  // ── Attendance ──
  const attId = (date, batchId) => `${date}_${batchId}`;
  const attendanceFor = (date, batchId) => Store.get('attendance', attId(date, batchId));

  function attendanceStats(sid, month) {
    const list = (index().att.get(sid) || []).filter((r) => !month || UI.monthOf(r.date) === month);
    const c = { P: 0, A: 0, L: 0 };
    list.forEach((r) => { if (c[r.st] != null) c[r.st]++; });
    const total = c.P + c.A + c.L;
    return { ...c, total, pct: total ? Math.round(((c.P + c.L) / total) * 100) : null, list };
  }

  function attendanceOnDate(date) {
    let present = 0, marked = 0;
    Store.all('attendance').filter((a) => a.date === date).forEach((a) => {
      Object.values(a.records || {}).forEach((st) => { marked++; if (st === 'P' || st === 'L') present++; });
    });
    return { present, marked };
  }

  const studentsInBatch = (batchId) => activeStudents().filter((s) => s.batchId === batchId);

  window.Logic = {
    index, courseOf, batchOf, students, activeStudents, endMonth, billableMonths, ledger, dues,
    admissionPaid, paymentsOf, totalPaidBy, monthReport, paymentsInMonth, collectedIn, expensesIn,
    nextReceiptNo, nextStudentCode, attId, attendanceFor, attendanceStats, attendanceOnDate, studentsInBatch, byDateDesc
  };
})();

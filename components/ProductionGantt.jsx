'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from 'lucide-react';

// ─── Layout constants ───────────────────────────────────────────────
const DAY_W       = 40;  // px per day column
const ROW_H       = 24;  // px per Plan / Actual row
const HDR_YEAR_H  = 20;  // px for year header row
const HDR_MONTH_H = 20;  // px for month header row
const HDR_DAY_H   = 22;  // px for day-number header row

const COL_PROJECT_W = 130;
const COL_ITEM_W    = 120;
const COL_LABEL_W   = 56;
const LEFT_W        = COL_PROJECT_W + COL_ITEM_W + COL_LABEL_W;  // 306 px

// ─── Station colour palette ─────────────────────────────────────────
const PALETTE = [
  { match: ['qc'],                         bg: '#16a34a', text: '#fff' },
  { match: ['cnc'],                        bg: '#d97706', text: '#fff' },
  { match: ['pack', 'บรรจุ', 'แพ็ค'],     bg: '#059669', text: '#fff' },
  { match: ['ประกอบ', 'assem', 'โครง'],   bg: '#4f46e5', text: '#fff' },
  { match: ['อัด', 'press', 'บาน'],       bg: '#db2777', text: '#fff' },
  { match: ['paint', 'พ่น', 'ทาสี', 'color', 'spray'], bg: '#2563eb', text: '#fff' },
  { match: ['weld', 'เชื่อม'],            bg: '#ea580c', text: '#fff' },
  { match: ['ปรับขนาด', 'size', 'trim'],  bg: '#7c3aed', text: '#fff' },
  { match: ['เจาะ', 'drill'],             bg: '#b45309', text: '#fff' },
  { match: ['กลึง', 'lathe', 'turn'],     bg: '#0891b2', text: '#fff' },
];

function stationStyle(name = '') {
  const n = name.toLowerCase();
  for (const { match, bg, text } of PALETTE) {
    if (match.some(m => n.includes(m))) return { bg, text };
  }
  return { bg: '#6b7280', text: '#fff' };
}

// ─── Thai month names ───────────────────────────────────────────────
const THAI_MO = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// ─── Date helpers (string "YYYY-MM-DD" to avoid TZ issues) ─────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysBetween(fromStr, toStr) {
  return Math.round(
    (new Date(toStr   + 'T00:00:00') - new Date(fromStr + 'T00:00:00')) / 86400000
  );
}

function dateOnlyOf(isoStr) {
  if (!isoStr) return null;
  return isoStr.split('T')[0];
}

// ─── Main component ─────────────────────────────────────────────────
export default function ProductionGantt() {
  const NUM_DAYS   = 35;

  const [loading, setLoading]   = useState(true);
  const [tickets, setTickets]   = useState([]);
  const [errMsg,  setErrMsg]    = useState('');
  const [viewStart, setViewStart] = useState(() => addDays(todayStr(), -10));

  const viewEnd = addDays(viewStart, NUM_DAYS - 1);
  const today   = todayStr();

  // Scroll refs for sync
  const bodyRef   = useRef(null);
  const headerRef = useRef(null);
  const syncing   = useRef(false);

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const res  = await fetch(`/api/gantt?start=${viewStart}&end=${viewEnd}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTickets(json.tickets || []);
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, [viewStart, viewEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll to today on first load
  useEffect(() => {
    if (!loading && bodyRef.current) {
      const off = daysBetween(viewStart, today);
      const target = Math.max(0, off * DAY_W - 80);
      bodyRef.current.scrollLeft = target;
      if (headerRef.current) headerRef.current.scrollLeft = target;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Scroll sync ────────────────────────────────────────────────────
  const onBodyScroll = e => {
    if (syncing.current) return;
    syncing.current = true;
    if (headerRef.current) headerRef.current.scrollLeft = e.target.scrollLeft;
    syncing.current = false;
  };
  const onHeaderScroll = e => {
    if (syncing.current) return;
    syncing.current = true;
    if (bodyRef.current) bodyRef.current.scrollLeft = e.target.scrollLeft;
    syncing.current = false;
  };

  // ── Build date array ───────────────────────────────────────────────
  const dates = Array.from({ length: NUM_DAYS }, (_, i) => addDays(viewStart, i));

  // Month groups
  const monthGroups = [];
  dates.forEach(d => {
    const mo = parseInt(d.slice(5,7)) - 1;
    const yr = parseInt(d.slice(0,4));
    const label = `${THAI_MO[mo]} ${yr + 543}`;
    if (!monthGroups.length || monthGroups.at(-1).label !== label) {
      monthGroups.push({ label, count: 1, year: yr });
    } else {
      monthGroups.at(-1).count++;
    }
  });

  // Year groups (for top row)
  const yearGroups = [];
  monthGroups.forEach(mg => {
    if (!yearGroups.length || yearGroups.at(-1).year !== mg.year) {
      yearGroups.push({ year: mg.year, count: mg.count });
    } else {
      yearGroups.at(-1).count += mg.count;
    }
  });

  const totalGridW = NUM_DAYS * DAY_W;

  // ── Block position helper ──────────────────────────────────────────
  function blockX(startIso, endIso) {
    // returns { left, width } in px, or null if entirely outside view
    const s = dateOnlyOf(startIso);
    const e = dateOnlyOf(endIso) || today; // ongoing → extend to today

    if (!s) return null;

    let so = daysBetween(viewStart, s);
    let eo = daysBetween(viewStart, e) + 1; // +1: include full end day

    if (eo <= 0 || so >= NUM_DAYS) return null;
    so = Math.max(0, so);
    eo = Math.min(NUM_DAYS, eo);

    const left  = so * DAY_W;
    const width = Math.max(DAY_W * 0.8, (eo - so) * DAY_W);
    return { left, width };
  }

  // Today vertical line X
  const todayOff = daysBetween(viewStart, today);
  const todayX   = (todayOff >= 0 && todayOff < NUM_DAYS)
    ? todayOff * DAY_W + DAY_W / 2
    : null;

  // Weekend mask cells
  function weekendMasks() {
    return dates.map((d, i) => {
      const dow = new Date(d + 'T00:00:00').getDay();
      if (dow !== 0 && dow !== 6) return null;
      return (
        <div
          key={d}
          className="absolute inset-y-0 bg-gray-100/60 dark:bg-gray-900/30 pointer-events-none"
          style={{ left: i * DAY_W, width: DAY_W }}
        />
      );
    });
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md overflow-hidden select-none">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-teal-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">แผนการผลิต</span>
          {loading && (
            <span className="text-[10px] text-gray-400 animate-pulse">กำลังโหลด…</span>
          )}
          {errMsg && (
            <span className="text-[10px] text-red-500" title={errMsg}>⚠ โหลดข้อมูลไม่ได้</span>
          )}
          {!loading && !errMsg && (
            <span className="text-[10px] text-gray-400">{tickets.length} ตั๋ว</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewStart(v => addDays(v, -7))}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            title="ย้อนหลัง 7 วัน"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewStart(addDays(today, -10))}
            className="px-2 py-0.5 text-[10px] rounded border dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
          >
            วันนี้
          </button>
          <button
            onClick={() => setViewStart(v => addDays(v, 7))}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            title="ไปข้างหน้า 7 วัน"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={fetchData}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            title="รีเฟรช"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Main table ── */}
      <div className="flex overflow-hidden" style={{ fontSize: 11 }}>

        {/* ═══ LEFT FIXED COLUMNS ═══ */}
        <div
          className="flex-shrink-0 border-r dark:border-gray-700 bg-white dark:bg-gray-800 z-20"
          style={{ width: LEFT_W }}
        >
          {/* Year header */}
          <div
            className="flex items-center border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
            style={{ height: HDR_YEAR_H }}
          >
            <div
              className="flex items-center justify-center border-r dark:border-gray-700 font-bold text-gray-600 dark:text-gray-300"
              style={{ width: COL_PROJECT_W, height: '100%', fontSize: 10 }}
            >
              โครงการ
            </div>
            <div
              className="flex items-center justify-center border-r dark:border-gray-700 font-bold text-gray-600 dark:text-gray-300"
              style={{ width: COL_ITEM_W, height: '100%', fontSize: 10 }}
            >
              Item No.
            </div>
            <div style={{ width: COL_LABEL_W, height: '100%' }} />
          </div>

          {/* Month header (blank left side) */}
          <div
            className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
            style={{ height: HDR_MONTH_H }}
          >
            <div
              className="border-r dark:border-gray-700"
              style={{ width: COL_PROJECT_W }}
            />
            <div
              className="border-r dark:border-gray-700"
              style={{ width: COL_ITEM_W }}
            />
            <div style={{ width: COL_LABEL_W }} />
          </div>

          {/* Day header (blank left side) */}
          <div
            className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
            style={{ height: HDR_DAY_H }}
          >
            <div
              className="border-r dark:border-gray-700"
              style={{ width: COL_PROJECT_W }}
            />
            <div
              className="border-r dark:border-gray-700"
              style={{ width: COL_ITEM_W }}
            />
            <div style={{ width: COL_LABEL_W }} />
          </div>

          {/* Data rows */}
          {loading ? (
            <div className="flex items-center justify-center text-[10px] text-gray-400" style={{ height: 80 }}>
              กำลังโหลด...
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex items-center justify-center text-[10px] text-gray-400" style={{ height: 80 }}>
              ไม่มีข้อมูล
            </div>
          ) : tickets.map((t, ti) => (
            <div
              key={t.no}
              className={`flex border-b dark:border-gray-700/50 ${ti % 2 === 1 ? 'bg-gray-50/40 dark:bg-gray-700/10' : ''}`}
            >
              {/* Project cell — spans Plan+Actual rows */}
              <div
                className="border-r dark:border-gray-700 px-1.5 flex items-center text-gray-700 dark:text-gray-300 truncate"
                style={{ width: COL_PROJECT_W, height: ROW_H * 2, alignSelf: 'stretch', fontSize: 10 }}
                title={t.project_name}
              >
                {t.project_name}
              </div>

              {/* Item No cell — spans both rows */}
              <div
                className="border-r dark:border-gray-700 px-1.5 flex items-center text-gray-700 dark:text-gray-200 truncate font-mono"
                style={{ width: COL_ITEM_W, height: ROW_H * 2, alignSelf: 'stretch', fontSize: 9.5 }}
                title={t.no}
              >
                {t.no}
              </div>

              {/* Plan / Actual labels column */}
              <div className="flex flex-col" style={{ width: COL_LABEL_W }}>
                <div
                  className="flex items-center justify-center border-b dark:border-gray-700/40 text-[10px] font-semibold text-gray-500 dark:text-gray-400"
                  style={{ height: ROW_H }}
                >
                  แผน
                </div>
                <div
                  className="flex items-center justify-center text-[10px] font-semibold text-gray-500 dark:text-gray-400"
                  style={{ height: ROW_H }}
                >
                  จริง
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ RIGHT SCROLLABLE DATE GRID ═══ */}
        <div className="flex-1 overflow-x-auto min-w-0" style={{ position: 'relative' }}>

          {/* Sticky header wrapper (scrolls only horizontally, not vertically) */}
          <div
            ref={headerRef}
            onScroll={onHeaderScroll}
            style={{
              overflowX: 'auto',
              overflowY: 'hidden',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: 'inherit',
            }}
            className="bg-white dark:bg-gray-800"
          >
            <div style={{ width: totalGridW }}>
              {/* Year row */}
              <div
                className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                style={{ height: HDR_YEAR_H }}
              >
                {yearGroups.map(yg => (
                  <div
                    key={yg.year}
                    className="border-r dark:border-gray-600 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300"
                    style={{ width: yg.count * DAY_W, minWidth: yg.count * DAY_W, fontSize: 10 }}
                  >
                    {yg.year + 543}
                  </div>
                ))}
              </div>

              {/* Month row */}
              <div
                className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                style={{ height: HDR_MONTH_H }}
              >
                {monthGroups.map(mg => (
                  <div
                    key={mg.label}
                    className="border-r dark:border-gray-600 flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300"
                    style={{ width: mg.count * DAY_W, minWidth: mg.count * DAY_W, fontSize: 10 }}
                  >
                    {mg.label}
                  </div>
                ))}
              </div>

              {/* Day numbers row */}
              <div
                className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                style={{ height: HDR_DAY_H }}
              >
                {dates.map(d => {
                  const isToday   = d === today;
                  const dow       = new Date(d + 'T00:00:00').getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const dayNum    = parseInt(d.slice(8, 10));
                  return (
                    <div
                      key={d}
                      className={[
                        'border-r dark:border-gray-700 flex items-center justify-center font-semibold',
                        isToday
                          ? 'bg-blue-500 text-white'
                          : isWeekend
                          ? 'bg-gray-200/70 dark:bg-gray-600/40 text-gray-400'
                          : 'text-gray-600 dark:text-gray-400',
                      ].join(' ')}
                      style={{ width: DAY_W, minWidth: DAY_W, fontSize: 10 }}
                    >
                      {dayNum}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Body scroll area */}
          <div
            ref={bodyRef}
            onScroll={onBodyScroll}
            style={{ overflowX: 'auto', overflowY: 'visible' }}
          >
            <div style={{ width: totalGridW }}>

              {/* Empty states */}
              {(loading || tickets.length === 0) && (
                <div style={{ height: 80, width: totalGridW }} />
              )}

              {/* Ticket rows */}
              {!loading && tickets.map((t, ti) => (
                <div
                  key={t.no}
                  className={`border-b dark:border-gray-700/50 ${ti % 2 === 1 ? 'bg-gray-50/40 dark:bg-gray-700/10' : ''}`}
                  style={{ width: totalGridW }}
                >
                  {/* ── Plan row ── */}
                  <div
                    className="relative border-b dark:border-gray-700/30"
                    style={{ height: ROW_H, width: totalGridW }}
                  >
                    {weekendMasks()}

                    {/* Today line */}
                    {todayX !== null && (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-blue-400/70 pointer-events-none z-10"
                        style={{ left: todayX }}
                      />
                    )}

                    {/* Plan block: ticket created_at → due_date (dark charcoal) */}
                    {(() => {
                      const b = blockX(t.created_at, t.due_date || addDays(today, 7));
                      if (!b) return null;
                      const hasDue = !!t.due_date;
                      return (
                        <div
                          className="absolute top-1 bottom-1 rounded-sm flex items-center px-1.5 overflow-hidden z-20"
                          style={{
                            left: b.left,
                            width: b.width,
                            background: '#374151',
                            color: '#e5e7eb',
                            opacity: hasDue ? 1 : 0.6,
                          }}
                          title={`แผน: ${t.no} (${t.created_at?.slice(0,10)} → ${t.due_date?.slice(0,10) || 'ยังไม่กำหนด'})`}
                        >
                          <span style={{ fontSize: 9, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {t.no}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Actual row ── */}
                  <div
                    className="relative"
                    style={{ height: ROW_H, width: totalGridW }}
                  >
                    {weekendMasks()}

                    {/* Today line */}
                    {todayX !== null && (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-blue-400/70 pointer-events-none z-10"
                        style={{ left: todayX }}
                      />
                    )}

                    {/* Station flow blocks */}
                    {t.flows
                      .filter(f => f.started_at)
                      .map((f, fi) => {
                        const b = blockX(f.started_at, f.completed_at);
                        if (!b) return null;
                        const { bg, text } = stationStyle(f.station_name);
                        const ongoing = !f.completed_at;
                        const label   = [f.station_name, f.technician_name]
                          .filter(Boolean).join(' ');
                        return (
                          <div
                            key={fi}
                            className={[
                              'absolute top-1 bottom-1 rounded-sm flex items-center px-1 overflow-hidden z-20',
                              ongoing ? 'opacity-90' : '',
                            ].join(' ')}
                            style={{
                              left: b.left,
                              width: b.width,
                              background: bg,
                              color: text,
                              outline: ongoing ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                            }}
                            title={`${f.station_name}${f.technician_name ? ' – ' + f.technician_name : ''}${ongoing ? ' (กำลังทำ)' : ''}\n${f.started_at?.slice(0,10)} → ${f.completed_at?.slice(0,10) || 'ปัจจุบัน'}`}
                          >
                            <span
                              style={{
                                fontSize: 9,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="px-3 py-1.5 border-t dark:border-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50/50 dark:bg-gray-700/20">
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded-sm bg-gray-700" />
          <span className="text-[9px] text-gray-500 dark:text-gray-400">แผน (ช่วงตั๋ว)</span>
        </div>
        {PALETTE.slice(0, 6).map(({ match, bg }) => (
          <div key={match[0]} className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ background: bg }} />
            <span className="text-[9px] text-gray-500 dark:text-gray-400">{match[0]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <div className="w-0.5 h-3 border-l-2 border-blue-400" />
          <span className="text-[9px] text-gray-500 dark:text-gray-400">วันนี้</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded-sm bg-gray-200 dark:bg-gray-600" />
          <span className="text-[9px] text-gray-500 dark:text-gray-400">วันหยุด</span>
        </div>
      </div>
    </section>
  );
}

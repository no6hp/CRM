import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, AreaChart, Area,
} from 'recharts'

/* ─────────────────────────── RESPONSIVE HOOK ─────────────────────────── */
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return w
}

/* ─────────────────────────── STORAGE ─────────────────────────── */
const STORAGE_KEY = 'fincrm_v3'
const defaultData = () => ({ activities: [], apiKey: '', customers: [], recruits: [] })

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData()
  } catch { return defaultData() }
}
const save = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {} }

/* ─────────────────────────── UTILS ─────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10)

const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const fmtShortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'

const now = () => new Date().toISOString()

/* ─────────────────────────── ANTHROPIC ─────────────────────────── */
const analyzeText = async (text, apiKey) => {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const system = `Du bist ein CRM-Assistent für deutschen Finanzdienstleistungs-Vertrieb. Analysiere den Freitext und gib NUR ein JSON-Objekt zurück – kein weiterer Text, kein Markdown.

Heute ist: ${today}

JSON-Schema (alle Felder optional außer type):
{
  "type": "call" | "appointment" | "deal" | "callback",
  "name": "Vollständiger Kundenname",
  "phone": "Telefonnummer",
  "result": "appointment" | "callback" | "not_interested" | "not_reached" | "won" | "lost",
  "followUp": "ISO 8601 Datum+Uhrzeit des Folgetargets",
  "dealUnits": <Anzahl Einheiten als Zahl>,
  "dealProduct": "Produktname / Beratungswunsch / Thema",
  "note": "Prägnante Zusammenfassung für das CRM",
  "calendarTitle": "Name – Beratungswunsch (z.B. 'Maria Müller – Altersvorsorge')",
  "calendarNote": "Mehrzeiliger Text mit: Telefon, alle Kontaktdaten, Beratungsthema, sonstige erwähnte Infos"
}

Regeln:
- "Donnerstag 14 Uhr" = nächsten Donnerstag 14:00:00
- "08.08.26" = 2026-08-08T09:00:00
- dealUnits = Anzahl der genannten Einheiten (z.B. "2 Einheiten" → 2)
- Bei result:"appointment" MÜSSEN calendarTitle und calendarNote gesetzt sein
- calendarTitle = "<Name> – <Beratungswunsch>" (exakter Kundenname + Thema)
- calendarNote = alle Kontaktdaten (Telefon, Adresse falls genannt) + Beratungsdetails + sonstige Notizen aus dem Text
- Antworte ausschließlich mit validem JSON`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: text }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API-Fehler ${res.status}`)
  }
  const data = await res.json()
  const raw = data.content[0].text.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Ungültige KI-Antwort')
  return JSON.parse(match[0])
}

/* ─────────────────────────── CALENDAR (ICS) ─────────────────────────── */
const exportCalendar = (title, note, isoDate) => {
  const d = new Date(isoDate)
  const e = new Date(d.getTime() + 60 * 60 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  const f = (dt) => `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}T${p(dt.getHours())}${p(dt.getMinutes())}00`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinCRM//DE',
    'BEGIN:VEVENT',
    `DTSTART:${f(d)}`, `DTEND:${f(e)}`, `SUMMARY:${title}`,
    note ? `DESCRIPTION:${note.replace(/\n/g, '\\n')}` : '',
    `UID:${uid()}@fincrm.app`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^\w\säöüÄÖÜ-]/g, '_')}.ics`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─────────────────────────── CONFIG ─────────────────────────── */
const RESULT_BADGE = {
  appointment:    { label: 'Termin',          bg: '#dcfce7', color: '#166534' },
  callback:       { label: 'Rückruf',         bg: '#fef9c3', color: '#854d0e' },
  not_interested: { label: 'Kein Interesse',  bg: '#fee2e2', color: '#991b1b' },
  not_reached:    { label: 'Nicht erreicht',  bg: '#f1f5f9', color: '#475569' },
  won:            { label: 'Gewonnen ✓',      bg: '#d1fae5', color: '#065f46' },
  lost:           { label: 'Verloren',        bg: '#fee2e2', color: '#991b1b' },
}

const TYPE_LABEL = {
  call:        { label: 'Anruf',     icon: '📞', color: '#3b82f6' },
  appointment: { label: 'Termin',    icon: '📅', color: '#8b5cf6' },
  deal:        { label: 'Abschluss', icon: '🏆', color: '#f59e0b' },
  callback:    { label: 'Rückruf',   icon: '🔄', color: '#06b6d4' },
}

const CHART_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

const KPI_CONFIG = [
  { key: 'totalRevenue',     label: 'Gesamtumsatz',   format: (v) => String(v),           gradient: 'linear-gradient(135deg,#6d28d9,#7c3aed)', icon: '💶' },
  { key: 'closeRate',        label: 'Abschlussquote', format: (v) => `${v.toFixed(1)} %`, gradient: 'linear-gradient(135deg,#1d4ed8,#2563eb)', icon: '🎯' },
  { key: 'appointmentRate',  label: 'Terminquote',    format: (v) => `${v.toFixed(1)} %`, gradient: 'linear-gradient(135deg,#0369a1,#0284c7)', icon: '📅' },
  { key: 'totalCalls',       label: 'Anrufe gesamt',  format: (v) => v,                   gradient: 'linear-gradient(135deg,#0f766e,#0d9488)', icon: '📞' },
  { key: 'notReached',       label: 'Nicht erreicht', format: (v) => v,                   gradient: 'linear-gradient(135deg,#7f1d1d,#991b1b)', icon: '📵' },
  { key: 'callbacks',        label: 'Rückrufe',       format: (v) => v,                   gradient: 'linear-gradient(135deg,#164e63,#0e7490)', icon: '🔄' },
  { key: 'totalUnits',       label: 'Einheiten',      format: (v) => v,                   gradient: 'linear-gradient(135deg,#5b21b6,#6d28d9)', icon: '📦' },
  { key: 'openAppointments', label: 'Offene Termine', format: (v) => v,                   gradient: 'linear-gradient(135deg,#1e40af,#1d4ed8)', icon: '🗓' },
]

const NAV_ITEMS = [
  { key: 'Dashboard',    icon: '◼', label: 'Dashboard' },
  { key: 'Aktivitäten', icon: '≡',  label: 'Aktivitäten' },
  { key: 'Pipeline',     icon: '⬦', label: 'Pipeline' },
  { key: 'Statistiken',  icon: '↗', label: 'Statistiken' },
]

/* ─────────────────────────── COMPUTED ─────────────────────────── */
const computeKpis = (activities) => {
  const calls = activities.filter((a) => a.type === 'call' || a.type === 'callback')
  const appts = activities.filter((a) => a.result === 'appointment')
  const won   = activities.filter((a) => a.type === 'deal' && a.result === 'won')
  const open  = activities.filter((a) => a.result === 'appointment' && a.followUp && new Date(a.followUp) > new Date())
  const totalUnits  = won.reduce((s, d) => s + (d.dealUnits || 0), 0)
  const notReached  = activities.filter((a) => a.result === 'not_reached').length
  const callbacks   = activities.filter((a) => a.result === 'callback').length
  return {
    totalRevenue:     totalUnits * 7,
    closeRate:        calls.length ? (won.length / calls.length) * 100 : 0,
    appointmentRate:  calls.length ? (appts.length / calls.length) * 100 : 0,
    totalCalls:       calls.length,
    totalUnits,
    openAppointments: open.length,
    notReached,
    callbacks,
  }
}

const getISOWeek = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  return Math.ceil(((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)
}

const filterByPeriod = (activities, period) => {
  if (period === 'all') return activities
  const cutoff = new Date()
  if (period === '1m') cutoff.setMonth(cutoff.getMonth() - 1)
  else if (period === '3m') cutoff.setMonth(cutoff.getMonth() - 3)
  else if (period === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
  else if (period === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
  return activities.filter((a) => new Date(a.createdAt) >= cutoff)
}

const buildChartData = (activities, period = 'all') => {
  const now = new Date()
  const empty = () => ({ anrufe: 0, termine: 0, abschlüsse: 0, umsatz: 0 })
  const buckets = {}

  const fillActivity = (label) => {
    if (!buckets[label]) return
    return (a) => {
      if (a.type === 'call' || a.type === 'callback') buckets[label].anrufe++
      if (a.result === 'appointment') buckets[label].termine++
      if (a.type === 'deal' && a.result === 'won') { buckets[label].abschlüsse++; buckets[label].umsatz += (a.dealUnits || 0) * 7 }
    }
  }

  if (period === '1m' || period === '3m') {
    const weeks = period === '1m' ? 4 : 13
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7)
      const label = `KW${getISOWeek(d)}`
      if (!buckets[label]) buckets[label] = { label, ...empty() }
    }
    activities.forEach((a) => {
      const label = `KW${getISOWeek(new Date(a.createdAt))}`
      if (!buckets[label]) return
      if (a.type === 'call' || a.type === 'callback') buckets[label].anrufe++
      if (a.result === 'appointment') buckets[label].termine++
      if (a.type === 'deal' && a.result === 'won') { buckets[label].abschlüsse++; buckets[label].umsatz += (a.dealUnits || 0) * 7 }
    })
  } else {
    const months = period === '6m' ? 6 : period === '1y' ? 12 : null
    if (months) {
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const label = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
        buckets[label] = { label, ...empty() }
      }
    } else {
      const earliest = activities.length
        ? activities.reduce((min, a) => { const d = new Date(a.createdAt); return d < min ? d : min }, new Date())
        : new Date(now.getFullYear(), now.getMonth() - 5, 1)
      let cur = new Date(earliest.getFullYear(), earliest.getMonth(), 1)
      while (cur <= now) {
        const label = cur.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
        buckets[label] = { label, ...empty() }
        cur.setMonth(cur.getMonth() + 1)
      }
    }
    activities.forEach((a) => {
      const d = new Date(a.createdAt)
      const label = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
      if (!buckets[label]) return
      if (a.type === 'call' || a.type === 'callback') buckets[label].anrufe++
      if (a.result === 'appointment') buckets[label].termine++
      if (a.type === 'deal' && a.result === 'won') { buckets[label].abschlüsse++; buckets[label].umsatz += (a.dealUnits || 0) * 7 }
    })
  }

  return Object.values(buckets)
}

// Keep alias for any remaining references
const buildWeeklyData = (activities) => buildChartData(activities, 'all')

const buildPipelineStages = (activities) => {
  const s = { contacted: [], appointment: [], won: [], lost: [], noInterest: [] }
  activities.forEach((a) => {
    if (a.result === 'not_reached' || a.result === 'callback') s.contacted.push(a)
    else if (a.result === 'appointment' && a.type !== 'deal') s.appointment.push(a)
    else if (a.type === 'deal' && a.result === 'won') s.won.push(a)
    else if (a.type === 'deal' && a.result === 'lost') s.lost.push(a)
    else if (a.result === 'not_interested') s.noInterest.push(a)
  })
  return s
}

/* ─────────────────────────── SHARED TOOLTIP ─────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: 12, fontWeight: 600 }}>
          {p.name}: {p.name === 'Umsatz' ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT: KpiTile
═══════════════════════════════════════════════════════════════════ */
const KpiTile = ({ config, value }) => (
  <div style={{
    background: config.gradient, borderRadius: 12, padding: '14px 16px',
    color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
      {config.icon} {config.label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
      {config.format(value)}
    </div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT: ActivityCard
═══════════════════════════════════════════════════════════════════ */
const ActivityCard = ({ activity, onDelete }) => {
  const rb = RESULT_BADGE[activity.result] || {}
  const tb = TYPE_LABEL[activity.type] || {}
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: `${tb.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>{tb.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{activity.name || 'Unbekannt'}</span>
            {activity.phone && (
              <a href={`tel:${activity.phone}`} style={{ color: '#64748b', fontSize: 12, marginLeft: 8, textDecoration: 'none' }}>
                {activity.phone}
              </a>
            )}
          </div>
          <button onClick={() => onDelete(activity.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1',
            fontSize: 16, padding: '4px', flexShrink: 0, lineHeight: 1, borderRadius: 4,
            minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        {activity.note && (
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>{activity.note}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {rb.label && (
            <span style={{ background: rb.bg, color: rb.color, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20 }}>
              {rb.label}
            </span>
          )}
          {activity.dealTotal > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{fmt(activity.dealTotal)}</span>
          )}
          {activity.dealProduct && (
            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>
              {activity.dealProduct}
            </span>
          )}
          {activity.followUp && (
            <span style={{ fontSize: 11, color: '#7c3aed' }}>📅 {fmtDate(activity.followUp)}</span>
          )}
        </div>
        {activity.followUp && activity.calendarTitle && (
          <button
            onClick={() => exportCalendar(activity.calendarTitle, activity.calendarNote || activity.note, activity.followUp)}
            style={{ marginTop: 6, fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            📥 In Kalender speichern (.ics)
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Dashboard
═══════════════════════════════════════════════════════════════════ */
const DashboardView = ({ kpis, activities, isMobile, period }) => {
  const chartData = useMemo(() => buildChartData(activities, period), [activities, period])
  const stages = useMemo(() => buildPipelineStages(activities), [activities])

  const donutData = [
    { name: 'Kontaktiert', value: stages.contacted.length },
    { name: 'Termin',      value: stages.appointment.length },
    { name: 'Gewonnen',    value: stages.won.length },
    { name: 'Verloren',    value: stages.lost.length },
    { name: 'Kein Int.',   value: stages.noInterest.length },
  ].filter((d) => d.value > 0)

  const recent = [...activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)

  return (
    <div>
      {/* KPI Grid — auto-responsive via minmax */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10, marginBottom: 16 }}>
        {KPI_CONFIG.map((cfg) => <KpiTile key={cfg.key} config={cfg} value={kpis[cfg.key]} />)}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 12, marginBottom: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Aktivitäten pro Woche</div>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                {['anrufe', 'termine', 'abschlüsse'].map((k, i) => (
                  <linearGradient key={k} id={`g${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[i]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="anrufe"     name="Anrufe"     stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#ganrufe)"     dot={false} />
              <Area type="monotone" dataKey="termine"    name="Termine"    stroke={CHART_COLORS[1]} strokeWidth={2} fill="url(#gtermine)"    dot={false} />
              <Area type="monotone" dataKey="abschlüsse" name="Abschlüsse" stroke={CHART_COLORS[2]} strokeWidth={2} fill="url(#gabschlüsse)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>Pipeline</div>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 210}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="44%" innerRadius={55} outerRadius={82} paddingAngle={3} dataKey="value">
                  {donutData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Noch keine Daten</div>
          )}
        </div>
      </div>

      {/* Recent Activities */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Letzte Aktivitäten</div>
        {recent.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Noch keine Aktivitäten. Logge jetzt deine erste Aktivität!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.map((a) => {
              const rb = RESULT_BADGE[a.result] || {}
              return (
                <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 8, background: '#f8fafc' }}>
                  <span style={{ fontSize: 16 }}>{TYPE_LABEL[a.type]?.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || 'Unbekannt'}</span>
                  {rb.label && (
                    <span style={{ background: rb.bg, color: rb.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{rb.label}</span>
                  )}
                  <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtShortDate(a.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Aktivitäten
═══════════════════════════════════════════════════════════════════ */
const ActivitiesView = ({ activities, onDelete }) => {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filters = [
    { key: 'all',  label: 'Alle' },
    { key: 'call', label: 'Anrufe' },
    { key: 'appointment', label: 'Termine' },
    { key: 'deal', label: 'Abschlüsse' },
    { key: 'won',  label: 'Gewonnen' },
  ]

  const filtered = useMemo(() => {
    let list = [...activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (filter === 'won') list = list.filter((a) => a.result === 'won')
    else if (filter !== 'all') list = list.filter((a) => a.type === filter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) => a.name?.toLowerCase().includes(q) || a.phone?.includes(q) ||
               a.note?.toLowerCase().includes(q) || a.dealProduct?.toLowerCase().includes(q),
      )
    }
    return list
  }, [activities, filter, search])

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
        {/* Filter chips — scrollable on mobile */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              background: filter === f.key ? '#7c3aed' : '#f1f5f9',
              color: filter === f.key ? '#fff' : '#64748b',
              minHeight: 34, flexShrink: 0,
            }}>{f.label}</button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen nach Name, Telefon, Produkt …"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
            fontSize: 14, color: '#0f172a', outline: 'none', marginTop: 4,
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, paddingLeft: 2 }}>{filtered.length} Einträge</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Keine Aktivitäten gefunden.
          </div>
        ) : (
          filtered.map((a) => <ActivityCard key={a.id} activity={a} onDelete={onDelete} />)
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Pipeline
═══════════════════════════════════════════════════════════════════ */
const PipelineView = ({ activities }) => {
  const stages = useMemo(() => buildPipelineStages(activities), [activities])

  const cols = [
    { key: 'contacted',   label: 'Kontaktiert',     color: '#64748b', icon: '📞', items: stages.contacted },
    { key: 'appointment', label: 'Termin vereinbart',color: '#3b82f6', icon: '📅', items: stages.appointment },
    { key: 'noInterest',  label: 'Kein Interesse',   color: '#f59e0b', icon: '⚠️', items: stages.noInterest },
    { key: 'won',         label: 'Gewonnen',          color: '#10b981', icon: '🏆', items: stages.won },
    { key: 'lost',        label: 'Verloren',          color: '#ef4444', icon: '✕',  items: stages.lost },
  ]

  return (
    /* Horizontal scroll container on mobile */
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', gap: 10, minWidth: 700 }}>
        {cols.map((col) => (
          <div key={col.key}>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{col.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: col.color }}>{col.label}</span>
              <span style={{ marginLeft: 'auto', background: `${col.color}22`, color: col.color, borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {col.items.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.items.map((a) => (
                <div key={a.id} style={{
                  background: '#fff', borderRadius: 10, padding: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: `1px solid ${col.color}22`,
                  borderLeft: `3px solid ${col.color}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 3 }}>{a.name || 'Unbekannt'}</div>
                  {a.phone && (
                    <a href={`tel:${a.phone}`} style={{ display: 'block', fontSize: 11, color: '#3b82f6', marginBottom: 4, textDecoration: 'none' }}>{a.phone}</a>
                  )}
                  {a.dealTotal > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 3 }}>{fmt(a.dealTotal)}</div>}
                  {a.dealProduct && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{a.dealProduct}</div>}
                  {a.followUp && <div style={{ fontSize: 11, color: '#7c3aed' }}>📅 {fmtDate(a.followUp)}</div>}
                  {a.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.4, borderTop: '1px solid #f1f5f9', paddingTop: 5 }}>{a.note?.slice(0, 80)}{a.note?.length > 80 ? '…' : ''}</div>}
                </div>
              ))}
              {col.items.length === 0 && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#cbd5e1', fontSize: 12, border: '2px dashed #e2e8f0' }}>Leer</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Statistiken
═══════════════════════════════════════════════════════════════════ */
const StatisticsView = ({ activities, kpis, isMobile, period }) => {
  const chartData = useMemo(() => buildChartData(activities, period), [activities, period])

  const monthlyRevenue = useMemo(() => {
    const m = {}
    activities.filter((a) => a.type === 'deal' && a.result === 'won').forEach((a) => {
      const d = new Date(a.createdAt)
      const key = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
      m[key] = (m[key] || 0) + (a.dealUnits || 0) * 7
    })
    return Object.entries(m).map(([name, umsatz]) => ({ name, umsatz }))
  }, [activities])

  const resultDist = useMemo(() => {
    const counts = {}
    activities.forEach((a) => {
      if (!a.result) return
      const l = RESULT_BADGE[a.result]?.label || a.result
      counts[l] = (counts[l] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [activities])

  const statCards = [
    { label: 'Terminquote',    value: `${kpis.appointmentRate.toFixed(1)} %`, sub: 'Anrufe → Termin',       color: '#3b82f6' },
    { label: 'Abschlussquote', value: `${kpis.closeRate.toFixed(1)} %`,       sub: 'Anrufe → Gewonnen',    color: '#10b981' },
    { label: 'Einheiten',      value: String(kpis.totalUnits),                 sub: 'gewonnene Abschlüsse', color: '#f59e0b' },
    { label: 'Gesamtumsatz',   value: String(kpis.totalRevenue),              sub: 'Einheiten × 7',        color: '#7c3aed' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 4, letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Anrufe & Termine / Woche</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barGap={3} margin={{ left: -20, right: 0, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="anrufe"     name="Anrufe"     fill={CHART_COLORS[0]} radius={[3,3,0,0]} />
              <Bar dataKey="termine"    name="Termine"    fill={CHART_COLORS[1]} radius={[3,3,0,0]} />
              <Bar dataKey="abschlüsse" name="Abschlüsse" fill={CHART_COLORS[2]} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Monatsumsatz</div>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyRevenue} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="umsatz" name="Umsatz" fill="#7c3aed" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Noch keine Abschlüsse</div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 8 }}>Ergebnis-Verteilung</div>
          {resultDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={resultDist} cx="50%" cy="42%" innerRadius={48} outerRadius={75} paddingAngle={3} dataKey="value">
                  {resultDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Keine Daten</div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Nächste Folgetermine</div>
          {(() => {
            const upcoming = activities
              .filter((a) => a.followUp && new Date(a.followUp) > new Date())
              .sort((a, b) => new Date(a.followUp) - new Date(b.followUp))
              .slice(0, 7)
            return upcoming.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {upcoming.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#f8fafc', borderLeft: '3px solid #7c3aed' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || 'Unbekannt'}</div>
                      {a.calendarTitle && <div style={{ fontSize: 11, color: '#64748b' }}>{a.calendarTitle}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>{fmtDate(a.followUp)}</div>
                      {a.calendarTitle && (
                        <button onClick={() => exportCalendar(a.calendarTitle, a.calendarNote || a.note, a.followUp)}
                          style={{ fontSize: 10, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          📥 .ics
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Keine bevorstehenden Termine</div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Logger (mobile full-screen input)
═══════════════════════════════════════════════════════════════════ */
const LoggerView = ({ input, setInput, analyzing, onAnalyze, preview, onConfirm, onDismiss, error, setError, recording, onRecord }) => (
  <div>
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✨</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>KI-Aktivitäts-Logger</span>
      </div>

      {/* Mikrofon-Button */}
      <button
        onClick={onRecord}
        style={{
          width: '100%', padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: recording
            ? 'linear-gradient(135deg,#dc2626,#ef4444)'
            : 'linear-gradient(135deg,#1e293b,#334155)',
          color: '#fff', fontWeight: 700, fontSize: 17,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 12,
          boxShadow: recording
            ? '0 0 0 4px rgba(239,68,68,0.25), 0 4px 16px rgba(220,38,38,0.4)'
            : '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 24, display: 'inline-block', animation: recording ? 'micPulse 1s ease-in-out infinite' : 'none' }}>🎤</span>
        {recording ? 'Aufnahme läuft … (Tippen zum Stoppen)' : 'Sprechen  —  Taste [1]'}
      </button>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={'Oder hier frei eintippen:\n\n„Maria Müller angerufen, Tel. 0171 123456, Termin 08.08.26"\n„Abschluss Herr Bauer, 2 Einheiten à 25.000€, Altersvorsorge"'}
        style={{
          width: '100%', minHeight: 130, padding: '12px 14px', borderRadius: 10,
          border: `1.5px solid ${recording ? '#ef4444' : '#e2e8f0'}`,
          fontSize: 15, resize: 'none', outline: 'none',
          color: '#0f172a', lineHeight: 1.55, fontFamily: 'inherit',
          transition: 'border-color 0.2s',
          background: recording ? '#fff8f8' : '#fff',
        }}
      />
      <button
        onClick={onAnalyze}
        disabled={analyzing || !input.trim()}
        style={{
          marginTop: 10, width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          cursor: (analyzing || !input.trim()) ? 'not-allowed' : 'pointer',
          background: (analyzing || !input.trim()) ? '#e2e8f0' : 'linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%)',
          color: (analyzing || !input.trim()) ? '#94a3b8' : '#fff',
          fontWeight: 700, fontSize: 16, boxShadow: (analyzing || !input.trim()) ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
        }}
      >
        {analyzing ? '⟳ KI analysiert …' : '✨ Analysieren'}
      </button>
    </div>

    {error && (
      <div style={{ marginBottom: 12, padding: '11px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, color: '#991b1b', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
        {error}
        <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>✕</button>
      </div>
    )}

    {preview && (
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px', boxShadow: '0 4px 24px rgba(124,58,237,0.14)', border: '2px solid #7c3aed', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>✨ Ergebnis bestätigen</span>
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, padding: '4px' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Typ',       value: TYPE_LABEL[preview.type]?.label || preview.type, icon: TYPE_LABEL[preview.type]?.icon },
            preview.name         && { label: 'Name',         value: preview.name,                            icon: '👤' },
            preview.phone        && { label: 'Telefon',      value: preview.phone,                           icon: '📞' },
            preview.result       && { label: 'Ergebnis',     value: RESULT_BADGE[preview.result]?.label || preview.result, icon: '📋' },
            preview.followUp     && { label: 'Folgetermin',  value: fmtDate(preview.followUp),              icon: '📅' },
            preview.dealUnits    && { label: 'Einheiten',    value: String(preview.dealUnits),               icon: '📦' },
            preview.dealValue    && { label: 'Wert/Einheit', value: fmt(preview.dealValue),                  icon: '💶' },
            preview.dealTotal    && { label: 'Gesamt',       value: fmt(preview.dealTotal),                  icon: '💰' },
            preview.dealProduct  && { label: 'Produkt',      value: preview.dealProduct,                     icon: '🏷' },
            preview.calendarTitle && { label: 'Kalender',    value: preview.calendarTitle,                   icon: '🗓' },
            preview.note         && { label: 'Notiz',        value: preview.note,                            icon: '📝' },
          ].filter(Boolean).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 9, padding: '9px 11px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{f.icon} {f.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{f.value}</div>
            </div>
          ))}
        </div>
        <button onClick={onConfirm} style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 15,
          boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
        }}>
          ✓ Speichern{preview.followUp ? ' · Kalender exportieren' : ''}
        </button>
        <button onClick={onDismiss} style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#64748b', fontSize: 14 }}>
          Verwerfen
        </button>
      </div>
    )}
  </div>
)

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Strategie (GB → Informationsberatung → AT)
═══════════════════════════════════════════════════════════════════ */
const STRATEGY_STAGES = [
  { key: 'GB',   label: 'Grundberatung',        short: 'GB',   icon: '📋', color: '#3b82f6' },
  { key: 'Info', label: 'Informationsberatung',  short: 'Info', icon: '📊', color: '#8b5cf6' },
  { key: 'AT',   label: 'Abschlusstermin',       short: 'AT',   icon: '🏆', color: '#10b981' },
]

const StrategieView = ({ customers, onAdd, onMove, onDelete }) => {
  const [addingTo, setAddingTo] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', note: '', date: '' })

  const byStage = useMemo(() => STRATEGY_STAGES.reduce((acc, s) => {
    acc[s.key] = customers.filter((c) => c.stage === s.key)
    return acc
  }, {}), [customers])

  const submitAdd = (stageKey) => {
    if (!form.name.trim()) return
    onAdd({ ...form, stage: stageKey })
    setForm({ name: '', phone: '', note: '', date: '' })
    setAddingTo(null)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
    marginBottom: 6, fontFamily: 'inherit',
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: 12, minWidth: 560 }}>
        {STRATEGY_STAGES.map((stage, si) => (
          <div key={stage.key}>
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>{stage.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: stage.color }}>{stage.label}</span>
              <span style={{ marginLeft: 'auto', background: `${stage.color}22`, color: stage.color, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {byStage[stage.key].length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byStage[stage.key].map((c) => (
                <div key={c.id} style={{
                  background: '#fff', borderRadius: 10, padding: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  border: `1px solid ${stage.color}22`, borderLeft: `3px solid ${stage.color}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.name}</div>
                    <button onClick={() => onDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}>✕</button>
                  </div>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ display: 'block', fontSize: 11, color: '#3b82f6', marginTop: 2, textDecoration: 'none' }}>{c.phone}</a>}
                  {c.date && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>📅 {fmtDate(c.date)}</div>}
                  {c.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>{c.note}</div>}
                  {si < STRATEGY_STAGES.length - 1 && (
                    <button onClick={() => onMove(c.id, STRATEGY_STAGES[si + 1].key)} style={{
                      marginTop: 8, width: '100%', background: `${STRATEGY_STAGES[si + 1].color}12`,
                      color: STRATEGY_STAGES[si + 1].color, border: `1px solid ${STRATEGY_STAGES[si + 1].color}44`,
                      borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    }}>→ {STRATEGY_STAGES[si + 1].short}</button>
                  )}
                  {si === STRATEGY_STAGES.length - 1 && (
                    <button onClick={() => onDelete(c.id)} style={{
                      marginTop: 8, width: '100%', background: '#d1fae520',
                      color: '#059669', border: '1px solid #059669',
                      borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    }}>✓ Abschluss fertig</button>
                  )}
                </div>
              ))}

              {addingTo === stage.key ? (
                <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: `2px solid ${stage.color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" style={inputStyle} />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefon" style={inputStyle} />
                  <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
                  <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Notiz" rows={2} style={{ ...inputStyle, resize: 'none', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => submitAdd(stage.key)} style={{ flex: 1, background: stage.color, color: '#fff', border: 'none', borderRadius: 7, padding: '8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Hinzufügen</button>
                    <button onClick={() => setAddingTo(null)} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTo(stage.key)} style={{
                  width: '100%', padding: '10px', background: '#f8fafc',
                  border: `2px dashed ${stage.color}55`, borderRadius: 10,
                  cursor: 'pointer', color: stage.color, fontSize: 12, fontWeight: 600,
                }}>+ Kunde hinzufügen</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Recruiting (BVG-Tracking)
═══════════════════════════════════════════════════════════════════ */
const RECRUIT_STATUSES = [
  { key: 'neu',         label: 'Interessent',  icon: '⭐', color: '#64748b' },
  { key: 'kontaktiert', label: 'Kontaktiert',  icon: '📞', color: '#3b82f6' },
  { key: 'bvg',         label: 'BVG geplant',  icon: '📅', color: '#8b5cf6' },
  { key: 'team',        label: 'Im Team',       icon: '🎉', color: '#10b981' },
]

const RecruitingView = ({ recruits, onAdd, onUpdateStatus, onDelete }) => {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({ name: '', phone: '', note: '', bvgDate: '' })

  const filtered = filter === 'all' ? recruits : recruits.filter((r) => r.status === filter)

  const submitAdd = () => {
    if (!form.name.trim()) return
    onAdd({ ...form, status: 'neu' })
    setForm({ name: '', phone: '', note: '', bvgDate: '' })
    setShowForm(false)
  }

  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>Team-Recruiting</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Potenzielle Teammitglieder · BVG-Tracking</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          + Hinzufügen
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, border: '2px solid #7c3aed', boxShadow: '0 4px 16px rgba(124,58,237,0.12)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 12 }}>Neue Person</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" style={inputStyle} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefon" style={inputStyle} />
          </div>
          <input type="datetime-local" value={form.bvgDate} onChange={(e) => setForm({ ...form, bvgDate: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 8, display: 'block' }} />
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Notizen..." rows={2} style={{ ...inputStyle, width: '100%', resize: 'none', display: 'block', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitAdd} style={{ flex: 1, background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Speichern</button>
            <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button onClick={() => setFilter('all')} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filter === 'all' ? '#7c3aed' : '#e2e8f0'}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: filter === 'all' ? '#7c3aed' : '#fff', color: filter === 'all' ? '#fff' : '#64748b', flexShrink: 0 }}>
          Alle ({recruits.length})
        </button>
        {RECRUIT_STATUSES.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filter === s.key ? s.color : '#e2e8f0'}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: filter === s.key ? s.color : '#fff', color: filter === s.key ? '#fff' : '#64748b', flexShrink: 0 }}>
            {s.icon} {s.label} ({recruits.filter((r) => r.status === s.key).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          {recruits.length === 0 ? 'Noch keine Personen. Füge potenzielle Teammitglieder hinzu!' : 'Keine Einträge für diesen Filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
          {filtered.map((r) => {
            const st = RECRUIT_STATUSES.find((s) => s.key === r.status) || RECRUIT_STATUSES[0]
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 12, padding: 14,
                boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                border: `1px solid ${st.color}22`, borderLeft: `3px solid ${st.color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{r.name}</div>
                    {r.phone && <a href={`tel:${r.phone}`} style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>{r.phone}</a>}
                  </div>
                  <button onClick={() => onDelete(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '2px 4px' }}>✕</button>
                </div>
                {r.bvgDate && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>📅 BVG: {fmtDate(r.bvgDate)}</div>}
                {r.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>{r.note}</div>}
                <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                  {RECRUIT_STATUSES.map((s) => (
                    <button key={s.key} onClick={() => onUpdateStatus(r.id, s.key)} style={{
                      padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: 600,
                      background: r.status === s.key ? s.color : `${s.color}18`,
                      color: r.status === s.key ? '#fff' : s.color,
                    }}>{s.icon} {s.label}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const width = useWindowWidth()
  const isMobile = width < 768

  const [data, setData] = useState(defaultData)
  const [view, setView] = useState('Dashboard')
  const [input, setInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [tempKey, setTempKey] = useState('')
  const [period, setPeriod] = useState('all')
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef(null)
  const recordingRef = useRef(false)
  const importRef = useRef(null)

  const startVoice = useCallback(() => {
    if (recordingRef.current) { recognitionRef.current?.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Spracherkennung nicht verfügbar. Bitte eintippen.'); return }
    const r = new SR()
    recognitionRef.current = r
    r.lang = 'de-DE'; r.continuous = true; r.interimResults = true
    r.onstart = () => { setRecording(true); recordingRef.current = true }
    r.onend = () => { setRecording(false); recordingRef.current = false }
    r.onresult = (ev) => {
      const transcript = Array.from(ev.results).map((res) => res[0].transcript).join('')
      setInput(transcript)
    }
    r.onerror = (ev) => {
      setRecording(false); recordingRef.current = false
      if (ev.error !== 'aborted') setError(`Mikrofon: ${ev.error}`)
    }
    r.start()
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '1' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault(); startVoice()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [startVoice])

  useEffect(() => {
    const d = load()
    const existingNames = new Set((d.customers || []).map((c) => c.name?.toLowerCase()))
    const toAdd = (d.activities || [])
      .filter((a) => a.result === 'appointment' && a.name && !existingNames.has(a.name.toLowerCase()))
      .map((a) => ({
        id: uid(),
        name: a.name,
        phone: a.phone || '',
        note: [a.dealProduct, a.note].filter(Boolean).join(' – '),
        date: a.followUp || '',
        stage: 'GB',
        createdAt: a.createdAt,
      }))
    const migrated = toAdd.length > 0
      ? { ...d, customers: [...toAdd, ...(d.customers || [])] }
      : d
    if (toAdd.length > 0) save(migrated)
    setData(migrated)
    setTempKey(migrated.apiKey || '')
    if (!migrated.apiKey) setShowApiKey(true)
  }, [])

  const persist = useCallback((newData) => { setData(newData); save(newData) }, [])
  const filteredActivities = useMemo(() => filterByPeriod(data.activities, period), [data.activities, period])
  const kpis = useMemo(() => computeKpis(filteredActivities), [filteredActivities])

  const handleAnalyze = async () => {
    if (!input.trim()) return
    if (!data.apiKey) { setError('Bitte zuerst den Anthropic API-Key eingeben.'); setShowApiKey(true); return }
    setAnalyzing(true); setError('')
    try {
      const result = await analyzeText(input, data.apiKey)
      setPreview({ ...result, rawInput: input })
    } catch (e) {
      setError(`KI-Analyse fehlgeschlagen: ${e.message}`)
    } finally { setAnalyzing(false) }
  }

  const handleConfirm = () => {
    if (!preview) return
    const activity = { id: uid(), ...preview, createdAt: now() }
    const isAppointment = preview.result === 'appointment' || preview.type === 'appointment'
    let newData = { ...data, activities: [activity, ...data.activities] }
    if (isAppointment && preview.name) {
      const existingNames = new Set((newData.customers || []).map((c) => c.name?.toLowerCase()))
      if (!existingNames.has(preview.name.toLowerCase())) {
        const customer = {
          id: uid(),
          name: preview.name,
          phone: preview.phone || '',
          note: [preview.dealProduct, preview.note].filter(Boolean).join(' – '),
          date: preview.followUp || '',
          stage: 'GB',
          createdAt: now(),
        }
        newData = { ...newData, customers: [customer, ...(newData.customers || [])] }
      }
    }
    persist(newData)
    if (preview.followUp && isAppointment) {
      const title = preview.calendarTitle || [preview.name, preview.dealProduct].filter(Boolean).join(' – ') || 'Termin'
      const desc = preview.calendarNote || [
        preview.phone ? `Tel: ${preview.phone}` : '',
        preview.note || '',
      ].filter(Boolean).join('\n')
      exportCalendar(title, desc, preview.followUp)
      setSuccess(`✓ Gespeichert · 📅 Kalender-Export gestartet: ${title}`)
    } else {
      setSuccess('✓ Aktivität gespeichert')
    }
    setTimeout(() => setSuccess(''), 5000)
    setPreview(null); setInput('')
  }

  const handleDelete = useCallback((id) => {
    persist({ ...data, activities: data.activities.filter((a) => a.id !== id) })
  }, [data, persist])

  const handleAddCustomer = useCallback((fields) => {
    const c = { id: uid(), ...fields, createdAt: now() }
    persist({ ...data, customers: [c, ...(data.customers || [])] })
  }, [data, persist])

  const handleMoveCustomer = useCallback((id, stage) => {
    persist({ ...data, customers: (data.customers || []).map((c) => c.id === id ? { ...c, stage } : c) })
  }, [data, persist])

  const handleDeleteCustomer = useCallback((id) => {
    persist({ ...data, customers: (data.customers || []).filter((c) => c.id !== id) })
  }, [data, persist])

  const handleAddRecruit = useCallback((fields) => {
    const r = { id: uid(), ...fields, createdAt: now() }
    persist({ ...data, recruits: [r, ...(data.recruits || [])] })
  }, [data, persist])

  const handleUpdateRecruitStatus = useCallback((id, status) => {
    persist({ ...data, recruits: (data.recruits || []).map((r) => r.id === id ? { ...r, status } : r) })
  }, [data, persist])

  const handleDeleteRecruit = useCallback((id) => {
    persist({ ...data, recruits: (data.recruits || []).filter((r) => r.id !== id) })
  }, [data, persist])

  const saveKey = () => {
    persist({ ...data, apiKey: tempKey })
    setShowApiKey(false)
    setSuccess('API-Key gespeichert ✓ – wird dauerhaft in dieser App gespeichert')
    setTimeout(() => setSuccess(''), 4000)
  }

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `FinCRM-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setSuccess(`✓ ${data.activities.length} Einträge exportiert`)
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result)
        if (!Array.isArray(imported.activities)) throw new Error('Ungültiges Format')
        const merged = { ...defaultData(), ...imported }
        persist(merged)
        setTempKey(merged.apiKey || '')
        setShowApiKey(false)
        setSuccess(`✓ Import erfolgreich: ${merged.activities.length} Einträge geladen`)
        setTimeout(() => setSuccess(''), 5000)
      } catch {
        setError('Import fehlgeschlagen – bitte eine gültige FinCRM-JSON-Datei wählen.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /* Bottom padding to clear the fixed bottom tab bar on mobile */
  const mainPaddingBottom = isMobile ? 80 : 40

  /* Which nav items to show on mobile bottom bar */
  const mobileNavItems = [
    { key: 'Dashboard',    icon: '◼', label: 'Dashboard' },
    { key: 'Logger',       icon: '✨', label: 'Logger' },
    { key: 'Aktivitäten', icon: '≡',  label: 'Aktivit.' },
    { key: 'Strategie',   icon: '🎯', label: 'Strategie' },
    { key: 'Recruiting',  icon: '👥', label: 'Recruiting' },
    { key: 'Pipeline',     icon: '⬦', label: 'Pipeline' },
    { key: 'Statistiken',  icon: '↗', label: 'Statistik' },
  ]

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", minHeight: '100vh', background: '#f1f5f9', color: '#0f172a' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: '#0f172a', height: isMobile ? 52 : 60,
        display: 'flex', alignItems: 'center', padding: isMobile ? '0 16px' : '0 24px',
        gap: 16, position: 'sticky', top: 0, zIndex: 200,
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%)', fontSize: 16,
            boxShadow: '0 0 0 2px rgba(124,58,237,0.3)',
          }}>💼</div>
          <div>
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em', lineHeight: 1 }}>FinCRM</div>
            {!isMobile && <div style={{ color: '#475569', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Finanzvertrieb</div>}
          </div>
        </div>

        {/* Desktop nav */}
        {!isMobile && (
          <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            {['Dashboard', 'Aktivitäten', 'Pipeline', 'Strategie', 'Recruiting', 'Statistiken'].map((n) => (
              <button key={n} onClick={() => setView(n)} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: view === n ? '#1e293b' : 'transparent',
                color: view === n ? '#e2e8f0' : '#64748b',
              }}>{n}</button>
            ))}
          </nav>
        )}

        {/* Mobile: current view title */}
        {isMobile && (
          <div style={{ flex: 1, textAlign: 'center', color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>
            {view === 'Logger' ? '✨ KI-Logger' : view}
          </div>
        )}

        {/* API key button */}
        <button onClick={() => { setShowApiKey(!showApiKey); setTempKey(data.apiKey || '') }} style={{
          background: data.apiKey ? '#1e293b' : '#7c3aed', border: '1px solid #334155',
          borderRadius: 7, color: data.apiKey ? '#94a3b8' : '#fff',
          padding: isMobile ? '6px 10px' : '6px 14px',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 4,
          minHeight: 34, minWidth: 34,
        }}>
          <span>{data.apiKey ? '🔑' : '⚠️'}</span>
          {!isMobile && <span>{data.apiKey ? 'API-Key' : 'API-Key eingeben'}</span>}
        </button>
      </header>

      {/* ── EINSTELLUNGEN PANEL ── */}
      {showApiKey && (
        <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* API Key row */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
            <span style={{ color: '#64748b', fontSize: 13, flexShrink: 0 }}>🔑 Anthropic API-Key:</span>
            <input
              type="password"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveKey() }}
              placeholder="sk-ant-api03-…"
              autoFocus
              style={{ flex: 1, padding: '9px 12px', borderRadius: 7, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 14, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveKey} style={{ flex: 1, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 42 }}>
                Speichern
              </button>
              <button onClick={() => setShowApiKey(false)} style={{ background: '#334155', border: 'none', borderRadius: 7, color: '#94a3b8', padding: '9px 12px', cursor: 'pointer', fontSize: 16, minHeight: 42 }}>✕</button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: 10 }}>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              📲 <strong style={{ color: '#cbd5e1' }}>Daten übertragen (Safari ↔ Home-Screen-App)</strong>
              <span style={{ display: 'block', marginTop: 3, color: '#475569' }}>
                Safari und die Home-Screen-App haben getrennte Datenspeicher. Exportiere hier und importiere in der anderen Version.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleExport} style={{
                flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
                borderRadius: 7, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 40,
              }}>
                ⬇ Exportieren (.json)
              </button>
              <label style={{
                flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
                borderRadius: 7, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                ⬆ Importieren (.json)
                <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '14px 12px' : '18px 24px', paddingBottom: mainPaddingBottom }}>

        {/* ── NOTIFICATIONS ── */}
        {success && (
          <div style={{ marginBottom: 12, padding: '11px 14px', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 10, color: '#065f46', fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {success}
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: 16 }}>✕</button>
          </div>
        )}
        {error && !isMobile && (
          <div style={{ marginBottom: 12, padding: '11px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, color: '#991b1b', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── DESKTOP: AI logger always visible above content ── */}
        {!isMobile && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✨</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>KI-Aktivitäts-Logger</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>⌘+Enter · Taste [1] Mikro</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={startVoice}
                title={recording ? 'Aufnahme stoppen' : 'Spracherkennung starten (Taste 1)'}
                style={{
                  flexShrink: 0, width: 46, alignSelf: 'flex-end',
                  borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: recording
                    ? 'linear-gradient(135deg,#dc2626,#ef4444)'
                    : 'linear-gradient(135deg,#1e293b,#334155)',
                  color: '#fff', fontSize: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 42,
                  boxShadow: recording
                    ? '0 0 0 3px rgba(239,68,68,0.25), 0 4px 12px rgba(220,38,38,0.35)'
                    : '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'all 0.2s',
                }}
              >🎤</button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAnalyze() }}
                placeholder={`„Kundin Maria Müller angerufen, Tel. 0171 123456, Termin am 08.08.26 eingetragen"  ·  „Abschluss mit Herrn Bauer, 2 Einheiten à 25.000€, Altersvorsorge"`}
                style={{
                  flex: 1, minHeight: 68, padding: '10px 14px', borderRadius: 10,
                  border: `1.5px solid ${recording ? '#ef4444' : '#e2e8f0'}`,
                  fontSize: 14, resize: 'none', outline: 'none',
                  color: '#0f172a', lineHeight: 1.5, fontFamily: 'inherit',
                  background: recording ? '#fff8f8' : '#fff',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = recording ? '#ef4444' : '#7c3aed' }}
                onBlur={(e) => { e.target.style.borderColor = recording ? '#ef4444' : '#e2e8f0' }}
              />
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !input.trim()}
                style={{
                  alignSelf: 'flex-end', padding: '11px 22px', borderRadius: 10, border: 'none',
                  cursor: (analyzing || !input.trim()) ? 'not-allowed' : 'pointer',
                  background: (analyzing || !input.trim()) ? '#e2e8f0' : 'linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%)',
                  color: (analyzing || !input.trim()) ? '#94a3b8' : '#fff',
                  fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
                  boxShadow: (analyzing || !input.trim()) ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
                }}
              >{analyzing ? '⟳ Analysiere …' : '✨ Analysieren'}</button>
            </div>
          </div>
        )}
        {!isMobile && preview && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', marginBottom: 16, boxShadow: '0 4px 28px rgba(124,58,237,0.14)', border: '2px solid #7c3aed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>✨ KI-Ergebnis – bitte bestätigen</span>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Typ',       value: TYPE_LABEL[preview.type]?.label || preview.type,          icon: TYPE_LABEL[preview.type]?.icon },
                preview.name         && { label: 'Name',         value: preview.name,                   icon: '👤' },
                preview.phone        && { label: 'Telefon',      value: preview.phone,                  icon: '📞' },
                preview.result       && { label: 'Ergebnis',     value: RESULT_BADGE[preview.result]?.label || preview.result, icon: '📋' },
                preview.followUp     && { label: 'Folgetermin',  value: fmtDate(preview.followUp),     icon: '📅' },
                preview.dealUnits    && { label: 'Einheiten',    value: String(preview.dealUnits),      icon: '📦' },
                preview.dealValue    && { label: 'Wert/Einheit', value: fmt(preview.dealValue),         icon: '💶' },
                preview.dealTotal    && { label: 'Gesamt',       value: fmt(preview.dealTotal),         icon: '💰' },
                preview.dealProduct  && { label: 'Produkt',      value: preview.dealProduct,            icon: '🏷' },
                preview.calendarTitle && { label: 'Kalender',   value: preview.calendarTitle,           icon: '🗓' },
                preview.note         && { label: 'Notiz',        value: preview.note,                   icon: '📝' },
              ].filter(Boolean).map((f, i) => (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 9, padding: '9px 11px', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{f.icon} {f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleConfirm} style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                ✓ Bestätigen & Speichern{preview.followUp ? ' · Kalender .ics' : ''}
              </button>
              <button onClick={() => setPreview(null)} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 9, padding: '11px 16px', cursor: 'pointer', fontSize: 14 }}>Verwerfen</button>
            </div>
          </div>
        )}

        {/* ── MOBILE: Logger is its own view ── */}
        {isMobile && view === 'Logger' && (
          <LoggerView
            input={input} setInput={setInput}
            analyzing={analyzing} onAnalyze={handleAnalyze}
            preview={preview} onConfirm={handleConfirm} onDismiss={() => setPreview(null)}
            error={error} setError={setError}
            recording={recording} onRecord={startVoice}
          />
        )}

        {/* ── ZEITRAUM-FILTER ── */}
        {view !== 'Logger' && view !== 'Aktivitäten' && view !== 'Pipeline' && view !== 'Strategie' && view !== 'Recruiting' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {[
              { key: 'all', label: 'Gesamt' },
              { key: '1m',  label: '1 Monat' },
              { key: '3m',  label: '3 Monate' },
              { key: '6m',  label: '6 Monate' },
              { key: '1y',  label: '1 Jahr' },
            ].map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                background: period === p.key ? '#7c3aed' : '#fff',
                color: period === p.key ? '#fff' : '#64748b',
                border: `1px solid ${period === p.key ? '#7c3aed' : '#e2e8f0'}`,
                boxShadow: period === p.key ? '0 2px 8px rgba(124,58,237,0.3)' : '0 1px 3px rgba(0,0,0,0.07)',
                transition: 'all 0.15s',
              }}>{p.label}</button>
            ))}
          </div>
        )}

        {/* ── MAIN VIEWS ── */}
        {view === 'Dashboard'    && <DashboardView   kpis={kpis} activities={filteredActivities} isMobile={isMobile} period={period} />}
        {view === 'Aktivitäten' && <ActivitiesView   activities={data.activities} onDelete={handleDelete} />}
        {view === 'Pipeline'     && <PipelineView     activities={data.activities} />}
        {view === 'Statistiken'  && <StatisticsView  activities={filteredActivities} kpis={kpis} isMobile={isMobile} period={period} />}
        {view === 'Strategie'   && <StrategieView    customers={data.customers || []} onAdd={handleAddCustomer} onMove={handleMoveCustomer} onDelete={handleDeleteCustomer} />}
        {view === 'Recruiting'  && <RecruitingView   recruits={data.recruits || []} onAdd={handleAddRecruit} onUpdateStatus={handleUpdateRecruitStatus} onDelete={handleDeleteRecruit} />}
      </main>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#0f172a', borderTop: '1px solid #1e293b',
          display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 300, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {mobileNavItems.map((item) => {
            const active = view === item.key
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '10px 4px 8px', border: 'none',
                  background: 'transparent', cursor: 'pointer', minHeight: 56,
                  color: active ? '#a78bfa' : '#475569',
                  transition: 'color 0.15s',
                }}
              >
                <span style={{
                  fontSize: item.key === 'Logger' ? 18 : 16,
                  display: 'block',
                  background: item.key === 'Logger' && active ? 'linear-gradient(135deg,#7c3aed,#3b82f6)' : 'transparent',
                  borderRadius: item.key === 'Logger' ? 10 : 0,
                  padding: item.key === 'Logger' ? '4px 10px' : 0,
                  color: item.key === 'Logger' && active ? '#fff' : undefined,
                }}>{item.icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, marginTop: 3 }}>{item.label}</span>
                {active && <div style={{ width: 4, height: 4, borderRadius: 2, background: '#a78bfa', marginTop: 3 }} />}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}

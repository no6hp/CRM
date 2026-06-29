import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, AreaChart, Area,
} from 'recharts'

/* ─────────────────────────── STORAGE ─────────────────────────── */
const STORAGE_KEY = 'fincrm_v2'

const defaultData = () => ({
  activities: [],
  apiKey: '',
  seedDone: false,
})

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData()
  } catch {
    return defaultData()
  }
}

const save = (d) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch {}
}

/* ─────────────────────────── UTILS ─────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10)

const fmt = (n) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n || 0)

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const fmtShortDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

const now = () => new Date().toISOString()

/* ─────────────────────────── SEED DATA ─────────────────────────── */
const SEED = (() => {
  const ago = (days, h = 10) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }
  const future = (days, h = 14) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }
  return [
    { id: uid(), type: 'deal', name: 'Claudia Hoffmann', phone: '0171 234567', result: 'won', dealUnits: 3, dealValue: 15000, dealTotal: 45000, dealProduct: 'Altersvorsorge', note: 'Altersvorsorge-Abschluss, sehr zufrieden', createdAt: ago(2) },
    { id: uid(), type: 'call', name: 'Thomas Bauer', phone: '0162 345678', result: 'appointment', followUp: future(3, 11), calendarTitle: 'Termin Thomas Bauer – Beratung', calendarNote: 'Erstgespräch Altersvorsorge', note: 'Sehr interessiert, Termin in 3 Tagen', createdAt: ago(3) },
    { id: uid(), type: 'call', name: 'Sabine Koch', phone: '', result: 'not_reached', followUp: future(1, 15), calendarTitle: 'Rückruf Sabine Koch', note: 'Nicht erreicht, Rückruf morgen 15 Uhr', createdAt: ago(3) },
    { id: uid(), type: 'deal', name: 'Peter Schulz', phone: '0176 456789', result: 'won', dealUnits: 2, dealValue: 20000, dealTotal: 40000, dealProduct: 'Fondsgebundene Rentenversicherung', note: 'Zwei Policen abgeschlossen', createdAt: ago(5) },
    { id: uid(), type: 'call', name: 'Andrea Fischer', phone: '0151 567890', result: 'callback', followUp: future(2, 10), calendarTitle: 'Rückruf Andrea Fischer', note: 'Gerade keine Zeit, nächste Woche Dienstag', createdAt: ago(5) },
    { id: uid(), type: 'appointment', name: 'Klaus Müller', phone: '0170 678901', result: 'appointment', followUp: future(7), calendarTitle: 'Folgetermin Klaus Müller', note: 'Folgetermin nach Erstgespräch – Unterlagen mitbringen', createdAt: ago(7) },
    { id: uid(), type: 'call', name: 'Ingrid Wagner', phone: '0163 789012', result: 'not_interested', note: 'Kein Interesse, bereits anderweitig versorgt', createdAt: ago(8) },
    { id: uid(), type: 'deal', name: 'Frank Schneider', phone: '0172 890123', result: 'won', dealUnits: 1, dealValue: 30000, dealTotal: 30000, dealProduct: 'Einmalanlage', note: 'Großer Einmalanlagedeal', createdAt: ago(10) },
    { id: uid(), type: 'call', name: 'Lisa Weber', phone: '0175 901234', result: 'appointment', followUp: future(5, 14), calendarTitle: 'Termin Lisa Weber – Riester-Rente', note: 'Sehr interessiert, Riester-Rente besprochen', createdAt: ago(10) },
    { id: uid(), type: 'deal', name: 'Michael Braun', phone: '0174 012345', result: 'lost', dealUnits: 2, dealValue: 12000, dealTotal: 24000, dealProduct: 'Berufsunfähigkeit', note: 'Preis zu hoch, Konkurrenzangebot bevorzugt', createdAt: ago(12) },
    { id: uid(), type: 'call', name: 'Ursula Zimmermann', phone: '0168 123456', result: 'not_reached', createdAt: ago(14) },
    { id: uid(), type: 'call', name: 'Dieter Krause', phone: '0169 234567', result: 'appointment', followUp: future(10, 9), calendarTitle: 'Termin Dieter Krause', note: 'Interessiert an Lebensversicherung', createdAt: ago(14) },
    { id: uid(), type: 'deal', name: 'Maria Lange', phone: '0177 345678', result: 'won', dealUnits: 4, dealValue: 10000, dealTotal: 40000, dealProduct: 'Betriebliche Altersvorsorge', note: 'bAV für 4 Mitarbeiter', createdAt: ago(18) },
    { id: uid(), type: 'call', name: 'Helmut Richter', phone: '0178 456789', result: 'callback', followUp: future(4, 16), calendarTitle: 'Rückruf Helmut Richter', note: 'Im Urlaub, Rückruf in einer Woche', createdAt: ago(20) },
    { id: uid(), type: 'call', name: 'Erika Neumann', phone: '0179 567890', result: 'not_interested', note: 'Bereits vollständig abgesichert', createdAt: ago(21) },
    { id: uid(), type: 'call', name: 'Jörg Wolf', phone: '0171 678901', result: 'appointment', followUp: future(6, 10), calendarTitle: 'Termin Jörg Wolf', note: 'Interesse an Kapitalanlage', createdAt: ago(22) },
    { id: uid(), type: 'deal', name: 'Beate Hartmann', phone: '0162 789012', result: 'won', dealUnits: 2, dealValue: 25000, dealTotal: 50000, dealProduct: 'Kapitallebensversicherung', note: 'Sehr profitable Abschluss', createdAt: ago(25) },
    { id: uid(), type: 'call', name: 'Werner Schreiber', phone: '0163 890123', result: 'not_reached', createdAt: ago(26) },
    { id: uid(), type: 'call', name: 'Petra Krüger', phone: '0176 901234', result: 'appointment', followUp: future(8, 11), calendarTitle: 'Termin Petra Krüger', note: 'Rentenplanung besprochen', createdAt: ago(28) },
    { id: uid(), type: 'call', name: 'Hans Vogt', phone: '0175 012345', result: 'not_reached', createdAt: ago(30) },
  ]
})()

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
  "followUp": "ISO 8601 Datum+Uhrzeit des Folgetargets (z.B. nächsten Donnerstag 14 Uhr → korrekte ISO-Zeit)",
  "dealUnits": <Anzahl Einheiten als Zahl>,
  "dealValue": <Wert pro Einheit in EUR als Zahl>,
  "dealTotal": <Gesamtwert in EUR als Zahl, berechne dealUnits*dealValue wenn nötig>,
  "dealProduct": "Produktname oder Thema (Altersvorsorge, Rentenversicherung, BU, Kapitalanlage, ...)",
  "note": "Prägnante Zusammenfassung für das CRM",
  "calendarTitle": "Kurzer Titel für iOS-Kalendereintrag",
  "calendarNote": "Details für Kalendernotiz"
}

Regeln:
- "Donnerstag 14 Uhr" = nächsten Donnerstag 14:00:00
- "08.08.26" = 2026-08-08T09:00:00
- Berechne dealTotal = dealUnits × dealValue wenn nicht explizit angegeben
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
  const f = (dt) =>
    `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}T${p(dt.getHours())}${p(dt.getMinutes())}00`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinCRM//DE',
    'BEGIN:VEVENT',
    `DTSTART:${f(d)}`,
    `DTEND:${f(e)}`,
    `SUMMARY:${title}`,
    note ? `DESCRIPTION:${note.replace(/\n/g, '\\n')}` : '',
    `UID:${uid()}@fincrm.app`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^\w\säöüÄÖÜ-]/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─────────────────────────── BADGE CONFIG ─────────────────────────── */
const RESULT_BADGE = {
  appointment: { label: 'Termin', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  callback: { label: 'Rückruf', bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
  not_interested: { label: 'Kein Interesse', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
  not_reached: { label: 'Nicht erreicht', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
  won: { label: 'Gewonnen ✓', bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
  lost: { label: 'Verloren', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
}

const TYPE_LABEL = {
  call: { label: 'Anruf', icon: '📞', color: '#3b82f6' },
  appointment: { label: 'Termin', icon: '📅', color: '#8b5cf6' },
  deal: { label: 'Abschluss', icon: '🏆', color: '#f59e0b' },
  callback: { label: 'Rückruf', icon: '🔄', color: '#06b6d4' },
}

const PIPELINE_COLORS = ['#7c3aed', '#3b82f6', '#0d9488', '#10b981', '#ef4444']
const CHART_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

/* ─────────────────────────── KPI TILES ─────────────────────────── */
const KPI_CONFIG = [
  { key: 'totalRevenue', label: 'Gesamtumsatz', format: (v) => fmt(v), gradient: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)', icon: '💶' },
  { key: 'closeRate', label: 'Abschlussquote', format: (v) => `${v.toFixed(1)} %`, gradient: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', icon: '🎯' },
  { key: 'appointmentRate', label: 'Terminquote', format: (v) => `${v.toFixed(1)} %`, gradient: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)', icon: '📅' },
  { key: 'totalCalls', label: 'Anrufe gesamt', format: (v) => v.toLocaleString('de-DE'), gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', icon: '📞' },
  { key: 'pipelineValue', label: 'Pipeline-Wert', format: (v) => fmt(v), gradient: 'linear-gradient(135deg, #5b21b6 0%, #6d28d9 100%)', icon: '📊' },
  { key: 'openAppointments', label: 'Offene Termine', format: (v) => v.toLocaleString('de-DE'), gradient: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)', icon: '🗓' },
  { key: 'avgDeal', label: 'Ø Abschlussgröße', format: (v) => fmt(v), gradient: 'linear-gradient(135deg, #047857 0%, #059669 100%)', icon: '💰' },
  { key: 'wonDeals', label: 'Gewonnene Deals', format: (v) => v.toLocaleString('de-DE'), gradient: 'linear-gradient(135deg, #065f46 0%, #047857 100%)', icon: '🏆' },
]

/* ─────────────────────────── COMPUTED KPIs ─────────────────────────── */
const computeKpis = (activities) => {
  const calls = activities.filter((a) => a.type === 'call' || a.type === 'callback')
  const appts = activities.filter((a) => a.result === 'appointment')
  const won = activities.filter((a) => a.type === 'deal' && a.result === 'won')
  const open = activities.filter((a) => a.result === 'appointment' && a.followUp && new Date(a.followUp) > new Date())
  const totalRevenue = won.reduce((s, d) => s + (d.dealTotal || 0), 0)
  const avgDeal = won.length ? totalRevenue / won.length : 0
  const pipeline = activities
    .filter((a) => a.result === 'appointment')
    .reduce((s, a) => s + (a.dealTotal || 15000), 0)
  return {
    totalRevenue,
    closeRate: calls.length ? (won.length / calls.length) * 100 : 0,
    appointmentRate: calls.length ? (appts.length / calls.length) * 100 : 0,
    totalCalls: calls.length,
    pipelineValue: pipeline,
    openAppointments: open.length,
    avgDeal,
    wonDeals: won.length,
  }
}

/* ─────────────────────────── WEEKLY CHART DATA ─────────────────────────── */
const weeklyChartData = (activities) => {
  const buckets = {}
  const now = new Date()
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    const label = `KW ${getISOWeek(d)}`
    buckets[label] = { label, anrufe: 0, termine: 0, abschlüsse: 0, umsatz: 0 }
  }
  activities.forEach((a) => {
    const d = new Date(a.createdAt)
    const label = `KW ${getISOWeek(d)}`
    if (!buckets[label]) return
    if (a.type === 'call' || a.type === 'callback') buckets[label].anrufe++
    if (a.result === 'appointment') buckets[label].termine++
    if (a.type === 'deal' && a.result === 'won') {
      buckets[label].abschlüsse++
      buckets[label].umsatz += a.dealTotal || 0
    }
  })
  return Object.values(buckets)
}

const getISOWeek = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
}

/* ─────────────────────────── PIPELINE STAGES ─────────────────────────── */
const pipelineStages = (activities) => {
  const s = { contacted: [], appointment: [], closing: [], won: [], lost: [] }
  activities.forEach((a) => {
    if (a.result === 'not_reached' || a.result === 'callback') s.contacted.push(a)
    else if (a.result === 'appointment' && a.type !== 'deal') s.appointment.push(a)
    else if (a.type === 'deal' && a.result === 'won') s.won.push(a)
    else if (a.type === 'deal' && a.result === 'lost') s.lost.push(a)
    else if (a.result === 'not_interested') s.closing.push(a)
  })
  return s
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT: KpiTile
═══════════════════════════════════════════════════════════════════ */
const KpiTile = ({ config, value }) => (
  <div style={{
    background: config.gradient, borderRadius: 12, padding: '18px 20px',
    color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'default',
    minWidth: 0,
  }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)' }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)' }}
  >
    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
      {config.icon} {config.label}
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
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
      background: '#fff', borderRadius: 10, padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: `${tb.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
      }}>
        {tb.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{activity.name || 'Unbekannt'}</span>
            {activity.phone && (
              <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{activity.phone}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {activity.result && rb.label && (
              <span style={{ background: rb.bg, color: rb.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                {rb.label}
              </span>
            )}
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{fmtDate(activity.createdAt)}</span>
            <button onClick={() => onDelete(activity.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', lineHeight: 1,
            }} title="Löschen">✕</button>
          </div>
        </div>
        {activity.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>{activity.note}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          {activity.dealTotal > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{fmt(activity.dealTotal)}</span>
          )}
          {activity.dealProduct && (
            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8fafc', padding: '1px 6px', borderRadius: 4 }}>{activity.dealProduct}</span>
          )}
          {activity.followUp && (
            <span style={{ fontSize: 11, color: '#7c3aed' }}>📅 {fmtDate(activity.followUp)}</span>
          )}
          {activity.followUp && activity.calendarTitle && (
            <button
              onClick={() => exportCalendar(activity.calendarTitle, activity.calendarNote || activity.note, activity.followUp)}
              style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Kalender exportieren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Dashboard
═══════════════════════════════════════════════════════════════════ */
const DashboardView = ({ kpis, activities }) => {
  const weekly = useMemo(() => weeklyChartData(activities), [activities])
  const pipe = useMemo(() => pipelineStages(activities), [activities])

  const donutData = [
    { name: 'Kontaktiert', value: pipe.contacted.length },
    { name: 'Termin', value: pipe.appointment.length },
    { name: 'Kein Interesse', value: pipe.closing.length },
    { name: 'Gewonnen', value: pipe.won.length },
    { name: 'Verloren', value: pipe.lost.length },
  ].filter((d) => d.value > 0)

  const recentFive = [...activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontSize: 12, fontWeight: 600 }}>
            {p.name}: {p.name === 'Umsatz' ? fmt(p.value) : p.value}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {KPI_CONFIG.map((cfg) => (
          <KpiTile key={cfg.key} config={cfg} value={kpis[cfg.key]} />
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 16 }}>
        {/* Line Chart */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 20px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>Aktivitäten (letzte 8 Wochen)</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weekly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gAnrufe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gTermine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gAbschl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="anrufe" name="Anrufe" stroke="#3b82f6" strokeWidth={2} fill="url(#gAnrufe)" dot={{ r: 3, fill: '#3b82f6' }} />
              <Area type="monotone" dataKey="termine" name="Termine" stroke="#7c3aed" strokeWidth={2} fill="url(#gTermine)" dot={{ r: 3, fill: '#7c3aed' }} />
              <Area type="monotone" dataKey="abschlüsse" name="Abschlüsse" stroke="#10b981" strokeWidth={2} fill="url(#gAbschl)" dot={{ r: 3, fill: '#10b981' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 20px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>Pipeline-Status</div>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={PIPELINE_COLORS[i % PIPELINE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Noch keine Daten
            </div>
          )}
        </div>
      </div>

      {/* Recent Activities */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 14 }}>Letzte Aktivitäten</div>
        {recentFive.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Noch keine Aktivitäten – logge deine erste Aktivität oben.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentFive.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#f8fafc' }}>
                <span style={{ fontSize: 16 }}>{TYPE_LABEL[a.type]?.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', flex: 1 }}>{a.name || 'Unbekannt'}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{a.note?.slice(0, 60)}{a.note?.length > 60 ? '…' : ''}</span>
                {RESULT_BADGE[a.result] && (
                  <span style={{ background: RESULT_BADGE[a.result].bg, color: RESULT_BADGE[a.result].color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    {RESULT_BADGE[a.result].label}
                  </span>
                )}
                <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtShortDate(a.createdAt)}</span>
              </div>
            ))}
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
    { key: 'all', label: 'Alle' },
    { key: 'call', label: 'Anrufe' },
    { key: 'appointment', label: 'Termine' },
    { key: 'deal', label: 'Abschlüsse' },
    { key: 'won', label: 'Gewonnen' },
  ]

  const filtered = useMemo(() => {
    let list = [...activities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (filter === 'won') list = list.filter((a) => a.result === 'won')
    else if (filter !== 'all') list = list.filter((a) => a.type === filter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name?.toLowerCase().includes(q) ||
          a.phone?.includes(q) ||
          a.note?.toLowerCase().includes(q) ||
          a.dealProduct?.toLowerCase().includes(q),
      )
    }
    return list
  }, [activities, filter, search])

  return (
    <div>
      {/* Filter bar */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: filter === f.key ? '#7c3aed' : '#f1f5f9',
              color: filter === f.key ? '#fff' : '#64748b',
              transition: 'all 0.15s',
            }}>{f.label}</button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen nach Name, Telefon, Produkt …"
          style={{ flex: 1, minWidth: 200, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none' }}
        />
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{filtered.length} Einträge</span>
      </div>

      {/* List */}
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
   VIEW: Pipeline (Kanban)
═══════════════════════════════════════════════════════════════════ */
const PipelineView = ({ activities }) => {
  const stages = useMemo(() => pipelineStages(activities), [activities])

  const cols = [
    { key: 'contacted', label: 'Kontaktiert', color: '#64748b', icon: '📞', items: stages.contacted },
    { key: 'appointment', label: 'Termin vereinbart', color: '#3b82f6', icon: '📅', items: stages.appointment },
    { key: 'closing', label: 'Kein Interesse', color: '#f59e0b', icon: '⚠️', items: stages.closing },
    { key: 'won', label: 'Gewonnen', color: '#10b981', icon: '🏆', items: stages.won },
    { key: 'lost', label: 'Verloren', color: '#ef4444', icon: '✕', items: stages.lost },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'start' }}>
      {cols.map((col) => (
        <div key={col.key}>
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{col.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: col.color }}>{col.label}</span>
            <span style={{ marginLeft: 'auto', background: col.color + '22', color: col.color, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
              {col.items.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
            {col.items.map((a) => (
              <div key={a.id} style={{
                background: '#fff', borderRadius: 10, padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                border: `1px solid ${col.color}22`, borderLeft: `3px solid ${col.color}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>{a.name || 'Unbekannt'}</div>
                {a.phone && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{a.phone}</div>}
                {a.dealTotal > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 4 }}>{fmt(a.dealTotal)}</div>
                )}
                {a.dealProduct && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{a.dealProduct}</div>}
                {a.followUp && (
                  <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>📅 {fmtDate(a.followUp)}</div>
                )}
                {a.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4, borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>{a.note?.slice(0, 80)}{a.note?.length > 80 ? '…' : ''}</div>}
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 6 }}>{fmtShortDate(a.createdAt)}</div>
              </div>
            ))}
            {col.items.length === 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#cbd5e1', fontSize: 12, border: '2px dashed #e2e8f0' }}>
                Leer
              </div>
            )}
          </div>
          {col.items.filter((i) => i.dealTotal).length > 0 && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: col.color + '11', borderRadius: 6, textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: col.color, fontWeight: 700 }}>
                {fmt(col.items.reduce((s, i) => s + (i.dealTotal || 0), 0))}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: Statistiken
═══════════════════════════════════════════════════════════════════ */
const StatisticsView = ({ activities, kpis }) => {
  const weekly = useMemo(() => weeklyChartData(activities), [activities])

  const resultDist = useMemo(() => {
    const counts = {}
    activities.forEach((a) => {
      if (!a.result) return
      const l = RESULT_BADGE[a.result]?.label || a.result
      counts[l] = (counts[l] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [activities])

  const monthlyRevenue = useMemo(() => {
    const m = {}
    activities
      .filter((a) => a.type === 'deal' && a.result === 'won')
      .forEach((a) => {
        const d = new Date(a.createdAt)
        const key = `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
        m[key] = (m[key] || 0) + (a.dealTotal || 0)
      })
    return Object.entries(m).map(([name, umsatz]) => ({ name, umsatz }))
  }, [activities])

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || '#fff', fontSize: 12, fontWeight: 600 }}>
            {p.name}: {p.name === 'Umsatz' ? fmt(p.value) : p.value}
          </div>
        ))}
      </div>
    )
  }

  const statCards = [
    { label: 'Terminquote', value: `${kpis.appointmentRate.toFixed(1)} %`, sub: 'Anrufe → Termin', color: '#3b82f6' },
    { label: 'Abschlussquote', value: `${kpis.closeRate.toFixed(1)} %`, sub: 'Anrufe → Gewonnen', color: '#10b981' },
    { label: 'Ø Abschlussgröße', value: fmt(kpis.avgDeal), sub: 'pro gewonnenem Deal', color: '#f59e0b' },
    { label: 'Gesamtumsatz', value: fmt(kpis.totalRevenue), sub: `${kpis.wonDeals} Deals`, color: '#7c3aed' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stat summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, marginTop: 6, letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Weekly bar chart */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>Anrufe & Termine pro Woche</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} barGap={4} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="anrufe" name="Anrufe" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="termine" name="Termine" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="abschlüsse" name="Abschlüsse" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly revenue */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>Umsatz pro Monat</div>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyRevenue} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="umsatz" name="Umsatz" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Noch keine Abschlüsse erfasst
            </div>
          )}
        </div>

        {/* Result distribution */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>Aktivitäts-Ergebnisse</div>
          {resultDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={resultDist} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {resultDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Keine Daten</div>
          )}
        </div>

        {/* Upcoming follow-ups */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 14 }}>Nächste Folgetermine</div>
          {(() => {
            const upcoming = activities
              .filter((a) => a.followUp && new Date(a.followUp) > new Date())
              .sort((a, b) => new Date(a.followUp) - new Date(b.followUp))
              .slice(0, 7)
            return upcoming.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#f8fafc', borderLeft: '3px solid #7c3aed' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{a.name || 'Unbekannt'}</div>
                      {a.calendarTitle && <div style={{ fontSize: 11, color: '#64748b' }}>{a.calendarTitle}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{fmtDate(a.followUp)}</div>
                      {a.followUp && a.calendarTitle && (
                        <button
                          onClick={() => exportCalendar(a.calendarTitle, a.calendarNote || a.note, a.followUp)}
                          style={{ fontSize: 10, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
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
   ROOT APP
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [data, setData] = useState(defaultData)
  const [view, setView] = useState('Dashboard')
  const [input, setInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [tempKey, setTempKey] = useState('')

  useEffect(() => {
    const d = load()
    if (!d.seedDone) {
      d.activities = [...SEED, ...d.activities]
      d.seedDone = true
      save(d)
    }
    setData(d)
    setTempKey(d.apiKey || '')
    if (!d.apiKey) setShowApiKey(true)
  }, [])

  const persist = useCallback((newData) => {
    setData(newData)
    save(newData)
  }, [])

  const kpis = useMemo(() => computeKpis(data.activities), [data.activities])

  const handleAnalyze = async () => {
    if (!input.trim()) return
    if (!data.apiKey) {
      setError('Bitte zuerst den Anthropic API-Key eintragen (oben rechts).')
      setShowApiKey(true)
      return
    }
    setAnalyzing(true)
    setError('')
    try {
      const result = await analyzeText(input, data.apiKey)
      setPreview({ ...result, rawInput: input })
    } catch (e) {
      setError(`KI-Analyse fehlgeschlagen: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleConfirm = () => {
    if (!preview) return
    const activity = { id: uid(), ...preview, createdAt: now() }
    const newActivities = [activity, ...data.activities]
    persist({ ...data, activities: newActivities })

    if (preview.followUp && preview.calendarTitle) {
      exportCalendar(preview.calendarTitle, preview.calendarNote || preview.note || '', preview.followUp)
    }

    const msg = preview.followUp
      ? `✓ Aktivität gespeichert · Kalender-Export (${preview.calendarTitle}) gestartet`
      : '✓ Aktivität erfolgreich gespeichert'
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 4000)
    setPreview(null)
    setInput('')
  }

  const handleDelete = useCallback((id) => {
    persist({ ...data, activities: data.activities.filter((a) => a.id !== id) })
  }, [data, persist])

  const saveKey = () => {
    persist({ ...data, apiKey: tempKey })
    setShowApiKey(false)
    setSuccess('API-Key gespeichert')
    setTimeout(() => setSuccess(''), 2000)
  }

  const navItems = ['Dashboard', 'Aktivitäten', 'Pipeline', 'Statistiken']

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", minHeight: '100vh', background: '#f1f5f9', color: '#0f172a' }}>
      {/* ── HEADER ── */}
      <header style={{
        background: '#0f172a', height: 60, display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 20, position: 'sticky', top: 0, zIndex: 200,
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 18,
            background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
            boxShadow: '0 0 0 2px rgba(124,58,237,0.3)',
          }}>💼</div>
          <div>
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em', lineHeight: 1 }}>FinCRM</div>
            <div style={{ color: '#475569', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Finanzvertrieb</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 2 }}>
          {navItems.map((n) => (
            <button key={n} onClick={() => setView(n)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: view === n ? '#1e293b' : 'transparent',
              color: view === n ? '#e2e8f0' : '#64748b',
              transition: 'all 0.15s',
            }}>{n}</button>
          ))}
        </nav>

        {/* API Key button */}
        <button onClick={() => { setShowApiKey(!showApiKey); setTempKey(data.apiKey || '') }} style={{
          background: data.apiKey ? '#1e293b' : '#7c3aed', border: '1px solid #334155',
          borderRadius: 7, color: data.apiKey ? '#94a3b8' : '#fff', padding: '6px 14px',
          cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>{data.apiKey ? '🔑' : '⚠️'}</span>
          <span>{data.apiKey ? 'API-Key' : 'API-Key eingeben'}</span>
        </button>
      </header>

      {/* ── API KEY PANEL ── */}
      {showApiKey && (
        <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 13, flexShrink: 0 }}>Anthropic API-Key:</span>
          <input
            type="password"
            value={tempKey}
            onChange={(e) => setTempKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveKey() }}
            placeholder="sk-ant-api03-..."
            autoFocus
            style={{
              flex: 1, maxWidth: 480, padding: '7px 12px', borderRadius: 7,
              border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, outline: 'none',
            }}
          />
          <button onClick={saveKey} style={{
            background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7,
            padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>Speichern</button>
          <button onClick={() => setShowApiKey(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 18,
          }}>✕</button>
          <span style={{ color: '#475569', fontSize: 11 }}>
            Der Key wird nur lokal im Browser gespeichert und nie übertragen.
          </span>
        </div>
      )}

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px 40px' }}>
        {/* ── SUCCESS / ERROR ── */}
        {success && (
          <div style={{
            marginBottom: 14, padding: '11px 16px', background: '#d1fae5',
            border: '1px solid #a7f3d0', borderRadius: 10, color: '#065f46', fontSize: 13, fontWeight: 500,
            display: 'flex', justifyContent: 'space-between',
          }}>
            {success}
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>✕</button>
          </div>
        )}
        {error && (
          <div style={{
            marginBottom: 14, padding: '11px 16px', background: '#fee2e2',
            border: '1px solid #fca5a5', borderRadius: 10, color: '#991b1b', fontSize: 13,
            display: 'flex', justifyContent: 'space-between',
          }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>✕</button>
          </div>
        )}

        {/* ── AI INPUT BOX ── */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: '20px 22px',
          marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            }}>✨</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              KI-Aktivitäts-Logger
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>⌘+Enter zum Analysieren</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAnalyze() }}
              placeholder={[
                '„Kundin Maria Müller angerufen, Tel. 0171 123456, Termin am 08.08.26 eingetragen"',
                '„Herrn Bauer nicht erreicht, Rückruf Donnerstag 14 Uhr"',
                '„Abschluss mit Frau Schmidt, 3 Einheiten à 15.000€, Altersvorsorge"',
              ].join('\n')}
              style={{
                flex: 1, minHeight: 82, padding: '12px 14px', borderRadius: 10,
                border: '1.5px solid #e2e8f0', fontSize: 14, resize: 'none', outline: 'none',
                color: '#0f172a', lineHeight: 1.55, fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#7c3aed' }}
              onBlur={(e) => { e.target.style.borderColor = '#e2e8f0' }}
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !input.trim()}
              style={{
                alignSelf: 'flex-end', padding: '13px 26px', borderRadius: 10, border: 'none',
                cursor: (analyzing || !input.trim()) ? 'not-allowed' : 'pointer',
                background: (analyzing || !input.trim()) ? '#e2e8f0' : 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
                color: (analyzing || !input.trim()) ? '#94a3b8' : '#fff',
                fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
                boxShadow: (analyzing || !input.trim()) ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {analyzing ? '⟳ Analysiere …' : '✨ Analysieren'}
            </button>
          </div>
        </div>

        {/* ── PREVIEW CARD ── */}
        {preview && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: '20px 22px',
            marginBottom: 20, boxShadow: '0 4px 28px rgba(124,58,237,0.14)',
            border: '2px solid #7c3aed',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>KI-Ergebnis – bitte prüfen und bestätigen</span>
              </div>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Typ', value: TYPE_LABEL[preview.type]?.label || preview.type, icon: TYPE_LABEL[preview.type]?.icon },
                preview.name && { label: 'Name', value: preview.name, icon: '👤' },
                preview.phone && { label: 'Telefon', value: preview.phone, icon: '📞' },
                preview.result && { label: 'Ergebnis', value: RESULT_BADGE[preview.result]?.label || preview.result, icon: '📋' },
                preview.followUp && { label: 'Folgetermin', value: fmtDate(preview.followUp), icon: '📅' },
                preview.dealUnits && { label: 'Einheiten', value: String(preview.dealUnits), icon: '📦' },
                preview.dealValue && { label: 'Wert / Einheit', value: fmt(preview.dealValue), icon: '💶' },
                preview.dealTotal && { label: 'Gesamtwert', value: fmt(preview.dealTotal), icon: '💰' },
                preview.dealProduct && { label: 'Produkt', value: preview.dealProduct, icon: '🏷' },
                preview.calendarTitle && { label: 'Kalender-Titel', value: preview.calendarTitle, icon: '🗓' },
                preview.note && { label: 'Notiz', value: preview.note, icon: '📝' },
              ].filter(Boolean).map((f, i) => (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 9, padding: '10px 12px', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {f.icon} {f.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleConfirm} style={{
                background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', color: '#fff',
                border: 'none', borderRadius: 9, padding: '11px 26px', cursor: 'pointer',
                fontWeight: 700, fontSize: 14, boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
              }}>
                ✓ Bestätigen & Speichern{preview.followUp ? ' · Kalender .ics' : ''}
              </button>
              <button onClick={() => setPreview(null)} style={{
                background: '#f1f5f9', color: '#64748b', border: 'none',
                borderRadius: 9, padding: '11px 18px', cursor: 'pointer', fontSize: 14,
              }}>
                Verwerfen
              </button>
            </div>
          </div>
        )}

        {/* ── MAIN VIEWS ── */}
        {view === 'Dashboard' && <DashboardView kpis={kpis} activities={data.activities} />}
        {view === 'Aktivitäten' && <ActivitiesView activities={data.activities} onDelete={handleDelete} />}
        {view === 'Pipeline' && <PipelineView activities={data.activities} />}
        {view === 'Statistiken' && <StatisticsView activities={data.activities} kpis={kpis} />}
      </main>
    </div>
  )
}

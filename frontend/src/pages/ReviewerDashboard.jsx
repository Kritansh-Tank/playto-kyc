import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { getQueue, getDashboard, getAllSubmissions } from '../api'
import {
    LayoutDashboard, Clock, CheckCircle2, AlertTriangle,
    ChevronRight, LogOut, RefreshCw, Filter
} from 'lucide-react'

const STATE_BADGE = {
    draft: 'badge-draft',
    submitted: 'badge-submitted',
    under_review: 'badge-under_review',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    more_info_requested: 'badge-more_info_requested',
}

function MetricCard({ icon: Icon, label, value, sub, color }) {
    return (
        <div className="metric-card flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={18} className="text-white" />
            </div>
            <div>
                <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
                <p className="text-xs font-semibold text-slate-400">{label}</p>
                {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

export default function ReviewerDashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [metrics, setMetrics] = useState(null)
    const [submissions, setSubmissions] = useState([])
    const [stateFilter, setStateFilter] = useState('')
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)
        try {
            const [mRes, sRes] = await Promise.all([
                getDashboard(),
                stateFilter ? getAllSubmissions(stateFilter) : getQueue(),
            ])
            setMetrics(mRes.data)
            setSubmissions(sRes.data)
        } catch (e) {
            console.error(e)
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [stateFilter])

    const STATE_FILTERS = [
        { value: '', label: 'Queue (active)' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'draft', label: 'Drafts' },
    ]

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">P</div>
                    <div>
                        <p className="text-white font-bold text-lg leading-tight">Reviewer Dashboard</p>
                        <p className="text-slate-500 text-xs">{user?.full_name} · {user?.email}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => { logout(); navigate('/login') }} className="btn-secondary flex items-center gap-2 text-sm py-2 px-3">
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </div>

            {/* Metrics */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <MetricCard
                        icon={LayoutDashboard} label="In Queue" color="bg-indigo-500"
                        value={metrics.submissions_in_queue} sub="submitted + under review"
                    />
                    <MetricCard
                        icon={AlertTriangle} label="SLA At Risk" color="bg-red-500"
                        value={metrics.at_risk_count} sub=">24h in queue"
                    />
                    <MetricCard
                        icon={Clock} label="Avg Time in Queue" color="bg-amber-500"
                        value={metrics.average_time_in_queue_hours != null
                            ? `${metrics.average_time_in_queue_hours}h` : null}
                        sub="hours since submission"
                    />
                    <MetricCard
                        icon={CheckCircle2} label="7d Approval Rate" color="bg-emerald-500"
                        value={metrics.approval_rate_7d != null ? `${metrics.approval_rate_7d}%` : null}
                        sub={`${metrics.total_approved_7d}/${metrics.total_decided_7d} decided`}
                    />
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {STATE_FILTERS.map(f => (
                    <button
                        key={f.value}
                        onClick={() => setStateFilter(f.value)}
                        className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${stateFilter === f.value
                                ? 'bg-indigo-500 text-white'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Queue table */}
            <div className="glass overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading…</div>
                ) : submissions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No submissions found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5 text-left">
                                {['Merchant', 'State', 'SLA', 'Submitted', 'Business', ''].map(h => (
                                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {submissions.map((s) => (
                                <tr
                                    key={s.id}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/reviewer/${s.id}`)}
                                >
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-200">{s.full_name || s.merchant_email}</p>
                                        <p className="text-xs text-slate-500">{s.merchant_email}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`badge ${STATE_BADGE[s.state]}`}>{s.state.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {s.submitted_at ? (
                                            <span className={`badge ${s.sla_status === 'at_risk' ? 'badge-at_risk' : 'badge-ok'}`}>
                                                {s.sla_status === 'at_risk' ? '⚠ At Risk' : 'OK'}
                                            </span>
                                        ) : <span className="text-slate-600">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">
                                        {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400">
                                        <p>{s.business_name || '—'}</p>
                                        <p className="text-xs text-slate-600">{s.business_type}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <ChevronRight size={16} className="text-slate-600" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

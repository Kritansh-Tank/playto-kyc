import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSubmissionDetail, transitionSubmission } from '../api'
import {
    ArrowLeft, CheckCircle, XCircle, MessageSquare,
    Eye, FileText, AlertCircle, Clock, ExternalLink
} from 'lucide-react'

const STATE_BADGE = {
    draft: 'badge-draft',
    submitted: 'badge-submitted',
    under_review: 'badge-under_review',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    more_info_requested: 'badge-more_info_requested',
}

function Field({ label, value }) {
    return (
        <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-slate-200 text-sm">{value || <span className="text-slate-600">—</span>}</p>
        </div>
    )
}

function ActionButton({ label, icon: Icon, onClick, variant = 'secondary', disabled }) {
    const cls = variant === 'approve' ? 'btn-success' : variant === 'reject' ? 'btn-danger' : 'btn-secondary'
    return (
        <button className={`${cls} flex items-center gap-2`} onClick={onClick} disabled={disabled}>
            <Icon size={15} />{label}
        </button>
    )
}

export default function SubmissionDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [sub, setSub] = useState(null)
    const [note, setNote] = useState('')
    const [acting, setActing] = useState(false)
    const [error, setError] = useState('')
    const [noteOpen, setNoteOpen] = useState(false)
    const [pendingAction, setPendingAction] = useState(null)

    const load = async () => {
        const res = await getSubmissionDetail(id)
        setSub(res.data)
    }
    useEffect(() => { load() }, [id])

    const doTransition = async (newState) => {
        setError(''); setActing(true)
        try {
            await transitionSubmission(id, { new_state: newState, note })
            setNote(''); setNoteOpen(false); setPendingAction(null)
            await load()
        } catch (e) {
            setError(e.response?.data?.error || 'Transition failed')
        } finally { setActing(false) }
    }

    if (!sub) return <div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>

    const canUnderReview = sub.allowed_transitions?.includes('under_review')
    const canApprove = sub.allowed_transitions?.includes('approved')
    const canReject = sub.allowed_transitions?.includes('rejected')
    const canMoreInfo = sub.allowed_transitions?.includes('more_info_requested')

    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
            {/* Back nav */}
            <button onClick={() => navigate('/reviewer')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6 text-sm transition-colors">
                <ArrowLeft size={16} /> Back to dashboard
            </button>

            {/* Title + state */}
            <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">{sub.full_name || sub.merchant_email}</h1>
                    <p className="text-slate-500 text-sm">{sub.merchant_email}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className={`badge ${STATE_BADGE[sub.state]}`}>{sub.state.replace(/_/g, ' ')}</span>
                    {sub.sla_status === 'at_risk' && (
                        <span className="badge badge-at_risk"><AlertCircle size={11} /> SLA at risk</span>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-400 text-sm mb-4">
                    <AlertCircle size={15} />{error}
                </div>
            )}

            {/* Action bar */}
            {(canUnderReview || canApprove || canReject || canMoreInfo) && (
                <div className="glass p-4 mb-6 flex flex-wrap gap-3 items-start">
                    <div className="flex flex-wrap gap-2 flex-1">
                        {canUnderReview && (
                            <ActionButton label="Mark Under Review" icon={Eye}
                                onClick={() => doTransition('under_review')} disabled={acting} />
                        )}
                        {canApprove && (
                            <ActionButton label="Approve" icon={CheckCircle} variant="approve"
                                onClick={() => { setPendingAction('approved'); setNoteOpen(true) }} disabled={acting} />
                        )}
                        {canReject && (
                            <ActionButton label="Reject" icon={XCircle} variant="reject"
                                onClick={() => { setPendingAction('rejected'); setNoteOpen(true) }} disabled={acting} />
                        )}
                        {canMoreInfo && (
                            <ActionButton label="Request More Info" icon={MessageSquare}
                                onClick={() => { setPendingAction('more_info_requested'); setNoteOpen(true) }} disabled={acting} />
                        )}
                    </div>

                    {noteOpen && (
                        <div className="w-full space-y-2 border-t border-white/5 pt-3 mt-1">
                            <label className="text-xs font-semibold text-slate-400">
                                Note to merchant {pendingAction === 'approved' ? '(optional)' : '(required)'}
                            </label>
                            <textarea
                                className="input-base resize-none"
                                rows={2}
                                placeholder={
                                    pendingAction === 'rejected'
                                        ? 'Reason for rejection…'
                                        : pendingAction === 'more_info_requested'
                                            ? 'What additional information is needed?'
                                            : 'Optional note…'
                                }
                                value={note}
                                onChange={e => setNote(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button className="btn-primary" onClick={() => doTransition(pendingAction)} disabled={acting}>
                                    {acting ? 'Processing…' : `Confirm ${pendingAction?.replace(/_/g, ' ')}`}
                                </button>
                                <button className="btn-secondary" onClick={() => { setNoteOpen(false); setPendingAction(null) }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
                {/* Personal details */}
                <div className="glass p-5">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Personal Details</h3>
                    <div className="space-y-3">
                        <Field label="Full Name" value={sub.full_name} />
                        <Field label="Email" value={sub.email} />
                        <Field label="Phone" value={sub.phone} />
                    </div>
                </div>

                {/* Business details */}
                <div className="glass p-5">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Business Details</h3>
                    <div className="space-y-3">
                        <Field label="Business Name" value={sub.business_name} />
                        <Field label="Business Type" value={sub.business_type} />
                        <Field label="Expected Monthly Volume"
                            value={sub.expected_monthly_volume ? `$${Number(sub.expected_monthly_volume).toLocaleString()} USD` : null} />
                    </div>
                </div>

                {/* Documents */}
                <div className="glass p-5 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Documents</h3>
                    {sub.documents?.length === 0 ? (
                        <p className="text-slate-500 text-sm">No documents uploaded yet.</p>
                    ) : (
                        <div className="grid sm:grid-cols-3 gap-3">
                            {sub.documents?.map(doc => (
                                <a
                                    key={doc.id}
                                    href={doc.file?.startsWith('http') ? doc.file : `${BASE_URL}${doc.file}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all group"
                                >
                                    <FileText size={20} className="text-indigo-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-200 capitalize">{doc.doc_type.replace('_', ' ')}</p>
                                        <p className="text-xs text-slate-500 truncate">{doc.original_filename}</p>
                                        <p className="text-xs text-slate-600">{(doc.file_size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <ExternalLink size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* Timeline / metadata */}
                <div className="glass p-5 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Timeline</h3>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-slate-500" />
                            <div>
                                <p className="text-xs text-slate-600">Created</p>
                                <p className="text-sm text-slate-300">{new Date(sub.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                        {sub.submitted_at && (
                            <div className="flex items-center gap-2">
                                <Clock size={14} className="text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-600">Submitted</p>
                                    <p className="text-sm text-slate-300">{new Date(sub.submitted_at).toLocaleString()}</p>
                                </div>
                            </div>
                        )}
                        {sub.reviewed_at && (
                            <div className="flex items-center gap-2">
                                <CheckCircle size={14} className="text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-600">Reviewed</p>
                                    <p className="text-sm text-slate-300">{new Date(sub.reviewed_at).toLocaleString()}</p>
                                </div>
                            </div>
                        )}
                    </div>
                    {sub.reviewer_note && (
                        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <p className="text-xs text-amber-400 font-semibold mb-1">Reviewer Note</p>
                            <p className="text-sm text-amber-200">{sub.reviewer_note}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

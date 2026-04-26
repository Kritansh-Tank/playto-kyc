import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useAuth } from '../AuthContext'
import {
    getMyKYC, updateMyKYC, submitMyKYC, uploadDocument
} from '../api'
import {
    User, Building2, FileText, CheckCircle2, AlertCircle,
    Upload, LogOut, ChevronRight, ChevronLeft, Clock, Info
} from 'lucide-react'

const STEPS = [
    { id: 1, label: 'Personal Details', icon: User },
    { id: 2, label: 'Business Details', icon: Building2 },
    { id: 3, label: 'Documents', icon: FileText },
]

const STATE_CONFIG = {
    draft: { color: 'badge-draft', label: 'Draft' },
    submitted: { color: 'badge-submitted', label: 'Submitted for Review' },
    under_review: { color: 'badge-under_review', label: 'Under Review' },
    approved: { color: 'badge-approved', label: 'Approved ✓' },
    rejected: { color: 'badge-rejected', label: 'Rejected' },
    more_info_requested: { color: 'badge-more_info_requested', label: 'More Info Required' },
}

const DOC_TYPES = [
    { key: 'pan', label: 'PAN Card', desc: 'PAN card issued by Indian Income Tax Dept' },
    { key: 'aadhaar', label: 'Aadhaar Card', desc: '12-digit government ID' },
    { key: 'bank_statement', label: 'Bank Statement', desc: 'Last 3 months statement' },
]

function DocUploader({ docType, label, desc, existing, onUpload }) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(!!existing)

    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0]
        if (!file) return
        // Client-side pre-check
        const MB5 = 5 * 1024 * 1024
        if (file.size > MB5) { setError('File must be under 5 MB'); return }
        const allowed = ['application/pdf', 'image/jpeg', 'image/png']
        if (!allowed.includes(file.type)) { setError('Only PDF, JPG, PNG allowed'); return }

        setError('')
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('doc_type', docType)
            fd.append('file', file)
            await onUpload(fd)
            setSuccess(true)
        } catch (e) {
            setError(e.response?.data?.error || 'Upload failed')
            setSuccess(false)
        } finally {
            setUploading(false)
        }
    }, [docType, onUpload])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop, multiple: false,
        accept: { 'application/pdf': [], 'image/jpeg': [], 'image/png': [] },
    })

    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-200">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                </div>
                {success && <span className="badge badge-approved"><CheckCircle2 size={11} /> Uploaded</span>}
            </div>
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${isDragActive ? 'border-indigo-500 bg-indigo-500/10' :
                        success ? 'border-green-500/30 bg-green-500/5' :
                            'border-white/10 hover:border-indigo-500/50 hover:bg-white/5'}`}
            >
                <input {...getInputProps()} />
                <Upload size={20} className={`mx-auto mb-2 ${success ? 'text-green-400' : 'text-slate-500'}`} />
                <p className="text-xs text-slate-400">
                    {uploading ? 'Uploading…' : isDragActive ? 'Drop it here' : 'Drag & drop, or click to select'}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG · max 5 MB</p>
            </div>
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
        </div>
    )
}

export default function KYCPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [step, setStep] = useState(1)
    const [kyc, setKyc] = useState(null)
    const [form, setForm] = useState({ full_name: '', email: '', phone: '', business_name: '', business_type: '', expected_monthly_volume: '' })
    const [saving, setSaving] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)

    const load = async () => {
        const res = await getMyKYC()
        setKyc(res.data)
        setForm({
            full_name: res.data.full_name || '',
            email: res.data.email || '',
            phone: res.data.phone || '',
            business_name: res.data.business_name || '',
            business_type: res.data.business_type || '',
            expected_monthly_volume: res.data.expected_monthly_volume || '',
        })
    }
    useEffect(() => { load() }, [])

    const saveProgress = async () => {
        setSaving(true); setSaved(false); setError('')
        try {
            await updateMyKYC(form)
            await load()
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } catch (e) {
            setError(e.response?.data?.error || 'Save failed')
        } finally { setSaving(false) }
    }

    const handleSubmit = async () => {
        setError(''); setSubmitting(true)
        try {
            await saveProgress()
            await submitMyKYC()
            await load()
        } catch (e) {
            setError(e.response?.data?.error || 'Submission failed')
        } finally { setSubmitting(false) }
    }

    const handleUpload = async (fd) => {
        await uploadDocument(fd)
        await load()
    }

    if (!kyc) return <div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>

    const editable = ['draft', 'more_info_requested'].includes(kyc.state)
    const stateConf = STATE_CONFIG[kyc.state] || {}

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">P</div>
                    <div>
                        <p className="text-white font-bold text-lg leading-tight">Playto Pay KYC</p>
                        <p className="text-slate-500 text-xs">{user?.email}</p>
                    </div>
                </div>
                <button onClick={() => { logout(); navigate('/login') }} className="btn-secondary flex items-center gap-2 text-sm py-2 px-3">
                    <LogOut size={14} /> Logout
                </button>
            </div>

            {/* Status banner */}
            <div className="glass p-4 mb-6 flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Status</p>
                    <span className={`badge ${stateConf.color}`}>{stateConf.label}</span>
                </div>
                {kyc.reviewer_note && (
                    <div className="flex items-start gap-2 text-sm text-amber-300 max-w-xs">
                        <Info size={15} className="mt-0.5 shrink-0" />
                        <span>{kyc.reviewer_note}</span>
                    </div>
                )}
            </div>

            {/* Non-editable state */}
            {!editable && (
                <div className="glass p-6 text-center">
                    <div className="text-4xl mb-3">
                        {kyc.state === 'approved' ? '🎉' : kyc.state === 'rejected' ? '❌' : '⏳'}
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        {kyc.state === 'approved' ? 'KYC Approved!' : kyc.state === 'rejected' ? 'KYC Rejected' : 'Application Submitted'}
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {kyc.state === 'approved' && 'Your account is verified. You can now start collecting payments.'}
                        {kyc.state === 'rejected' && (kyc.reviewer_note || 'Please contact support for more information.')}
                        {kyc.state === 'submitted' && "Your application is in the review queue. We'll notify you of any changes."}
                        {kyc.state === 'under_review' && 'Your application is being reviewed. Sit tight!'}
                    </p>
                    {kyc.submitted_at && (
                        <p className="text-slate-600 text-xs mt-3 flex items-center justify-center gap-1">
                            <Clock size={12} /> Submitted {new Date(kyc.submitted_at).toLocaleString()}
                        </p>
                    )}
                </div>
            )}

            {/* Editable wizard */}
            {editable && (
                <>
                    {/* Step indicators */}
                    <div className="flex items-center gap-2 mb-6">
                        {STEPS.map((s, i) => (
                            <div key={s.id} className="flex items-center flex-1">
                                <button
                                    onClick={() => setStep(s.id)}
                                    className={`flex items-center gap-2 flex-1 p-3 rounded-xl transition-all border
                    ${step === s.id
                                            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                                            : 'border-white/5 text-slate-500 hover:border-white/10'}`}
                                >
                                    <span className={`step-dot ${step === s.id ? 'active' : step > s.id ? 'done' : 'inactive'}`}>{s.id}</span>
                                    <span className="text-xs font-semibold hidden sm:block">{s.label}</span>
                                </button>
                                {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-600 mx-1 shrink-0" />}
                            </div>
                        ))}
                    </div>

                    <div className="glass p-6 space-y-5">
                        {/* Step 1: Personal */}
                        {step === 1 && (
                            <>
                                <h2 className="text-lg font-bold text-white">Personal Details</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        { key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Arjun Sharma' },
                                        { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
                                        { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+91-9876543210' },
                                    ].map(f => (
                                        <div key={f.key} className={f.key === 'phone' ? 'sm:col-span-2' : ''}>
                                            <label className="block text-sm font-medium text-slate-300 mb-1.5">{f.label}</label>
                                            <input className="input-base" type={f.type} placeholder={f.placeholder}
                                                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Step 2: Business */}
                        {step === 2 && (
                            <>
                                <h2 className="text-lg font-bold text-white">Business Details</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Business Name</label>
                                        <input className="input-base" placeholder="Sharma Digital Agency"
                                            value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Business Type</label>
                                        <select className="input-base" value={form.business_type}
                                            onChange={e => setForm({ ...form, business_type: e.target.value })}>
                                            <option value="">Select type…</option>
                                            {['freelancer', 'agency', 'ecommerce', 'saas', 'other'].map(t => (
                                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Expected Monthly Volume (USD)</label>
                                        <input className="input-base" type="number" placeholder="5000"
                                            value={form.expected_monthly_volume}
                                            onChange={e => setForm({ ...form, expected_monthly_volume: e.target.value })} />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Step 3: Documents */}
                        {step === 3 && (
                            <>
                                <h2 className="text-lg font-bold text-white">Document Upload</h2>
                                <p className="text-slate-500 text-sm">Upload PDF, JPG, or PNG. Max 5 MB each.</p>
                                <div className="space-y-6">
                                    {DOC_TYPES.map(dt => (
                                        <DocUploader
                                            key={dt.key}
                                            docType={dt.key}
                                            label={dt.label}
                                            desc={dt.desc}
                                            existing={kyc.documents?.find(d => d.doc_type === dt.key)}
                                            onUpload={handleUpload}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-400 text-sm">
                                <AlertCircle size={15} />{error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-2">
                            <button className="btn-secondary flex items-center gap-2" onClick={saveProgress} disabled={saving}>
                                {saved ? <CheckCircle2 size={15} className="text-green-400" /> : null}
                                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save progress'}
                            </button>
                            <div className="flex gap-2">
                                {step > 1 && (
                                    <button className="btn-secondary flex items-center gap-1" onClick={() => setStep(s => s - 1)}>
                                        <ChevronLeft size={15} /> Back
                                    </button>
                                )}
                                {step < 3 ? (
                                    <button className="btn-primary" onClick={() => setStep(s => s + 1)}>
                                        Next <ChevronRight size={15} />
                                    </button>
                                ) : (
                                    <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                                        {submitting ? 'Submitting…' : 'Submit for Review'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

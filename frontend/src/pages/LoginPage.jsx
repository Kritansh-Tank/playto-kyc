import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { login } from '../api'
import { LogIn, AlertCircle } from 'lucide-react'

export default function LoginPage() {
    const { setAuth } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await login({ username: form.username, password: form.password })
            setAuth(res.data.token, res.data.user)
            navigate(res.data.user.role === 'reviewer' ? '/reviewer' : '/kyc')
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid credentials')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="glass p-8 w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">P</div>
                        <span className="text-xl font-bold text-white">Playto Pay</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Welcome back</h1>
                    <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-400 text-sm">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                        <input
                            className="input-base"
                            type="email"
                            placeholder="you@example.com"
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                        <input
                            className="input-base"
                            type="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required
                        />
                    </div>
                    <button className="btn-primary w-full justify-center" type="submit" disabled={loading}>
                        <LogIn size={16} />
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-6">
                    New merchant?{' '}
                    <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">Create account</Link>
                </p>

                {/* Demo credentials */}
                <div className="mt-6 p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Demo accounts</p>
                    <div className="space-y-1 text-xs text-slate-400 font-mono">
                        <div>📋 merchant_draft@playto.test / pass1234</div>
                        <div>🔍 merchant_review@playto.test / pass1234</div>
                        <div>👤 reviewer@playto.test / pass1234</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

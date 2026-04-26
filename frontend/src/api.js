import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({
    baseURL: `${BASE}/api/v1`,
})

// Attach token on every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Token ${token}`
    return config
})

// Auth
export const register = (data) => api.post('/auth/register/', data)
export const login = (data) => api.post('/auth/login/', data)
export const getMe = () => api.get('/auth/me/')

// Merchant KYC
export const getMyKYC = () => api.get('/kyc/me/')
export const updateMyKYC = (data) => api.patch('/kyc/me/', data)
export const submitMyKYC = () => api.post('/kyc/me/submit/')
export const uploadDocument = (formData) =>
    api.post('/kyc/me/documents/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })

// Reviewer
export const getQueue = () => api.get('/reviewer/queue/')
export const getAllSubmissions = (state) =>
    api.get('/reviewer/submissions/', { params: state ? { state } : {} })
export const getSubmissionDetail = (id) => api.get(`/reviewer/submissions/${id}/`)
export const transitionSubmission = (id, data) =>
    api.post(`/reviewer/submissions/${id}/transition/`, data)
export const getDashboard = () => api.get('/reviewer/dashboard/')

export default api

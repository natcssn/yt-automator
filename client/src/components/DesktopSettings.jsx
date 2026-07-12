import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FaTimes, FaSave, FaCheckCircle, FaRobot, FaLock, FaTv, FaGoogle } from 'react-icons/fa'

export default function DesktopSettings({ onClose }) {
    const [settings, setSettings] = useState({
        PORT: '5000',
        NVIDIA_GPU: 'false',
        FONT_PATH: 'fonts/OpenSansExtraBold.ttf',
        MAX_OUTPUT_SECONDS: '57',
        FILEBIN_KEY: 'YOUR_FILEBIN_KEY',
        GEMINI_API_KEY: '',
        GEMINI_MODEL: 'gemma-4-31b-it',
        COOKIES_FROM_BROWSER: '',
        DISCORD_TOKEN: '',
        CHANNEL_ID: '',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
    })

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                if (window.electronAPI) {
                    const data = await window.electronAPI.getSettings()
                    setSettings(s => ({ ...s, ...data }))
                }
            } catch (err) {
                console.error('Failed to load settings:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const handleChange = (key, value) => {
        setSettings(s => ({ ...s, [key]: value }))
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setSaving(true)
        setSaved(false)
        try {
            if (window.electronAPI) {
                await window.electronAPI.saveSettings(settings)
                setSaved(true)
                window.electronAPI.showNotification('YT Made EZ Studio', 'Desktop configuration updated successfully!')
                setTimeout(() => setSaved(false), 3000)
            }
        } catch (err) {
            console.error('Failed to save settings:', err)
        } finally {
            setSaving(false)
        }
    }

    return (
        <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                className="modal-content"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ maxWidth: 850 }}
            >
                <button className="modal-close" onClick={onClose}><FaTimes /></button>

                <h2 className="modal-title">
                    <span className="gradient-text">Desktop Suite Settings</span>
                </h2>
                <p className="modal-subtitle">⚙️ Tune your API keys, hardware parameters, and Discord bot locally.</p>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                        <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #A142F4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                            {/* Gemini Config */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#A142F4' }}>
                                    <FaRobot /> AI Captioning & SEO
                                </h3>
                                <div className="form-group" style={{ marginBottom: 14 }}>
                                    <label className="form-label">Gemini API Key</label>
                                    <input className="form-input" type="password" placeholder="AIzaSy..." value={settings.GEMINI_API_KEY || ''} onChange={e => handleChange('GEMINI_API_KEY', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Gemini Model</label>
                                    <input className="form-input" type="text" value={settings.GEMINI_MODEL || 'gemma-4-31b-it'} onChange={e => handleChange('GEMINI_MODEL', e.target.value)} />
                                </div>
                            </div>

                            {/* Discord Bot Config */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#5865F2' }}>
                                    <FaLock /> Discord Ingest Bot
                                </h3>
                                <div className="form-group" style={{ marginBottom: 14 }}>
                                    <label className="form-label">Bot Token</label>
                                    <input className="form-input" type="password" placeholder="MTI..." value={settings.DISCORD_TOKEN || ''} onChange={e => handleChange('DISCORD_TOKEN', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Channel ID</label>
                                    <input className="form-input" type="text" placeholder="12345678..." value={settings.CHANNEL_ID || ''} onChange={e => handleChange('CHANNEL_ID', e.target.value)} />
                                </div>
                            </div>

                            {/* Performance and Local Options */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)', gridColumn: 'span 2' }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#34A853' }}>
                                    <FaTv /> System & Media Rendering Options
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="form-group">
                                        <label className="form-label">Nvidia GPU acceleration</label>
                                        <select className="form-select" value={String(settings.NVIDIA_GPU).toLowerCase()} onChange={e => handleChange('NVIDIA_GPU', e.target.value)}>
                                            <option value="true">Enabled (Use h264_nvenc)</option>
                                            <option value="false">Disabled (Use libx264 CPU fallback)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Cookies from Browser (Optional)</label>
                                        <select className="form-select" value={settings.COOKIES_FROM_BROWSER || ''} onChange={e => handleChange('COOKIES_FROM_BROWSER', e.target.value)}>
                                            <option value="">None (Scrape without cookies)</option>
                                            <option value="chrome">Chrome</option>
                                            <option value="edge">Edge</option>
                                            <option value="firefox">Firefox</option>
                                            <option value="safari">Safari</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Server Port</label>
                                        <input className="form-input" type="number" value={settings.PORT || '5000'} onChange={e => handleChange('PORT', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Filebin upload key</label>
                                        <input className="form-input" type="text" value={settings.FILEBIN_KEY || 'YOUR_FILEBIN_KEY'} onChange={e => handleChange('FILEBIN_KEY', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Google Client API */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)', gridColumn: 'span 2' }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#4285F4' }}>
                                    <FaGoogle /> Google Client Sync (Direct Upload)
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="form-group">
                                        <label className="form-label">OAuth Client ID</label>
                                        <input className="form-input" type="text" placeholder="123456-abc..." value={settings.GOOGLE_CLIENT_ID || ''} onChange={e => handleChange('GOOGLE_CLIENT_ID', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">OAuth Client Secret</label>
                                        <input className="form-input" type="password" placeholder="GOCSPX..." value={settings.GOOGLE_CLIENT_SECRET || ''} onChange={e => handleChange('GOOGLE_CLIENT_SECRET', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="actions-row-end">
                            <button className="btn-secondary" type="button" onClick={onClose}>Close</button>
                            <button className="btn-primary" type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, #A142F4, #8b25e2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <FaSave /> {saving ? 'Saving...' : 'Save Config'}
                            </button>
                            {saved && (
                                <span className="save-indicator">
                                    <FaCheckCircle /> Saved!
                                </span>
                            )}
                        </div>
                    </form>
                )}
            </motion.div>
        </motion.div>
    )
}

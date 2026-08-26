import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
    FaTimes, FaRobot, FaPlay, FaStop, FaInstagram, FaDownload,
    FaShareAlt, FaCheckCircle, FaMagic, FaYoutube, FaLock, FaFilm,
    FaPalette, FaChevronDown, FaChevronUp, FaSlidersH, FaRandom,
    FaClock, FaExternalLinkAlt, FaGoogle, FaCalendarAlt, FaShieldAlt,
    FaBolt, FaLayerGroup, FaUpload
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';

const PRESET_PROMPTS = [
    { label: '🐱 Cute Kittens', prompt: 'Cute kittens and playful fluffy cats' },
    { label: '🐶 Puppy Moments', prompt: 'Golden retriever and funny cute puppies' },
    { label: '🏋️ Gym Memes', prompt: 'Crazy gym fails and bodybuilding humor' },
    { label: '🏎️ Supercars', prompt: 'Loud supercars and drifting action' },
    { label: '😂 Viral Memes', prompt: 'Top funny relatable dank memes' },
];

const COLOR_OPTIONS = [
    { label: 'Cyan', value: 'cyan', hex: '#00FFFF' },
    { label: 'Magenta / Pink', value: '#C11C84', hex: '#C11C84' },
    { label: 'Neon Yellow', value: 'yellow', hex: '#FFFF00' },
    { label: 'Bright Red', value: 'red', hex: '#FF3333' },
    { label: 'Lime Green', value: 'green', hex: '#00FF66' },
    { label: 'Electric Orange', value: '#FF9900', hex: '#FF9900' },
    { label: 'Gold', value: '#FFD700', hex: '#FFD700' },
    { label: 'Electric Blue', value: '#00BFFF', hex: '#00BFFF' },
    { label: 'Pure White', value: 'white', hex: '#FFFFFF' },
    { label: 'Purple', value: '#A142F4', hex: '#A142F4' },
];

const BADGE_PRESETS = {
    default: {
        name: '🌈 Classic Vibrant',
        colors5: ['#FFFF00', '#00FFFF', '#FF3333', '#00FF66', '#C11C84'],
        colors3: ['#FFFF00', '#00FFFF', '#FF3333']
    },
    neon: {
        name: '⚡ Cyberpunk Neon',
        colors5: ['#00FFFF', '#FF007F', '#FFE600', '#00FF66', '#A142F4'],
        colors3: ['#00FFFF', '#FF007F', '#FFE600']
    },
    sunset: {
        name: '🌅 Sunset Heat',
        colors5: ['#FF3366', '#FF6600', '#FFCC00', '#FF0099', '#CC00FF'],
        colors3: ['#FF3366', '#FF6600', '#FFCC00']
    },
    metals: {
        name: '🥇 Olympian Metals',
        colors5: ['#FFD700', '#C0C0C0', '#CD7F32', '#00FFFF', '#57F287'],
        colors3: ['#FFD700', '#C0C0C0', '#CD7F32']
    }
};

export default function AutoPilotWizard({ onClose }) {
    const { user, isAuthenticated, tokens, login: loginGoogle } = useAuth();

    // Primary Minimalist Inputs
    const [prompt, setPrompt] = useState('Cute kittens and playful fluffy cats');
    const [targetVideoCount, setTargetVideoCount] = useState(5);
    const [autoUploadYouTube, setAutoUploadYouTube] = useState(true);
    const [scheduleMode, setScheduleMode] = useState('daily'); // 'daily' | 'twice_daily' | 'custom_days' | 'hourly' | 'instant'
    const [scheduleDaysGap, setScheduleDaysGap] = useState(1);
    const [scheduleHoursGap, setScheduleHoursGap] = useState(4);

    // Advanced Overrides Dropdown State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [stylingMode, setStylingMode] = useState('ai_random'); // 'ai_random' | 'custom'
    const [mode, setMode] = useState('ranking5'); // 'ranking5' | 'ranking3' | 'compile'
    const [customTitle, setCustomTitle] = useState('');
    const [titleColor1, setTitleColor1] = useState('cyan');
    const [titleColor2, setTitleColor2] = useState('#C11C84');
    const [randomizeWordColors, setRandomizeWordColors] = useState(false);
    const [badgeTheme, setBadgeTheme] = useState('default');
    const [badgeColors, setBadgeColors] = useState(['#FFFF00', '#00FFFF', '#FF3333', '#00FF66', '#C11C84']);
    const [limitTotalDuration, setLimitTotalDuration] = useState(true);
    const [trimIndividualClips, setTrimIndividualClips] = useState(true);
    const [clipTrimLimit, setClipTrimLimit] = useState(10);
    const [youtubePrivacy, setYoutubePrivacy] = useState('public');
    const [youtubeCategory, setYoutubeCategory] = useState('22');

    // Live state from backend
    const [managerState, setManagerState] = useState({
        status: 'idle',
        currentVideoIndex: 1,
        targetVideoCount: 1,
        candidateCount: 0,
        requiredClips: 5,
        completedVideos: [],
        terminalLogs: []
    });

    const [loginLoading, setLoginLoading] = useState(false);
    const [shelfUploadingId, setShelfUploadingId] = useState(null);
    const [activeTab, setActiveTab] = useState('control'); // 'control' | 'shelf'
    const terminalEndRef = useRef(null);
    const socketRef = useRef(null);

    // Initialize Socket.io connection
    useEffect(() => {
        const socketOrigin = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
        const socket = io(socketOrigin, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        // Fetch initial status
        axios.get(`${API_URL}/autopilot/status`)
            .then(res => setManagerState(res.data))
            .catch(() => {});

        socket.on('autopilot:state', (state) => {
            setManagerState(state);
        });

        socket.on('autopilot:log', (entry) => {
            setManagerState(prev => ({
                ...prev,
                terminalLogs: [...(prev.terminalLogs || []), entry].slice(-80)
            }));
        });

        socket.on('autopilot:video_ready', (video) => {
            setManagerState(prev => ({
                ...prev,
                completedVideos: [video, ...(prev.completedVideos || [])]
            }));
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // Auto-scroll terminal to bottom
    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [managerState.terminalLogs]);

    const handleApplyBadgeTheme = (themeKey) => {
        setBadgeTheme(themeKey);
        if (BADGE_PRESETS[themeKey]) {
            const list = mode === 'ranking3' ? BADGE_PRESETS[themeKey].colors3 : BADGE_PRESETS[themeKey].colors5;
            setBadgeColors([...list, '#00FF66', '#C11C84'].slice(0, 5));
        }
    };

    const handleBadgeColorChange = (index, colorValue) => {
        const updated = [...badgeColors];
        updated[index] = colorValue;
        setBadgeColors(updated);
        setBadgeTheme('custom');
    };

    const handleStart = async (e) => {
        if (e) e.preventDefault();
        try {
            await axios.post(`${API_URL}/autopilot/start`, {
                prompt,
                mode,
                targetVideoCount: Number(targetVideoCount),
                limitTotalDuration,
                trimIndividualClips,
                clipTrimLimit: Number(clipTrimLimit),
                autoUploadYouTube,
                youtubeTokens: autoUploadYouTube ? tokens : null,
                youtubePrivacy,
                youtubeCategory,
                scheduleMode,
                scheduleDaysGap: Number(scheduleDaysGap),
                scheduleHoursGap: Number(scheduleHoursGap),
                stylingMode,
                customTitle: customTitle.trim(),
                titleColor1,
                titleColor2,
                randomizeWordColors,
                badgeColors: mode === 'ranking3' ? badgeColors.slice(0, 3) : badgeColors.slice(0, 5)
            });
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        }
    };

    const handleStop = async () => {
        try {
            await axios.post(`${API_URL}/autopilot/stop`);
        } catch (err) {
            console.error('Stop error:', err);
        }
    };

    const handleInteractiveLogin = async () => {
        setLoginLoading(true);
        try {
            await axios.post(`${API_URL}/autopilot/login`);
        } catch (err) {
            alert('Failed to launch Instagram login: ' + err.message);
        } finally {
            setLoginLoading(false);
        }
    };

    // Manual single upload from shelf
    const handleSingleUpload = async (videoId) => {
        if (!isAuthenticated || !tokens) {
            alert('Please connect your YouTube channel first.');
            loginGoogle();
            return;
        }
        setShelfUploadingId(videoId);
        try {
            const res = await axios.post(`${API_URL}/autopilot/upload-single`, {
                videoId,
                tokens,
                options: { privacyStatus: 'public' }
            });
            alert(`🎉 Video uploaded successfully to YouTube! Link: ${res.data.youtubeUrl}`);
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setShelfUploadingId(null);
        }
    };

    const isRunning = managerState.status === 'running';
    const isWaitingLogin = managerState.status === 'waiting_login';

    // Compute preview timeline text
    const computeScheduleDescription = () => {
        if (!autoUploadYouTube) return 'Offline batch only (no YouTube upload)';
        if (scheduleMode === 'instant') return `⚡ All ${targetVideoCount} videos will be published immediately on YouTube.`;
        if (scheduleMode === 'daily') return `📅 1 video will release per day (spread across ${targetVideoCount} consecutive days at peak hours). Quota-safe & optimal reach!`;
        if (scheduleMode === 'twice_daily') return `⚡ 2 videos will release every day (spaced 12 hours apart across ${Math.ceil(targetVideoCount / 2)} days).`;
        if (scheduleMode === 'custom_days') return `📅 1 video will release every ${scheduleDaysGap} day(s) (spread across ${targetVideoCount * scheduleDaysGap} days).`;
        if (scheduleMode === 'hourly') return `⏳ 1 video will release every ${scheduleHoursGap} hours.`;
        return '';
    };

    // Simulated title preview for custom mode
    const previewTitle = customTitle.trim() || (prompt.toLowerCase().includes('cat') ? 'KITTY MOMENTS' : prompt.toLowerCase().includes('dog') ? 'PUPPY MOMENTS' : 'TOP MOMENTS');
    const previewWords = previewTitle.split(' ');
    const previewHalf = Math.ceil(previewWords.length / 2);
    const previewLine1 = previewWords.slice(0, previewHalf).join(' ');
    const previewLine2 = previewWords.slice(previewHalf).join(' ');

    return (
        <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && !isRunning && onClose()}
        >
            <motion.div
                className="modal-content"
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 30 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    maxWidth: 960,
                    border: '1px solid rgba(255, 215, 0, 0.35)',
                    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.85), 0 0 30px rgba(255, 215, 0, 0.15)'
                }}
            >
                <button className="modal-close" onClick={onClose} disabled={isRunning}><FaTimes /></button>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                background: 'linear-gradient(90deg, #FFD700, #FFA500, #FF8C00)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontWeight: 900
                            }}>
                                ✨ Absolute AutoPilot AI
                            </span>
                        </h2>
                        <p className="modal-subtitle" style={{ marginBottom: 0 }}>
                            Zero-touch autonomous reel hunter, Gemini 2.5 Flash vision director &amp; multi-day YouTube drip publisher.
                        </p>
                    </div>

                    {/* Navigation Tabs */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className={`btn-secondary ${activeTab === 'control' ? 'active' : ''}`}
                            onClick={() => setActiveTab('control')}
                            style={{
                                padding: '6px 14px',
                                fontSize: 13,
                                borderRadius: 16,
                                borderColor: activeTab === 'control' ? '#FFD700' : 'rgba(255,255,255,0.1)',
                                color: activeTab === 'control' ? '#FFD700' : 'var(--text-secondary)'
                            }}
                        >
                            <FaRobot /> Agent Console
                        </button>
                        <button
                            className={`btn-secondary ${activeTab === 'shelf' ? 'active' : ''}`}
                            onClick={() => setActiveTab('shelf')}
                            style={{
                                padding: '6px 14px',
                                fontSize: 13,
                                borderRadius: 16,
                                borderColor: activeTab === 'shelf' ? '#FFD700' : 'rgba(255,255,255,0.1)',
                                color: activeTab === 'shelf' ? '#FFD700' : 'var(--text-secondary)',
                                position: 'relative'
                            }}
                        >
                            <FaFilm /> Video Shelf ({managerState.completedVideos?.length || 0})
                        </button>
                    </div>
                </div>

                {activeTab === 'control' ? (
                    <>
                        {/* Live Radar & Running Status View */}
                        {isRunning ? (
                            <div style={{
                                background: 'rgba(255, 215, 0, 0.03)',
                                border: '1px solid rgba(255, 215, 0, 0.25)',
                                borderRadius: 20,
                                padding: 24,
                                marginBottom: 20,
                                textAlign: 'center'
                            }}>
                                <div className="radar-container">
                                    <div className="radar-sweep" />
                                    <div className="radar-blip" style={{ top: '35%', left: '40%' }} />
                                    <FaRobot style={{ fontSize: 28, color: '#FFD700', zIndex: 2 }} />
                                </div>

                                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#FFD700', marginBottom: 6 }}>
                                    AI Agent Hunting Candidate Reels...
                                </h3>
                                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                    Video <strong>#{managerState.currentVideoIndex}</strong> of <strong>{managerState.targetVideoCount}</strong> &bull; Approved Clips: <span style={{ color: '#57F287', fontWeight: 800 }}>{managerState.candidateCount}/{managerState.requiredClips}</span>
                                </p>

                                <div className="progress-bar-wrap" style={{ margin: '0 auto 20px', maxWidth: 450 }}>
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${Math.min(100, ((managerState.candidateCount || 0) / (managerState.requiredClips || 5)) * 100)}%`,
                                            background: 'linear-gradient(90deg, #FFD700, #FFA500)'
                                        }}
                                    />
                                </div>

                                <button
                                    className="btn-secondary"
                                    onClick={handleStop}
                                    style={{ borderColor: '#EA4335', color: '#EA4335', fontWeight: 700 }}
                                >
                                    <FaStop /> Stop AutoPilot
                                </button>
                            </div>
                        ) : isWaitingLogin ? (
                            <div style={{
                                background: 'rgba(234, 67, 53, 0.08)',
                                border: '1px solid rgba(234, 67, 53, 0.3)',
                                borderRadius: 20,
                                padding: 28,
                                textAlign: 'center',
                                marginBottom: 20
                            }}>
                                <FaLock style={{ fontSize: 36, color: '#EA4335', marginBottom: 12 }} />
                                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Instagram Authentication Required</h3>
                                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto 20px' }}>
                                    To discover high-resolution reels across all hashtag categories, connect your session once.
                                </p>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => {
                                            handleStop();
                                            setManagerState(s => ({ ...s, status: 'idle' }));
                                        }}
                                    >
                                        ← Back to Configuration
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={handleInteractiveLogin}
                                        disabled={loginLoading}
                                        style={{ background: 'linear-gradient(135deg, #E1306C, #C13584)' }}
                                    >
                                        <FaInstagram /> {loginLoading ? 'Opening Browser Window...' : 'Log into Instagram (One-Time)'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* ── Minimalist One-Click Configuration Form ────────────────── */
                            <form onSubmit={handleStart}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 22, marginBottom: 16 }}>
                                    
                                    {/* 1. Theme / Prompt */}
                                    <div className="form-group" style={{ marginBottom: 16 }}>
                                        <label className="form-label" style={{ color: '#FFD700', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <FaMagic /> What kind of ranking videos do you want?
                                        </label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            placeholder="e.g. Cute kittens and playful fluffy cats"
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            style={{ borderColor: 'rgba(255, 215, 0, 0.4)', fontSize: 15, padding: '12px 14px' }}
                                            required
                                        />
                                        <div className="prompt-chips">
                                            {PRESET_PROMPTS.map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className="prompt-chip"
                                                    onClick={() => setPrompt(item.prompt)}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 2. Batch Quantity Target */}
                                    <div style={{ marginBottom: 18 }}>
                                        <label className="form-label" style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                            <FaLayerGroup style={{ color: '#FFD700' }} /> How many complete videos to produce in this batch?
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                            {[
                                                { count: 1, label: '1 Video' },
                                                { count: 3, label: '3 Videos' },
                                                { count: 5, label: '5 Videos' },
                                                { count: 10, label: '10 Videos' },
                                                { count: 20, label: '20 Videos' }
                                            ].map(({ count, label }) => (
                                                <button
                                                    key={count}
                                                    type="button"
                                                    onClick={() => setTargetVideoCount(count)}
                                                    className="prompt-chip"
                                                    style={{
                                                        padding: '10px 4px',
                                                        textAlign: 'center',
                                                        justifyContent: 'center',
                                                        borderColor: targetVideoCount === count ? '#FFD700' : 'rgba(255,255,255,0.08)',
                                                        background: targetVideoCount === count ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.02)',
                                                        color: targetVideoCount === count ? '#FFD700' : 'var(--text-secondary)',
                                                        fontWeight: targetVideoCount === count ? 800 : 500
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 3. YouTube Auto-Upload & Multi-Day Quota Drip */}
                                    <div style={{
                                        background: autoUploadYouTube ? 'rgba(87, 242, 135, 0.06)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${autoUploadYouTube ? 'rgba(87, 242, 135, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                                        borderRadius: 16,
                                        padding: 16,
                                        marginBottom: 16,
                                        transition: 'all 0.25s ease'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <FaYoutube style={{ color: '#FF0000', fontSize: 20 }} />
                                                <div>
                                                    <span style={{ fontSize: 14, fontWeight: 800, color: autoUploadYouTube ? '#57F287' : '#ffffff' }}>
                                                        Auto-Upload to YouTube &amp; Multi-Day Drip
                                                    </span>
                                                    <p style={{ fontSize: 11.5, color: 'var(--text-hint)', margin: '2px 0 0 0' }}>
                                                        Automatically publish and spread videos across days to stay well within YouTube's daily API limits.
                                                    </p>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={autoUploadYouTube}
                                                onChange={(e) => setAutoUploadYouTube(e.target.checked)}
                                                style={{ width: 20, height: 20, accentColor: '#57F287', cursor: 'pointer' }}
                                            />
                                        </div>

                                        {autoUploadYouTube && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    {isAuthenticated && user ? (
                                                        <span style={{ fontSize: 12, color: '#57F287', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <FaCheckCircle /> Channel Linked: <strong>{user.name}</strong>
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={loginGoogle}
                                                            className="google-signin-btn"
                                                            style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                        >
                                                            <FaGoogle style={{ color: '#4285F4' }} /> Connect Google / YouTube Channel
                                                        </button>
                                                    )}

                                                    <span style={{ fontSize: 11.5, color: '#FFD700', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <FaShieldAlt /> Quota Guard Active
                                                    </span>
                                                </div>

                                                {/* Smart Schedule Cadence Selector */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'center' }}>
                                                    <div>
                                                        <label className="form-label" style={{ fontSize: 12 }}>Scheduling Cadence</label>
                                                        <select
                                                            className="form-select"
                                                            value={scheduleMode}
                                                            onChange={(e) => setScheduleMode(e.target.value)}
                                                            style={{ fontSize: 12.5 }}
                                                        >
                                                            <option value="daily">🌟 AI Smart Drip (1 Video / Day &mdash; Optimal Quota &amp; Reach)</option>
                                                            <option value="twice_daily">⚡ Twice Daily (1 Video every 12 Hours)</option>
                                                            <option value="custom_days">📅 Multi-Day Gap (Every N Days)</option>
                                                            <option value="hourly">⏳ Hourly Spacing (Every N Hours)</option>
                                                            <option value="instant">⚡ Instant Release (Publish Immediately)</option>
                                                        </select>
                                                    </div>

                                                    {scheduleMode === 'custom_days' && (
                                                        <div>
                                                            <label className="form-label" style={{ fontSize: 12 }}>Days Gap</label>
                                                            <select
                                                                className="form-select"
                                                                value={scheduleDaysGap}
                                                                onChange={(e) => setScheduleDaysGap(Number(e.target.value))}
                                                                style={{ fontSize: 12.5 }}
                                                            >
                                                                <option value={2}>Every 2 Days</option>
                                                                <option value={3}>Every 3 Days</option>
                                                                <option value={4}>Every 4 Days</option>
                                                                <option value={7}>Weekly (7 Days)</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {scheduleMode === 'hourly' && (
                                                        <div>
                                                            <label className="form-label" style={{ fontSize: 12 }}>Hours Gap</label>
                                                            <select
                                                                className="form-select"
                                                                value={scheduleHoursGap}
                                                                onChange={(e) => setScheduleHoursGap(Number(e.target.value))}
                                                                style={{ fontSize: 12.5 }}
                                                            >
                                                                <option value={2}>Every 2 Hours</option>
                                                                <option value={4}>Every 4 Hours</option>
                                                                <option value={6}>Every 6 Hours</option>
                                                                <option value={12}>Every 12 Hours</option>
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Live Schedule Timeline Preview */}
                                                <div style={{
                                                    background: 'rgba(0,0,0,0.3)',
                                                    borderRadius: 10,
                                                    padding: '8px 12px',
                                                    marginTop: 10,
                                                    fontSize: 12,
                                                    color: '#57F287',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}>
                                                    <FaCalendarAlt /> {computeScheduleDescription()}
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* ── ⚙️ Collapsible Advanced Customization & Styling Overrides ──── */}
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowAdvanced(!showAdvanced)}
                                            style={{
                                                background: showAdvanced ? 'rgba(255, 215, 0, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                                color: '#FFD700',
                                                borderRadius: 12,
                                                padding: '8px 16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                width: '100%',
                                                cursor: 'pointer',
                                                fontWeight: 700,
                                                fontSize: 13
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <FaSlidersH /> ⚙️ Advanced Customization &amp; Styling Overrides (Optional / AI Defaults)
                                            </span>
                                            {showAdvanced ? <FaChevronUp /> : <FaChevronDown />}
                                        </button>

                                        <AnimatePresence>
                                            {showAdvanced && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.25 }}
                                                    style={{ overflow: 'hidden' }}
                                                >
                                                    <div style={{ padding: '16px 4px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                        
                                                        {/* AI Styling Mode Selector */}
                                                        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                                                            <label className="form-label" style={{ color: '#FFD700', fontSize: 13, fontWeight: 700 }}>
                                                                🎨 Visual Aesthetics &amp; Color Styling
                                                            </label>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setStylingMode('ai_random')}
                                                                    className="prompt-chip"
                                                                    style={{
                                                                        borderColor: stylingMode === 'ai_random' ? '#FFD700' : 'rgba(255,255,255,0.1)',
                                                                        background: stylingMode === 'ai_random' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                                                                        color: stylingMode === 'ai_random' ? '#FFD700' : 'var(--text-secondary)',
                                                                        padding: '8px 12px',
                                                                        fontWeight: 700,
                                                                        justifyContent: 'center'
                                                                    }}
                                                                >
                                                                    🤖 AI Director (Randomize Fresh Viral Theme Per Video)
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setStylingMode('custom')}
                                                                    className="prompt-chip"
                                                                    style={{
                                                                        borderColor: stylingMode === 'custom' ? '#FFD700' : 'rgba(255,255,255,0.1)',
                                                                        background: stylingMode === 'custom' ? 'rgba(255, 215, 0, 0.15)' : 'transparent',
                                                                        color: stylingMode === 'custom' ? '#FFD700' : 'var(--text-secondary)',
                                                                        padding: '8px 12px',
                                                                        fontWeight: 700,
                                                                        justifyContent: 'center'
                                                                    }}
                                                                >
                                                                    🎨 Fixed Custom Color Palette
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Custom Color Controls (Only when 'custom' selected) */}
                                                        {stylingMode === 'custom' && (
                                                            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Custom Title &amp; Badge Colors</span>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#FFD700' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={randomizeWordColors}
                                                                            onChange={(e) => setRandomizeWordColors(e.target.checked)}
                                                                            style={{ accentColor: '#FFD700' }}
                                                                        />
                                                                        <FaRandom /> Randomize bright colors per word
                                                                    </label>
                                                                </div>

                                                                {!randomizeWordColors && (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                                                                        <div>
                                                                            <label className="form-label" style={{ fontSize: 12 }}>Line 1 Color</label>
                                                                            <select
                                                                                className="form-select"
                                                                                value={titleColor1}
                                                                                onChange={(e) => setTitleColor1(e.target.value)}
                                                                            >
                                                                                {COLOR_OPTIONS.map(c => (
                                                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="form-label" style={{ fontSize: 12 }}>Line 2 Color</label>
                                                                            <select
                                                                                className="form-select"
                                                                                value={titleColor2}
                                                                                onChange={(e) => setTitleColor2(e.target.value)}
                                                                            >
                                                                                {COLOR_OPTIONS.map(c => (
                                                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Number Badges */}
                                                                <div>
                                                                    <label className="form-label" style={{ fontSize: 12, marginBottom: 6 }}>Badge Preset Theme</label>
                                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                                                        {Object.entries(BADGE_PRESETS).map(([key, data]) => (
                                                                            <button
                                                                                key={key}
                                                                                type="button"
                                                                                onClick={() => handleApplyBadgeTheme(key)}
                                                                                className="prompt-chip"
                                                                                style={{
                                                                                    borderColor: badgeTheme === key ? '#FFD700' : 'rgba(255,255,255,0.1)',
                                                                                    color: badgeTheme === key ? '#FFD700' : 'var(--text-secondary)'
                                                                                }}
                                                                            >
                                                                                {data.name}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Video Format & Custom Title Override */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12.5 }}>Compilation Format</label>
                                                                <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>
                                                                    <option value="ranking5">5-Clip Ranking Reel (Top Viral Format)</option>
                                                                    <option value="ranking3">3-Clip Ranking Reel (Fast Paced)</option>
                                                                    <option value="compile">Continuous Compilation Reel</option>
                                                                </select>
                                                            </div>

                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12.5 }}>Custom Title Overlay (Optional)</label>
                                                                <input
                                                                    className="form-input"
                                                                    type="text"
                                                                    placeholder="Leave blank for AI dynamic titles"
                                                                    value={customTitle}
                                                                    onChange={(e) => setCustomTitle(e.target.value)}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Duration & Trimming Constraints */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12.5 }}>Max Clip Trim (Seconds)</label>
                                                                <input
                                                                    className="form-input"
                                                                    type="number"
                                                                    min={3}
                                                                    max={30}
                                                                    value={clipTrimLimit}
                                                                    onChange={(e) => setClipTrimLimit(e.target.value)}
                                                                />
                                                            </div>

                                                            <div className="form-group" style={{ justifyContent: 'center' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 18, color: 'var(--text)' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={limitTotalDuration}
                                                                        onChange={(e) => setLimitTotalDuration(e.target.checked)}
                                                                        style={{ width: 16, height: 16, accentColor: '#FFD700' }}
                                                                    />
                                                                    Strict 57s Total Duration (Shorts &amp; Reels Safe)
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {/* YouTube Privacy & Category */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12.5 }}>YouTube Upload Privacy</label>
                                                                <select className="form-select" value={youtubePrivacy} onChange={(e) => setYoutubePrivacy(e.target.value)}>
                                                                    <option value="public">Public (Recommended for Viral Growth)</option>
                                                                    <option value="unlisted">Unlisted</option>
                                                                    <option value="private">Private</option>
                                                                </select>
                                                            </div>

                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12.5 }}>YouTube Category</label>
                                                                <select className="form-select" value={youtubeCategory} onChange={(e) => setYoutubeCategory(e.target.value)}>
                                                                    <option value="22">People &amp; Blogs</option>
                                                                    <option value="15">Pets &amp; Animals</option>
                                                                    <option value="23">Comedy / Memes</option>
                                                                    <option value="24">Entertainment</option>
                                                                    <option value="17">Sports / Fitness</option>
                                                                    <option value="2">Autos &amp; Vehicles</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <div className="actions-row">
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleInteractiveLogin}
                                        style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                        <FaInstagram /> Connect Instagram
                                    </button>

                                    <button type="submit" className="btn-gold btn-gold-pulse">
                                        <FaPlay /> Launch Absolute AutoPilot
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Cyberpunk Agent Monospace Live Terminal */}
                        <div style={{ marginTop: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    🛰️ Live Agent Stream &amp; Vision Feedback
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>WebSocket Live</span>
                            </div>

                            <div className="agent-terminal">
                                {managerState.terminalLogs && managerState.terminalLogs.length > 0 ? (
                                    managerState.terminalLogs.map((log) => (
                                        <div key={log.id} className="terminal-line">
                                            <span className="terminal-time">[{log.time}]</span>
                                            <span className={`terminal-tag-${log.type}`}>{log.text}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ color: 'var(--text-hint)', textAlign: 'center', padding: '30px 0' }}>
                                        Absolute AutoPilot standby. Configure your prompt above and press Launch!
                                    </div>
                                )}
                                <div ref={terminalEndRef} />
                            </div>
                        </div>
                    </>
                ) : (
                    /* Completed Video Shelf View */
                    <div>
                        {managerState.completedVideos && managerState.completedVideos.length > 0 ? (
                            <div className="video-shelf-grid">
                                {managerState.completedVideos.map((vid) => (
                                    <div key={vid.id} className="video-shelf-card">
                                        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                                            <video
                                                src={`${API_URL}/autopilot/download?videoPath=${encodeURIComponent(vid.filePath)}`}
                                                controls
                                                playsInline
                                                style={{ width: '100%', maxHeight: 240, display: 'block' }}
                                            />
                                        </div>

                                        <div>
                                            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#FFD700', marginBottom: 4 }}>
                                                {vid.title}
                                            </h4>
                                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                                Format: {vid.mode.toUpperCase()} &bull; {vid.clipCount} Clips &bull; {new Date(vid.createdAt).toLocaleTimeString()}
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                                                {vid.clips?.map((c, i) => (
                                                    <span key={i} style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6 }}>
                                                        {i + 1}. {c.caption}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* YouTube Status & Schedule Badge */}
                                            {vid.youtubeUrl ? (
                                                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                                    <a
                                                        href={vid.youtubeUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            background: 'rgba(255,0,0,0.15)',
                                                            border: '1px solid rgba(255,0,0,0.4)',
                                                            color: '#FF4D4D',
                                                            borderRadius: 12,
                                                            padding: '4px 10px',
                                                            fontSize: 11.5,
                                                            textDecoration: 'none',
                                                            fontWeight: 700
                                                        }}
                                                    >
                                                        <FaYoutube /> Watch on YouTube <FaExternalLinkAlt size={9} />
                                                    </a>
                                                    {vid.publishAt && (
                                                        <span style={{ fontSize: 11, color: '#57F287', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(87,242,135,0.1)', padding: '3px 8px', borderRadius: 10 }}>
                                                            <FaClock /> Scheduled: {new Date(vid.publishAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(vid.publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ marginBottom: 10 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSingleUpload(vid.id)}
                                                        disabled={shelfUploadingId === vid.id}
                                                        className="btn-secondary"
                                                        style={{
                                                            fontSize: 11.5,
                                                            padding: '4px 10px',
                                                            color: '#FFD700',
                                                            borderColor: 'rgba(255,215,0,0.3)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6
                                                        }}
                                                    >
                                                        <FaUpload /> {shelfUploadingId === vid.id ? 'Uploading...' : 'Upload to YouTube Now'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                                            {/* Native save in Electron vs Web download */}
                                            {window.electronAPI ? (
                                                <button
                                                    className="btn-gold"
                                                    onClick={async () => {
                                                        const res = await window.electronAPI.saveVideo(vid.filePath, vid.fileName);
                                                        if (res.success) {
                                                            window.electronAPI.showNotification('AutoPilot Video Saved', `Saved to ${res.path}`);
                                                        }
                                                    }}
                                                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, justifyContent: 'center' }}
                                                >
                                                    <FaDownload /> Save Disk
                                                </button>
                                            ) : (
                                                <a
                                                    href={`${API_URL}/autopilot/download?videoPath=${encodeURIComponent(vid.filePath)}`}
                                                    download={vid.fileName}
                                                    className="btn-gold"
                                                    style={{ flex: 1, textDecoration: 'none', padding: '7px 10px', fontSize: 12, justifyContent: 'center' }}
                                                >
                                                    <FaDownload /> Download
                                                </a>
                                            )}

                                            {vid.filebinUrl && (
                                                <a
                                                    href={vid.filebinUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn-secondary"
                                                    style={{ padding: '7px 10px', fontSize: 12, textDecoration: 'none' }}
                                                    title="Share via Filebin"
                                                >
                                                    <FaShareAlt />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-hint)' }}>
                                <FaFilm style={{ fontSize: 42, marginBottom: 12, opacity: 0.4 }} />
                                <h3>No completed videos in this session yet</h3>
                                <p style={{ fontSize: 13, maxWidth: 360, margin: '6px auto 0' }}>
                                    Launch the Absolute AutoPilot agent from the console tab to automatically hunt, filter, and produce batch videos.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
    FaTimes, FaRobot, FaPlay, FaStop, FaInstagram, FaDownload,
    FaShareAlt, FaCheckCircle, FaMagic, FaYoutube, FaLock, FaFilm
} from 'react-icons/fa';

const API_URL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';

const PRESET_PROMPTS = [
    { label: '🐱 Cute Kittens', prompt: 'Cute kittens and playful fluffy cats' },
    { label: '🐶 Puppy Moments', prompt: 'Golden retriever and funny cute puppies' },
    { label: '🏋️ Gym Memes', prompt: 'Crazy gym fails and bodybuilding humor' },
    { label: '🏎️ Supercars', prompt: 'Loud supercars and drifting action' },
    { label: '😂 Viral Memes', prompt: 'Top funny relatable dank memes' },
];

export default function AutoPilotWizard({ onClose }) {
    const [prompt, setPrompt] = useState('Cute kittens and playful fluffy cats');
    const [mode, setMode] = useState('ranking5'); // 'ranking5' | 'ranking3' | 'compile'
    const [targetVideoCount, setTargetVideoCount] = useState(1);
    const [limitTotalDuration, setLimitTotalDuration] = useState(true);
    const [trimIndividualClips, setTrimIndividualClips] = useState(true);
    const [clipTrimLimit, setClipTrimLimit] = useState(10);
    const [autoUploadYouTube, setAutoUploadYouTube] = useState(false);

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
                autoUploadYouTube
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

    const isRunning = managerState.status === 'running';
    const isWaitingLogin = managerState.status === 'waiting_login';
    const requiredClips = mode === 'ranking3' ? 3 : 5;

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
                    maxWidth: 920,
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
                                ✨ AutoPilot AI Agent
                            </span>
                        </h2>
                        <p className="modal-subtitle" style={{ marginBottom: 0 }}>
                            Autonomous real-time Instagram reel hunter, Gemini 2.5 Flash vision curator & batch ranking producer.
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
                                    To bypass Instagram's public scraper limits and discover high-resolution reels, connect your session once.
                                </p>
                                <button
                                    className="btn-primary"
                                    onClick={handleInteractiveLogin}
                                    disabled={loginLoading}
                                    style={{ background: 'linear-gradient(135deg, #E1306C, #C13584)' }}
                                >
                                    <FaInstagram /> {loginLoading ? 'Opening Browser Window...' : 'Log into Instagram (One-Time)'}
                                </button>
                            </div>
                        ) : (
                            /* Configuration Form */
                            <form onSubmit={handleStart}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 22, marginBottom: 20 }}>
                                    {/* Natural Language Prompt */}
                                    <div className="form-group" style={{ marginBottom: 16 }}>
                                        <label className="form-label" style={{ color: '#FFD700', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <FaMagic /> Video Theme / Prompt
                                        </label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            placeholder="e.g. Cute orange kittens playing with yarn"
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            style={{ borderColor: 'rgba(255, 215, 0, 0.3)', fontSize: 15 }}
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

                                    {/* Video Structure & Batch Settings */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                        <div className="form-group">
                                            <label className="form-label">Compilation Format</label>
                                            <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>
                                                <option value="ranking5">5-Clip Ranking Reel (Top Pick)</option>
                                                <option value="ranking3">3-Clip Ranking Reel (Fast Paced)</option>
                                                <option value="compile">Continuous Compilation Reel</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Batch Video Target</label>
                                            <select
                                                className="form-select"
                                                value={targetVideoCount}
                                                onChange={(e) => setTargetVideoCount(Number(e.target.value))}
                                            >
                                                <option value={1}>1 Complete Video</option>
                                                <option value={2}>2 Complete Videos</option>
                                                <option value={3}>3 Complete Videos</option>
                                                <option value={5}>5 Complete Videos</option>
                                                <option value={10}>10 Complete Videos</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Clip Constraints & Trimming */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div className="form-group">
                                            <label className="form-label">Max Clip Trim (Seconds)</label>
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
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, marginTop: 18, color: 'var(--text)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={limitTotalDuration}
                                                    onChange={(e) => setLimitTotalDuration(e.target.checked)}
                                                    style={{ width: 16, height: 16, accentColor: '#FFD700' }}
                                                />
                                                Strict 57s Total Duration (Shorts & Reels Safe)
                                            </label>
                                        </div>
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
                                        <FaPlay /> Launch AutoPilot Agent
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Cyberpunk Agent Monospace Live Terminal */}
                        <div style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    🛰️ Live Agent Stream & Vision Feedback
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
                                        Agent standby. Configure your prompt above and press Launch!
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
                                    Launch the AutoPilot agent from the console tab to automatically hunt, filter, and produce batch videos.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}

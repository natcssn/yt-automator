const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const autoPilotBrowser = require('./autoPilotBrowser');
const { evaluateClipWithAI } = require('./autoPilotEvaluator');
const { downloadReel } = require('./reelDownload');
const {
    combineAndOverlaySinglePass,
    combineBuffer3,
    combineBuffer
} = require('./combine');
const { uploadToFilebin } = require('./filebinUpload');
const { uploadToYouTube } = require('./youtubeUpload');

const VIRAL_PALETTES = [
    { name: 'Cyberpunk Neon', c1: '#00FFFF', c2: '#FF007F', badges: ['#00FFFF', '#FF007F', '#FFE600', '#00FF66', '#A142F4'] },
    { name: 'Sunset Heat', c1: '#FFD700', c2: '#FF3366', badges: ['#FF3366', '#FF6600', '#FFCC00', '#FF0099', '#CC00FF'] },
    { name: 'Electric Lime & Purple', c1: '#00FF66', c2: '#A142F4', badges: ['#00FF66', '#A142F4', '#00FFFF', '#FFFF00', '#FF3366'] },
    { name: 'Classic Gold & Cyan', c1: '#00FFFF', c2: '#C11C84', badges: ['#FFFF00', '#00FFFF', '#FF3333', '#00FF66', '#C11C84'] },
    { name: 'Olympian Metals', c1: '#FFD700', c2: '#00BFFF', badges: ['#FFD700', '#C0C0C0', '#CD7F32', '#00FFFF', '#57F287'] },
    { name: 'Fire & Ice', c1: '#00BFFF', c2: '#FF4500', badges: ['#00BFFF', '#FF4500', '#00FFCC', '#FF8C00', '#FF1493'] },
    { name: 'Neon Toxic', c1: '#39FF14', c2: '#FF073A', badges: ['#39FF14', '#FF073A', '#00F0FF', '#FFE600', '#B026FF'] },
];

const THEMATIC_TITLE_TEMPLATES = {
    cats: ['KITTY MOMENTS', 'FELINE ZOOMIES', 'PURRFECT CLIPS', 'PAWSOME REELS', 'CUTEST KITTENS', 'CAT MADNESS', 'SWEET WHISKERS', 'SILLY PAWS'],
    dogs: ['PUPPY MOMENTS', 'DOGGO ZOOMIES', 'GOOD BOYS ONLY', 'BARKTACULAR CLIPS', 'CUTEST PUPS', 'PAW PATROL', 'GOLDEN VIBES', 'TAIL WAGGERS'],
    gym: ['GYM FAILS & WINS', 'BEAST MODE MOMENTS', 'IRON PUMP REELS', 'HEAVY LIFTS', 'GYM CHROMA', 'HARDCORE GAINS', 'PR SZN CLIPS', 'SAVAGE LIFTS'],
    cars: ['SUPERCAR REVS', 'DRIFT KING MOMENTS', 'TURBO NIGHTS', 'EXHAUST FLAMES', 'APEX MONSTERS', 'HYPERCAR RUNS', 'HORSEPOWER GLORY', 'PURE SPEED'],
    memes: ['DANK MEME VAULT', 'INTERNET GOLD', 'UNHINGED MOMENTS', 'TOP TIER HUMOR', 'PURE CHAOS REELS', 'BRAINROT ELITE', 'TIKTOK CLASSICS', 'ULTRA RELATABLE'],
    general: ['TOP MOMENTS', 'VIRAL PULSE', 'EPIC REELS', 'GOLD STANDARD', 'BEST OF THE WEB', 'PRIME HIGHLIGHTS', 'UNREAL CLIPS', 'THE VIRAL DROP']
};

class AutoPilotManager {
    constructor() {
        this.io = null;
        this.status = 'idle'; // 'idle' | 'running' | 'waiting_login' | 'completed' | 'error'
        this.config = {
            prompt: 'Cute Kittens Ranking',
            mode: 'ranking5', // 'ranking5' | 'ranking3' | 'compile'
            limitTotalDuration: true,
            trimIndividualClips: true,
            clipTrimLimit: 10,
            targetVideoCount: 1,
            autoUploadYouTube: false,
            scheduleMode: 'daily', // 'daily' | 'twice_daily' | 'custom_days' | 'hourly' | 'instant'
            scheduleDaysGap: 1,
            scheduleHoursGap: 24,
            stylingMode: 'ai_random' // 'ai_random' | 'custom'
        };
        this.currentJob = null;
        this.completedVideos = [];
        this.terminalLogs = [];
        this.isCancelled = false;
        this.activeCandidates = []; // Approved clips for current video
    }

    setSocketIO(io) {
        this.io = io;
    }

    log(text, type = 'info') {
        const entry = {
            id: uuidv4(),
            text,
            type, // 'info' | 'success' | 'warn' | 'error' | 'radar'
            time: new Date().toLocaleTimeString()
        };
        this.terminalLogs.push(entry);
        if (this.terminalLogs.length > 80) {
            this.terminalLogs.shift();
        }
        console.log(`[AutoPilot] [${type.toUpperCase()}] ${text}`);
        if (this.io) {
            this.io.emit('autopilot:log', entry);
        }
    }

    emitState() {
        if (!this.io) return;
        this.io.emit('autopilot:state', this.getState());
    }

    getState() {
        return {
            status: this.status,
            config: this.config,
            currentJob: this.currentJob,
            candidateCount: this.activeCandidates.length,
            requiredClips: this.config.mode === 'ranking3' ? 3 : 5,
            currentVideoIndex: this.currentJob ? this.currentJob.videosCompleted + 1 : 1,
            targetVideoCount: this.config.targetVideoCount,
            completedVideos: this.completedVideos,
            terminalLogs: this.terminalLogs
        };
    }

    getThematicTitle(prompt = '', category = '', videoIndex = 1) {
        const p = (prompt || '').toLowerCase();
        let list = THEMATIC_TITLE_TEMPLATES.general;
        if (p.includes('cat') || p.includes('kitten') || category.includes('cat')) {
            list = THEMATIC_TITLE_TEMPLATES.cats;
        } else if (p.includes('dog') || p.includes('puppy') || category.includes('dog')) {
            list = THEMATIC_TITLE_TEMPLATES.dogs;
        } else if (p.includes('gym') || p.includes('workout') || category.includes('gym')) {
            list = THEMATIC_TITLE_TEMPLATES.gym;
        } else if (p.includes('car') || p.includes('drift') || category.includes('car')) {
            list = THEMATIC_TITLE_TEMPLATES.cars;
        } else if (p.includes('meme') || p.includes('funny') || category.includes('meme')) {
            list = THEMATIC_TITLE_TEMPLATES.memes;
        }

        const baseTitle = list[(videoIndex - 1) % list.length];
        return baseTitle;
    }

    calculatePublishTimestamp(videoIndex) {
        // Mode: 'daily', 'twice_daily', 'custom_days', 'hourly', 'instant'
        const mode = this.config.scheduleMode || 'daily';
        let hoursOffset = 0;

        if (mode === 'instant') {
            return null; // Publish immediately
        }

        if (mode === 'daily') {
            hoursOffset = (videoIndex - 1) * 24;
        } else if (mode === 'twice_daily') {
            hoursOffset = (videoIndex - 1) * 12;
        } else if (mode === 'custom_days') {
            const daysGap = Math.max(1, Number(this.config.scheduleDaysGap) || 1);
            hoursOffset = (videoIndex - 1) * daysGap * 24;
        } else if (mode === 'hourly') {
            const hoursGap = Math.max(1, Number(this.config.scheduleHoursGap) || Number(this.config.youtubeScheduleIntervalHours) || 2);
            hoursOffset = (videoIndex - 1) * hoursGap;
        }

        // Set base time at upcoming optimal hour (or +15 minutes from now for video 1)
        const baseMs = Date.now() + 15 * 60 * 1000;
        const targetMs = baseMs + (hoursOffset * 3600 * 1000);
        return new Date(targetMs).toISOString();
    }

    async start(userConfig = {}) {
        if (this.status === 'running') {
            throw new Error('AutoPilot is already running a session.');
        }

        this.config = {
            ...this.config,
            ...userConfig
        };

        this.isCancelled = false;
        autoPilotBrowser.clearHistory();
        this.status = 'running';
        this.currentJob = {
            id: uuidv4(),
            targetVideoCount: Number(this.config.targetVideoCount) || 1,
            videosCompleted: 0,
            startedAt: new Date().toISOString()
        };

        this.log(`🚀 Absolute AutoPilot activated with prompt: "${this.config.prompt}"`, 'radar');
        this.log(`⚙️ Mode: ${this.config.mode.toUpperCase()} | Target: ${this.config.targetVideoCount} full video(s) | Schedule: ${(this.config.scheduleMode || 'daily').toUpperCase()}`, 'info');
        this.emitState();

        this.runLoop().catch(err => {
            console.error('[AutoPilotManager] Fatal runLoop error:', err);
            this.status = 'error';
            this.log(`❌ AutoPilot encountered an error: ${err.message}`, 'error');
            this.emitState();
        });

        return { success: true, jobId: this.currentJob.id };
    }

    async stop() {
        this.isCancelled = true;
        this.status = 'idle';
        this.log('🛑 AutoPilot stopped by user.', 'warn');
        await autoPilotBrowser.close();
        this.emitState();
        return { success: true };
    }

    async triggerInteractiveLogin() {
        this.status = 'waiting_login';
        this.log('🔐 Launching interactive Instagram login window...', 'warn');
        this.emitState();

        const success = await autoPilotBrowser.openInteractiveLogin((msg) => {
            this.log(`🌐 ${msg}`, 'info');
        });

        if (success) {
            this.status = 'idle';
            this.log('🎉 Instagram session confirmed! You can now start AutoPilot.', 'success');
        } else {
            this.status = 'idle';
            this.log('⚠️ Login window closed or timed out.', 'warn');
        }

        this.emitState();
        return { success };
    }

    async runLoop() {
        const SERVER_ROOT = path.join(__dirname, '..');
        const WRITABLE_ROOT = process.env.YT_DATA_DIR || SERVER_ROOT;
        const requiredClips = this.config.mode === 'ranking3' ? 3 : 5;

        // Step 1: Check login status
        this.log('🛡️ Verifying hunter channels & credentials...', 'info');
        const isLoggedIn = await autoPilotBrowser.checkLoginStatus();
        if (isLoggedIn) {
            this.log('✅ Instagram session authenticated.', 'success');
        } else {
            this.log('🌐 Multi-stream hunter active (Instagram + YouTube Shorts discovery).', 'info');
        }

        while (!this.isCancelled && this.currentJob.videosCompleted < this.config.targetVideoCount) {
            const currentVideoNum = this.currentJob.videosCompleted + 1;
            this.log(`📡 Hunting candidate reels for Video #${currentVideoNum}/${this.config.targetVideoCount}...`, 'radar');
            this.emitState();

            // Create temporary working directory for this video's clips
            const videoBufferDir = path.join(WRITABLE_ROOT, `autopilot_buffer_${Date.now()}_${uuidv4().slice(0, 6)}`);
            if (!fs.existsSync(videoBufferDir)) {
                fs.mkdirSync(videoBufferDir, { recursive: true });
            }

            this.activeCandidates = [];

            // Step 2 & 3: Reel Discovery and AI Vision Evaluation
            const handleReelDiscovered = async (reelUrl) => {
                if (this.isCancelled || this.activeCandidates.length >= requiredClips) return;

                this.log(`📥 Downloading candidate reel: ${reelUrl}...`, 'info');
                try {
                    const downloadResult = await downloadReel(reelUrl, videoBufferDir);
                    const clipPath = typeof downloadResult === 'string' ? downloadResult : downloadResult.filePath;

                    if (!fs.existsSync(clipPath)) {
                        this.log(`⚠️ Download file missing for ${reelUrl}`, 'warn');
                        return;
                    }

                    this.log(`👁️ Gemini 2.5 Flash evaluating clip #${this.activeCandidates.length + 1}...`, 'radar');
                    const existingCaptions = this.activeCandidates.map(c => c.caption);
                    const evaluation = await evaluateClipWithAI(clipPath, this.config.prompt, existingCaptions);

                    if (evaluation.isMatch) {
                        this.activeCandidates.push({
                            reelUrl,
                            filePath: clipPath,
                            caption: evaluation.caption,
                            category: evaluation.category,
                            score: evaluation.score,
                            reason: evaluation.reason
                        });

                        this.log(`✅ Approved (${this.activeCandidates.length}/${requiredClips}): "${evaluation.caption}" (Match Score: ${evaluation.score}/10)`, 'success');
                        this.emitState();
                    } else {
                        this.log(`❌ Rejected Reel: ${evaluation.reason} (Score: ${evaluation.score}/10)`, 'warn');
                        try { fs.unlinkSync(clipPath); } catch {}
                    }
                } catch (err) {
                    this.log(`⚠️ Evaluation error on ${reelUrl}: ${err.message}`, 'warn');
                }
            };

            // Collect reels until required count is achieved or cancelled with dynamic hashtag & query rotation
            await autoPilotBrowser.searchAndCollectReels(
                this.config.prompt,
                handleReelDiscovered,
                (msg) => this.log(msg, 'info'),
                () => this.isCancelled || this.activeCandidates.length >= requiredClips,
                25,
                currentVideoNum
            );

            if (this.isCancelled) break;

            if (this.activeCandidates.length < requiredClips) {
                this.log(`⚠️ Only gathered ${this.activeCandidates.length}/${requiredClips} approved clips. Broadening search terms and continuing...`, 'warn');
                continue;
            }

            // Step 4: Compile Final Video with AI Autonomous Styling or Custom Overrides
            this.log(`🎬 All ${requiredClips} clips gathered! Compiling Video #${currentVideoNum}...`, 'radar');
            this.emitState();

            const outputName = `autopilot_${this.config.mode}_${Date.now()}.mp4`;
            const outputPath = path.join(WRITABLE_ROOT, outputName);
            const captionsList = this.activeCandidates.map(c => c.caption);

            // Determine Video Title (Custom override or dynamic AI viral template)
            let titleText = 'TOP MOMENTS';
            if (this.config.customTitle && this.config.customTitle.trim()) {
                titleText = this.config.customTitle.trim().toUpperCase();
            } else {
                const category = this.activeCandidates[0]?.category || 'general';
                titleText = this.getThematicTitle(this.config.prompt, category, currentVideoNum);
            }

            // Determine Aesthetics / Color Styling
            let titleColor1 = this.config.titleColor1 || 'cyan';
            let titleColor2 = this.config.titleColor2 || '#C11C84';
            let badgeColors = this.config.badgeColors;
            let randomizeWordColors = !!this.config.randomizeWordColors;

            // If in AI Autonomous styling mode, pick fresh complementary viral palette per video
            if (this.config.stylingMode !== 'custom') {
                const palette = VIRAL_PALETTES[(currentVideoNum - 1) % VIRAL_PALETTES.length];
                titleColor1 = palette.c1;
                titleColor2 = palette.c2;
                badgeColors = this.config.mode === 'ranking3' ? palette.badges.slice(0, 3) : palette.badges.slice(0, 5);
                this.log(`🎨 AI Director assigned style "${palette.name}" for Video #${currentVideoNum}`, 'info');
            }

            try {
                if (this.config.mode === 'compile') {
                    await combineBuffer(videoBufferDir, {
                        outputFile: outputPath,
                        sortMode: 'provided',
                        cleanup: true
                    });
                } else {
                    // Ranking mode (3-clip or 5-clip with animated scores, titles & captions)
                    await combineAndOverlaySinglePass(videoBufferDir, titleText, captionsList, {
                        outputFile: outputPath,
                        sortMode: 'provided',
                        cleanup: true,
                        titleColor1,
                        titleColor2,
                        randomizeWordColors,
                        badgeColors
                    });
                }

                this.log(`🎉 Compilation Complete: ${outputName}!`, 'success');

                // Generate Filebin upload link
                let filebinUrl = null;
                try {
                    filebinUrl = await uploadToFilebin(outputPath, false);
                    this.log(`🔗 Filebin download link generated: ${filebinUrl}`, 'info');
                } catch (e) {
                    // Filebin upload optional
                }

                const videoRecord = {
                    id: uuidv4(),
                    videoIndex: currentVideoNum,
                    title: `${titleText} #${currentVideoNum}`,
                    fileName: outputName,
                    filePath: outputPath,
                    mode: this.config.mode,
                    clipCount: requiredClips,
                    clips: this.activeCandidates.map(c => ({ caption: c.caption, reelUrl: c.reelUrl, score: c.score })),
                    downloadUrl: `/api/video/download-file?path=${encodeURIComponent(outputPath)}`,
                    filebinUrl: filebinUrl,
                    createdAt: new Date().toISOString()
                };

                // Automatic YouTube Upload & Multi-Day Drip Scheduling (if enabled)
                if (this.config.autoUploadYouTube && this.config.youtubeTokens) {
                    try {
                        this.log(`📤 Auto-uploading Video #${currentVideoNum} to YouTube...`, 'radar');
                        const publishAt = this.calculatePublishTimestamp(currentVideoNum);

                        if (publishAt) {
                            const dateStr = new Date(publishAt).toLocaleDateString();
                            const timeStr = new Date(publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            this.log(`📅 Video #${currentVideoNum} scheduled for release on: ${dateStr} at ${timeStr} (Quota-Safe Drip)`, 'info');
                        }

                        const ytMetadata = {
                            title: `${titleText} #${currentVideoNum} #Shorts`,
                            description: `Best moments curated automatically by YT Automation Studio.\n\n#Shorts #${this.config.prompt.replace(/\s+/g, '')} #viral #ranking`,
                            tags: ['shorts', 'viral', 'ranking', this.config.prompt, titleText],
                            privacyStatus: this.config.youtubePrivacy || 'public',
                            categoryId: this.config.youtubeCategory || '22',
                            publishAt: publishAt
                        };

                        const ytResult = await uploadToYouTube(outputPath, ytMetadata, this.config.youtubeTokens);
                        if (ytResult && ytResult.id) {
                            videoRecord.youtubeId = ytResult.id;
                            videoRecord.youtubeUrl = `https://youtu.be/${ytResult.id}`;
                            videoRecord.publishAt = publishAt;
                            this.log(`🎉 Successfully published Video #${currentVideoNum} to YouTube! Link: https://youtu.be/${ytResult.id}`, 'success');
                        }
                    } catch (ytErr) {
                        this.log(`⚠️ YouTube upload error for Video #${currentVideoNum}: ${ytErr.message}`, 'warn');
                    }
                }

                this.completedVideos.unshift(videoRecord);
                this.currentJob.videosCompleted++;

                if (this.io) {
                    this.io.emit('autopilot:video_ready', videoRecord);
                }
                this.emitState();

                // Clean up source buffer folder
                try {
                    fs.rmSync(videoBufferDir, { recursive: true, force: true });
                } catch {}

            } catch (err) {
                this.log(`❌ Compilation failed for Video #${currentVideoNum}: ${err.message}`, 'error');
            }
        }

        await autoPilotBrowser.close();
        if (this.currentJob.videosCompleted >= this.config.targetVideoCount) {
            this.status = 'completed';
            this.log(`🏁 AutoPilot Batch Complete! Successfully generated ${this.currentJob.videosCompleted} video(s).`, 'success');
        } else {
            this.status = 'idle';
        }
        this.emitState();
    }

    // Manual single upload from Video Shelf
    async uploadSingleVideo(videoId, tokens, options = {}) {
        const record = this.completedVideos.find(v => v.id === videoId);
        if (!record) throw new Error('Video record not found in shelf');
        if (!fs.existsSync(record.filePath)) throw new Error('Video file not found on disk');

        const {
            publishAt = null,
            privacyStatus = 'public',
            customTitle = record.title,
            category = '22'
        } = options;

        const ytMetadata = {
            title: `${customTitle} #Shorts`,
            description: `Best moments curated automatically by YT Automation Studio.\n\n#Shorts #viral #ranking`,
            tags: ['shorts', 'viral', 'ranking'],
            privacyStatus,
            categoryId: category,
            publishAt
        };

        const ytResult = await uploadToYouTube(record.filePath, ytMetadata, tokens);
        if (ytResult && ytResult.id) {
            record.youtubeId = ytResult.id;
            record.youtubeUrl = `https://youtu.be/${ytResult.id}`;
            record.publishAt = publishAt;
            this.emitState();
        }
        return { success: true, youtubeId: ytResult.id, youtubeUrl: `https://youtu.be/${ytResult.id}` };
    }
}

module.exports = new AutoPilotManager();

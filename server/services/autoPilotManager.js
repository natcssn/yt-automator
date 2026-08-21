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
            autoUploadYouTube: false
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
        const requiredClips = this.config.mode === 'ranking3' ? 3 : 5;
        return {
            status: this.status,
            config: this.config,
            currentVideoIndex: (this.currentJob ? this.currentJob.videosCompleted : 0) + 1,
            targetVideoCount: this.config.targetVideoCount,
            candidateCount: this.activeCandidates.length,
            requiredClips: requiredClips,
            completedVideos: this.completedVideos,
            terminalLogs: this.terminalLogs
        };
    }

    async start(userConfig = {}) {
        if (this.status === 'running') {
            throw new Error('AutoPilot is already running.');
        }

        this.config = { ...this.config, ...userConfig };
        this.config.targetVideoCount = Math.max(1, Number(this.config.targetVideoCount) || 1);
        this.config.clipTrimLimit = Math.max(3, Number(this.config.clipTrimLimit) || 10);
        this.isCancelled = false;
        this.status = 'running';
        this.activeCandidates = [];

        this.currentJob = {
            id: uuidv4(),
            startTime: Date.now(),
            videosCompleted: 0,
            totalScanned: 0,
            acceptedCount: 0
        };

        this.log(`🚀 AutoPilot activated with prompt: "${this.config.prompt}"`, 'radar');
        this.log(`⚙️ Mode: ${this.config.mode.toUpperCase()} | Target: ${this.config.targetVideoCount} full video(s) | Max Duration: 57s`, 'info');
        this.emitState();

        // Run orchestration loop in background
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
            fs.mkdirSync(videoBufferDir, { recursive: true });

            this.activeCandidates = [];
            const existingCaptions = [];

            // Collector callback
            const handleReelDiscovered = async (reelUrl) => {
                if (this.isCancelled) return;
                if (this.activeCandidates.length >= requiredClips) return;

                this.currentJob.totalScanned++;
                this.log(`📥 Downloading candidate reel: ${reelUrl}...`, 'info');

                try {
                    const dlResult = await downloadReel(reelUrl, videoBufferDir);
                    if (!dlResult || !dlResult.filePath || !fs.existsSync(dlResult.filePath)) {
                        this.log(`⚠️ Skipped: Failed to extract media from ${reelUrl}`, 'warn');
                        return;
                    }

                    // Step 3: Multimodal Vision Inspection
                    this.log(`👁️ Gemini 2.5 Flash evaluating clip #${this.currentJob.totalScanned}...`, 'radar');
                    const aiEval = await evaluateClipWithAI(dlResult.filePath, this.config.prompt, existingCaptions);

                    if (aiEval.isMatch) {
                        this.currentJob.acceptedCount++;
                        existingCaptions.push(aiEval.caption);

                        const candidateObj = {
                            id: uuidv4(),
                            filePath: dlResult.filePath,
                            reelUrl: reelUrl,
                            caption: aiEval.caption,
                            score: aiEval.score,
                            category: aiEval.category,
                            reason: aiEval.reason
                        };

                        this.activeCandidates.push(candidateObj);
                        this.log(`✅ Approved (${this.activeCandidates.length}/${requiredClips}): "${aiEval.caption}" (Match Score: ${aiEval.score}/10)`, 'success');

                        if (this.io) {
                            this.io.emit('autopilot:clip_accepted', {
                                candidate: candidateObj,
                                count: this.activeCandidates.length,
                                required: requiredClips
                            });
                        }
                        this.emitState();
                    } else {
                        // Reject and remove temp file
                        this.log(`❌ Rejected Reel: ${aiEval.reason || 'Did not match theme'} (Score: ${aiEval.score}/10)`, 'warn');
                        try { fs.unlinkSync(dlResult.filePath); } catch {}
                        if (this.io) {
                            this.io.emit('autopilot:clip_rejected', {
                                url: reelUrl,
                                reason: aiEval.reason
                            });
                        }
                    }
                } catch (err) {
                    this.log(`⚠️ Evaluation error on ${reelUrl}: ${err.message}`, 'warn');
                }
            };

            // Collect reels until required count is achieved or cancelled
            await autoPilotBrowser.searchAndCollectReels(
                this.config.prompt,
                handleReelDiscovered,
                (msg) => this.log(msg, 'info'),
                () => this.isCancelled || this.activeCandidates.length >= requiredClips,
                25
            );

            if (this.isCancelled) break;

            if (this.activeCandidates.length < requiredClips) {
                this.log(`⚠️ Only gathered ${this.activeCandidates.length}/${requiredClips} approved clips. Broadening search terms and continuing...`, 'warn');
                continue;
            }

            // Step 4: Compile Final Video
            this.log(`🎬 All ${requiredClips} clips gathered! Compiling Video #${currentVideoNum}...`, 'radar');
            this.emitState();

            const outputName = `autopilot_${this.config.mode}_${Date.now()}.mp4`;
            const outputPath = path.join(WRITABLE_ROOT, outputName);
            const captionsList = this.activeCandidates.map(c => c.caption);

            // Determine Video Title
            let titleText = 'TOP MOMENTS';
            if (this.activeCandidates[0] && this.activeCandidates[0].category) {
                const cat = this.activeCandidates[0].category.toUpperCase();
                titleText = cat.includes('CAT') ? 'KITTY MOMENTS' : cat.includes('DOG') ? 'PUPPY MOMENTS' : `${cat} MOMENTS`;
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
                        cleanup: true
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
}

module.exports = new AutoPilotManager();

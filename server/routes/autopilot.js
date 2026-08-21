const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const autoPilotManager = require('../services/autoPilotManager');

// Start autonomous AutoPilot pipeline
router.post('/start', async (req, res) => {
    try {
        const result = await autoPilotManager.start(req.body || {});
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Stop autonomous pipeline
router.post('/stop', async (req, res) => {
    try {
        const result = await autoPilotManager.stop();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Launch interactive Instagram login
router.post('/login', async (req, res) => {
    try {
        const result = await autoPilotManager.triggerInteractiveLogin();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current state, logs, and stats
router.get('/status', (req, res) => {
    res.json(autoPilotManager.getState());
});

// Get all completed videos in this session
router.get('/videos', (req, res) => {
    res.json(autoPilotManager.completedVideos);
});

// Stream or download video file directly
router.get('/download', (req, res) => {
    const { videoPath } = req.query;
    if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video file not found' });
    }

    const filename = path.basename(videoPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(videoPath).pipe(res);
});

module.exports = router;

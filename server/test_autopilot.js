const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const autoPilotManager = require('./services/autoPilotManager');

async function runTest() {
    console.log('🚀 Launching AutoPilot End-to-End Test with Gemini 2.5 Flash...');
    
    // Listen to manager state changes & terminal logs
    autoPilotManager.onLog = (logEntry) => {
        console.log(`[TERMINAL ${logEntry.time}] [${logEntry.type.toUpperCase()}] ${logEntry.text}`);
    };

    autoPilotManager.onStateChange = (state) => {
        console.log(`[STATE] Status: ${state.status} | Scanned: ${state.totalScanned} | Candidates: ${state.candidateCount}/${state.requiredClips} | Completed: ${state.completedVideos?.length || 0}`);
    };

    try {
        await autoPilotManager.start({
            prompt: 'Cute orange kittens playing with toys',
            mode: 'ranking3',
            targetVideoCount: 1,
            limitTotalDuration: true,
            trimIndividualClips: true,
            clipTrimLimit: 10,
            autoUploadYouTube: false
        });

        // Wait until pipeline finishes
        while (autoPilotManager.status === 'running') {
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log('\n=============================================');
        console.log('🎉 AutoPilot Pipeline Finished Successfully!');
        console.log('Completed Videos in Shelf:', autoPilotManager.completedVideos);
        console.log('=============================================\n');
    } catch (err) {
        console.error('❌ Test failed with error:', err);
    } finally {
        process.exit(0);
    }
}

runTest();

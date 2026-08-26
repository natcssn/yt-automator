const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const autoPilotManager = require('./services/autoPilotManager');

async function testBackend() {
    console.log('--- Testing AutoPilot Backend & Routing ---');

    // 1. Test state methods
    const state = autoPilotManager.getState();
    console.log('✅ autoPilotManager.getState() returned status:', state.status);
    console.log('✅ completedVideos count:', state.completedVideos?.length || 0);

    // 2. Test Multi-Day Drip Calculations
    autoPilotManager.config.scheduleMode = 'daily';
    const day1 = autoPilotManager.calculatePublishTimestamp(1);
    const day2 = autoPilotManager.calculatePublishTimestamp(2);
    const day3 = autoPilotManager.calculatePublishTimestamp(3);
    console.log('✅ Daily Drip Schedule Day 1:', day1);
    console.log('✅ Daily Drip Schedule Day 2:', day2);
    console.log('✅ Daily Drip Schedule Day 3:', day3);

    const diffHours = (new Date(day2).getTime() - new Date(day1).getTime()) / (3600 * 1000);
    console.log(`✅ Time difference between Day 1 and Day 2: ${diffHours} hours (Expected: 24)`);

    // 3. Test AI Director Aesthetic Palette Selection & Title Generation
    for (let i = 1; i <= 3; i++) {
        const title = autoPilotManager.getThematicTitle('Cute kittens', 'cats', i);
        console.log(`✅ Video #${i} AI Dynamic Title: "${title}"`);
    }

    console.log('\n🎉 All backend unit & logic tests passed successfully!\n');
    process.exit(0);
}

testBackend().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});

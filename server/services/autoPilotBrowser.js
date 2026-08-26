const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

// Expansive, categorized dynamic hashtag matrices to guarantee non-repeating discoveries
const NICHE_HASHTAGS = {
    cats: [
        'cutecats', 'catsofinstagram', 'kittens', 'funnycats', 'catmemes',
        'catsoftiktok', 'meow', 'kittensofinstagram', 'gatos', 'catlover',
        'instacat', 'catzoomies', 'playfulcat', 'funnycatvideos', 'catfails',
        'catlogic', 'catattack', 'catpounce', 'catsplaying', 'crazycats',
        'kittenplay', 'orangekitty', 'gingercats', 'fluffykitten', 'calicocats',
        'tabbycats', 'chonk', 'chubbycat', 'tinykitten', 'babycat',
        'viralcats', 'catreels', 'petreels', 'meowstagram', 'catsdoingthings'
    ],
    dogs: [
        'cutedogs', 'puppiesofinstagram', 'dogsofinstagram', 'goldenretriever',
        'puppylife', 'dogfails', 'derpydogs', 'dogzoomies', 'funnydogvideos',
        'goldenretrievers', 'doggo', 'puppylove', 'dogmemes', 'dogsoftiktok',
        'husky', 'labrador', 'corgi', 'frenchie', 'playfuldog', 'dogplaying',
        'dogreels', 'puppyreels', 'viralpuppy', 'happydog', 'goodboy'
    ],
    gym: [
        'gymfails', 'gymhumor', 'fitnessmemes', 'bodybuilding', 'gymcomedy',
        'workoutfails', 'bodybuildingfails', 'prfails', 'powerliftingfails',
        'gymrat', 'gymmotivation', 'fitnesshumor', 'liftfails', 'gymtok',
        'gymbro', 'weightlifting', 'squatfail', 'benchpress', 'deadliftfail'
    ],
    cars: [
        'supercars', 'carsofinstagram', 'jdm', 'carmemes', 'supercardrift',
        'coldstart', 'exhaustflame', 'twinturbo', 'launchcontrol', 'carguys',
        'turbo', 'drifting', 'carreels', 'supercarreels', 'hypercars',
        'lamborghini', 'ferrari', 'porsche', 'gtr', 'driftcar', 'burnout'
    ],
    memes: [
        'memes', 'dankmemes', 'funnymemes', 'viralreels', 'dankmemesdaily',
        'unhingedmemes', 'brainrot', 'instantregret', 'shitposts', 'lol',
        'humor', 'comedyreels', 'tiktokmemes', 'funnyvideos', 'fails'
    ]
};

class AutoPilotBrowser {
    constructor() {
        this.context = null;
        this.page = null;
        this.isRunning = false;
        this.userDataDir = this.resolveUserDataDir();
        this.seenUrls = new Set(); // Global deduplication across the entire session/batch
    }

    clearHistory() {
        this.seenUrls.clear();
    }

    resolveUserDataDir() {
        const root = process.env.YT_DATA_DIR || path.join(__dirname, '..');
        const dir = path.join(root, 'browser_profile');
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (err) {
                console.error('[AutoPilotBrowser] Failed to create browser profile dir:', err.message);
            }
        }
        return dir;
    }

    async init(headless = true) {
        if (this.context) {
            return this.page;
        }

        console.log(`[AutoPilotBrowser] Launching Chromium (headless: ${headless}) with profile at ${this.userDataDir}...`);
        this.context = await chromium.launchPersistentContext(this.userDataDir, {
            headless: headless,
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
            ],
            locale: 'en-US',
        });

        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

        // Apply anti-detection evasions
        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        this.isRunning = true;
        return this.page;
    }

    async checkLoginStatus() {
        try {
            await this.init(true);
            console.log('[AutoPilotBrowser] Checking Instagram authentication state...');
            await this.page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.page.waitForTimeout(3000);

            // Check if login form inputs are present
            const isLoginForm = await this.page.$('input[name="username"], input[name="password"]');
            const hasNavFeed = await this.page.$('svg[aria-label="Home"], svg[aria-label="Reels"], svg[aria-label="Direct"], nav');

            const loggedIn = !isLoginForm && !!hasNavFeed;
            console.log(`[AutoPilotBrowser] Instagram Logged In: ${loggedIn}`);
            return loggedIn;
        } catch (err) {
            console.error('[AutoPilotBrowser] checkLoginStatus error:', err.message);
            return false;
        }
    }

    async openInteractiveLogin(onStatus) {
        console.log('[AutoPilotBrowser] Opening interactive login browser window for user...');
        if (this.context) {
            await this.close();
        }

        if (onStatus) onStatus('Opening browser window for Instagram login...');
        await this.init(false); // Visible window

        await this.page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    if (!this.page || this.page.isClosed()) {
                        clearInterval(checkInterval);
                        return resolve(false);
                    }

                    const isHome = await this.page.$('svg[aria-label="Home"], svg[aria-label="Reels"], a[href="/"]');
                    const url = this.page.url();

                    if (isHome && !url.includes('/accounts/login')) {
                        clearInterval(checkInterval);
                        console.log('[AutoPilotBrowser] User successfully logged in!');
                        if (onStatus) onStatus('Instagram Login detected! Saving session profile...');
                        await this.page.waitForTimeout(3000);
                        await this.close();
                        resolve(true);
                    }
                } catch (e) {
                    // Page may be transitioning
                }
            }, 2000);

            // Timeout after 3 minutes if user didn't finish
            setTimeout(async () => {
                clearInterval(checkInterval);
                await this.close();
                resolve(false);
            }, 180000);
        });
    }

    // Dynamic hashtag selection that rotates per videoIndex and avoids repeating
    deriveSearchTags(promptText, videoIndex = 1) {
        const clean = (promptText || '').toLowerCase();
        let pool = [];

        if (clean.includes('cat') || clean.includes('kitten') || clean.includes('kitty')) {
            pool = NICHE_HASHTAGS.cats;
        } else if (clean.includes('dog') || clean.includes('puppy') || clean.includes('pup')) {
            pool = NICHE_HASHTAGS.dogs;
        } else if (clean.includes('gym') || clean.includes('workout') || clean.includes('fitness')) {
            pool = NICHE_HASHTAGS.gym;
        } else if (clean.includes('car') || clean.includes('supercar') || clean.includes('drift')) {
            pool = NICHE_HASHTAGS.cars;
        } else if (clean.includes('meme') || clean.includes('funny') || clean.includes('comedy')) {
            pool = NICHE_HASHTAGS.memes;
        } else {
            // Natural language keyword extraction + generic viral pools
            const words = clean.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
            pool = [
                ...words,
                words.join(''),
                'viralreels', 'reelsinstagram', 'trendingreels', 'explorepage', 'reelsvideo', 'foryoupage'
            ];
        }

        // Rotate and slice 4-5 distinct hashtags based on videoIndex offset
        const startIndex = ((videoIndex - 1) * 4) % pool.length;
        const rotated = [...pool.slice(startIndex), ...pool.slice(0, startIndex)];
        return rotated.slice(0, 5);
    }

    async searchAndCollectReels(promptText, onReelDiscovered, onLog, isCancelledRef, targetCount = 15, videoIndex = 1) {
        await this.init(true);
        const tags = this.deriveSearchTags(promptText, videoIndex);
        const batchUrls = new Set();

        if (onLog) onLog(`🔍 AutoPilot dynamically targeted hashtags for Video #${videoIndex}: ${tags.map(t => `#${t}`).join(', ')}...`);

        // Phase 1: Search distinct Instagram explore hashtag feeds
        for (const tag of tags) {
            if (isCancelledRef && isCancelledRef()) break;
            if (batchUrls.size >= targetCount) break;

            const tagUrl = `https://www.instagram.com/explore/tags/${tag}/`;
            if (onLog) onLog(`🌐 Browsing fresh hashtag feed: #${tag}...`);

            try {
                await this.page.goto(tagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(2500);

                // Dismiss cookie/notification prompts if present
                try {
                    const dismissBtn = await this.page.$('button:has-text("Decline"), button:has-text("Not Now"), button:has-text("Cancel")');
                    if (dismissBtn) await dismissBtn.click();
                } catch {}

                let scrollAttempts = 0;
                // Vary scroll depth based on video index to explore deeper / different portions
                const maxScrolls = 4 + (videoIndex % 4);

                while (scrollAttempts < maxScrolls && batchUrls.size < targetCount) {
                    if (isCancelledRef && isCancelledRef()) break;

                    // Extract all hrefs matching /reel/ or /p/
                    const hrefs = await this.page.$$eval('a[href*="/reel/"], a[href*="/p/"]', anchors =>
                        anchors.map(a => a.href)
                    );

                    for (const rawHref of hrefs) {
                        const m = rawHref.match(/https:\/\/www\.instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
                        if (m) {
                            const canonicalUrl = `https://www.instagram.com/reels/${m[1]}/`;
                            // STRICT DEDUPLICATION: Skip if seen anywhere in this session or current batch
                            if (!this.seenUrls.has(canonicalUrl) && !batchUrls.has(canonicalUrl)) {
                                this.seenUrls.add(canonicalUrl);
                                batchUrls.add(canonicalUrl);
                                if (onReelDiscovered) {
                                    await onReelDiscovered(canonicalUrl);
                                }
                                if (batchUrls.size >= targetCount) break;
                            }
                        }
                    }

                    // Humanized scroll
                    if (!this.page || this.page.isClosed()) break;
                    const scrollDistance = Math.floor(Math.random() * 600) + 700;
                    await this.page.mouse.wheel(0, scrollDistance);
                    const pauseTime = Math.floor(Math.random() * 1200) + 1200;
                    await this.page.waitForTimeout(pauseTime);
                    scrollAttempts++;
                }
            } catch (err) {
                if (onLog && !this.isCancelled) onLog(`⚠️ Warning traversing #${tag}: ${err.message}`);
            }
        }

        // Phase 2: Dynamic YouTube Shorts search with rotating search queries per video index
        if (batchUrls.size < targetCount && !(isCancelledRef && isCancelledRef()) && this.page && !this.page.isClosed()) {
            try {
                const cleanQuery = promptText.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
                const queryVariations = [
                    `${cleanQuery} funny shorts`,
                    `${cleanQuery} viral clips shorts`,
                    `${cleanQuery} cute moments shorts`,
                    `${cleanQuery} compilation shorts`,
                    `${cleanQuery} trending shorts`,
                    `${cleanQuery} top shorts`
                ];
                const selectedQuery = queryVariations[(videoIndex - 1) % queryVariations.length];
                const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(selectedQuery)}`;

                if (onLog) onLog(`🔍 AutoPilot scanning fresh Shorts stream for "${selectedQuery}"...`);
                await this.page.goto(ytSearchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(3000);

                let scrollAttempts = 0;
                while (scrollAttempts < 8 && batchUrls.size < targetCount) {
                    if ((isCancelledRef && isCancelledRef()) || !this.page || this.page.isClosed()) break;

                    const shortsHrefs = await this.page.$$eval('a[href*="/shorts/"]', anchors =>
                        anchors.map(a => a.href)
                    );

                    for (const rawHref of shortsHrefs) {
                        const m = rawHref.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
                        if (m) {
                            const canonicalUrl = `https://www.youtube.com/shorts/${m[1]}`;
                            // STRICT DEDUPLICATION: Never repeat a URL used in an earlier video
                            if (!this.seenUrls.has(canonicalUrl) && !batchUrls.has(canonicalUrl)) {
                                this.seenUrls.add(canonicalUrl);
                                batchUrls.add(canonicalUrl);
                                if (onReelDiscovered) {
                                    await onReelDiscovered(canonicalUrl);
                                }
                                if (batchUrls.size >= targetCount) break;
                            }
                        }
                    }

                    if (!this.page || this.page.isClosed()) break;
                    await this.page.mouse.wheel(0, 1000);
                    await this.page.waitForTimeout(1500);
                    scrollAttempts++;
                }
            } catch (err) {
                if (onLog && !this.isCancelled) onLog(`⚠️ Warning on Shorts stream: ${err.message}`);
            }
        }

        if (onLog) onLog(`✅ AutoPilot collected ${batchUrls.size} unique candidate reel links for Video #${videoIndex}.`);
        return Array.from(batchUrls);
    }

    async close() {
        try {
            if (this.context) {
                await this.context.close();
            }
        } catch (err) {
            console.error('[AutoPilotBrowser] Close error:', err.message);
        } finally {
            this.context = null;
            this.page = null;
            this.isRunning = false;
        }
    }
}

module.exports = new AutoPilotBrowser();

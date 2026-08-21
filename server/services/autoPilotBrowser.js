const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

class AutoPilotBrowser {
    constructor() {
        this.context = null;
        this.page = null;
        this.isRunning = false;
        this.userDataDir = this.resolveUserDataDir();
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

    deriveSearchTags(promptText) {
        const clean = (promptText || '').toLowerCase();
        const tags = [];

        if (clean.includes('cat') || clean.includes('kitten') || clean.includes('kitty')) {
            tags.push('cutecats', 'catsofinstagram', 'kittens', 'funnycats', 'catmemes');
        } else if (clean.includes('dog') || clean.includes('puppy') || clean.includes('pup')) {
            tags.push('cutedogs', 'puppiesofinstagram', 'dogsofinstagram', 'goldenretriever');
        } else if (clean.includes('gym') || clean.includes('workout') || clean.includes('fitness')) {
            tags.push('gymfails', 'gymhumor', 'fitnessmemes', 'bodybuilding');
        } else if (clean.includes('car') || clean.includes('supercar') || clean.includes('drift')) {
            tags.push('supercars', 'carsofinstagram', 'jdm', 'carmemes');
        } else if (clean.includes('meme') || clean.includes('funny') || clean.includes('comedy')) {
            tags.push('memes', 'dankmemes', 'funnymemes', 'viralreels');
        } else {
            // Extract keywords from prompt
            const words = clean.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
            if (words.length > 0) {
                tags.push(words.join(''), words[0]);
            }
            tags.push('viralreels', 'reelsinstagram');
        }

        return tags;
    }

    async searchAndCollectReels(promptText, onReelDiscovered, onLog, isCancelledRef, targetCount = 15) {
        await this.init(true);
        const tags = this.deriveSearchTags(promptText);
        const collectedUrls = new Set();

        if (onLog) onLog(`🔍 AutoPilot scanning hashtags: ${tags.map(t => `#${t}`).join(', ')}...`);

        for (const tag of tags) {
            if (isCancelledRef && isCancelledRef()) break;
            if (collectedUrls.size >= targetCount) break;

            const tagUrl = `https://www.instagram.com/explore/tags/${tag}/`;
            if (onLog) onLog(`🌐 Browsing explore feed: #${tag}...`);

            try {
                await this.page.goto(tagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(2500);

                // Dismiss cookie or notification prompts if present
                try {
                    const dismissBtn = await this.page.$('button:has-text("Decline"), button:has-text("Not Now"), button:has-text("Cancel")');
                    if (dismissBtn) await dismissBtn.click();
                } catch {}

                let scrollAttempts = 0;
                while (scrollAttempts < 6 && collectedUrls.size < targetCount) {
                    if (isCancelledRef && isCancelledRef()) break;

                    // Extract all hrefs matching /reel/ or /p/
                    const hrefs = await this.page.$$eval('a[href*="/reel/"], a[href*="/p/"]', anchors =>
                        anchors.map(a => a.href)
                    );

                    for (const rawHref of hrefs) {
                        const m = rawHref.match(/https:\/\/www\.instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
                        if (m) {
                            const canonicalUrl = `https://www.instagram.com/reels/${m[1]}/`;
                            if (!collectedUrls.has(canonicalUrl)) {
                                collectedUrls.add(canonicalUrl);
                                if (onReelDiscovered) {
                                    await onReelDiscovered(canonicalUrl);
                                }
                                if (collectedUrls.size >= targetCount) break;
                            }
                        }
                    }

                    // Humanized scroll
                    if (!this.page || this.page.isClosed()) break;
                    const scrollDistance = Math.floor(Math.random() * 600) + 700;
                    await this.page.mouse.wheel(0, scrollDistance);
                    const pauseTime = Math.floor(Math.random() * 1500) + 1500;
                    await this.page.waitForTimeout(pauseTime);
                    scrollAttempts++;
                }
            } catch (err) {
                if (onLog && !this.isCancelled) onLog(`⚠️ Warning traversing #${tag}: ${err.message}`);
            }
        }

        // Fallback: Also explore general reels tab if not enough
        if (collectedUrls.size < targetCount && !(isCancelledRef && isCancelledRef()) && this.page && !this.page.isClosed()) {
            try {
                if (onLog) onLog('🌐 Browsing main Reels stream for additional candidates...');
                await this.page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(3000);

                let scrollAttempts = 0;
                while (scrollAttempts < 8 && collectedUrls.size < targetCount) {
                    if (isCancelledRef && isCancelledRef() || !this.page || this.page.isClosed()) break;

                    const url = this.page.url();
                    const m = url.match(/https:\/\/www\.instagram\.com\/reels\/([a-zA-Z0-9_-]+)/);
                    if (m) {
                        const canonicalUrl = `https://www.instagram.com/reels/${m[1]}/`;
                        if (!collectedUrls.has(canonicalUrl)) {
                            collectedUrls.add(canonicalUrl);
                            if (onReelDiscovered) {
                                await onReelDiscovered(canonicalUrl);
                            }
                        }
                    }

                    // Scroll to next reel (Down arrow or PageDown)
                    if (!this.page || this.page.isClosed()) break;
                    await this.page.keyboard.press('ArrowDown');
                    await this.page.waitForTimeout(Math.floor(Math.random() * 1500) + 2000);
                    scrollAttempts++;
                }
            } catch (err) {
                if (onLog && !this.isCancelled) onLog(`⚠️ Warning on reels feed: ${err.message}`);
            }
        }

        // Universal Stream: Search YouTube Shorts for guaranteed fresh candidate 9:16 reels
        if (collectedUrls.size < targetCount && !(isCancelledRef && isCancelledRef()) && this.page && !this.page.isClosed()) {
            try {
                const cleanQuery = promptText.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
                const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery + ' shorts')}`;
                if (onLog) onLog(`🔍 AutoPilot scanning Shorts stream for "${cleanQuery}"...`);
                await this.page.goto(ytSearchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(3000);

                let scrollAttempts = 0;
                while (scrollAttempts < 8 && collectedUrls.size < targetCount) {
                    if ((isCancelledRef && isCancelledRef()) || !this.page || this.page.isClosed()) break;

                    const shortsHrefs = await this.page.$$eval('a[href*="/shorts/"]', anchors =>
                        anchors.map(a => a.href)
                    );

                    for (const rawHref of shortsHrefs) {
                        const m = rawHref.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
                        if (m) {
                            const canonicalUrl = `https://www.youtube.com/shorts/${m[1]}`;
                            if (!collectedUrls.has(canonicalUrl)) {
                                collectedUrls.add(canonicalUrl);
                                if (onReelDiscovered) {
                                    await onReelDiscovered(canonicalUrl);
                                }
                                if (collectedUrls.size >= targetCount) break;
                            }
                        }
                    }

                    if (!this.page || this.page.isClosed()) break;
                    await this.page.mouse.wheel(0, 1000);
                    await this.page.waitForTimeout(1800);
                    scrollAttempts++;
                }
            } catch (err) {
                if (onLog && !this.isCancelled) onLog(`⚠️ Warning on Shorts stream: ${err.message}`);
            }
        }

        if (onLog) onLog(`✅ AutoPilot collected ${collectedUrls.size} candidate reel links for evaluation.`);
        return Array.from(collectedUrls);
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

const fs = require('fs');
const { spawn } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { ffmpegPath, ffprobePath } = require('ffmpeg-ffprobe-static');

// Rich contextual dictionary for smart non-duplicating fallbacks
const THEMATIC_CAPTIONS = {
    cats: [
        'Sneaky Pounce', 'Wool Chase', 'Fluffy Zoomies', 'Tiny Whiskers',
        'Box Jumper', 'Cozy Loaf', 'Laser Stalker', 'Purr Machine',
        'Bumble Meow', 'Sink Splasher', 'Tail Hunter', 'Silly Paws',
        'Sunny Napper', 'Feather Swat', 'Ninja Jump', 'Curious Look',
        'Fierce Kitten', 'Bouncy Paws', 'Midnight Sprint', 'Gentle Purr'
    ],
    dogs: [
        'Golden Joy', 'Tail Wagger', 'Puppy Zoomies', 'Stick Master',
        'Muddy Paws', 'Happy Barks', 'Ball Chaser', 'Derpy Smile',
        'Floppy Ears', 'Fast Fetch', 'Water Splasher', 'Snack Sniffer',
        'Cozy Snooze', 'Loyal Guard', 'Snow Slider', 'Bouncy Pup'
    ],
    gym: [
        'Iron Pump', 'Heavy Pull', 'Squat Beast', 'Epic PR',
        'Chalk Blast', 'Muscle Flex', 'Crazy Grip', 'Barbell Drop',
        'Raw Power', 'Core Burn', 'Pure Grind', 'Bicep Peak'
    ],
    cars: [
        'Turbo Drift', 'Exhaust Flame', 'Twin Turbo', 'Apex Clipper',
        'Smoke Show', 'V10 Scream', 'Launch Control', 'Track Beast',
        'Clean Slide', 'Boost Rush', 'Quarter Mile', 'Carbon Beast'
    ],
    memes: [
        'Absolute Cinema', 'Brain Freeze', 'Zero Regrets', 'Instant Regret',
        'Ultra Instinct', 'Peak Comedy', 'Skill Issue', 'Emotional Damage',
        'Task Failed', 'Plot Twist', 'Pure Chaos', 'Top Tier'
    ],
    general: [
        'Top Moment', 'Viral Pulse', 'Epic Catch', 'Gold Standard',
        'Next Level', 'Wild Action', 'Prime Focus', 'Crowd Pleaser',
        'Big Impact', 'Rare Find', 'Total Legend', 'Magic Touch'
    ]
};

function getDynamicSmartCaption(category = 'general', prompt = '', existingCaptions = []) {
    const p = prompt.toLowerCase();
    let pool = THEMATIC_CAPTIONS.general;

    if (p.includes('cat') || p.includes('kitten') || category.includes('cat')) {
        pool = THEMATIC_CAPTIONS.cats;
    } else if (p.includes('dog') || p.includes('puppy') || category.includes('dog')) {
        pool = THEMATIC_CAPTIONS.dogs;
    } else if (p.includes('gym') || p.includes('workout') || p.includes('lift') || category.includes('gym')) {
        pool = THEMATIC_CAPTIONS.gym;
    } else if (p.includes('car') || p.includes('drift') || p.includes('supercar') || category.includes('car')) {
        pool = THEMATIC_CAPTIONS.cars;
    } else if (p.includes('meme') || p.includes('funny') || p.includes('fail') || category.includes('meme')) {
        pool = THEMATIC_CAPTIONS.memes;
    }

    const lowerExisting = new Set((existingCaptions || []).map(c => String(c).toLowerCase().trim()));
    const available = pool.filter(c => !lowerExisting.has(c.toLowerCase()));

    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }

    // Secondary fallback with adjective + noun
    const adjs = ['Epic', 'Wild', 'Super', 'Hyper', 'Swift', 'Mega', 'Bold', 'Bright', 'Crisp'];
    const nouns = ['Moment', 'Action', 'Vibe', 'Energy', 'Spark', 'Rush', 'Peak', 'Highlight'];
    for (const a of adjs) {
        for (const n of nouns) {
            const candidate = `${a} ${n}`;
            if (!lowerExisting.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
    }

    return `Highlight ${existingCaptions.length + 1}`;
}

function probeDuration(filePath) {
    return new Promise((resolve, reject) => {
        const proc = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath,
        ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr.slice(-200)}`));
            const dur = parseFloat(stdout.trim());
            resolve(isNaN(dur) || dur <= 0 ? 5 : dur);
        });
        proc.on('error', reject);
    });
}

function processClipForGemini(filePath, duration) {
    return new Promise((resolve, reject) => {
        const maxDuration = 35;
        const args = [
            '-v', 'error',
            '-i', filePath,
        ];

        if (duration > maxDuration) {
            args.push('-t', String(maxDuration));
        }

        args.push(
            '-an',
            '-vf', 'scale=320:-2,fps=6',
            '-vcodec', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-crf', '34',
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov',
            'pipe:1',
        );

        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const chunks = [];
        let stderr = '';

        proc.stdout.on('data', d => chunks.push(d));
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code !== 0 || chunks.length === 0) {
                return reject(new Error(`ffmpeg clip compression failed: ${stderr.slice(-300)}`));
            }
            resolve(Buffer.concat(chunks));
        });
        proc.on('error', reject);
    });
}

async function queryGeminiModel(ai, modelName, videoBuffer, prompt) {
    const response = await ai.models.generateContent({
        model: modelName,
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: videoBuffer.toString('base64'),
                            mimeType: 'video/mp4',
                        },
                    },
                    {
                        text: prompt,
                    },
                ],
            },
        ],
    });

    let text = String(response?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || response?.text || '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
            try { parsed = JSON.parse(m[0]); } catch {}
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid JSON format in Gemini response: ${text.slice(0, 150)}`);
    }

    return parsed;
}

async function evaluateClipWithAI(filePath, userPrompt, existingCaptions = []) {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        console.warn('[AutoPilotEvaluator] No GEMINI_API_KEY set — assigning smart contextual caption.');
        const caption = getDynamicSmartCaption('general', userPrompt, existingCaptions);
        return {
            isMatch: true,
            score: 7,
            category: 'general',
            caption: caption,
            reason: 'Gemini API key not configured, default accepted.'
        };
    }

    if (!fs.existsSync(filePath)) {
        return { isMatch: false, score: 0, reason: 'File does not exist on disk' };
    }

    try {
        const duration = await probeDuration(filePath);
        const videoBuffer = await processClipForGemini(filePath, duration);
        const ai = new GoogleGenAI({ apiKey });

        const prompt = [
            'You are an elite video curator and caption writer for high-converting social media reels.',
            `The user\'s target content request is: "${userPrompt || 'cute interesting video'}"`,
            '',
            'Watch the provided video clip carefully and inspect its visual content and action.',
            'Evaluate whether this video satisfies the user request:',
            '1. "isMatch": true if the video clearly fits the user request theme, false if unrelated, an ad, or a person talking to camera.',
            '2. "score": Relevance score from 1 to 10 (10 being perfect match).',
            '3. "category": Main subject category (e.g. cats, dogs, gym, cars, memes, other).',
            '4. "caption": A catchy, funny, vivid 1 to 2 word title for this SPECIFIC clip based directly on what is happening in the video (e.g. "Sneaky Pounce", "Laser Hunt", "Tiny Loaf", "Sink Bath", "Wool Ball").',
            '   - FORBIDDEN WORDS: NEVER use generic placeholders like "short", "clip", "video", "moment", "featured", or numbers.',
            `   - STRICT CONSTRAINT: Do NOT duplicate any of these existing captions: ${JSON.stringify(existingCaptions)}`,
            '5. "reason": Brief 1-sentence explanation of what occurs in the video.',
            '',
            'Return ONLY a strict JSON object with these exact keys:',
            '{',
            '  "isMatch": true,',
            '  "score": 9,',
            '  "category": "cats",',
            '  "caption": "Sneaky Pounce",',
            '  "reason": "Shows a fluffy orange kitten pouncing on a toy mouse"',
            '}'
        ].join('\n');

        let parsed = null;
        let lastError = null;

        // Try primary model (gemini-2.5-flash), with fallback to gemini-1.5-flash
        const modelsToTry = [process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-1.5-flash'];

        for (const modelName of modelsToTry) {
            try {
                console.log(`[AutoPilotEvaluator] Inspecting clip with ${modelName} against prompt: "${userPrompt}"...`);
                parsed = await queryGeminiModel(ai, modelName, videoBuffer, prompt);
                if (parsed) break;
            } catch (err) {
                lastError = err;
                console.warn(`[AutoPilotEvaluator] ${modelName} attempt error: ${err.message}. Trying next fallback...`);
                await new Promise(r => setTimeout(r, 1200));
            }
        }

        if (!parsed) {
            throw lastError || new Error('All Gemini model queries failed');
        }

        // Clean and format caption
        let rawCaption = String(parsed.caption || '').replace(/['"“”`*#_]/g, '').trim();
        const words = rawCaption.split(/\s+/).filter(Boolean);
        let caption = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        const lower = caption.toLowerCase();
        const forbidden = ['clip', 'video', 'short', 'part', 'featured', 'moment', 'scene', 'top pick', 'untitled'];
        const isBadCaption = !caption || forbidden.some(f => lower.includes(f)) || (existingCaptions || []).some(e => e.toLowerCase() === lower);

        if (isBadCaption) {
            caption = getDynamicSmartCaption(String(parsed.category || ''), userPrompt, existingCaptions);
        }

        const result = {
            isMatch: Boolean(parsed.isMatch && (parsed.score >= 5 || parsed.score === undefined)),
            score: Number(parsed.score) || (parsed.isMatch ? 8 : 2),
            category: String(parsed.category || 'general'),
            caption: caption,
            reason: String(parsed.reason || 'AI inspected visual content')
        };

        console.log(`[AutoPilotEvaluator] AI Decision: ${result.isMatch ? '✅ MATCH' : '❌ REJECT'} (Score: ${result.score}/10) | Caption: "${result.caption}" | Reason: ${result.reason}`);
        return result;
    } catch (err) {
        console.error(`[AutoPilotEvaluator] AI Inspection error: ${err.message}`);
        // Smart Contextual Fallback (never hardcoded "Featured Clip")
        const fallbackCaption = getDynamicSmartCaption('general', userPrompt, existingCaptions);
        return {
            isMatch: true,
            score: 6,
            category: 'general',
            caption: fallbackCaption,
            reason: `Smart thematic fallback due to API status: ${err.message.slice(0, 60)}`
        };
    }
}

module.exports = {
    evaluateClipWithAI,
    probeDuration,
    getDynamicSmartCaption
};

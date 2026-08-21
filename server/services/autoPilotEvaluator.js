const fs = require('fs');
const { spawn } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { ffmpegPath, ffprobePath } = require('ffmpeg-ffprobe-static');

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
        const maxDuration = 45;
        const args = [
            '-v', 'error',
            '-i', filePath,
        ];

        if (duration > maxDuration) {
            args.push('-t', String(maxDuration));
        }

        args.push(
            '-an',
            '-vf', 'scale=320:-2,fps=8',
            '-vcodec', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-crf', '32',
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

async function evaluateClipWithAI(filePath, userPrompt, existingCaptions = []) {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        console.warn('[AutoPilotEvaluator] No GEMINI_API_KEY set — assuming match with default caption.');
        return {
            isMatch: true,
            score: 7,
            category: 'general',
            caption: 'Epic Reel',
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
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

        const prompt = [
            'You are an expert autonomous video curator and quality inspector.',
            `The user\'s target content request is: "${userPrompt || 'cute interesting video'}"`,
            '',
            'Watch the provided video clip carefully and inspect its visual content and action.',
            'Evaluate whether this video satisfies the user request:',
            '1. "isMatch": true if the video clearly fits the user request theme, false if unrelated, an ad, or a person talking to camera.',
            '2. "score": Relevance score from 1 to 10 (10 being perfect match).',
            '3. "category": Main subject category (e.g. cats, dogs, gym, cars, memes, other).',
            '4. "caption": A catchy, funny, or descriptive 1 to 2 word title for this specific clip (e.g., "Tiny Fluffball", "Big Meow").',
            '   - Do NOT use generic placeholders like "short", "clip", "video", or numbers.',
            `   - Do NOT duplicate any of these existing captions: ${JSON.stringify(existingCaptions)}`,
            '5. "reason": Brief 1-sentence explanation of what is in the video.',
            '',
            'Return ONLY a strict JSON object with these exact keys (no markdown code blocks, no other text):',
            '{',
            '  "isMatch": true,',
            '  "score": 9,',
            '  "category": "cats",',
            '  "caption": "Catchy Name",',
            '  "reason": "Shows a fluffy kitten playing with yarn"',
            '}'
        ].join('\n');

        console.log(`[AutoPilotEvaluator] Inspecting clip with ${model} against prompt: "${userPrompt}"...`);
        const response = await ai.models.generateContent({
            model: model,
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

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
                try { parsed = JSON.parse(m[0]); } catch {}
            }
        }

        if (!parsed) {
            throw new Error(`Failed to parse AI evaluation response: ${text}`);
        }

        // Clean caption formatting
        let caption = String(parsed.caption || 'Top Moment').replace(/['"“”`*#_]/g, '').trim();
        const words = caption.split(/\s+/).filter(Boolean);
        if (words.length > 2) {
            caption = words.slice(0, 2).join(' ');
        }

        const lower = caption.toLowerCase();
        if (!caption || lower.includes('clip') || lower.includes('video') || lower.includes('short') || /clip\s*\d*/i.test(lower)) {
            caption = 'Top Pick';
        }

        const result = {
            isMatch: Boolean(parsed.isMatch && (parsed.score >= 5 || parsed.score === undefined)),
            score: Number(parsed.score) || (parsed.isMatch ? 8 : 2),
            category: String(parsed.category || 'general'),
            caption: caption,
            reason: String(parsed.reason || 'AI inspected content')
        };

        console.log(`[AutoPilotEvaluator] AI Decision: ${result.isMatch ? '✅ MATCH' : '❌ REJECT'} (Score: ${result.score}/10) | Caption: "${result.caption}" | Reason: ${result.reason}`);
        return result;
    } catch (err) {
        console.error(`[AutoPilotEvaluator] AI Inspection error: ${err.message}`);
        // Safe fallback: Accept with generic score so pipeline doesn't hang
        return {
            isMatch: true,
            score: 6,
            category: 'general',
            caption: 'Featured Clip',
            reason: `Fallback evaluation due to: ${err.message}`
        };
    }
}

module.exports = {
    evaluateClipWithAI,
    probeDuration
};

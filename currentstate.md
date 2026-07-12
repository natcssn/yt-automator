# Current State (Updated 2026-06-12)

- **Excel-Based Application Authentication**:
  - Implemented application-level login gate blocking site access until the user logs in with valid credentials.
  - Verification database is `server/users.xlsx` containing Columns: `username` and `password`. Checked via server-side AND logic.
  - Automatically preconfigured with `admin`/`admin123` and `natc`/`testingisnatc` credentials. Admins can update this Excel file dynamically without restarting the server.
  
- **Optional Google OAuth Redirects**:
  - OAuth redirects were removed as a site-wide entry barrier. Landing page is accessed immediately after logging into the app.
  - Google/YouTube credentials sync is now completely optional; users can connect their accounts from the Navbar or directly within Step 4 of the **Compile**, **Ranking 5**, and **Ranking 3** wizards when publishing videos.

- **Discord Ingest Automation Service**:
  - Full Javascript port of the reference python ingest bot in `server/services/discordBot.js`.
  - Stages downloaded clips under unique names (`caption__timestamp.mp4`) in category subfolders, preventing files with identical captions from overwriting each other.
  - Automatically triggers when a category folder has exactly 5 clips: combines clips, trims to 57s, uploads compilation to Filebin, stages link to Discord channel, and purges local clips.
  - Draws the exact top-aligned `"RANKING BEST [TITLE]"` title block in a single-pass scaling, padding, and text-overlay concat stream.
  
- **Wizard Back-Button Navigation**:
  - Preview page (Step 2) in all wizards (**Compile**, **Ranking 5**, and **Ranking 3**) has its "Back" button re-routed to return to Step 0 (the link/caption inserting stage) instead of Step 1 (the loading animation).

- **API & Service Robustness**:
  - Added strict prompt rules and post-processing filters in `classify.js` and `captionGenerator.js` to ensure the AI never returns `"..."` or punctuation-only captions, fallbacking to random viral keyword captions.
  - Added an automatic GPU-to-CPU encoding fallback (`libx264`) in `combine.js` to ensure video creation succeeds even if hardware acceleration (`h264_nvenc`) encounters errors (e.g. driver version mismatch or missing GPU).
  - Updated `server/index.js` to support loading configurations via `process.env.DOTENV_CONFIG_PATH`, resolving environment variable resolution issues in packaged production desktop builds.
  - Upgraded the local `yt-dlp.exe` binary to `stable@2026.07.04` to resolve recent Instagram empty media response extractor issues.
  - Added support for a configurable `COOKIES_FROM_BROWSER` parameter in `reelDownload.js` and `.env` options to extract session cookies and bypass private reels or scraper locks.
  - Fixed the Filebin upload service in `filebinUpload.js` to always generate a unique, non-expired bin name, resolving the `405 The bin is no longer available` error.
  - Added play/pause video preview toggle click handlers and interactive pointer styling to preview players across all wizards.
  - Cleaned up obsolete tests folder and the reference python folder `yt-kitty-automate/`.

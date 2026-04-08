# Reddit Story Video Automation Website

This project gives you a local website that automates your faceless content workflow:

1. Pull trending Reddit text stories.
2. Select a story.
3. Upload Minecraft parkour gameplay and background music.
4. Auto-generate narration with TTS.
5. Export a final MP4 that mixes narration + music over gameplay.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Video processing: FFmpeg via `fluent-ffmpeg` + `ffmpeg-static`
- TTS: Azure Neural Voices (20+ options) with Google fallback

## Setup

1. Install Node.js 18+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy env file:

   ```bash
   copy .env.example .env
   ```

4. Add Azure Speech credentials in `.env` for high-quality natural voices:
   - `AZURE_SPEECH_KEY=your_key`
   - `AZURE_SPEECH_REGION=your_region`

5. Start server:

   ```bash
   npm run dev
   ```

6. Open:
   - http://localhost:3000

## Notes

- Keep gameplay clips at least as long as expected narration time.
- Upload non-copyright or licensed music only.
- The app supports 20+ voices including a Jessie-style preset.
- Exact cloning of a specific creator voice is not provided; use style presets and natural neural voices.
- Output videos are saved to the `outputs` folder.

## Future Additions

- Auto-download Minecraft background clips from a source folder.
- Add subtitle burn-in from narration text.
- Add voice selection and pacing control.
- Add scheduling and batch generation.

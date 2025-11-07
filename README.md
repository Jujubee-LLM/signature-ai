# Signify — AI Artistic Signature Generator

Minimal Next.js app to generate artistic signature images from names using QWEN.

## Setup

1. Install deps
```bash
pnpm i # or npm i / yarn
```

2. Environment
- Copy `.env.example` to `.env.local` and set `QWEN_API_KEY` (optional; app works with mock fallbacks).

3. Dev
```bash
pnpm dev
```

## API
- `POST /api/generatePrompt` → { prompt }
- `POST /api/generateImage` → { imageUrl }

## Notes
- If no API key is provided, prompt is mocked and image is SVG placeholder to ensure smooth UX.
- Languages supported: zh, en, ja, ko, fr, de, es, it.




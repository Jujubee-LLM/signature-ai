# Signify — AI Artistic Signature Generator

Next.js app to generate artistic signature images from names using QWEN, with built-in free quota and redeem-code billing.

## Setup

1. Install deps
```bash
pnpm i # or npm i / yarn
```

2. Environment (`.env.local`)
- `QWEN_API_KEY=...`
- `QWEN_TURBO_END_POINT=...`
- `QWEN_IMAGE_END_POINT=...`
- `REDIS_URL=redis://127.0.0.1:6379`
- `ADMIN_API_TOKEN=replace-with-a-strong-secret`
- Optional key namespace:
  - `REDIS_KEY_PREFIX=signify`
- Optional redeem-code seed (comma-separated, one code can be used once):
  - `REDEEM_CODES_5=CODE_A,CODE_B`
  - `REDEEM_CODES_10=CODE_C`
  - `REDEEM_CODES_20=CODE_D`

3. Dev
```bash
pnpm dev
```

## API
- `POST /api/generatePrompt` → { prompt }
- `POST /api/generateImage` → { imageUrl, quota }
- `GET /api/quota/status` → { quota }
- `POST /api/redeem` with `{ code }` → { ok, quota }
- `GET /api/admin/stats` (admin)
- `GET /api/admin/codes?cursor=0&limit=50` (admin)
- `POST /api/admin/codes` (admin)
- `GET /api/admin/codes/:code` (admin)
- `PATCH /api/admin/codes/:code` (admin)
- `GET /api/admin/users/:userId/quota` (admin)
- `POST /api/admin/users/:userId/credits` (admin)

## Notes
- Languages supported: zh, en, ja, ko, fr, de, es, it.
- Each user gets 8 free generations (tracked by secure cookie ID).
- Quota and redeem usage are persisted in Redis (supports multi-user concurrency).
- Local Redis quick start (Docker):
  - `docker run -d --name signify-redis -p 6379:6379 redis:7`

## Admin API Usage
- Auth header:
  - `Authorization: Bearer $ADMIN_API_TOKEN`
  - or `x-admin-token: $ADMIN_API_TOKEN`
- Create one code:
  - `POST /api/admin/codes`
  - body: `{ "credits": 10, "maxUses": 1, "code": "VIP2026A" }`
- Batch create codes:
  - `POST /api/admin/codes`
  - body: `{ "credits": 20, "maxUses": 1, "count": 50, "codePrefix": "SPRING" }`
- Disable a code:
  - `PATCH /api/admin/codes/VIP2026A`
  - body: `{ "active": false }`
- Grant paid credits to a user:
  - `POST /api/admin/users/<userId>/credits`
  - body: `{ "credits": 30 }`

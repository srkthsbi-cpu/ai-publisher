# Erol Vural AI Publisher — V9 fixed

Cloudflare Worker + Workers AI + Meta OAuth skeleton.

## Fixed in this build
- Workers AI Gemma response is normalized instead of rendering `[object Object]`.
- FLUX image output is handled as the documented base64 `response.image` and rendered as a real JPEG data URI.
- Meta OAuth/Graph endpoints are pinned to Graph API v26.0.
- Added `public/app-icon.png` generated from the supplied Erol Vural logo.

## Important Meta limitation
The Meta app currently shows that `public_profile` requires Advanced Access and the Advanced Access flow requires Business Verification. That is a Meta-side app configuration requirement; code changes cannot bypass it. The app remains in Development Mode for testing.

## Deploy
`npx wrangler deploy`

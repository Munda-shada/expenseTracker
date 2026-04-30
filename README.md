# Expense Tracker

Next.js expense tracker with local-first browser storage, PWA support, Gemini-powered parsing, and optional Google Drive backup.

## Getting Started

Install dependencies and run the local app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Create `.env.local` from `.env.example` before using AI parsing or Google Drive sync.

## Environment Variables

| Name | Required | Where used |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes for AI parsing | Server-side API routes under `/api/*` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes for Google Drive sync | Browser Google OAuth flow |

Never commit `.env.local`. Add these variables in Vercel for both Production and Preview deployments.

## Deploying To Vercel

This repository is nested inside `/Users/renu/Desktop/Expense_tracker/expense-tracker`. Deploy this directory as the Vercel project root.

Recommended Vercel settings:

- Root Directory: `expense-tracker` when importing from the outer folder, or project root when importing this inner repo directly.
- Framework Preset: Next.js.
- Install Command: `npm install`.
- Build Command: `npm run build`.
- Output Directory: leave empty so Vercel auto-detects Next.js.

Before deploying:

```bash
npm run lint
npm run build
```

After deploying:

- Visit `/api/health` and confirm `hasKey` is `true`.
- Test one manual expense, one AI parsed expense, and one bulk parsed entry.
- In Google Cloud Console, add the Vercel production domain to Authorized JavaScript origins.
- Confirm `/sw.js` loads and test install/offline behavior on mobile.

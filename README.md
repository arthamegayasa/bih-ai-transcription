# AI Medical Transcription — Demo for Bali International Hospital

An interactive presentation and live demo built to support the internal discussion on AI-assisted clinical documentation at BIH.

The page presents the architecture of an AI medical transcription pipeline (audio → transcript → structured SOAP), surfaces the build-vs-buy decision dimensions a JCI-accredited Indonesian hospital should weigh, and shows the workflow in action through both a deterministic auto-play scenario and a real-time microphone test.

## What this is

- **A 10-slide presentation** with embedded interactive demo, runnable from a single URL.
- **Two demo modes**:
  - **Watch** — a deterministic, offline-capable scenario showing a doctor-patient consultation in Bahasa Indonesia transformed into a SOAP note.
  - **Live** — real microphone capture using the browser's Web Speech API (Indonesian, `id-ID`), with structured SOAP generation via the Anthropic Claude API.
- **Production-style architecture**: static frontend on Vercel + serverless function calling Claude Haiku 4.5 for SOAP structuring. The API key is held server-side as a Vercel environment variable; it is never exposed to the browser.

## Tech stack

- Frontend: Static HTML, Tailwind CSS via CDN, vanilla JS — no build step.
- Speech-to-text: Web Speech API (browser-native, supports `id-ID`).
- LLM for SOAP structuring: Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`).
- Backend: Vercel serverless function (Node.js).
- Deploy: Vercel (Singapore/Asia region for proximity to Indonesia).

## Local development

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env.local
npm run dev
```

Then open the URL printed by `vercel dev` (typically `http://localhost:3000`).

## Deploy

```bash
vercel deploy --prod
```

Set the `ANTHROPIC_API_KEY` environment variable on the Vercel project before deploying. Without it, the live demo falls back to cached responses.

## Important — this is a demo, not a product

- No patient data is used. The auto-play scenario is fictional. The live mode should be tested only with mock dialogue.
- Web Speech API in Chrome routes audio to Google's STT servers. A production deployment would replace this with a sovereign STT provider hosted in Indonesia or Singapore.
- The SOAP output is a draft. In any real workflow, a licensed physician must review and sign off before the note enters the patient record.

## Contact

dr. Nyoman Artha — Neurology, Bali International Hospital

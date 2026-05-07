import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

const WHISPER_MODEL = 'whisper-1';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a clinical documentation assistant supporting physicians at Bali International Hospital. You receive a raw audio transcript of a doctor-patient consultation. The audio may be in Bahasa Indonesia, English, or a mix of both. You must:

1. Diarize the transcript — split it into speaker turns. Identify each turn as "Doctor", "Patient", or "Other" (e.g., a translator, family member). Use linguistic and content cues to decide. When you cannot tell, label the speaker as "Speaker 1" / "Speaker 2".
2. Generate a structured SOAP note in clinical English. Translate Indonesian content into English; preserve drug names exactly as spoken if Indonesian-specific.

Hard rules:
- Output ONLY valid JSON. No prose, no markdown fences, no commentary.
- Be faithful to the transcript. Never invent symptoms, vitals, or findings that are not stated. If a SOAP field has no information, write "Not documented in this encounter."
- Keep SOAP sections concise but clinically complete. Avoid filler.
- The output is a draft; a physician will review and sign off.

Output schema (strict):
{
  "labeled_transcript": [
    { "speaker": "Doctor" | "Patient" | "Other" | "Speaker 1" | "Speaker 2", "text": "string — verbatim or near-verbatim from the transcript, in the original language" }
  ],
  "soap": {
    "subjective": "string — patient's reported complaints, history of present illness, relevant past history, family/social context",
    "objective": "string — vital signs, physical exam findings, lab/imaging results mentioned",
    "assessment": "string — primary and differential diagnoses, clinical reasoning",
    "plan": "string — investigations, treatment (medications with doses), patient education, follow-up",
    "chief_complaint": "string — one-line summary of the primary reason for visit",
    "specialty_hint": "string — neurology | internal_medicine | orthopedics | general | other"
  }
}`;

function decodeBase64Audio(base64, mimeType) {
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType && mimeType.includes('mp4') ? 'mp4'
            : mimeType && mimeType.includes('ogg') ? 'ogg'
            : 'webm';
  return { buffer, ext };
}

async function transcribeWithWhisper(buffer, ext, language) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured on this deployment.');
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const filename = `audio.${ext}`;
  const file = new File([buffer], filename, { type: `audio/${ext}` });

  const params = {
    file,
    model: WHISPER_MODEL,
    response_format: 'verbose_json'
  };
  if (language && language !== 'auto') {
    params.language = language;
  }

  const result = await openai.audio.transcriptions.create(params);
  return {
    text: result.text || '',
    detected_language: result.language || (language === 'auto' ? null : language)
  };
}

async function diarizeAndStructure(rawTranscript) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured on this deployment.');
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Process this consultation transcript:\n\n${rawTranscript}`
      },
      {
        role: 'assistant',
        content: '{'
      }
    ]
  });

  const rawText = '{' + message.content[0].text;
  const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('Claude response could not be parsed as JSON.');
    }
  }

  return {
    labeled_transcript: Array.isArray(parsed.labeled_transcript) ? parsed.labeled_transcript : [],
    soap: parsed.soap || null,
    _input_tokens: message.usage?.input_tokens,
    _output_tokens: message.usage?.output_tokens
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { audio, mimeType, language } = req.body || {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid audio payload (expected base64 string).' });
  }

  const { buffer, ext } = decodeBase64Audio(audio, mimeType);
  if (buffer.length < 2000) {
    return res.status(400).json({ error: 'Audio is too short to transcribe.' });
  }

  try {
    const { text: rawTranscript, detected_language } = await transcribeWithWhisper(buffer, ext, language);

    if (!rawTranscript || rawTranscript.trim().length < 4) {
      return res.status(200).json({
        raw_transcript: '',
        detected_language,
        labeled_transcript: [],
        soap: null,
        _note: 'No discernible speech detected.'
      });
    }

    const structured = await diarizeAndStructure(rawTranscript);

    return res.status(200).json({
      raw_transcript: rawTranscript,
      detected_language,
      labeled_transcript: structured.labeled_transcript,
      soap: structured.soap,
      _whisper_model: WHISPER_MODEL,
      _claude_model: CLAUDE_MODEL,
      _claude_input_tokens: structured._input_tokens,
      _claude_output_tokens: structured._output_tokens
    });
  } catch (error) {
    console.error('process-audio error:', error);
    return res.status(500).json({
      error: error.message || 'Unknown error during processing.'
    });
  }
}

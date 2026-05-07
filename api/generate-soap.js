import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a clinical documentation assistant supporting physicians at Bali International Hospital. You receive a transcript of a doctor-patient consultation (typically in Bahasa Indonesia, sometimes mixed with English medical terminology) and produce a structured SOAP note in clinical English.

Rules:
- Output ONLY valid JSON. No prose, no markdown fences, no commentary.
- Use clinical English for all four SOAP sections, even if the source transcript is in Bahasa Indonesia. Preserve Indonesian medication names or local terms only where there is no clean English equivalent.
- Be faithful to the transcript. Never invent symptoms, vitals, or findings that are not stated. If a field has no information, write "Not documented in this encounter."
- Keep each section concise but clinically complete. Avoid filler.
- The output is a draft; a physician will review and sign off. Do not include disclaimers in the SOAP body itself — those are added by the UI.

Output schema (strict):
{
  "subjective": "string — patient's reported complaints, history of present illness, relevant past history, family/social context",
  "objective": "string — vital signs, physical exam findings, lab/imaging results mentioned",
  "assessment": "string — primary and differential diagnoses, clinical reasoning",
  "plan": "string — investigations, treatment (medications with doses), patient education, follow-up",
  "chief_complaint": "string — one-line summary of the primary reason for visit",
  "specialty_hint": "string — neurology | internal_medicine | orthopedics | general | other"
}`;

const FALLBACK_SOAP = {
  subjective: "Demo fallback — API unavailable. In a real session this section would contain the patient's reported complaints synthesized from the transcript.",
  objective: "Demo fallback — vital signs and exam findings would be summarized here.",
  assessment: "Demo fallback — primary and differential diagnoses with clinical reasoning.",
  plan: "Demo fallback — investigations, medications, patient education, and follow-up plan.",
  chief_complaint: "Demo fallback consultation",
  specialty_hint: "general",
  _fallback: true
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transcript } = req.body || {};

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
    return res.status(400).json({
      error: 'Transcript is required and must be at least 10 characters.'
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({
      ...FALLBACK_SOAP,
      _fallback_reason: 'ANTHROPIC_API_KEY not configured on this deployment.'
    });
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate a SOAP note from this consultation transcript:\n\n${transcript}`
        },
        {
          role: 'assistant',
          content: '{'
        }
      ]
    });

    const rawText = '{' + message.content[0].text;
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

    let soap;
    try {
      soap = JSON.parse(cleaned);
    } catch (parseError) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        soap = JSON.parse(match[0]);
      } else {
        throw parseError;
      }
    }

    return res.status(200).json({
      ...soap,
      _model: MODEL,
      _input_tokens: message.usage?.input_tokens,
      _output_tokens: message.usage?.output_tokens
    });
  } catch (error) {
    console.error('SOAP generation error:', error);
    return res.status(200).json({
      ...FALLBACK_SOAP,
      _fallback_reason: `API error: ${error.message || 'unknown'}`
    });
  }
}

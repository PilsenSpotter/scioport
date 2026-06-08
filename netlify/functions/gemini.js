const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_PROMPT_PROFILE = 'sciocile';
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash'
]);
const ALLOWED_PROMPT_PROFILES = new Set(['sciocile', 'general']);
const APP_RUNTIME_GUARDRAILS = [
  'Důležité pro tuto integraci:',
  '- Nemáš k dispozici interní nástroje zmíněné v promptu, například learnSkill, get_sck_context, search_curriculum ani get_curriculum_detail.',
  '- Nikdy nepředstírej volání nedostupného nástroje.',
  '- Pokud by prompt vyžadoval nedostupný nástroj, odpověz podle dostupného kontextu a jasně řekni, že detailní databázový zdroj v této integraci není připojený.'
].join('\n');
const promptCache = new Map();

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

function getModel(value) {
  const requested = String(value || '').trim();
  if (requested && ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return String(process.env.GEMINI_MODEL_NAME || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function getSecret(name) {
  const processValue = String(process.env[name] || '').trim();
  if (processValue) {
    return processValue;
  }

  if (
    typeof Netlify !== 'undefined'
    && Netlify.env
    && typeof Netlify.env.get === 'function'
  ) {
    return String(Netlify.env.get(name) || '').trim();
  }

  return '';
}

function getPromptProfile() {
  const requested = getSecret('SCIOCHAT_PROMPT_PROFILE').toLowerCase();
  if (requested && ALLOWED_PROMPT_PROFILES.has(requested)) {
    return requested;
  }
  return DEFAULT_PROMPT_PROFILE;
}

function readPrompt(profile) {
  if (promptCache.has(profile)) {
    return promptCache.get(profile);
  }

  const promptPath = path.join(__dirname, 'prompts', `${profile}.txt`);
  const prompt = fs.readFileSync(promptPath, 'utf8').trim();
  promptCache.set(profile, prompt);
  return prompt;
}

function getSystemInstruction() {
  const prompt = readPrompt(getPromptProfile());
  return {
    parts: [{ text: `${APP_RUNTIME_GUARDRAILS}\n\n${prompt}` }]
  };
}

function getNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
}

function getGenerationConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  return {
    temperature: getNumber(config.temperature, 0.45, 0, 1),
    candidateCount: 1,
    maxOutputTokens: Math.round(getNumber(config.maxOutputTokens, 512, 1, 1024)),
    topP: getNumber(config.topP, 0.95, 0, 1),
    topK: Math.round(getNumber(config.topK, 40, 1, 100))
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const apiKey = getSecret('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse(500, { error: 'Gemini API key is not configured on the server.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid JSON request body.' });
  }

  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  if (!contents.length) {
    return jsonResponse(400, { error: 'Missing conversation contents.' });
  }

  const model = getModel(payload.model);
  const requestBody = {
    contents,
    systemInstruction: getSystemInstruction(),
    generationConfig: getGenerationConfig(payload.generationConfig)
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { error: text || 'Gemini returned an unreadable response.' };
    }

    if (!response.ok) {
      const message = body && body.error && body.error.message
        ? body.error.message
        : body.error || `${response.status} ${response.statusText}`;
      return jsonResponse(response.status, { error: message });
    }

    return jsonResponse(200, body);
  } catch (error) {
    return jsonResponse(502, { error: String(error && error.message ? error.message : error) });
  }
};

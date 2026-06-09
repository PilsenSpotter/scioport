const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const FIXED_PROMPT_PROFILE = 'sciocile';
const MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash'
];
const ALLOWED_MODELS = new Set(MODEL_FALLBACKS);
const APP_RUNTIME_GUARDRAILS = [
  'Dulezite pro tuto integraci:',
  '- Interni nastroje learnSkill a askClarificationQuestions jsou v teto integraci pripojene pres Gemini function calling.',
  '- Kdyz chces pouzit learnSkill nebo askClarificationQuestions, zavolej pripojenou funkci. Nikdy nevypisuj <tool_code>, print(...), pseudo-kod ani text "Nyni aktivuji...".',
  '- Nastroje get_sck_context, search_curriculum a get_curriculum_detail zatim nejsou pripojene. Nepredstirej jejich volani.',
  '- Pokud by prompt vyzadoval nepripojeny nastroj, odpovez podle dostupneho kontextu a jasne rekni, ze detailni databazovy zdroj v teto integraci neni pripojeny.'
].join('\n');
const promptCache = new Map();
const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'learnSkill',
        description: 'Activates one of the assistant skills listed in the system prompt.',
        parameters: {
          type: 'object',
          properties: {
            skillName: {
              type: 'string',
              description: 'The skill to activate.',
              enum: [
                'clarification-questions',
                'web-search',
                'image-generation',
                'dynamic-forms',
                'diagrams'
              ]
            },
            specializations: {
              type: 'array',
              description: 'Optional skill specializations, for example diagram types.',
              items: { type: 'string' }
            }
          },
          required: ['skillName']
        }
      },
      {
        name: 'askClarificationQuestions',
        description: 'Asks 1-3 concise follow-up questions with optional answer choices.',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              description: 'One to three concise clarification questions.',
              items: {
                type: 'object',
                properties: {
                  question: {
                    type: 'string',
                    description: 'The question text.'
                  },
                  options: {
                    type: 'array',
                    description: 'Optional short answer choices.',
                    items: { type: 'string' }
                  }
                },
                required: ['question']
              }
            }
          },
          required: ['questions']
        }
      }
    ]
  }
];

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

  const configured = String(process.env.GEMINI_MODEL_NAME || '').trim();
  if (configured && ALLOWED_MODELS.has(configured)) {
    return configured;
  }

  return DEFAULT_MODEL;
}

function getModelFallbacks(primaryModel) {
  const primary = ALLOWED_MODELS.has(primaryModel) ? primaryModel : DEFAULT_MODEL;
  return [
    primary,
    ...MODEL_FALLBACKS.filter((model) => model !== primary)
  ];
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
  const prompt = readPrompt(FIXED_PROMPT_PROFILE);
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

async function callGemini(endpoint, apiKey, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let responseBody = null;
  try {
    responseBody = text ? JSON.parse(text) : {};
  } catch (error) {
    responseBody = { error: text || 'Gemini returned an unreadable response.' };
  }

  if (!response.ok) {
    const message = responseBody && responseBody.error && responseBody.error.message
      ? responseBody.error.message
      : responseBody.error || `${response.status} ${response.statusText}`;
    return {
      ok: false,
      status: response.status,
      error: message
    };
  }

  return {
    ok: true,
    body: responseBody
  };
}

function isRetryableModelError(result) {
  return [429, 502, 503, 504].includes(Number(result && result.status));
}

function getModelContent(responseBody) {
  const candidates = responseBody && Array.isArray(responseBody.candidates)
    ? responseBody.candidates
    : [];
  const content = candidates[0] && candidates[0].content;
  if (!content || !Array.isArray(content.parts)) {
    return null;
  }

  return {
    role: content.role || 'model',
    parts: content.parts
  };
}

function getResponseText(responseBody) {
  const content = getModelContent(responseBody);
  if (!content) {
    return '';
  }

  return content.parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function buildTextResponse(text) {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text }]
        },
        finishReason: 'STOP'
      }
    ]
  };
}

function getFunctionCalls(responseBody) {
  const content = getModelContent(responseBody);
  if (!content) {
    return [];
  }

  return content.parts
    .map((part) => part && (part.functionCall || part.function_call))
    .filter((call) => call && call.name)
    .map((call) => ({
      name: String(call.name),
      args: call.args && typeof call.args === 'object' ? call.args : {}
    }));
}

function cleanText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback || '';
}

function normalizeStringList(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function getSkillName(args) {
  return cleanText(args.skillName || args.skill_name || args.name || args.skill, '');
}

function normalizeClarificationQuestions(args) {
  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
  return rawQuestions
    .map((item) => {
      if (typeof item === 'string') {
        return {
          question: cleanText(item),
          options: []
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const question = cleanText(item.question || item.text || item.prompt);
      if (!question) {
        return null;
      }

      return {
        question,
        options: normalizeStringList(item.options || item.choices, 4)
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function buildClarificationText(questions) {
  if (!questions.length) {
    return 'Potrebuju si to nejdriv upresnit: co presne chces, aby AI s timto ukolem udelala?';
  }

  const lines = ['Potrebuju si upresnit par veci:'];
  questions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.question}`);
    if (item.options.length) {
      lines.push(`Moznosti: ${item.options.join(' / ')}`);
    }
  });
  return lines.join('\n');
}

function runTool(call) {
  const args = call.args && typeof call.args === 'object' ? call.args : {};

  if (call.name === 'learnSkill') {
    const skillName = getSkillName(args);
    if (skillName === 'clarification-questions') {
      return {
        activated: true,
        skillName,
        instructions: 'Clarification questions skill is active. If more context is needed, call askClarificationQuestions with 1-3 concrete questions. If enough context is present, answer directly. Do not mention activation or tool code.'
      };
    }

    return {
      activated: false,
      skillName,
      availableSkills: ['clarification-questions'],
      instructions: 'This app currently supports only clarification-questions. Continue with the available context and do not pretend unavailable tools were called.'
    };
  }

  if (call.name === 'askClarificationQuestions') {
    return {
      questions: normalizeClarificationQuestions(args),
      instructions: 'Present these questions to the user as the final response and wait for answers.'
    };
  }

  return {
    error: `Unsupported tool: ${call.name}`,
    instructions: 'Do not pretend this tool is available. Continue with the available context.'
  };
}

function buildToolResponseParts(calls) {
  return calls.map((call) => ({
    functionResponse: {
      name: call.name,
      response: runTool(call)
    }
  }));
}

function getClarificationCall(calls) {
  return calls.find((call) => call.name === 'askClarificationQuestions') || null;
}

function getPseudoToolCalls(text) {
  const calls = [];
  const learnSkillPattern = /learnSkill\(\s*["']([^"']+)["']\s*\)/g;
  let match = learnSkillPattern.exec(text);
  while (match) {
    calls.push({
      name: 'learnSkill',
      args: { skillName: match[1] }
    });
    match = learnSkillPattern.exec(text);
  }

  const toolNamePattern = /\b(askClarificationQuestions|get_sck_context|search_curriculum|get_curriculum_detail)\s*\(/g;
  match = toolNamePattern.exec(text);
  while (match) {
    calls.push({
      name: match[1],
      args: {}
    });
    match = toolNamePattern.exec(text);
  }

  return calls;
}

function hasPseudoToolCode(text) {
  return /<tool_code>|<\/tool_code>|learnSkill\(|askClarificationQuestions\(|get_sck_context\(|search_curriculum\(|get_curriculum_detail\(|print\(/i.test(text);
}

function stripPseudoToolCode(text) {
  return String(text || '')
    .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
    .replace(/^\s*Nyn\S*\s+aktivuji[^\n]*\n?/gim, '')
    .replace(/^\s*.*(?:learnSkill|askClarificationQuestions|get_sck_context|search_curriculum|get_curriculum_detail|print\()[^\n]*\n?/gim, '')
    .trim();
}

async function generateWithModel(model, apiKey, baseRequestBody, contents) {
  const conversationContents = contents.slice();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let lastBody = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const gemini = await callGemini(endpoint, apiKey, {
      ...baseRequestBody,
      contents: conversationContents
    });

    if (!gemini.ok) {
      return {
        ok: false,
        status: gemini.status,
        error: gemini.error,
        retryable: isRetryableModelError(gemini)
      };
    }

    lastBody = gemini.body;
    const calls = getFunctionCalls(lastBody);
    const clarificationCall = getClarificationCall(calls);

    if (clarificationCall) {
      const questions = normalizeClarificationQuestions(clarificationCall.args);
      return {
        ok: true,
        body: buildTextResponse(buildClarificationText(questions)),
        model
      };
    }

    if (calls.length) {
      const modelContent = getModelContent(lastBody);
      if (modelContent) {
        conversationContents.push(modelContent);
      }
      conversationContents.push({
        role: 'user',
        parts: buildToolResponseParts(calls)
      });
      continue;
    }

    const responseText = getResponseText(lastBody);
    const pseudoCalls = getPseudoToolCalls(responseText);
    if (pseudoCalls.length) {
      conversationContents.push({
        role: 'user',
        parts: [
          {
            text: [
              'Runtime handled the pseudo tool call instead of showing it to the user.',
              `Tool results: ${JSON.stringify(pseudoCalls.map((call) => runTool(call)))}`,
              'Now produce only the user-facing answer in Czech. Do not mention <tool_code>, print(...), or tool calls.'
            ].join('\n')
          }
        ]
      });
      continue;
    }

    if (hasPseudoToolCode(responseText)) {
      const visibleText = stripPseudoToolCode(responseText);
      return {
        ok: true,
        body: buildTextResponse(
          visibleText || 'Potrebuju si to nejdriv upresnit. Napis mi prosim trochu vic kontextu.'
        ),
        model
      };
    }

    return {
      ok: true,
      body: lastBody,
      model
    };
  }

  const finalText = stripPseudoToolCode(getResponseText(lastBody));
  return {
    ok: true,
    body: buildTextResponse(
      finalText || 'Potrebuju si to nejdriv upresnit. Napis mi prosim trochu vic kontextu.'
    ),
    model
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
  const baseRequestBody = {
    systemInstruction: getSystemInstruction(),
    generationConfig: getGenerationConfig(payload.generationConfig),
    tools: TOOL_DECLARATIONS
  };

  try {
    let lastFailure = null;
    const fallbackModels = getModelFallbacks(model);
    for (const nextModel of fallbackModels) {
      const result = await generateWithModel(nextModel, apiKey, baseRequestBody, contents);
      if (result.ok) {
        return jsonResponse(200, result.body);
      }

      lastFailure = result;
      if (!result.retryable) {
        return jsonResponse(result.status, { error: result.error });
      }
    }

    return jsonResponse(lastFailure ? lastFailure.status : 503, {
      error: lastFailure && lastFailure.error
        ? lastFailure.error
        : 'Gemini models are temporarily overloaded. Please try again shortly.'
    });
  } catch (error) {
    return jsonResponse(502, { error: String(error && error.message ? error.message : error) });
  }
};

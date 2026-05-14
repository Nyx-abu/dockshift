/**
 * AI provider abstraction for the main process.
 *
 * One uniform interface across Gemini, OpenAI, Anthropic, Ollama and
 * OpenRouter so the rest of the app never branches on provider. Each provider
 * exposes:
 *   - id, label
 *   - keyName        secret name in electron-secrets (null = no key, e.g. Ollama)
 *   - keyless        true if it needs no API key
 *   - models[]       common model ids for the Settings picker (free-text also allowed)
 *   - defaultModel
 *   - canTranscribe  whether it implements audio transcription
 *   - chat({ apiKey, model, prompt, onChunk, signal }) -> Promise<string>
 *       Streams: calls onChunk(deltaText) as tokens arrive, resolves with the
 *       full text. A provider with no streaming API calls onChunk once.
 *   - transcribe?({ apiKey, model, audioBase64, language }) -> Promise<string>
 *
 * HTTP providers use the built-in `fetch` — no SDK dependency. Gemini keeps
 * `@google/genai` since it's already a dependency and handles audio cleanly.
 */

/* ─── Shared SSE helper ──────────────────────────────────────────────────────
 * OpenAI and OpenRouter both speak OpenAI-style Server-Sent Events. This
 * pulls `data:` lines off the stream and yields parsed JSON objects.
 */
async function* sseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch (_) {
        /* keep-alive / partial line — ignore */
      }
    }
  }
}

/** Turn a non-OK fetch Response into a useful Error. */
async function httpError(provider, response) {
  let detail = '';
  try {
    const body = await response.text();
    detail = body.slice(0, 300);
  } catch (_) { /* ignore */ }
  return new Error(`${provider} request failed (${response.status}): ${detail || response.statusText}`);
}

/* ─── OpenAI-compatible chat (OpenAI + OpenRouter share this) ────────────── */
async function openAiCompatChat({ endpoint, headers, model, prompt, onChunk, signal }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  });
  if (!response.ok || !response.body) throw await httpError('AI', response);

  let full = '';
  for await (const event of sseEvents(response)) {
    const delta = event?.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      onChunk?.(delta);
    }
  }
  return full;
}

/* ─── Provider definitions ──────────────────────────────────────────────── */

const gemini = {
  id: 'gemini',
  label: 'Google Gemini',
  keyName: 'gemini',
  keyless: false,
  models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  defaultModel: 'gemini-2.5-flash',
  canTranscribe: true,

  async chat({ apiKey, model, prompt, onChunk }) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    let full = '';
    const stream = await ai.models.generateContentStream({
      model: model || this.defaultModel,
      contents: prompt,
    });
    for await (const chunk of stream) {
      const delta = chunk?.text || '';
      if (delta) {
        full += delta;
        onChunk?.(delta);
      }
    }
    return full || 'No response.';
  },

  async transcribe({ apiKey, audioBase64, language }) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
          { text: `Transcribe this audio to text. The language is ${language || 'en'}. Return ONLY the transcribed text, nothing else.` },
        ],
      }],
    });
    return response.text || '';
  },
};

const openai = {
  id: 'openai',
  label: 'OpenAI',
  keyName: 'openai',
  keyless: false,
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  defaultModel: 'gpt-4o-mini',
  canTranscribe: true,

  chat({ apiKey, model, prompt, onChunk, signal }) {
    return openAiCompatChat({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${apiKey}` },
      model: model || this.defaultModel,
      prompt, onChunk, signal,
    });
  },

  async transcribe({ apiKey, audioBase64, language }) {
    // Whisper wants multipart/form-data with the raw audio file.
    const bytes = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-1');
    if (language) form.append('language', language);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) throw await httpError('OpenAI', response);
    const json = await response.json();
    return json?.text || '';
  },
};

const anthropic = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  keyName: 'anthropic',
  keyless: false,
  models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  defaultModel: 'claude-sonnet-4-6',
  canTranscribe: false,

  async chat({ apiKey, model, prompt, onChunk, signal }) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || this.defaultModel,
        max_tokens: 4096,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });
    if (!response.ok || !response.body) throw await httpError('Anthropic', response);

    let full = '';
    for await (const event of sseEvents(response)) {
      // Anthropic streams typed events; text lives in content_block_delta.
      if (event?.type === 'content_block_delta' && event?.delta?.text) {
        full += event.delta.text;
        onChunk?.(event.delta.text);
      }
    }
    return full;
  },
};

const ollama = {
  id: 'ollama',
  label: 'Ollama (local)',
  keyName: null,
  keyless: true,
  models: ['llama3.2', 'llama3.1', 'qwen2.5-coder', 'mistral', 'phi4'],
  defaultModel: 'llama3.2',
  canTranscribe: false,

  async chat({ model, prompt, onChunk, signal }) {
    // Ollama runs locally; default host, no key. Streams NDJSON.
    let response;
    try {
      response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal,
      });
    } catch (_) {
      throw new Error('Could not reach Ollama at http://127.0.0.1:11434 — is it running?');
    }
    if (!response.ok || !response.body) throw await httpError('Ollama', response);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const delta = obj?.message?.content || '';
          if (delta) {
            full += delta;
            onChunk?.(delta);
          }
        } catch (_) { /* partial line */ }
      }
    }
    return full;
  },
};

const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  keyName: 'openrouter',
  keyless: false,
  models: [
    'openai/gpt-4o-mini',
    'anthropic/claude-sonnet-4-6',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  defaultModel: 'openai/gpt-4o-mini',
  canTranscribe: false,

  chat({ apiKey, model, prompt, onChunk, signal }) {
    return openAiCompatChat({
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Salah-XD/dockshift',
        'X-Title': 'DockShift',
      },
      model: model || this.defaultModel,
      prompt, onChunk, signal,
    });
  },
};

export const PROVIDERS = { gemini, openai, anthropic, ollama, openrouter };

/** Ordered list for the Settings UI. */
export const PROVIDER_LIST = [gemini, openai, anthropic, ollama, openrouter].map(p => ({
  id: p.id,
  label: p.label,
  keyName: p.keyName,
  keyless: p.keyless,
  models: p.models,
  defaultModel: p.defaultModel,
  canTranscribe: p.canTranscribe,
}));

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

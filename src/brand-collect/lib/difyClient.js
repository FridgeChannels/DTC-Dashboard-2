const DEFAULT_USER = 'brand-demo-config';
const DEFAULT_RESPONSE_MODE = 'blocking';
const REQUEST_TIMEOUT_MS = 120000;

function getDifyConfig() {
  const apiUrl = process.env.DIFY_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.DIFY_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error('DIFY_API_URL and DIFY_API_KEY must be configured in environment');
  }

  return {
    apiUrl,
    apiKey,
    user: process.env.DIFY_USER || DEFAULT_USER,
    responseMode: process.env.DIFY_RESPONSE_MODE || DEFAULT_RESPONSE_MODE,
  };
}

function buildChatMessagesUrl(apiUrl) {
  return `${apiUrl}/chat-messages`;
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => '');
  try {
    const data = JSON.parse(text);
    return data.message || data.error || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

async function sendBlockingChatMessage({ query, inputs = {}, conversationId = '' }) {
  const { apiUrl, apiKey, user, responseMode } = getDifyConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildChatMessagesUrl(apiUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs,
        query,
        response_mode: responseMode === 'streaming' ? 'blocking' : responseMode,
        conversation_id: conversationId,
        user,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Dify API error: ${await parseErrorResponse(response)}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Dify API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendStreamingChatMessage({ query, inputs = {}, conversationId = '' }) {
  const { apiUrl, apiKey, user } = getDifyConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildChatMessagesUrl(apiUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs,
        query,
        response_mode: 'streaming',
        conversation_id: conversationId,
        user,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Dify API error: ${await parseErrorResponse(response)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let conversation_id = conversationId;
    let message_id = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.conversation_id) conversation_id = event.conversation_id;
        if (event.message_id) message_id = event.message_id;
        if (typeof event.answer === 'string') {
          answer += event.answer;
        }
      }
    }

    return {
      answer,
      conversation_id,
      message_id,
      mode: 'streaming',
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Dify API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendDifyChatMessage({ query, inputs, conversationId } = {}) {
  if (!query || typeof query !== 'string') {
    throw new Error('Dify query is required');
  }

  const { responseMode } = getDifyConfig();

  if (responseMode === 'streaming') {
    return sendStreamingChatMessage({ query, inputs, conversationId });
  }

  return sendBlockingChatMessage({ query, inputs, conversationId });
}

export function isDifyConfigured() {
  return Boolean(process.env.DIFY_API_URL && process.env.DIFY_API_KEY);
}

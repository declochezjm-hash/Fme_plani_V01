import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, CursorAgentError } from '@cursor/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

const PORT = Number(process.env.COPILOT_BRIDGE_PORT ?? 8787);
const API_KEY = process.env.CURSOR_API_KEY;
const DEFAULT_MODEL = process.env.CURSOR_MODEL ?? 'composer-2.5';

if (!API_KEY) {
  console.error(
    '[copilot-bridge] CURSOR_API_KEY manquant. Créez une clé sur https://cursor.com/dashboard/integrations',
  );
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function formatMessages(messages) {
  return messages
    .map((message) => {
      const role =
        message.role === 'assistant'
          ? 'Assistant'
          : message.role === 'system'
            ? 'System'
            : 'User';
      return `${role}:\n${message.content}`;
    })
    .join('\n\n');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/copilot/health') {
    sendJson(res, 200, {
      ok: true,
      provider: 'cursor',
      model: DEFAULT_MODEL,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/copilot/chat') {
    try {
      const body = JSON.parse(await readBody(req));
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;

      const result = await Agent.prompt(formatMessages(messages), {
        apiKey: API_KEY,
        model: { id: model },
        local: {
          cwd: projectRoot,
          settingSources: [],
        },
      });

      if (result.status === 'error') {
        sendJson(res, 502, {
          error: 'Exécution agent Cursor échouée.',
          runId: result.id,
        });
        return;
      }

      sendJson(res, 200, {
        content: result.result ?? '',
        model,
        provider: 'cursor',
        runId: result.id,
      });
    } catch (error) {
      const message = error instanceof CursorAgentError ? error.message : String(error);
      const status = error instanceof CursorAgentError ? 503 : 500;
      sendJson(res, status, { error: message });
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(
    `[copilot-bridge] Cursor SDK actif sur http://localhost:${PORT} (modèle: ${DEFAULT_MODEL})`,
  );
});

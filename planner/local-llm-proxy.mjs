// Local LM Studio proxy middleware for Vite (dev and preview).
// Solenoid (Radial Day Planner) local offline engine.
// Forwards /api/local-llm/* to local LM Studio server at http://127.0.0.1:1234

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234';

export function localLlmMiddleware(options = {}) {
  const targetUrl = (options.targetUrl || DEFAULT_LM_STUDIO_URL).replace(/\/+$/, '');

  return async (req, res, next = () => { res.statusCode = 404; res.end('Not found'); }) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/local-llm')) return next();

    const sendJson = (status, data) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      });
      res.end(JSON.stringify(data));
    };

    // Health check endpoint: pings LM Studio /v1/models with a short timeout
    if (url.pathname === '/api/local-llm/health' && req.method === 'GET') {
      try {
        const response = await fetch(`${targetUrl}/v1/models`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) {
          return sendJson(502, {
            ok: false,
            online: false,
            status: response.status,
            error: `LM Studio returned HTTP ${response.status}`,
            models: [],
          });
        }
        const data = await response.json();
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const models = rawList.map((m) => m?.id).filter(Boolean);
        // Find best Gemma 4 or loaded model
        const preferred = models.find((m) => /gemma-4/i.test(m)) ||
                          models.find((m) => /gemma/i.test(m)) ||
                          models[0] || '';
        return sendJson(200, {
          ok: true,
          online: true,
          models,
          preferredModel: preferred,
          targetUrl,
        });
      } catch (err) {
        return sendJson(200, {
          ok: false,
          online: false,
          error: err?.message || 'Cannot connect to LM Studio at 127.0.0.1:1234',
          models: [],
        });
      }
    }

    // Models endpoint: proxies /v1/models
    if (url.pathname === '/api/local-llm/models' && req.method === 'GET') {
      try {
        const response = await fetch(`${targetUrl}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        return sendJson(response.status, data);
      } catch (err) {
        return sendJson(503, {
          error: {
            message: `Failed to query LM Studio models: ${err.message}`,
            code: 'lm_studio_offline',
          },
        });
      }
    }

    // Chat completions endpoint: proxies /v1/chat/completions
    if (url.pathname === '/api/local-llm/chat/completions' && req.method === 'POST') {
      try {
        let text = '';
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 5 * 1024 * 1024) {
            return sendJson(413, { error: { message: 'Payload too large.' } });
          }
        }

        let body = {};
        if (text.trim()) {
          try {
            body = JSON.parse(text);
          } catch {
            return sendJson(400, { error: { message: 'Invalid JSON body.' } });
          }
        }

        // LM Studio compatibility adjustments:
        // 1. LM Studio rejects response_format.type === 'json_object' (only accepts 'json_schema' or 'text').
        // Remove or relax it so prompt instructions handle the JSON framing smoothly.
        if (body.response_format && body.response_format.type === 'json_object') {
          delete body.response_format;
        }

        // 2. If no model specified or model is empty, try to resolve one from LM Studio
        if (!body.model) {
          try {
            const mRes = await fetch(`${targetUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
            if (mRes.ok) {
              const mData = await mRes.json();
              const list = Array.isArray(mData?.data) ? mData.data.map(m => m.id) : [];
              body.model = list.find(m => /gemma-4/i.test(m)) || list[0] || 'default';
            }
          } catch {
            body.model = 'default';
          }
        }

        // Forward to LM Studio
        const lmResponse = await fetch(`${targetUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const status = lmResponse.status;
        const contentType = lmResponse.headers.get('content-type') || 'application/json';

        if (body.stream && lmResponse.body) {
          res.writeHead(status, {
            'content-type': contentType,
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
          });
          const reader = lmResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          return res.end();
        }

        const data = await lmResponse.json();
        return sendJson(status, data);
      } catch (err) {
        return sendJson(503, {
          error: {
            message: `LM Studio communication failed: ${err.message}`,
            code: 'lm_studio_unreachable',
          },
        });
      }
    }

    return next();
  };
}

export function localLlmPlugin(options = {}) {
  const middleware = localLlmMiddleware(options);
  return {
    name: 'local-lm-studio-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

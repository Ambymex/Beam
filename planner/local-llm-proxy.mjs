// Local LM Studio proxy middleware for Vite (dev and preview).
// Solenoid (Radial Day Planner) local offline engine.
// Forwards /api/local-llm/* to local LM Studio server at http://127.0.0.1:1234

import os from 'os';

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234';

export function localLlmMiddleware(options = {}) {
  const targetUrl = (options.targetUrl || DEFAULT_LM_STUDIO_URL).replace(/\/+$/, '');

  return async (req, res, next = () => { res.statusCode = 404; res.end('Not found'); }) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/local-llm')) return next();

    const sendJson = (status, data) => {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      });
      res.end(JSON.stringify(data));
    };

    // Health check endpoint: queries LM Studio /api/v0/models (or /v1/models)
    // and detects which model is currently loaded in memory.
    if (url.pathname === '/api/local-llm/health' && req.method === 'GET') {
      try {
        let loadedModel = '';
        let models = [];
        let detailedModels = [];

        // Try /api/v0/models first (rich metadata including loaded state)
        try {
          const v0Res = await fetch(`${targetUrl}/api/v0/models`, {
            signal: AbortSignal.timeout(3000),
          });
          if (v0Res.ok) {
            const v0Data = await v0Res.json();
            const list = Array.isArray(v0Data?.data) ? v0Data.data : [];
            detailedModels = list;
            models = list.map((m) => m?.id).filter(Boolean);
            const loaded = list.find((m) => m?.state === 'loaded');
            if (loaded?.id) loadedModel = loaded.id;
          }
        } catch {
          // fall through to v1
        }

        // Fall back to /v1/models if v0 didn't populate models
        if (models.length === 0) {
          const v1Res = await fetch(`${targetUrl}/v1/models`, {
            signal: AbortSignal.timeout(3000),
          });
          if (!v1Res.ok) {
            return sendJson(502, {
              ok: false,
              online: false,
              status: v1Res.status,
              error: `LM Studio returned HTTP ${v1Res.status}`,
              models: [],
            });
          }
          const v1Data = await v1Res.json();
          const list = Array.isArray(v1Data?.data) ? v1Data.data : [];
          models = list.map((m) => m?.id).filter(Boolean);
        }

        // Determine best model: active loaded model comes FIRST, then Gemma 4, then others
        const preferred = loadedModel ||
                          models.find((m) => /gemma-4/i.test(m)) ||
                          models.find((m) => /gemma/i.test(m)) ||
                          models[0] || '';

        // Detect local IPv4 addresses (LAN Wi-Fi / Ethernet / Tailscale)
        const nets = os.networkInterfaces();
        const lanAddresses = [];
        for (const name of Object.keys(nets)) {
          for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
              lanAddresses.push({
                name,
                address: net.address,
                url: `http://${net.address}:5173`,
              });
            }
          }
        }

        return sendJson(200, {
          ok: true,
          online: true,
          models,
          detailedModels: detailedModels.map(m => ({
            id: m.id,
            loaded: m.state === 'loaded',
            contextLength: m.loaded_context_length || m.max_context_length
          })),
          loadedModel,
          preferredModel: preferred,
          lanAddresses,
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

    // Chat completions endpoint: proxies /v1/chat/completions with SSE heartbeat support
    if (url.pathname === '/api/local-llm/chat/completions' && req.method === 'POST') {
      try {
        let text = '';
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 10 * 1024 * 1024) {
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
        // 1. LM Studio rejects response_format.type === 'json_object'
        if (body.response_format && body.response_format.type === 'json_object') {
          delete body.response_format;
        }

        // 2. Resolve model: prefer currently loaded model if body.model is omitted
        if (!body.model) {
          try {
            const v0 = await fetch(`${targetUrl}/api/v0/models`, { signal: AbortSignal.timeout(2000) });
            if (v0.ok) {
              const v0Data = await v0.json();
              const loaded = v0Data?.data?.find(m => m?.state === 'loaded');
              if (loaded?.id) body.model = loaded.id;
            }
          } catch {}
          if (!body.model) {
            body.model = 'default';
          }
        }

        // Safety guard: if prompt exceeds ~22,000 characters (~5,500 tokens),
        // trim intermediate history turns to protect LM Studio 8k context window.
        if (Array.isArray(body.messages) && body.messages.length > 3) {
          const totalChars = body.messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 100), 0);
          if (totalChars > 22000) {
            console.warn(`[local-llm-proxy] Incoming prompt is large (${totalChars} chars) - trimming older turns to protect 8k context window.`);
            const system = body.messages[0];
            const tail = body.messages.slice(-4);
            body.messages = [system, ...tail];
          }
        }

        // If streaming is requested (or default for tunnel-resilience),
        // write SSE headers and keepalive heartbeats immediately so ngrok / mobile Safari
        // never time out while LM Studio performs prompt evaluation or token generation.
        if (body.stream) {
          console.log(`[local-llm-proxy] Streaming chat request to LM Studio (${body.model}, ${body.messages?.length || 0} msgs, max_tokens: ${body.max_tokens || 2048})...`);
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            'connection': 'keep-alive',
            'x-accel-buffering': 'no',
          });

          // Immediate ping to establish connection with zero idle delay
          res.write(': keepalive initial\n\n');

          const abortController = new AbortController();
          const onClientClose = () => abortController.abort();
          res.on('close', onClientClose);

          // Send keep-alive heartbeat comment every 2.5 seconds during generation
          const keepAliveTimer = setInterval(() => {
            if (res.writableEnded || res.destroyed) {
              clearInterval(keepAliveTimer);
              return;
            }
            try {
              res.write(': keepalive\n\n');
            } catch {
              clearInterval(keepAliveTimer);
            }
          }, 2500);

          let lmResponse;
          try {
            lmResponse = await fetch(`${targetUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
              signal: abortController.signal,
            });
          } catch (fetchErr) {
            clearInterval(keepAliveTimer);
            res.off('close', onClientClose);
            console.error('[local-llm-proxy] Fetch error connecting to LM Studio:', fetchErr.message);
            if (!res.writableEnded && !res.destroyed) {
              res.write(`data: ${JSON.stringify({ error: { message: `LM Studio connection error: ${fetchErr.message}` } })}\n\n`);
              res.end();
            }
            return;
          }

          if (!lmResponse.ok) {
            clearInterval(keepAliveTimer);
            res.off('close', onClientClose);
            const errText = await lmResponse.text();
            console.error(`[local-llm-proxy] LM Studio returned HTTP ${lmResponse.status}:`, errText);
            if (!res.writableEnded && !res.destroyed) {
              res.write(`data: ${JSON.stringify({ error: { message: `LM Studio error ${lmResponse.status}: ${errText}` } })}\n\n`);
              res.end();
            }
            return;
          }

          if (lmResponse.body) {
            const reader = lmResponse.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done || res.writableEnded || res.destroyed) break;
                res.write(value);
              }
              console.log('[local-llm-proxy] Streaming completed successfully.');
            } catch (streamErr) {
              if (!abortController.signal.aborted) {
                console.error('[local-llm-proxy] Mid-stream read error from LM Studio:', streamErr?.message || streamErr);
                if (!res.writableEnded && !res.destroyed) {
                  res.write(`data: ${JSON.stringify({ error: { message: `LM Studio stream error: ${streamErr?.message || streamErr}` } })}\n\n`);
                }
              }
            } finally {
              clearInterval(keepAliveTimer);
              res.off('close', onClientClose);
              try { reader.cancel().catch(() => {}); } catch {}
              if (!res.writableEnded) res.end();
            }
          } else {
            clearInterval(keepAliveTimer);
            res.off('close', onClientClose);
            if (!res.writableEnded) res.end();
          }
          return;
        }

        // Non-streaming fallback
        const lmResponse = await fetch(`${targetUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

        const status = lmResponse.status;
        const data = await lmResponse.json();
        return sendJson(status, data);
      } catch (err) {
        if (res.headersSent) {
          console.error('[local-llm-proxy] Post-header error:', err?.message || err);
          if (!res.writableEnded) res.end();
          return;
        }
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

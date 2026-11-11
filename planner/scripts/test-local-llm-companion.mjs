import { preview } from 'vite';

async function testLocalLlmIntegration() {
  console.log('Testing Vite Preview with localLlmPlugin...');
  const server = await preview({
    preview: { port: 5199, host: '127.0.0.1' },
    configFile: './vite.config.ts'
  });

  try {
    const origin = 'http://127.0.0.1:5199';
    console.log(`Preview server started at ${origin}`);

    // 1. Health check via preview server
    console.log('\n1. Checking /api/local-llm/health via Vite preview server:');
    const healthRes = await fetch(`${origin}/api/local-llm/health`);
    if (!healthRes.ok) throw new Error(`Health HTTP ${healthRes.status}`);
    const healthData = await healthRes.json();
    console.log('Health:', healthData);
    if (!healthData.online) throw new Error('Local LM Studio reported offline');
    console.log('Active loaded model in RAM:', healthData.loadedModel);

    // 2. Chat completions via preview server with stream: true
    console.log('\n2. Testing /api/local-llm/chat/completions (SSE stream) via Vite preview server:');
    const chatRes = await fetch(`${origin}/api/local-llm/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: healthData.preferredModel,
        messages: [
          { role: 'system', content: 'You are Solenoid, Ashriel\'s industrial dreadnought companion. Respond in JSON: { "message": "...", "react": "nod" }' },
          { role: 'user', content: 'Quick ping check.' }
        ],
        stream: true,
        max_tokens: 150
      })
    });

    if (!chatRes.ok) throw new Error(`Chat HTTP ${chatRes.status}: ${await chatRes.text()}`);
    console.log('Stream headers received! Content-Type:', chatRes.headers.get('content-type'));

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let keepalives = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      accumulated += text;
      if (text.includes(': keepalive')) keepalives++;
    }

    console.log('Received stream length:', accumulated.length, 'Keepalive pings:', keepalives);
    console.log('\n✅ Local LM Studio Vite proxy streaming integration verified successfully!');
  } finally {
    await server.close();
  }
}

testLocalLlmIntegration().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

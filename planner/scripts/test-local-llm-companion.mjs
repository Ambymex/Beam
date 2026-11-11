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

    // 2. Chat completions via preview server
    console.log('\n2. Testing /api/local-llm/chat/completions via Vite preview server:');
    const chatRes = await fetch(`${origin}/api/local-llm/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: healthData.preferredModel,
        messages: [
          { role: 'system', content: 'You are Solenoid, Ashriel\'s industrial dreadnought companion. Respond in JSON: { "message": "...", "react": "nod" }' },
          { role: 'user', content: 'System check for local offline engine.' }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300
      })
    });

    if (!chatRes.ok) throw new Error(`Chat HTTP ${chatRes.status}: ${await chatRes.text()}`);
    const chatData = await chatRes.json();
    console.log('Completions Choice Message:', chatData.choices?.[0]?.message);

    console.log('\n✅ Local LM Studio Vite proxy integration verified successfully!');
  } finally {
    await server.close();
  }
}

testLocalLlmIntegration().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

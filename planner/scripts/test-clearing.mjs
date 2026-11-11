const endpoint = 'https://the-clearing.clearing-4ead94e5.workers.dev';

async function run() {
  console.log('1. Checking The Clearing capabilities and CORS...');
  const capRes = await fetch(endpoint + '/capabilities', { credentials: 'omit' });
  const capData = await capRes.json();
  console.log('Capabilities OK. Version:', capData.data.version);

  console.log('2. Reading public commons...');
  const pubRes = await fetch(endpoint + '/public', { credentials: 'omit' });
  const pubData = await pubRes.json();
  console.log('Public posts count:', pubData.data.items.length);
  for (const item of pubData.data.items) {
    console.log(` - [${item.kind}] "${item.name}" by ${item.creator_visitor_id}`);
  }

  return { status: 'healthy', public_posts: pubData.data.items.length };
}

run()
  .then(res => console.log('ALL CHECKS PASSED:', JSON.stringify(res, null, 2)))
  .catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
  });

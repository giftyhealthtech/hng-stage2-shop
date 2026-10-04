function isAnonOrPublishableKey(key) {
  if (key.startsWith('sb_publishable_')) return true;

  const parts = key.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

module.exports = (request, response) => {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  let validUrl = false;
  try {
    const parsedUrl = new URL(supabaseUrl);
    validUrl = parsedUrl.protocol === 'https:' && Boolean(parsedUrl.hostname);
  } catch {
    validUrl = false;
  }

  if (!validUrl || !isAnonOrPublishableKey(supabaseAnonKey)) {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).send('Supabase public configuration is missing or invalid.');
    return;
  }

  const script = [
    `window.SUPABASE_URL = window.SUPABASE_URL || ${JSON.stringify(supabaseUrl)};`,
    `window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || ${JSON.stringify(supabaseAnonKey)};`
  ].join('\n');

  response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.status(200).send(script);
};

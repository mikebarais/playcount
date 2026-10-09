import { createClient } from 'npm:@supabase/supabase-js@2';
import { importJWK, SignJWT } from 'npm:jose@5';

const sessionSeconds = 60 * 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ConfigError extends Error {}

let signer: Promise<{ kid: string; key: CryptoKey | Uint8Array }> | null = null;

function getSigner() {
  signer ??= (async () => {
    const raw = Deno.env.get('PLAYCOUNT_JWT_PRIVATE_KEY');
    if (!raw) throw new ConfigError('PLAYCOUNT_JWT_PRIVATE_KEY is not set.');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Generic message: JSON.parse errors can echo parts of the private key.
      throw new ConfigError('PLAYCOUNT_JWT_PRIVATE_KEY is not valid JSON.');
    }

    const jwk = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!jwk?.d || !jwk?.kid) {
      throw new ConfigError('PLAYCOUNT_JWT_PRIVATE_KEY must be a private ES256 JWK with a kid.');
    }

    // Generated keys list "verify" in key_ops, which WebCrypto rejects for a private key.
    const { key_ops: _keyOps, ext: _ext, ...privateKey } = jwk;

    try {
      return { kid: jwk.kid, key: await importJWK(privateKey, 'ES256') };
    } catch {
      throw new ConfigError('PLAYCOUNT_JWT_PRIVATE_KEY could not be imported as an ES256 key.');
    }
  })();

  // Retry on the next request instead of caching a failed load.
  signer.catch(() => {
    signer = null;
  });

  return signer;
}

function getDatabase() {
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  const serverKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serverKey) throw new ConfigError('No Supabase secret key is available to the function.');

  return createClient(Deno.env.get('SUPABASE_URL')!, serverKey, {
    auth: { persistSession: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    return await createSession(request);
  } catch (error) {
    if (error instanceof ConfigError) return json({ error: error.message }, 500);

    console.error('Session creation failed:', error);
    return json({ error: 'Unable to create a session.' }, 500);
  }
});

async function createSession(request: Request) {
  const { personalLink } = await request.json().catch(() => ({}));
  if (typeof personalLink !== 'string' || !uuidPattern.test(personalLink)) {
    return json({ error: 'A valid personal link is required.' }, 400);
  }

  const signing = await getSigner();
  const { data: member, error } = await getDatabase()
    .from('members')
    .select('id')
    .eq('personal_link', personalLink)
    .maybeSingle();

  if (error) {
    console.error('Member lookup failed:', error);
    return json({ error: 'Unable to verify the personal link.' }, 500);
  }
  if (!member) return json({ error: 'Personal link is not recognized.' }, 401);

  const expiresAt = Math.floor(Date.now() / 1000) + sessionSeconds;
  const accessToken = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: signing.kid, typ: 'JWT' })
    .setSubject(member.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signing.key);

  return json({ accessToken, expiresAt });
}

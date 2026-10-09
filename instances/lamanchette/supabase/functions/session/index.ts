import { createClient } from 'npm:@supabase/supabase-js@2';
import { importJWK, SignJWT } from 'npm:jose@5';

const sessionSeconds = 60 * 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const privateJwk = JSON.parse(Deno.env.get('PLAYCOUNT_JWT_PRIVATE_KEY') ?? 'null');
const signingKey = privateJwk ? await importJWK(privateJwk, 'ES256') : null;

const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
const serverKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const database = createClient(Deno.env.get('SUPABASE_URL')!, serverKey, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!signingKey) return json({ error: 'Session signing is not configured.' }, 500);

  const { personalLink } = await request.json().catch(() => ({}));
  if (typeof personalLink !== 'string' || personalLink.length === 0) {
    return json({ error: 'A personal link is required.' }, 400);
  }

  const { data: member, error } = await database
    .from('members')
    .select('id')
    .eq('personal_link', personalLink)
    .maybeSingle();

  if (error) return json({ error: 'Unable to verify the personal link.' }, 500);
  if (!member) return json({ error: 'Personal link is not recognized.' }, 401);

  const expiresAt = Math.floor(Date.now() / 1000) + sessionSeconds;
  const accessToken = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: privateJwk.kid, typ: 'JWT' })
    .setSubject(member.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey);

  return json({ accessToken, expiresAt });
});

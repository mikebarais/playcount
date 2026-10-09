import { createClient } from '@supabase/supabase-js';

const instancePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getInstanceSlug(hostname = window.location.hostname) {
  const localInstance = new URLSearchParams(window.location.search).get('instance')
    || import.meta.env.VITE_DEFAULT_INSTANCE;
  const slug = hostname === 'localhost' || hostname === '127.0.0.1'
    ? localInstance
    : hostname.split('.')[0];

  if (!slug || !instancePattern.test(slug)) {
    throw new Error('No valid club instance could be resolved from this hostname.');
  }

  return slug;
}

export async function loadInstanceConfig(slug) {
  const response = await fetch(`/instances/${encodeURIComponent(slug)}.json`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No Supabase configuration exists for instance "${slug}".`);
  }

  const config = await response.json();

  if (!config.supabaseUrl || !config.publishableKey) {
    throw new Error(`Supabase configuration for instance "${slug}" is incomplete.`);
  }

  return config;
}

export function createPublicClient(config) {
  return createClient(config.supabaseUrl, config.publishableKey);
}

export async function createMemberClient(config, personalLink) {
  const publicClient = createPublicClient(config);
  let session = null;

  async function getAccessToken() {
    // Renew a minute early so in-flight requests never carry an expired token.
    if (!session || session.expiresAt - 60 <= Date.now() / 1000) {
      const { data, error } = await publicClient.functions.invoke('session', {
        body: { personalLink },
      });

      if (error || !data?.accessToken) {
        throw new Error('The personal link is not recognized.');
      }

      session = data;
    }

    return session.accessToken;
  }

  await getAccessToken();

  return createClient(config.supabaseUrl, config.publishableKey, {
    accessToken: getAccessToken,
  });
}

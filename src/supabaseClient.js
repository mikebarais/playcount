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

let publicClient = null;

// One shared instance, since it owns the persisted Google session.
export function createPublicClient(config) {
  publicClient ??= createClient(config.supabaseUrl, config.publishableKey);
  return publicClient;
}

export function signInWithGoogle(client) {
  const redirectUrl = new URL('/', window.location.origin);
  const instance = new URLSearchParams(window.location.search).get('instance');
  if (instance) redirectUrl.searchParams.set('instance', instance);

  return client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUrl.toString() },
  });
}

export function getPersonalPagePath(personalLink) {
  const path = `/p/${encodeURIComponent(personalLink)}`;
  const instance = new URLSearchParams(window.location.search).get('instance');
  return instance ? `${path}?instance=${encodeURIComponent(instance)}` : path;
}

export async function createMemberClient(config, personalLink) {
  const anonClient = createPublicClient(config);
  const { data, error } = await anonClient.functions.invoke('session', {
    body: { personalLink },
  });

  if (error || !data?.accessToken) {
    throw new Error('The personal link is not recognized.');
  }

  return createClient(config.supabaseUrl, config.publishableKey, {
    accessToken: async () => data.accessToken,
  });
}

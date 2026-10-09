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

export async function createSupabaseClientForInstance(slug) {
  const response = await fetch(`/instances/${encodeURIComponent(slug)}.json`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No Supabase configuration exists for instance "${slug}".`);
  }

  const config = await response.json();
  const supabaseUrl = config.supabaseUrl;
  const publishableKey = config.publishableKey;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(`Supabase configuration for instance "${slug}" is incomplete.`);
  }

  return createClient(supabaseUrl, publishableKey);
}

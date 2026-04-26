import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export const LOCAL_URL = 'http://127.0.0.1:60000';
export const LOCAL_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export function makeClient(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
}

/** Unique channel name per test so tests don't bleed into each other */
export function uniqueChannel(): string {
  return `test-${crypto.randomUUID()}`;
}

/** Subscribe and wait until SUBSCRIBED */
export function subscribe(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR') reject(new Error('Channel error'));
    });
  });
}

/** Poll until condition is true or timeout */
export function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 30,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const timer = setInterval(() => {
      if (condition()) { clearInterval(timer); resolve(); }
      else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('waitFor timed out')); }
    }, interval);
  });
}

export async function cleanup(...clients: SupabaseClient[]): Promise<void> {
  await Promise.all(clients.map(c => c.realtime.disconnect()));
}
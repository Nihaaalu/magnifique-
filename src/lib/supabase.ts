import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables safely across browser (Vite import.meta.env) and Node (process.env)
function getEnvVar(key: string): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || '';
    }
  } catch {
    // ignore
  }
  return '';
}

// Supabase URL: Sanitize to ensure no `/rest/v1` or trailing paths/slashes are appended
function getSanitizedSupabaseUrl(): string {
  const rawUrl =
    getEnvVar('VITE_SUPABASE_URL') ||
    getEnvVar('SUPABASE_URL') ||
    'https://wunyyaosaplodirdozxo.supabase.co';

  // Clean out any accidental `/rest/v1`, `/auth/v1`, or trailing slashes
  return rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

// Supabase Publishable Key: Checks VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY
function getSupabaseKey(): string {
  return (
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    getEnvVar('VITE_SUPABASE_ANON_KEY') ||
    getEnvVar('SUPABASE_PUBLISHABLE_KEY') ||
    getEnvVar('SUPABASE_ANON_KEY') ||
    ''
  ).trim();
}

const supabaseUrl = getSanitizedSupabaseUrl();
const supabaseKey = getSupabaseKey();

// Initialize client with fallback placeholder to prevent module crash if key is missing during build
export const supabase = createClient(
  supabaseUrl,
  supabaseKey || 'sb_publishable_placeholder'
);

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseKey &&
    supabaseKey !== 'sb_publishable_placeholder'
  );
};

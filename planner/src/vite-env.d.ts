/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  // VAPID public key for Web Push (§7); injected at build/deploy time.
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  // Supabase project (§7 server spine). Both safe to ship publicly; the
  // service-role key stays server-side in the Edge Functions only.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

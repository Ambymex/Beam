/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  // VAPID public key for Web Push (§7); injected at build/deploy time.
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

const path = require('path');

// Resolve ProseMirror packages from a single location to avoid duplicate
// instances that break BlockNote.  We use @blocknote/core's resolution
// context (it depends on prosemirror-* directly).
const blocknoteResolveBase = path.dirname(require.resolve('@blocknote/core'));
const resolveFromBlockNote = (pkg) =>
  require.resolve(pkg, { paths: [blocknoteResolveBase] });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled for BlockNote compatibility
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Add basePath configuration
  basePath: '',
  assetPrefix: '/',

  // Strip console.log / console.debug / console.warn in production builds.
  // console.error is preserved so crash information still reaches users.
  compiler: {
    removeConsole: {
      exclude: ['error'],
    },
  },

  // Add webpack configuration for Tauri
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };

      // Keep ProseMirror single-instanced for BlockNote.
      config.resolve.alias = {
        ...config.resolve.alias,
        '@blocknote/core$': require.resolve('@blocknote/core'),
        '@blocknote/react$': require.resolve('@blocknote/react'),
        '@blocknote/shadcn$': require.resolve('@blocknote/shadcn'),
        'prosemirror-model': resolveFromBlockNote('prosemirror-model'),
        'prosemirror-state': resolveFromBlockNote('prosemirror-state'),
        'prosemirror-view': resolveFromBlockNote('prosemirror-view'),
        'prosemirror-transform': resolveFromBlockNote('prosemirror-transform'),
        'prosemirror-tables': resolveFromBlockNote('prosemirror-tables'),
        'prosemirror-schema-list': resolveFromBlockNote('prosemirror-schema-list'),
        'prosemirror-keymap': resolveFromBlockNote('prosemirror-keymap'),
        'prosemirror-commands': resolveFromBlockNote('prosemirror-commands'),
        'prosemirror-history': resolveFromBlockNote('prosemirror-history'),
        'prosemirror-inputrules': resolveFromBlockNote('prosemirror-inputrules'),
        'prosemirror-gapcursor': resolveFromBlockNote('prosemirror-gapcursor'),
        'prosemirror-dropcursor': resolveFromBlockNote('prosemirror-dropcursor'),
      };

      // Give the Tauri webview's first cold on-demand compile (this app has
      // 1900+ modules) more room before webpack gives up on a chunk request
      // and throws ChunkLoadError. Default is 120000ms.
      config.output.chunkLoadTimeout = 300000;
    }
    return config;
  },
}

module.exports = nextConfig

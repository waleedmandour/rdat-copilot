import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Cache-first strategy for offline support
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: {
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        },
      },
    },
    {
      urlPattern: /\.(?:js|css|wasm|json)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: {
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
  ],
  // Custom service worker for AI model caching
  sw: "/sw.js",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── GitHub Pages Static Export ──────────────────────────────────
  // Phase 3 enables `output: 'export'` for GitHub Pages deployment.
  // Currently set to undefined for development with Vercel/local dev.
  // To deploy to GitHub Pages, uncomment the next line:
  // output: "export",

  // Base path for GitHub Pages project site
  // Uncomment when deploying to https://waleedmandour.github.io/rdat-copilot/
  // basePath: "/rdat-copilot",
  // assetPrefix: "/rdat-copilot/",

  // Required for static export with next/image
  images: {
    unoptimized: true,
  },

  // Trailing slash for GitHub Pages compatibility
  trailingSlash: true,

  // Prevent SSR hydration issues for Monaco/WebGPU/Transformers.js
  // These Node.js modules must be excluded from client-side bundling
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        worker_threads: false,
        perf_hooks: false,
      };
    }
    return config;
  },
  // Configure Turbopack for compatibility
  turbopack: {
    rules: {
      // Allow WebAssembly modules (for future ML libraries)
      "*.wasm": {
        loaders: ["next/dist/build/webpack/loaders/wasm-module-loader.js"],
        as: "*.wasm",
      },
    },
  },
};

export default withPWA(nextConfig);

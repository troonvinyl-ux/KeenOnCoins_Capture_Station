// metro.config.js — SWISH
// Expo 53 + pnpm: @expo/cli does require('metro') before loading this config.
// In pnpm, metro is not hoisted so the bare require fails.
//
// Fix 1: Module._resolveFilename patch so that bare require('metro') and
//         require('metro/...') resolve to Expo's copy of Metro.
//
// Fix 2: Explicit babelTransformerPath so Metro's worker process never tries
//         to bare-require('metro-react-native-babel-transformer'). The worker
//         runs in a separate jest-worker child process; it resolves modules
//         from its own location (inside Expo's pnpm store), so our hoisted
//         shim in root node_modules may not intercept. Giving Metro the
//         absolute path bypasses all resolution ambiguity.

const path = require('path');
const Module = require('module');

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: Module._resolveFilename — redirect bare 'metro' / 'metro/*' imports
// ─────────────────────────────────────────────────────────────────────────────
(function patchMetroResolution() {
  let realMetroDir;
  try {
    // Already resolvable — nothing to do
    require.resolve('metro');
    return;
  } catch (_) {
    try {
      const expoMetroConfigDir = path.dirname(
        require.resolve('expo/metro-config', {
          paths: [path.join(__dirname, 'node_modules')],
        })
      );
      realMetroDir = path.dirname(
        require.resolve('metro/package.json', { paths: [expoMetroConfigDir] })
      );
    } catch (e2) {
      return;
    }
  }

  const _orig = Module._resolveFilename.bind(Module);
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'metro' || request.startsWith('metro/')) {
      try {
        return _orig(request, parent, isMain, options);
      } catch (_) {
        const suffix = request.slice('metro'.length);
        return _orig(
          path.join(realMetroDir, suffix),
          parent,
          isMain,
          options,
        );
      }
    }
    return _orig(request, parent, isMain, options);
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: Resolve the real metro-react-native-babel-transformer absolute path
// The worker process is forked by Metro and inherits nothing from this file's
// require() cache. By passing the absolute path via babelTransformerPath, Metro
// never performs a bare module lookup for the transformer.
// ─────────────────────────────────────────────────────────────────────────────
function resolveTransformerPath() {
  // Canonical resolution order (same strategies as the shim):
  const searchRoots = [];

  // 1. expo package root
  try { searchRoots.push(path.dirname(require.resolve('expo/package.json'))); } catch (_) {}
  // 2. @expo/metro-config package root
  try { searchRoots.push(path.dirname(require.resolve('@expo/metro-config/package.json'))); } catch (_) {}
  // 3. metro-transform-worker (direct dependency of metro that uses the transformer)
  try { searchRoots.push(path.dirname(require.resolve('metro-transform-worker/package.json'))); } catch (_) {}

  for (const root of searchRoots) {
    try {
      const pkgJsonPath = require.resolve(
        'metro-react-native-babel-transformer/package.json',
        { paths: [root] },
      );
      const pkg = require(pkgJsonPath);
      const pkgDir = path.dirname(pkgJsonPath);
      // Try main field first, then known entry points
      for (const entry of [pkg.main, 'src/index.js', 'build/index.js'].filter(Boolean)) {
        const fullPath = path.resolve(pkgDir, entry);
        try {
          require.resolve(fullPath);
          return fullPath;
        } catch (_) {}
      }
    } catch (_) {}
  }
  return null;
}

const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Explicitly wire the transformer so Metro workers don't need to resolve it
const resolvedTransformerPath = resolveTransformerPath();
if (resolvedTransformerPath) {
  config.transformer = config.transformer || {};
  config.transformer.babelTransformerPath = resolvedTransformerPath;
}

module.exports = config;

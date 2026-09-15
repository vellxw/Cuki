module.exports = function (api) {
  api.cache(true);
  // Resolve Expo's own compatible preset, including non-hoisted npm workspaces.
  return { presets: [require.resolve('expo/internal/babel-preset')] };
};

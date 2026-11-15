const expoConfig = require('./app.json').expo;

module.exports = () => ({
  ...expoConfig,
  experiments: {
    ...expoConfig.experiments,
    baseUrl: process.env.EXPO_BASE_URL || '/',
  },
});

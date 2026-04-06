const appJson = require('./app.json');

const expoConfig = appJson.expo ?? {};
const androidConfig = expoConfig.android ?? {};

module.exports = {
  expo: {
    ...expoConfig,
    android: {
      ...androidConfig,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || androidConfig.googleServicesFile,
    },
  },
};

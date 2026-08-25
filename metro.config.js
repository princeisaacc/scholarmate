const { getDefaultConfig } = require("expo/metro-config");

const defaultConfig = getDefaultConfig(__dirname);
defaultConfig.resolver.unstable_enablePackageExports = false;
module.exports = defaultConfig;
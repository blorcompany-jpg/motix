// EXPO_BASE_PATH: percorso sotto cui la versione web dell'app è pubblicata (ad esempio «/app» nell'ambiente di prova).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_PATH ? { baseUrl: process.env.EXPO_BASE_PATH } : {}) },
});

export const environment = {
  production: false,
  infura: {
    apiKey: process.env['INFURA_API_KEY'] || '',
    network: 'mainnet',
    get rpcUrl(): string {
      return `https://${this.network}.infura.io/v3/${this.apiKey}`;
    },
  },
  huggingFaceApiKey: process.env['HUGGING_FACE_API_KEY'] || '',
};

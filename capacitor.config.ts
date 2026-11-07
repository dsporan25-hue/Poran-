import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.poran.live',
  appName: 'PORAN LIVE',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

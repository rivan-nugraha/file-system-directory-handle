import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pos.offline',
  appName: 'POS',
  webDir: 'dist',
  server: {
    // Untuk development: arahkan ke Vite dev server
    // Untuk production: kosongkan, gunakan file dari webDir
    // cleartext: true,
    // url: 'http://192.168.1.x:5173',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;

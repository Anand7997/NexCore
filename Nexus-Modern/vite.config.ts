import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  console.log('ðŸ”§ Vite Config - Loading environment variables:', {
    mode,
    VITE_API_BASE_URL: env.VITE_API_BASE_URL,
    VITE_ENV: env.VITE_ENV
  });

  return {
    server: {
      host: "::",
      port: 3002,
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __VITE_API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL)
    }
  };
});


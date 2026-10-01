/**
 * PM2 ecosystem file (CommonJS) to run the backend in production.
 * Use the .cjs extension because the project uses ESM (`type: "module"`).
 * Reads backend/.env via the app (dotenv in src/config/env.ts).
 */
module.exports = {
  apps: [
    {
      name: 'cloudeasy-backend',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

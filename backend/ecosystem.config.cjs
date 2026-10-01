/**
 * PM2 ecosystem file (CommonJS) to run the backend.
 * Use the .cjs extension because the project uses ESM (`type: "module"`).
 */
module.exports = {
  apps: [
    {
      name: 'cloudeasy-backend',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'cloudeasy-backend-dev',
      script: 'npm',
      args: 'run dev',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};

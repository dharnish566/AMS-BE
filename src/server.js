import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.get('/', (req, res) => {
  res.send('Joineazy API is running');
});

app.listen(env.port, () => {
  console.log(`Joineazy API is running at http://localhost:${env.port}`);
  console.log(`Health check: http://localhost:${env.port}/api/health`);
});

import { createApp } from './app.js';
import { dbPath } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);

createApp().listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`SQLite file: ${dbPath}`);
});

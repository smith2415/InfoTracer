import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";

const pool = createPool();
await migrate(pool);

const app = createApp(pool);
const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`InfoTracer is running on port ${port}`);
});

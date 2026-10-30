import "dotenv/config";
import { readFile } from "fs/promises";
import { pool } from "./pool";

async function migrate() {
  const sql = await readFile("src/db/schema.sql", "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Database schema is ready.");
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

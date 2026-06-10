#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const migrationName = "20260417070500_add_task_deliverable_type";

async function getDeliverableTypeColumnCount() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tasks'
      AND COLUMN_NAME = 'deliverableType'
  `);

  return Number(rows?.[0]?.count ?? 0);
}

async function ensureDeliverableTypeColumn() {
  const columnCount = await getDeliverableTypeColumnCount();

  if (columnCount > 0) {
    console.log("tasks.deliverableType already exists");
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`tasks\`
      ADD COLUMN \`deliverableType\` VARCHAR(50) NULL
  `);
  console.log("Added tasks.deliverableType");
}

async function getMigrationRecord() {
  const rows = await prisma.$queryRaw`
    SELECT
      migration_name AS migrationName,
      finished_at AS finishedAt,
      rolled_back_at AS rolledBackAt
    FROM _prisma_migrations
    WHERE migration_name = ${migrationName}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function main() {
  const record = await getMigrationRecord();

  if (!record) {
    console.log(`No migration record found for ${migrationName}; nothing to repair`);
    return;
  }

  if (record.finishedAt || record.rolledBackAt) {
    console.log(`Migration ${migrationName} is already resolved`);
    return;
  }

  console.log(`Repairing failed migration ${migrationName}`);
  await ensureDeliverableTypeColumn();
  await prisma.$disconnect();

  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "resolve", "--applied", migrationName],
    { stdio: "inherit" },
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

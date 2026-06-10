SET @project_work_item_concurrency_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_work_items'
      AND COLUMN_NAME = 'concurrencyMode'
);

SET @project_work_item_concurrency_sql = IF(
    @project_work_item_concurrency_exists = 0,
    'ALTER TABLE `project_work_items` ADD COLUMN `concurrencyMode` ENUM(''SINGLE'', ''RACE'', ''MULTI_ROLE'', ''PRIMARY_BACKUP'') NOT NULL DEFAULT ''SINGLE'' AFTER `dependsOn`',
    'SELECT 1'
);

PREPARE project_work_item_concurrency_stmt FROM @project_work_item_concurrency_sql;
EXECUTE project_work_item_concurrency_stmt;
DEALLOCATE PREPARE project_work_item_concurrency_stmt;

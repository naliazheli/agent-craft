ALTER TABLE `tasks`
    ADD COLUMN `codeType` VARCHAR(100) NULL;

CREATE TABLE `task_generator_runs` (
  `id` VARCHAR(191) NOT NULL,
  `type` ENUM('FETCH_GITHUB', 'SCORE', 'PUBLISH', 'SCORE_AND_PUBLISH') NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  `triggeredBy` VARCHAR(191) NULL,
  `input` JSON NULL,
  `result` JSON NULL,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `task_generator_runs_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `task_generator_runs_type_createdAt_idx`(`type`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

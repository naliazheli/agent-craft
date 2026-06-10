CREATE TABLE IF NOT EXISTS `project_global_secrets` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `encryptedValue` LONGTEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `project_global_secrets_projectId_key_key`(`projectId`, `key`),
    INDEX `project_global_secrets_projectId_idx`(`projectId`),
    CONSTRAINT `project_global_secrets_projectId_fkey`
      FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_personal_templates` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `sourceProjectId` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `templateKey` TEXT NOT NULL,
  `snapshotSummary` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `project_personal_templates_ownerId_updatedAt_idx` ON `project_personal_templates`(`ownerId`, `updatedAt`);
CREATE INDEX `project_personal_templates_sourceProjectId_idx` ON `project_personal_templates`(`sourceProjectId`);

ALTER TABLE `project_personal_templates` ADD CONSTRAINT `project_personal_templates_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_personal_templates` ADD CONSTRAINT `project_personal_templates_sourceProjectId_fkey` FOREIGN KEY (`sourceProjectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

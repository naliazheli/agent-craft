CREATE TABLE `project_agent_profiles` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `role` VARCHAR(50) NOT NULL,
  `launchMode` VARCHAR(50) NOT NULL DEFAULT 'aws-agentcore',
  `agentType` VARCHAR(80) NOT NULL DEFAULT 'hermes-agent',
  `image` TEXT NULL,
  `model` VARCHAR(191) NULL,
  `llmConfigId` VARCHAR(191) NULL,
  `deploymentDays` INTEGER NOT NULL DEFAULT 1,
  `settings` JSON NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `lastLaunchedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `project_agent_profiles_projectId_role_updatedAt_idx` ON `project_agent_profiles`(`projectId`, `role`, `updatedAt`);
CREATE INDEX `project_agent_profiles_createdById_updatedAt_idx` ON `project_agent_profiles`(`createdById`, `updatedAt`);

ALTER TABLE `project_agent_profiles` ADD CONSTRAINT `project_agent_profiles_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_agent_profiles` ADD CONSTRAINT `project_agent_profiles_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

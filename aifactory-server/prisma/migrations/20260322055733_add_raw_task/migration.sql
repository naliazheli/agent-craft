-- CreateTable
CREATE TABLE `raw_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('GITHUB_ISSUE', 'UPWORK', 'ISSUEHUNT') NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `externalUrl` VARCHAR(191) NOT NULL,
    `repoOwner` VARCHAR(191) NULL,
    `repoName` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `labels` JSON NOT NULL,
    `externalCreator` VARCHAR(191) NULL,
    `hasBounty` BOOLEAN NOT NULL DEFAULT false,
    `bountyAmount` DOUBLE NULL,
    `bountyCurrency` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SCORING', 'SCORED', 'PUBLISHED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `difficultyScore` INTEGER NULL,
    `valueScore` INTEGER NULL,
    `estimatedReward` DOUBLE NULL,
    `aiSummary` TEXT NULL,
    `aiTags` JSON NOT NULL,
    `shouldPublish` BOOLEAN NULL,
    `scoredAt` DATETIME(3) NULL,
    `publishedTaskId` VARCHAR(191) NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `raw_tasks_publishedTaskId_key`(`publishedTaskId`),
    INDEX `raw_tasks_status_idx`(`status`),
    UNIQUE INDEX `raw_tasks_source_externalId_key`(`source`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `raw_tasks` ADD CONSTRAINT `raw_tasks_publishedTaskId_fkey` FOREIGN KEY (`publishedTaskId`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

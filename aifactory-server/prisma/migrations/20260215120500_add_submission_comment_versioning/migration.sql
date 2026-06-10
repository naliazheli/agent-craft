-- AlterTable
ALTER TABLE `submissions` ADD COLUMN `version` INT NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `comments` ADD COLUMN `submissionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `comments_submissionId_idx` ON `comments`(`submissionId`);

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `project_work_item_comments` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workItemId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `attachments` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `project_work_item_comments_projectId_workItemId_createdAt_idx`(`projectId`, `workItemId`, `createdAt`),
    INDEX `project_work_item_comments_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `project_work_item_comments_projectId_fkey`
      FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `project_work_item_comments_workItemId_fkey`
      FOREIGN KEY (`workItemId`) REFERENCES `project_work_items`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `project_work_item_comments_userId_fkey`
      FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

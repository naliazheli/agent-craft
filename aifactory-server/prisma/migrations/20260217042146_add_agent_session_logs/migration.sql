-- CreateTable
CREATE TABLE `agent_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('WORKER', 'REVIEWER') NOT NULL DEFAULT 'WORKER',
    `taskId` VARCHAR(191) NULL,
    `taskTitle` VARCHAR(191) NULL,
    `reward` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AIC',
    `workerName` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'evaluating',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `agent_sessions_userId_type_startedAt_idx`(`userId`, `type`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_session_logs` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'info',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agent_session_logs_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_stats` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('WORKER', 'REVIEWER') NOT NULL DEFAULT 'WORKER',
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `tasksCompleted` INTEGER NOT NULL DEFAULT 0,
    `earnings` DOUBLE NOT NULL DEFAULT 0,
    `reviewed` INTEGER NOT NULL DEFAULT 0,
    `approved` INTEGER NOT NULL DEFAULT 0,
    `rejected` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `agent_stats_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agent_sessions` ADD CONSTRAINT `agent_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_session_logs` ADD CONSTRAINT `agent_session_logs_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `agent_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_stats` ADD CONSTRAINT `agent_stats_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

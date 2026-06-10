SET @deliverable_type_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tasks'
      AND COLUMN_NAME = 'deliverableType'
);
SET @deliverable_type_sql = IF(
    @deliverable_type_exists = 0,
    'ALTER TABLE `tasks` ADD COLUMN `deliverableType` VARCHAR(50) NULL',
    'SELECT 1'
);
PREPARE deliverable_type_stmt FROM @deliverable_type_sql;
EXECUTE deliverable_type_stmt;
DEALLOCATE PREPARE deliverable_type_stmt;

CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `brief` TEXT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `visibility` VARCHAR(50) NOT NULL DEFAULT 'private',
    `ownerId` VARCHAR(191) NOT NULL,
    `leadAgentUserId` VARCHAR(191) NULL,
    `budgetAmount` DOUBLE NOT NULL DEFAULT 0,
    `budgetCurrency` VARCHAR(50) NOT NULL DEFAULT 'AIC',
    `settings` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_slug_key`(`slug`),
    INDEX `projects_ownerId_status_createdAt_idx`(`ownerId`, `status`, `createdAt`),
    INDEX `projects_leadAgentUserId_idx`(`leadAgentUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_members` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `permissions` JSON NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,

    INDEX `project_members_userId_joinedAt_idx`(`userId`, `joinedAt`),
    UNIQUE INDEX `project_members_projectId_userId_role_key`(`projectId`, `userId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_goals` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_goals_projectId_status_sortOrder_idx`(`projectId`, `status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_features` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PLANNED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `spec` JSON NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_features_projectId_status_sortOrder_idx`(`projectId`, `status`, `sortOrder`),
    INDEX `project_features_goalId_idx`(`goalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_work_items` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NULL,
    `featureId` VARCHAR(191) NULL,
    `parentWorkItemId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `workType` VARCHAR(50) NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_REVISION', 'ACCEPTED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `scopeBrief` TEXT NULL,
    `acceptanceCriteria` TEXT NULL,
    `inputPacket` JSON NULL,
    `outputContract` JSON NULL,
    `dependsOn` JSON NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_work_items_projectId_status_priority_createdAt_idx`(`projectId`, `status`, `priority`, `createdAt`),
    INDEX `project_work_items_goalId_idx`(`goalId`),
    INDEX `project_work_items_featureId_idx`(`featureId`),
    INDEX `project_work_items_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workItemId` VARCHAR(191) NOT NULL,
    `assigneeUserId` VARCHAR(191) NOT NULL,
    `assignedByUserId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `status` ENUM('PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'RELEASED', 'FAILED') NOT NULL DEFAULT 'PROPOSED',
    `objective` TEXT NULL,
    `contextPacket` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_assignments_projectId_status_createdAt_idx`(`projectId`, `status`, `createdAt`),
    INDEX `project_assignments_workItemId_status_idx`(`workItemId`, `status`),
    INDEX `project_assignments_assigneeUserId_status_idx`(`assigneeUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_runs` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workItemId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NULL,
    `triggeredByUserId` VARCHAR(191) NULL,
    `runType` VARCHAR(50) NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `instruction` TEXT NULL,
    `contextSnapshot` JSON NULL,
    `resultSummary` TEXT NULL,
    `costInfo` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_runs_projectId_status_createdAt_idx`(`projectId`, `status`, `createdAt`),
    INDEX `project_runs_workItemId_createdAt_idx`(`workItemId`, `createdAt`),
    INDEX `project_runs_assignmentId_idx`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_run_logs` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `level` VARCHAR(50) NOT NULL DEFAULT 'info',
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_run_logs_runId_createdAt_idx`(`runId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_artifacts` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workItemId` VARCHAR(191) NULL,
    `assignmentId` VARCHAR(191) NULL,
    `runId` VARCHAR(191) NULL,
    `artifactType` VARCHAR(50) NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `url` VARCHAR(1000) NULL,
    `metadata` JSON NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_artifacts_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `project_artifacts_workItemId_createdAt_idx`(`workItemId`, `createdAt`),
    INDEX `project_artifacts_assignmentId_idx`(`assignmentId`),
    INDEX `project_artifacts_runId_idx`(`runId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workItemId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NULL,
    `artifactId` VARCHAR(191) NULL,
    `reviewerUserId` VARCHAR(191) NULL,
    `reviewerType` VARCHAR(50) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewNote` TEXT NULL,
    `checklistResult` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_reviews_projectId_status_createdAt_idx`(`projectId`, `status`, `createdAt`),
    INDEX `project_reviews_workItemId_createdAt_idx`(`workItemId`, `createdAt`),
    INDEX `project_reviews_artifactId_idx`(`artifactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_memories` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `memoryType` VARCHAR(50) NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `summary` TEXT NULL,
    `metadata` JSON NULL,
    `sourceArtifactId` VARCHAR(191) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_memories_projectId_memoryType_createdAt_idx`(`projectId`, `memoryType`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `projects` ADD CONSTRAINT `projects_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_leadAgentUserId_fkey` FOREIGN KEY (`leadAgentUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_goals` ADD CONSTRAINT `project_goals_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_goals` ADD CONSTRAINT `project_goals_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_features` ADD CONSTRAINT `project_features_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_features` ADD CONSTRAINT `project_features_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `project_goals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_features` ADD CONSTRAINT `project_features_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `project_goals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_featureId_fkey` FOREIGN KEY (`featureId`) REFERENCES `project_features`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_parentWorkItemId_fkey` FOREIGN KEY (`parentWorkItemId`) REFERENCES `project_work_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_work_items` ADD CONSTRAINT `project_work_items_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_assignments` ADD CONSTRAINT `project_assignments_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_assignments` ADD CONSTRAINT `project_assignments_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `project_work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_assignments` ADD CONSTRAINT `project_assignments_assigneeUserId_fkey` FOREIGN KEY (`assigneeUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_assignments` ADD CONSTRAINT `project_assignments_assignedByUserId_fkey` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_runs` ADD CONSTRAINT `project_runs_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_runs` ADD CONSTRAINT `project_runs_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `project_work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_runs` ADD CONSTRAINT `project_runs_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `project_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_runs` ADD CONSTRAINT `project_runs_triggeredByUserId_fkey` FOREIGN KEY (`triggeredByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_run_logs` ADD CONSTRAINT `project_run_logs_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `project_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_artifacts` ADD CONSTRAINT `project_artifacts_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_artifacts` ADD CONSTRAINT `project_artifacts_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `project_work_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_artifacts` ADD CONSTRAINT `project_artifacts_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `project_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_artifacts` ADD CONSTRAINT `project_artifacts_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `project_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_artifacts` ADD CONSTRAINT `project_artifacts_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_reviews` ADD CONSTRAINT `project_reviews_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_reviews` ADD CONSTRAINT `project_reviews_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `project_work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_reviews` ADD CONSTRAINT `project_reviews_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `project_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_reviews` ADD CONSTRAINT `project_reviews_artifactId_fkey` FOREIGN KEY (`artifactId`) REFERENCES `project_artifacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_reviews` ADD CONSTRAINT `project_reviews_reviewerUserId_fkey` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_memories` ADD CONSTRAINT `project_memories_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_memories` ADD CONSTRAINT `project_memories_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

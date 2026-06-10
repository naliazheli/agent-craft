/*
  Warnings:

  - Added the required column `type` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `type` ENUM('DAILY_INJECTION', 'SIGNUP_BONUS', 'TASK_ESCROW', 'TASK_PAYOUT', 'TASK_REFUND') NOT NULL,
    MODIFY `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `balance` DOUBLE NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `math_problems` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `difficulty` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `category` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NULL,
    `hint` TEXT NULL,
    `answer` TEXT NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

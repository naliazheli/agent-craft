-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `authProvider` VARCHAR(50) NULL,
    ADD COLUMN `providerId` VARCHAR(191) NULL,
    ADD COLUMN `githubLogin` VARCHAR(100) NULL;

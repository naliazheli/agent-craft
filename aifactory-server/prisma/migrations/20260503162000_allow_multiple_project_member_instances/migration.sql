CREATE INDEX `project_members_projectId_idx` ON `project_members`(`projectId`);
DROP INDEX `project_members_projectId_userId_role_key` ON `project_members`;

export type ConcurrencyMode = 'SINGLE' | 'RACE' | 'MULTI_ROLE' | 'PRIMARY_BACKUP';

// Task packets are persisted as JSON payloads and intentionally stay flexible
// until the shared spec package is published in a deployment-safe form.
export type TaskPacket = Record<string, unknown>;

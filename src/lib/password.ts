import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 使用 scrypt 生成密码哈希
 * 格式: scrypt$<salt_hex>$<hash_hex>
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * 校验明文密码是否匹配哈希
 * 兼容旧的明文密码（迁移期）
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  // 兼容旧数据（未哈希的明文密码）
  if (!stored.startsWith('scrypt$')) {
    return password === stored;
  }
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = scryptSync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

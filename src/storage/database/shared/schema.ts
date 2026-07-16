import { sql } from "drizzle-orm";
import { pgTable, serial, timestamp, varchar, index } from "drizzle-orm/pg-core";

// 系统表：不可删除
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// 用户表：注册/审批/登录用户数据
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 64 }).notNull(),
    password_hash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 32 }).notNull().default("anchor"),
    brand: varchar("brand", { length: 32 }),
    // 审批状态：pending / approved / rejected
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    remark: varchar("remark", { length: 255 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_phone_idx").on(table.phone),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.created_at),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

import { pgTable, serial, timestamp, varchar, integer, boolean, jsonb, text, index, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
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

// SOP 管理：制度与培训统一文档主表
export const sopDocuments = pgTable(
  "sop_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    // management 制度 / training 培训
    doc_type: varchar("doc_type", { length: 20 }).notNull().default("training"),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }),
    // 适用岗位数组，可空
    applicable_post: jsonb("applicable_post"),
    // 适用品牌数组，可空
    applicable_brand: jsonb("applicable_brand"),
    // link 在线文档 / file 上传文件（v2 起由 feishu / tencent / manual 表示来源）
    source_type: varchar("source_type", { length: 10 }).notNull().default("link"),
    external_url: text("external_url"),
    // 上传文件字段，本期可空，预留
    file_id: varchar("file_id", { length: 64 }),
    file_name: varchar("file_name", { length: 255 }),
    // v2：一级业务域 scope（general / vivo / iqoo_douyin / iqoo_kuaishou）
    scope: varchar("scope", { length: 32 }),
    // v2：二级内容类目 sub_category（product / culture / management / live_standard / other）
    sub_category: varchar("sub_category", { length: 32 }),
    // v2：AI 关键内容提炼
    ai_summary: text("ai_summary"),
    // 提炼关键要点（string 数组）
    ai_keypoints: jsonb("ai_keypoints"),
    // pending / processing / done / failed
    ai_status: varchar("ai_status", { length: 16 }).notNull().default("pending"),
    ai_error: varchar("ai_error", { length: 255 }),
    // v2：上传人
    uploaded_by: varchar("uploaded_by", { length: 36 }),
    uploader_name: varchar("uploader_name", { length: 64 }),
    // v2：上传备注（可选）
    remark: varchar("remark", { length: 255 }),
    // v2：软删除 / 下架
    is_active: boolean("is_active").notNull().default(true),
    // internal 内部可见（默认）/ general 通用可见（外部合作可见）
    visibility: varchar("visibility", { length: 20 }).notNull().default("internal"),
    // 后续是否需要考核（本期仅标记，不做考试）
    needs_quiz: boolean("needs_quiz").notNull().default(false),
    // draft / published / archived（本期导入默认 published）
    status: varchar("status", { length: 20 }).notNull().default("published"),
    version: integer("version").notNull().default(1),
    created_by: varchar("created_by", { length: 64 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sop_documents_doc_type_idx").on(table.doc_type),
    index("sop_documents_category_idx").on(table.category),
    index("sop_documents_status_idx").on(table.status),
    index("sop_documents_visibility_idx").on(table.visibility),
    index("sop_documents_created_at_idx").on(table.created_at),
    index("sop_documents_scope_idx").on(table.scope),
    index("sop_documents_sub_category_idx").on(table.sub_category),
    index("sop_documents_ai_status_idx").on(table.ai_status),
    index("sop_documents_is_active_idx").on(table.is_active),
  ]
);

// SOP 已读日志：记录某用户已读某文档，unique(doc_id, user_id) 避免重复
export const sopReadLogs = pgTable(
  "sop_read_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    doc_id: varchar("doc_id", { length: 36 }).notNull(),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    read_at: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("sop_read_logs_doc_user_unique").on(table.doc_id, table.user_id),
    index("sop_read_logs_doc_idx").on(table.doc_id),
    index("sop_read_logs_user_idx").on(table.user_id),
  ]
);

// SOP 分类字典：type = category（内容分类）/ post（适用岗位）/ brand（适用品牌）
export const sopCategories = pgTable(
  "sop_categories",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 20 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("sop_categories_type_sort_idx").on(table.type, table.sort_order),
  ]
);

export type SopDocument = typeof sopDocuments.$inferSelect;
export type InsertSopDocument = typeof sopDocuments.$inferInsert;
export type SopCategory = typeof sopCategories.$inferSelect;
export type SopReadLog = typeof sopReadLogs.$inferSelect;
import { pgTable, serial, timestamp, varchar, integer, boolean, jsonb, text, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

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
    // link 在线文档 / file 上传文件（本期默认 link）
    source_type: varchar("source_type", { length: 10 }).notNull().default("link"),
    external_url: text("external_url"),
    // 上传文件字段，本期可空，预留
    file_id: varchar("file_id", { length: 64 }),
    file_name: varchar("file_name", { length: 255 }),
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
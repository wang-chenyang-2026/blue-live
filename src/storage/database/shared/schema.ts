import { pgTable, serial, timestamp, varchar, integer, bigint, boolean, jsonb, text, index, unique } from "drizzle-orm/pg-core"
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
    // v2.5 UI 重构：正文摘录（抓到的正文前段）、上一版本时间
    content_excerpt: text("content_excerpt"),
    // v2.8 原文内联展示：已抓取的飞书正文全量
    content_body: text("content_body"),
    // v2.14 表格文件结构化数据（JSON 字符串：sheets[]，供详情页表格化展示）
    content_sheet: text("content_sheet"),
    // v2.9 本地文件上传：对象存储路径 + 类型/字节 + 备注
    file_url: text("file_url"),
    file_kind: text("file_kind"),
    mime_type: text("mime_type"),
    file_size: bigint("file_size", { mode: "bigint" }),
    original_file_url: text("original_file_url"),
    original_mime_type: text("original_mime_type"),
    prev_version_at: timestamp("prev_version_at", { withTimezone: true }),
    // v2.16 在线文档授权状态：pending(待授权)/granted(已把平台应用加为只读协作者)/ok(已可读)
    perm_status: text("perm_status"),
    perm_source: text("perm_source"),
    perm_at: timestamp("perm_at", { withTimezone: true }),
    fetch_as: text("fetch_as"),
    fetch_error: text("fetch_error"),
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

// 百应采集任务配置（M2）。频率 daily/weekly/custom/manual；写模式 append/overwrite；交付方式二期支持飞书。
export const buyinTasks = pgTable(
  "buyin_tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 64 }).notNull(),
    // 达人ID / 账号名（留空走默认 vivo 官方旗舰店）
    by_kol_id: varchar("by_kol_id", { length: 64 }),
    by_account: varchar("by_account", { length: 128 }),
    // 数据粒度数组：day / hour / product / anchor
    granularities: jsonb("granularities").notNull(),
    // 已选指标 FIELD（按 FIELD 源顺序记录，作为输出列）
    selected_fields: jsonb("selected_fields").notNull(),
    // 商品明细开关（仅 product 粒度可用）
    with_product_detail: boolean("with_product_detail").notNull().default(false),
    // 每次采集回溯天数
    lookback_days: integer("lookback_days").notNull().default(1),
    // minute / hour / daily / weekly / custom / manual
    frequency: varchar("frequency", { length: 12 }).notNull().default("daily"),
    // 间隔数值：minute=分钟(≥5)、hour=小时(1-23)、custom=天(≥1)；daily/weekly/manual 为 null
    interval_days: integer("interval_days"),
    interval_value: integer("interval_value"),
    // 每天/每周/自定义 时执行时刻；每周时 weekday 1(周一)~7(周日)
    weekday: integer("weekday").notNull().default(1),
    run_time: varchar("run_time", { length: 10 }),
    // 交付：方式固定飞书；target_type=feishu / auto_create
    delivery_target_type: varchar("delivery_target_type", { length: 16 }).notNull().default("feishu"),
    delivery_feishu_token: varchar("delivery_feishu_token", { length: 512 }),
    delivery_feishu_url: text("delivery_feishu_url"),
    delivery_auto_create: boolean("delivery_auto_create").notNull().default(false),
    // 自动新建是否已在 M4 交付阶段创建（预留回链字段）
    delivery_sheet_created: boolean("delivery_sheet_created").notNull().default(false),
    // 一个 data_type 一个 sheet
    one_sheet_per_type: boolean("one_sheet_per_type").notNull().default(true),
    write_mode: varchar("write_mode", { length: 8 }).notNull().default("append"),
    enabled: boolean("enabled").notNull().default(true),
    created_by: varchar("created_by", { length: 64 }),
    creator_name: varchar("creator_name", { length: 64 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("buyin_tasks_created_by_idx").on(table.created_by),
    index("buyin_tasks_enabled_idx").on(table.enabled),
  ]
);

export type SopDocument = typeof sopDocuments.$inferSelect;
export type InsertSopDocument = typeof sopDocuments.$inferInsert;
export type SopCategory = typeof sopCategories.$inferSelect;
export type SopReadLog = typeof sopReadLogs.$inferSelect;

// 百应采集任务执行记录（M3）。trigger_type=auto/manual；status=running/success/partial/failed/skipped。
// cookie/签名串一律不入本表；error_summary 仅记录风控/缺数据/缺登录态等非敏感原因。
export const buyinRunLogs = pgTable(
  "buyin_run_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).notNull(),
    account_hint: varchar("account_hint", { length: 128 }),
    trigger_type: varchar("trigger_type", { length: 12 }).notNull(),
    // 本次实际溯源的统计日（ISO 日期），如 ["2026-09-25"]
    stat_dates: jsonb("stat_dates").notNull().default([]).$type<string[]>(),
    granularities: jsonb("granularities").notNull().default([]).$type<string[]>(),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    row_count: integer("row_count").notNull().default(0),
    request_count: integer("request_count").notNull().default(0),
    error_summary: text("error_summary"),
    detail: text("detail"),
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    creator_id: varchar("creator_id", { length: 64 }),
  },
  (table) => [
    index("buyin_run_logs_task_idx").on(table.task_id),
    index("buyin_run_logs_task_started_idx").on(table.task_id, table.started_at),
  ]
);

export type BuyinTask = typeof buyinTasks.$inferSelect;
export type BuyinRunLog = typeof buyinRunLogs.$inferSelect;
export type InsertBuyinRunLog = typeof buyinRunLogs.$inferInsert;

// 百应取数结果数据行（M4）。run 成功/部分成功拿到 parse 后 upsert 入库。
// 幂等唯一键 (account_key, stat_date, data_type, dim_key)：重跑同一统计日覆盖更新，不堆叠。
// cookie/签名串一律不入本表（row_json 仅含业务指标字段）。
export const buyinData = pgTable(
  "buyin_data",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    // 来源任务（可为空表示系统级采集）
    task_id: varchar("task_id", { length: 36 }),
    account_hint: varchar("account_hint", { length: 128 }),
    account_key: varchar("account_key", { length: 32 }).notNull(),
    // 统计日 YYYY-MM-DD
    stat_date: varchar("stat_date", { length: 10 }).notNull(),
    // day / hour / anchor / product
    data_type: varchar("data_type", { length: 16 }).notNull(),
    // day='day'；hour=统计时段；anchor=主播标识；product='product'（skill 单日单聚合行）
    dim_key: varchar("dim_key", { length: 255 }).notNull(),
    live_room_id: varchar("live_room_id", { length: 64 }),
    // 全量业务字段（英文字段名行）
    row_json: jsonb("row_json").notNull(),
    crawl_status: varchar("crawl_status", { length: 32 }),
    state_desc: varchar("state_desc", { length: 255 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("buyin_data_upsert_unique").on(table.account_key, table.stat_date, table.data_type, table.dim_key),
    index("buyin_data_stat_date_idx").on(table.stat_date),
    index("buyin_data_data_type_idx").on(table.data_type),
    index("buyin_data_task_id_idx").on(table.task_id),
  ]
);

export type BuyinData = typeof buyinData.$inferSelect;
export type InsertBuyinData = typeof buyinData.$inferInsert;
export type InsertBuyinTask = typeof buyinTasks.$inferInsert;
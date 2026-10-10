/**
 * 全平台深色主题统一色板（仅颜色，值全部来自文档指定调色板）。
 * 供图表系列、业务线徽章、涨跌/告警等场景复用，避免各页面散点硬编码。
 */

/** 图表系列：单主色 #4158D0 四档透明度（100/70/50/30）区分系列；仅承载状态语义的系列允许用语义色。 */
export const CHART_SERIES = ['#4158d0', '#4158d0b3', '#4158d080', '#4158d04d'];
export const CHART_SERIES_MORE = ['#4158d0', '#4158d0b3', '#4158d080', '#4158d04d', '#4158d02b', '#4158d01a'];

/** 业务线统一中性徽章底色（vivo/IQOO/IOT 不再用颜色区分） */
export const NEUTRAL_BADGE_BG = 'var(--badge-bg, #2a2e45)';
export const NEUTRAL_BADGE_FG = 'var(--badge-fg, rgb(255 255 255 / 92%))';

/** 涨/跌/告警（红涨 #F5483B / 跌绿 #34C759 / 告警 #FF9F0A） */
export const RISE = 'var(--rise, #f5483b)';
export const FALL = 'var(--fall, #34c759)';
export const ALERT = 'var(--alert, #ff9f0a)';

/** 主色三态 */
export const PRIMARY = '#4158d0';
export const PRIMARY_HOVER = '#6a7cda';
export const PRIMARY_PRESSED = '#2c42b2';
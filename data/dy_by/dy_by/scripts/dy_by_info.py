import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import datetime

import requests

from dy_by_common import (SEP, DATA_SOURCE, PLAT_TYPE, VALUE_TYPE,
                          by_id, by_now, by_join, by_kv, by_json,
                          by_hour, by_div, by_ratio_of,
                          TEST_KOL_ID, TEST_STAT_DATE, dy_by_debug_cookies)
from dy_by_live_list import dy_by_live_list_by_date, DATE_TYPE_30D
from dy_by_live_detail import dy_by_live_detail, dy_by_live_trend
from dy_by_product import (dy_by_live_product, dy_by_model_summary,
                           dy_by_product_summary, dy_by_model_config)

# ───────────────────── 巨量百应 · by_info 组装器 ─────────────────────
# 上游四个模块都只负责「单场次」或「单日场次列表」, 本模块把它们拼成落库行。
# 一次 dy_by_collect 把某日的原料全取回来(列表 + 每场复盘 + 每场分时 + 每场商品),
# 四种 data_type 的行都从同一份原料里出, 不重复请求。
#
# 关键坑 1: FIELD_MATRIX 同时是「字段顺序」「粒度矩阵」和「白名单」。
#           上游解析出来但设计表没定义的字段(comment_count / like_count /
#           live_peak / live_fans_club_add / product_count ...)会在这里被丢掉,
#           这是故意的 —— 落库字段以 抖音百应字段设计表.md 为准。
#           矩阵里标 0 的落 'no_column'(结构性没有), 标 1 但取不到的落 None(有列无值)。
# 关键坑 2: 日粒度的去重人数类字段(live_watch_uv / exposure_uv / deal_user_count)
#           在断播重开多场时只能各场相加, 跨场的同一个人会被重复计数。
#           vivo 官方旗舰店一天基本一场, 影响有限; 多场日的人数类字段属近似口径。
# 关键坑 3: 比率字段能重算的一律用汇总后的分子分母重算(设计表 3.5),
#           只有 live_interact_rate_uv 拿不到互动人数原始值, 多场时按观看人数加权平均。
# 关键坑 4: hour 粒度的数据源只有 trend_analysis_v2, 它没有退款/GPM/曝光/停留时长,
#           更没有商品维度 —— 所以 data_type=hour 的 phone_* / live_refund_amount /
#           live_settle_amount / gpm / exposure_* / avg_stay_duration 一律 None,
#           见 设计表 3.4。这是数据源限制, 不是采集失败, crawl_status 不因此置 2。
# 关键坑 5: anchor 粒度依赖飞书排班表, 爬虫侧拿不到。shifts 不传就不出 anchor 行,
#           传了就按 [start_time, end_time) 窗口把 hour 行汇总上去。
#           phone_* 需要订单级时间戳才能按主播切, 百应不给, 所以 anchor 行也是 None。
# 关键坑 6: 小时值逐时求和与日值有 3%~5% 偏差(UV 跨小时去重 + 成交 T+ 回调),
#           所以 day 行一律走场次级接口, 绝不由 hour 行反推(设计表 3.4)。

DATA_TYPES = ('day', 'hour', 'anchor', 'product')
TYPE_INDEX = {name: idx for idx, name in enumerate(DATA_TYPES)}

NO_COLUMN = 'no_column'

# 爬取状态: 1 全部成功 / 2 部分模块失败(沿用上期) / 3 该日无数据
STATUS_OK = '1'
STATUS_PART = '2'
STATUS_EMPTY = '3'

# 落库字段矩阵, 顺序与 抖音百应字段设计表.md「四、百应数据表 by_info」一致
# (字段名, 日, 时, 播, 品)
FIELD_MATRIX = (
    # 一、索引与账号
    ('_id', 1, 1, 1, 1),
    ('data_type', 1, 1, 1, 1),
    ('by_kol_id', 1, 1, 1, 1),
    ('by_account', 1, 1, 1, 1),
    ('kol_id', 1, 1, 1, 1),
    ('nickname', 1, 1, 1, 1),
    ('stat_date', 1, 1, 1, 1),
    ('stat_hour', 0, 1, 0, 0),
    ('anchor_name', 0, 1, 1, 0),
    ('stat_period', 1, 1, 1, 1),
    ('value_type', 1, 1, 1, 1),
    ('live_count', 1, 1, 1, 0),
    ('live_ids', 1, 1, 1, 0),
    ('live_start_time', 1, 0, 1, 0),
    ('live_end_time', 1, 0, 1, 0),
    ('live_duration', 1, 1, 1, 0),
    ('live_duration_hour', 1, 0, 1, 0),
    ('is_cross_day', 1, 0, 1, 0),
    ('is_fallback', 1, 1, 1, 1),
    # 二、核心结算与订单
    ('phone_sale_num', 1, 1, 1, 1),
    ('phone_refund_num', 1, 1, 1, 1),
    ('phone_settle_num', 1, 1, 1, 1),
    ('phone_settle_num_per_hour', 0, 0, 1, 0),
    ('phone_sale_order_count', 0, 1, 1, 0),
    ('phone_refund_order_count', 0, 1, 1, 0),
    ('phone_settle_order_count', 0, 1, 1, 0),
    # 三、GMV 与效率
    ('live_sale_amount', 1, 1, 1, 0),
    ('live_refund_amount', 1, 1, 1, 0),
    ('live_settle_amount', 1, 1, 1, 0),
    ('gpm', 1, 1, 1, 0),
    ('live_uv_value', 0, 0, 1, 0),
    ('customer_price', 1, 0, 0, 0),
    # 四、分渠道 GMV(仅每日)
    ('natural_sale_amount', 1, 0, 0, 0),
    ('feed_sale_amount', 1, 0, 0, 0),
    ('search_sale_amount', 1, 0, 0, 0),
    ('follow_sale_amount', 1, 0, 0, 0),
    ('short_video_sale_amount', 1, 0, 0, 0),
    ('qianchuan_sale_amount', 1, 0, 0, 0),
    ('brand_ad_sale_amount', 1, 0, 0, 0),
    ('live_traffic_sale_trend', 1, 0, 0, 0),
    # 五、分渠道观看次数(仅每日)
    ('live_watch_pv', 1, 0, 0, 0),
    ('natural_watch_pv', 1, 0, 0, 0),
    ('feed_watch_pv', 1, 0, 0, 0),
    ('search_watch_pv', 1, 0, 0, 0),
    ('follow_watch_pv', 1, 0, 0, 0),
    ('short_video_watch_pv', 1, 0, 0, 0),
    ('qianchuan_watch_pv', 1, 0, 0, 0),
    ('brand_ad_watch_pv', 1, 0, 0, 0),
    ('live_traffic_watch_trend', 1, 0, 0, 0),
    # 六、流量、互动与粉丝
    ('exposure_pv', 1, 0, 0, 0),
    ('exposure_uv', 0, 1, 1, 0),
    ('live_watch_uv', 1, 1, 1, 0),
    ('avg_online_count', 1, 0, 0, 0),
    ('avg_stay_duration', 1, 1, 1, 0),
    ('exposure_view_rate_pv', 1, 1, 1, 0),
    ('exposure_view_rate_uv', 1, 1, 1, 0),
    ('fans_add_rate', 1, 1, 1, 0),
    ('live_fans_add', 1, 1, 1, 0),
    ('live_fans_group_add', 1, 0, 0, 0),
    ('live_interact_rate_uv', 1, 0, 0, 0),
    ('deal_user_count', 1, 0, 0, 0),
    ('refund_user_count', 1, 0, 0, 0),
    # 七、转化漏斗(人数口径)
    ('watch_product_show_rate_uv', 1, 1, 1, 0),
    ('product_show_click_rate_uv', 1, 1, 1, 0),
    ('product_click_deal_rate_uv', 1, 1, 1, 0),
    ('watch_deal_rate_uv', 1, 1, 1, 0),
    # 八、商品与机型(仅商品粒度)
    ('model_sale_trend', 0, 0, 0, 1),
    ('series_sale_trend', 0, 0, 0, 1),
    ('model_sale_list', 0, 0, 0, 1),
    ('product_list', 0, 0, 0, 1),
    # 九、目标与元字段
    ('target_value', 1, 0, 1, 0),
    ('target_rate', 1, 0, 1, 0),
    ('plat_type', 1, 1, 1, 1),
    ('data_source', 1, 1, 1, 1),
    ('brand_name', 1, 1, 1, 1),
    ('project_id', 1, 1, 1, 1),
    ('project_name', 1, 1, 1, 1),
    ('create_time', 1, 1, 1, 1),
    ('update_time', 1, 1, 1, 1),
    ('crawl_status', 1, 1, 1, 1),
    ('state_desc', 1, 1, 1, 1),
)


# 落库字段 -> 设计表中文名, 只给 excel 表头用, 落库/json 一律走英文字段名。
# 与 FIELD_MATRIX 一一对应(81 个), 加字段时两边都要补, 漏了 excel 会回落英文名。
FIELD_CN = {
    '_id': '索引',
    'data_type': '数据粒度',
    'by_kol_id': '百应达人id',
    'by_account': '百应账号',
    'kol_id': '达人id',
    'nickname': '昵称',
    'stat_date': '统计日期',
    'stat_hour': '统计时段',
    'anchor_name': '主播',
    'stat_period': '统计周期',
    'value_type': '数值口径',
    'live_count': '直播场次',
    'live_ids': '关联场次id',
    'live_start_time': '开播时间',
    'live_end_time': '下播时间',
    'live_duration': '直播时长',
    'live_duration_hour': '直播时长(小时)',
    'is_cross_day': '是否含跨零点场次',
    'is_fallback': '是否沿用上期数据',
    'phone_sale_num': '手机销售台数',
    'phone_refund_num': '手机退款台数',
    'phone_settle_num': '手机结算台数',
    'phone_settle_num_per_hour': '时均手机结算订单',
    'phone_sale_order_count': '手机成交订单数',
    'phone_refund_order_count': '手机退款订单数',
    'phone_settle_order_count': '手机去退订单数',
    'live_sale_amount': '总GMV',
    'live_refund_amount': '退款GMV',
    'live_settle_amount': '去退GMV',
    'gpm': 'GPM',
    'live_uv_value': 'UV价值',
    'customer_price': '客单价',
    'natural_sale_amount': '自然总GMV',
    'feed_sale_amount': 'feedGMV',
    'search_sale_amount': '搜索GMV',
    'follow_sale_amount': '关注GMV',
    'short_video_sale_amount': '短视频GMV',
    'qianchuan_sale_amount': '千川GMV',
    'brand_ad_sale_amount': '品牌广告GMV',
    'live_traffic_sale_trend': '分渠道GMV明细',
    'live_watch_pv': '总观看次数',
    'natural_watch_pv': '自然流量总观看次数',
    'feed_watch_pv': 'feed观看次数',
    'search_watch_pv': '搜索观看次数',
    'follow_watch_pv': '关注观看次数',
    'short_video_watch_pv': '短视频观看次数',
    'qianchuan_watch_pv': '千川观看次数',
    'brand_ad_watch_pv': '品牌广告观看次数',
    'live_traffic_watch_trend': '分渠道观看次数明细',
    'exposure_pv': '曝光次数',
    'exposure_uv': '曝光人数',
    'live_watch_uv': '累计观看人数',
    'avg_online_count': '平均在线人数',
    'avg_stay_duration': '平均停留时长',
    'exposure_view_rate_pv': '曝光-观看率(次数)',
    'exposure_view_rate_uv': '曝光-观看率(人数)',
    'fans_add_rate': '新增关注率',
    'live_fans_add': '新增粉丝数',
    'live_fans_group_add': '新加粉丝团人数',
    'live_interact_rate_uv': '观看-互动率(人数)',
    'deal_user_count': '成交人数',
    'refund_user_count': '退款人数',
    'watch_product_show_rate_uv': '观看-商品曝光率(人数)',
    'product_show_click_rate_uv': '商品曝光-点击率(人数)',
    'product_click_deal_rate_uv': '商品点击-成交转化率(人数)',
    'watch_deal_rate_uv': '观看-成交转化率(人数)',
    'model_sale_trend': '各机型销量',
    'series_sale_trend': '各系列销量',
    'model_sale_list': '机型销量明细',
    'product_list': '商品明细',
    'target_value': '目标值',
    'target_rate': '目标达成率',
    'plat_type': '平台',
    'data_source': '数据来源',
    'brand_name': '所属品牌',
    'project_id': '项目id',
    'project_name': '项目名称',
    'create_time': '创建时间',
    'update_time': '更新时间',
    'crawl_status': '爬取状态',
    'state_desc': '状态描述',
}

# 日粒度多场汇总: 直接相加的整数字段(人数类跨场无法去重, 见 关键坑 2)
DAY_SUM_INT = ('exposure_pv', 'exposure_uv', 'live_watch_pv', 'live_watch_uv',
               'live_fans_add', 'live_fans_group_add',
               'deal_user_count', 'refund_user_count',
               'deal_order_count', 'refund_order_count',
               'product_show_uv', 'product_click_uv',
               'natural_watch_pv', 'feed_watch_pv', 'search_watch_pv',
               'follow_watch_pv', 'short_video_watch_pv',
               'qianchuan_watch_pv', 'brand_ad_watch_pv')

# 日粒度多场汇总: 直接相加的金额字段
DAY_SUM_MONEY = ('live_sale_amount', 'live_refund_amount',
                 'natural_sale_amount', 'feed_sale_amount', 'search_sale_amount',
                 'follow_sale_amount', 'short_video_sale_amount',
                 'qianchuan_sale_amount', 'brand_ad_sale_amount')

# 小时粒度可落库的字段(trend_analysis_v2 给得出来的那几个), 其余 hour 字段一律 None
HOUR_SUM_INT = ('live_watch_uv', 'live_fans_add',
                'deal_user_count', 'deal_order_count',
                'product_show_uv', 'product_click_uv')
HOUR_SUM_MONEY = ('live_sale_amount',)


# ───────────────────── 通用小工具 ─────────────────────


def _sum(values):
    """相加, 全为空时返回 None(不落 0, 区分「没有」和「是 0」)"""
    vals = [v for v in values if v is not None]
    return sum(vals) if vals else None


def _sum_money(values):
    total = _sum(values)
    return round(total, 2) if total is not None else None


def _weighted(pairs):
    """按权重求平均(avg_online_count 按时长, avg_stay_duration 按观看人数), 单场时即原值"""
    valid = [(v, w) for v, w in pairs if v is not None and w]
    if not valid:
        return None
    total_weight = sum(w for _, w in valid)
    if not total_weight:
        return None
    return int(round(sum(v * w for v, w in valid) / total_weight))


def _weighted_rate(pairs):
    """比率的加权平均, 只给 live_interact_rate_uv 用(拿不到互动人数原始值, 没法重算)"""
    valid = []
    for value, weight in pairs:
        if value is None or not weight:
            continue
        try:
            valid.append((float(str(value).rstrip('%')), weight))
        except ValueError:
            continue
    if not valid:
        return None
    total_weight = sum(w for _, w in valid)
    return f'{round(sum(v * w for v, w in valid) / total_weight, 2):.2f}%'


def _merge_trend(trend_strings):
    """'推荐feed:123%@搜索:45' 多场合并, 同渠道相加。渠道顺序按首次出现"""
    order, bucket = [], {}
    for text in trend_strings:
        for part in str(text or '').split(SEP):
            if ':' not in part:
                continue
            name, _, value = part.rpartition(':')
            if not name:
                continue
            try:
                num = float(value)
            except ValueError:
                continue
            if name not in bucket:
                order.append(name)
                bucket[name] = 0.0
            bucket[name] += num
    if not order:
        return None
    return by_kv([(n, int(bucket[n]) if bucket[n].is_integer() else round(bucket[n], 2))
                  for n in order])


def _dt(text):
    try:
        return datetime.datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
    except (TypeError, ValueError):
        return None


def _overlap(start_a, end_a, start_b, end_b):
    """两个时间窗的重叠秒数, 用来算某自然小时内的实际直播时长"""
    if None in (start_a, end_a, start_b, end_b):
        return 0
    delta = (min(end_a, end_b) - max(start_a, start_b)).total_seconds()
    return int(delta) if delta > 0 else 0


# ───────────────────── 采集: 一次把某日的原料取全 ─────────────────────


def dy_by_collect(session, by_cp, stat_date, date_type=DATE_TYPE_30D,
                  with_detail=True, with_trend=True, with_product=True,
                  with_product_detail=False):
    """
    某个自然日的全部原料。四种 data_type 的行都从这份原料里出, 不重复请求。
    返回 {'day': 列表侧日汇总, 'lives': [场次], 'details': {live_id: {...}},
          'trends': {live_id: {小时: {...}}}, 'products': {live_id: {...}}, 'fails': [...]}
    """
    bundle = {'stat_date': stat_date, 'lives': [], 'details': {},
              'trends': {}, 'products': {}, 'fails': []}

    day = dy_by_live_list_by_date(session, by_cp, stat_date, date_type=date_type)
    if day.get('state_desc') not in (None, 'ok'):
        bundle['fails'].append(day['state_desc'])
    bundle['day'] = {k: v for k, v in day.items() if k != 'items'}
    bundle['lives'] = day.get('items') or []

    for live in bundle['lives']:
        live_id = live.get('live_id')
        if not live_id:
            continue
        if with_detail:
            detail = dy_by_live_detail(session, by_cp, live_id)
            if detail.get('state_desc') != 'ok':
                bundle['fails'].append(f"{live_id} {detail['state_desc']}")
            bundle['details'][live_id] = detail
        if with_trend:
            bundle['trends'][live_id] = dy_by_live_trend(session, by_cp, live_id)
        if with_product:
            product = dy_by_live_product(session, by_cp, live_id,
                                         with_detail=with_product_detail)
            if product.get('state_desc') != 'ok':
                bundle['fails'].append(f"{live_id} {product['state_desc']}")
            bundle['products'][live_id] = product
    return bundle


# ───────────────────── 行组装 ─────────────────────


def by_meta(by_cp, data_type, stat_date, state_desc, key_extra=None):
    """索引与元字段, 四种粒度共用"""
    by_kol_id = by_cp.get('by_kol_id') or by_cp.get('kol_id')
    now = by_now()
    return {
        '_id': by_id(by_kol_id, data_type, stat_date, key_extra),
        'data_type': data_type,
        'by_kol_id': by_kol_id,
        'by_account': by_cp.get('by_account'),
        'kol_id': by_cp.get('kol_id'),
        'nickname': by_cp.get('nickname'),
        'stat_date': stat_date,
        'stat_period': 'h' if data_type == 'hour' else 'd',
        'value_type': VALUE_TYPE,
        'is_fallback': '0',
        'plat_type': PLAT_TYPE,
        'data_source': DATA_SOURCE,
        'brand_name': by_cp.get('brand_name'),
        'project_id': by_cp.get('project_id'),
        'project_name': by_cp.get('project_name'),
        'create_time': now,
        'update_time': now,
        'crawl_status': STATUS_OK if state_desc == 'ok' else STATUS_PART,
        'state_desc': state_desc,
    }


def by_fill(send_data, data_type):
    """按 FIELD_MATRIX 裁剪成落库行: 矩阵 0 落 'no_column', 矩阵 1 取不到落 None"""
    idx = TYPE_INDEX[data_type] + 1
    return {field[0]: (send_data.get(field[0]) if field[idx] else NO_COLUMN)
            for field in FIELD_MATRIX}


def dy_by_day_row(by_cp, bundle):
    """
    day 行: 当日全部场次汇总成一条(设计表 3.3 断播重开合并)。
    累加类相加、比率类用汇总后的分子分母重算、均值类加权, 不从 hour 行反推。
    """
    stat_date = bundle['stat_date']
    day = bundle.get('day') or {}
    details = [bundle['details'].get(l.get('live_id')) or {} for l in bundle['lives']]
    details = [d for d in details if d]
    products = [bundle['products'].get(l.get('live_id')) or {} for l in bundle['lives']]

    send_data = by_meta(by_cp, 'day', stat_date, _state_desc(bundle))
    if not bundle['lives']:
        send_data['crawl_status'] = STATUS_EMPTY
        send_data['state_desc'] = f'{stat_date} 无直播场次'
        return by_fill(send_data, 'day')

    duration = day.get('live_duration')
    send_data.update({
        'live_count': day.get('live_count'),
        'live_ids': day.get('live_ids'),
        'live_start_time': day.get('live_start_time'),
        'live_end_time': day.get('live_end_time'),
        'live_duration': duration,
        'live_duration_hour': by_hour(duration),
        'is_cross_day': day.get('is_cross_day'),
    })

    for field in DAY_SUM_INT:
        send_data[field] = _sum(d.get(field) for d in details)
    for field in DAY_SUM_MONEY:
        send_data[field] = _sum_money(d.get(field) for d in details)

    # 均值类: 在线人数按直播时长加权, 停留时长按观看人数加权
    send_data['avg_online_count'] = _weighted(
        [(d.get('avg_online_count'), d.get('live_duration')) for d in details])
    send_data['avg_stay_duration'] = _weighted(
        [(d.get('avg_stay_duration'), d.get('live_watch_uv')) for d in details])
    # 互动率拿不到互动人数原始值, 只能按观看人数加权(单场时等于原值)
    send_data['live_interact_rate_uv'] = _weighted_rate(
        [(d.get('live_interact_rate_uv'), d.get('live_watch_uv')) for d in details])
    # GPM 单场直接用 trade_info 的原生值, 多场口径不可加, 交给 _fill_formula 重算
    if len(details) == 1:
        send_data['gpm'] = details[0].get('gpm')

    send_data['live_traffic_sale_trend'] = _merge_trend(
        d.get('live_traffic_sale_trend') for d in details)
    send_data['live_traffic_watch_trend'] = _merge_trend(
        d.get('live_traffic_watch_trend') for d in details)

    # 手机口径: 各场商品明细按 product_id 合并后重算, 不是各场汇总值相加
    send_data.update(_merge_product(products)['summary'])

    _fill_formula(send_data)
    return by_fill(send_data, 'day')


def dy_by_hour_rows(by_cp, bundle):
    """
    hour 行: trend_analysis_v2 的时段增量直接落, 不做差(设计表 3.4)。
    同一小时被多场覆盖时相加; live_duration 按场次窗口与自然小时的重叠秒数算, ≤3600。
    """
    stat_date = bundle['stat_date']
    state_desc = _state_desc(bundle)
    windows = {l.get('live_id'): (_dt(l.get('live_start_time')), _dt(l.get('live_end_time')))
               for l in bundle['lives']}

    hours = {}
    for live_id, trend in (bundle.get('trends') or {}).items():
        for hour_key, values in (trend or {}).items():
            hours.setdefault(hour_key, []).append((live_id, values))

    rows = []
    for hour_key in sorted(hours):
        parts = hours[hour_key]
        hour_start = _dt(hour_key + ':00:00')
        hour_end = hour_start + datetime.timedelta(hours=1) if hour_start else None

        send_data = by_meta(by_cp, 'hour', stat_date, state_desc,
                            key_extra=hour_key[11:13])
        send_data['stat_hour'] = int(hour_key[11:13])
        # 归属日按开播日算, 跨零点小时的 stat_date 仍是开播日(设计表 3.2)
        send_data['live_ids'] = by_join([live_id for live_id, _ in parts])
        send_data['live_count'] = len(parts)
        send_data['live_duration'] = min(3600, sum(
            _overlap(*windows.get(live_id, (None, None)), hour_start, hour_end)
            for live_id, _ in parts)) or None

        for field in HOUR_SUM_INT:
            send_data[field] = _sum(v.get(field) for _, v in parts)
        for field in HOUR_SUM_MONEY:
            send_data[field] = _sum_money(v.get(field) for _, v in parts)

        _fill_formula(send_data)
        rows.append(by_fill(send_data, 'hour'))
    return rows


def dy_by_anchor_rows(by_cp, bundle, shifts):
    """
    anchor 行: 按飞书排班表窗口把 hour 行汇总上去。
    shifts = [{'anchor_name': '张三', 'start_time': '2026-09-21 08:00:00',
               'end_time': '2026-09-21 12:00:00'}, ...]
    窗口按「实际开播/下播时间」与排班窗口取交集(设计表 3.4), 不按排班预设时间硬切。
    phone_* 要订单级时间戳才能按主播切, 百应不给, 所以这里恒为 None。
    """
    if not shifts:
        return []
    stat_date = bundle['stat_date']
    state_desc = _state_desc(bundle)
    windows = {l.get('live_id'): (_dt(l.get('live_start_time')), _dt(l.get('live_end_time')))
               for l in bundle['lives']}

    rows = []
    for shift in shifts:
        anchor_name = shift.get('anchor_name')
        shift_start, shift_end = _dt(shift.get('start_time')), _dt(shift.get('end_time'))
        if not anchor_name or None in (shift_start, shift_end):
            continue

        send_data = by_meta(by_cp, 'anchor', stat_date, state_desc, key_extra=anchor_name)
        send_data['anchor_name'] = anchor_name

        hit_ids, duration, buckets = [], 0, []
        for live_id, (live_start, live_end) in windows.items():
            seconds = _overlap(live_start, live_end, shift_start, shift_end)
            if not seconds:
                continue
            hit_ids.append(live_id)
            duration += seconds

        for live_id in hit_ids:
            for hour_key, values in (bundle['trends'].get(live_id) or {}).items():
                hour_start = _dt(hour_key + ':00:00')
                if hour_start and shift_start <= hour_start < shift_end:
                    buckets.append(values)

        # 开播/下播时间取「场次窗口 ∩ 排班窗口」的首尾, 不落排班的预设时间
        starts = [windows[lid][0] for lid in hit_ids if windows[lid][0]]
        ends = [windows[lid][1] for lid in hit_ids if windows[lid][1]]
        send_data['live_ids'] = by_join(hit_ids)
        send_data['live_count'] = len(hit_ids)
        send_data['live_start_time'] = (
            max(min(starts), shift_start).strftime('%Y-%m-%d %H:%M:%S') if starts else None)
        send_data['live_end_time'] = (
            min(max(ends), shift_end).strftime('%Y-%m-%d %H:%M:%S') if ends else None)
        send_data['live_duration'] = duration or None
        send_data['live_duration_hour'] = by_hour(duration)
        send_data['is_cross_day'] = (
            '1' if send_data['live_start_time'] and send_data['live_end_time']
            and send_data['live_start_time'][:10] != send_data['live_end_time'][:10] else '0')

        for field in HOUR_SUM_INT:
            send_data[field] = _sum(v.get(field) for v in buckets)
        for field in HOUR_SUM_MONEY:
            send_data[field] = _sum_money(v.get(field) for v in buckets)

        _fill_formula(send_data)
        rows.append(by_fill(send_data, 'anchor'))
    return rows


def dy_by_product_row(by_cp, bundle):
    """product 行: 当日各场商品明细按 product_id 合并后重新做机型归类汇总"""
    stat_date = bundle['stat_date']
    products = [bundle['products'].get(l.get('live_id')) or {} for l in bundle['lives']]

    send_data = by_meta(by_cp, 'product', stat_date, _state_desc(bundle))
    if not bundle['lives']:
        send_data['crawl_status'] = STATUS_EMPTY
        send_data['state_desc'] = f'{stat_date} 无直播场次'
        return by_fill(send_data, 'product')

    merged = _merge_product(products)
    send_data.update(merged['summary'])
    send_data.update(merged['models'])
    send_data['product_list'] = merged['product_list']
    return by_fill(send_data, 'product')


# ───────────────────── 内部: 商品合并与公式 ─────────────────────


def _merge_product(products):
    """
    多场商品明细按 product_id 合并(同一商品挂多场时销量要累加, 不能各场汇总值相加,
    否则 model_sale_list 的机型桶会重复建)。合并后重跑 dy_by_product 的两个汇总函数。
    """
    order, bucket = [], {}
    for product in products or []:
        for item in product.get('items') or []:
            key = item.get('product_id')
            if key is None:
                continue
            if key not in bucket:
                order.append(key)
                bucket[key] = dict(item)
                continue
            target = bucket[key]
            for field in ('sale_num', 'refund_num', 'sale_amount',
                          'deal_order_count', 'refund_order_count',
                          'explain_count', 'product_click_uv'):
                left, right = target.get(field), item.get(field)
                if left is None and right is None:
                    continue
                target[field] = (left or 0) + (right or 0)

    items = []
    for key in order:
        item = bucket[key]
        if item.get('sale_num') is not None:
            item['settle_num'] = item['sale_num'] - (item.get('refund_num') or 0)
        if isinstance(item.get('sale_amount'), float):
            item['sale_amount'] = round(item['sale_amount'], 2)
        items.append(item)

    return {
        'summary': dy_by_product_summary(items),
        'models': dy_by_model_summary(items, dy_by_model_config()),
        'product_list': by_json([
            {k: item.get(k) for k in ('product_id', 'product_url', 'product_title',
                                      'product_cover', 'product_price', 'sale_num',
                                      'refund_num', 'settle_num', 'sale_amount',
                                      'model_name')}
            for item in items]),
    }


def _fill_formula(send_data):
    """设计表 3.5 的派生字段, 分母为 0 或为空时留 None 不落 0"""
    sale = send_data.get('live_sale_amount')
    refund = send_data.get('live_refund_amount')
    watch_uv = send_data.get('live_watch_uv')
    watch_pv = send_data.get('live_watch_pv')
    show_uv = send_data.get('product_show_uv')
    click_uv = send_data.get('product_click_uv')
    deal_uv = send_data.get('deal_user_count')

    send_data['live_settle_amount'] = (round(sale - refund, 2)
                                       if None not in (sale, refund) else None)
    send_data['customer_price'] = by_div(sale, deal_uv)
    send_data['live_uv_value'] = by_div(sale, watch_uv)
    # GPM 千次观看成交金额, 场次级接口的原生值只对单场成立, 多场/时段一律重算
    if send_data.get('gpm') is None and sale is not None and watch_pv:
        send_data['gpm'] = by_div(sale * 1000, watch_pv)

    send_data['exposure_view_rate_pv'] = by_ratio_of(watch_pv, send_data.get('exposure_pv'))
    send_data['exposure_view_rate_uv'] = by_ratio_of(watch_uv, send_data.get('exposure_uv'))
    send_data['fans_add_rate'] = by_ratio_of(send_data.get('live_fans_add'), watch_uv)
    send_data['watch_product_show_rate_uv'] = by_ratio_of(show_uv, watch_uv)
    send_data['product_show_click_rate_uv'] = by_ratio_of(click_uv, show_uv)
    send_data['product_click_deal_rate_uv'] = by_ratio_of(deal_uv, click_uv)
    send_data['watch_deal_rate_uv'] = by_ratio_of(deal_uv, watch_uv)

    sale_num = send_data.get('phone_sale_num')
    refund_num = send_data.get('phone_refund_num')
    if None not in (sale_num, refund_num):
        send_data['phone_settle_num'] = sale_num - refund_num
    send_data['phone_settle_num_per_hour'] = by_div(send_data.get('phone_settle_num'),
                                                    send_data.get('live_duration_hour'))
    return send_data


def _state_desc(bundle):
    return '；'.join(bundle['fails']) if bundle['fails'] else 'ok'


# ───────────────────── 入口 ─────────────────────


def dy_by_info(session, by_cp, stat_date, data_types=DATA_TYPES, shifts=None,
               date_type=DATE_TYPE_30D, with_product_detail=False):
    """
    某个自然日的 by_info 落库行。data_types 决定出哪几种粒度, 原料只采一次。
    shifts 是飞书排班表窗口, 不传就不出 anchor 行。
    """
    data_types = tuple(data_types)
    bundle = dy_by_collect(session, by_cp, stat_date, date_type=date_type,
                           with_detail='day' in data_types,
                           with_trend=bool({'hour', 'anchor'} & set(data_types)),
                           with_product=bool({'day', 'product'} & set(data_types)),
                           with_product_detail=with_product_detail)

    rows = []
    if 'day' in data_types:
        rows.append(dy_by_day_row(by_cp, bundle))
    if 'hour' in data_types:
        rows.extend(dy_by_hour_rows(by_cp, bundle))
    if 'anchor' in data_types:
        rows.extend(dy_by_anchor_rows(by_cp, bundle, shifts))
    if 'product' in data_types:
        rows.append(dy_by_product_row(by_cp, bundle))
    return rows


if __name__ == '__main__':
    session = requests.Session()
    by_cp = {
        'cookies': dy_by_debug_cookies(),
        'proxies': {},
        'by_kol_id': TEST_KOL_ID,
        'by_account': 'vivo官方旗舰店',
        'kol_id': TEST_KOL_ID,
        'nickname': 'vivo官方旗舰店',
        'brand_name': 'vivo',
        'project_id': 1,
        'project_name': 'vivo抖音直播间监控',
    }

    rows = dy_by_info(session, by_cp, TEST_STAT_DATE, data_types=('day', 'hour', 'product'))
    for row in rows:
        print(f"\n=== {row['data_type']} {row['_id']}")
        for key, value in row.items():
            if value != NO_COLUMN:
                print(f'  {key}: {value}')

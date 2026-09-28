import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import requests

from dy_by_common import (dy_by_get, dy_by_data, dy_by_ok, dy_by_error, BASE_COMPASS,
                          by_value, by_index, by_hour, by_time,
                          by_ratio_of, by_kv,
                          TEST_LIVE_ROOM_ID, dy_by_debug_cookies)

# ───────────────────── 巨量百应 · 直播复盘(单场次) ─────────────────────
# 页面: https://compass.jinritemai.com/talent/live-statement?live_room_id=xxx
# live_room_id 来自 dy_by_live_list 的 operation.live_id。
#
# 关键坑 1: 同一个页面里 host 只有 compass 一个, 但路径前缀有两套, 且入参名不统一:
#           /compass_api/author/live/live_room_detail/*        入参 live_room_id
#           /compass_api/content_live/author/live_room_detail/* 入参 room_id
#           传错名字直接 621000601 参数校验失败, 传错前缀直接 404 纯文本(json 解析会炸)。
# 关键坑 2: core_group_info 的指标散在 5 个 *_index_list 里, 但 refund_index_list 经常是空的,
#           退款订单数/退款人数实际躺在 index_group[].index_group[] 这层嵌套里, 两边都要拍平。
# 关键坑 3: index_name 有历史脏数据带尾空格('product_show_click_ucnt_ratio '), by_index 已 strip。
# 关键坑 4: 场次 GMV 不在 core_group_info 也不在 trade_info, 只有 channel_flow 的「整体」行给,
#           所以 live_sale_amount / live_watch_pv / deal_order_count 一律从 channel_flow 取。
# 关键坑 5: channel_flow 的每个渠道行 watch_ucnt 都是 unit=6(nan), 只有「整体」行有人数;
#           所以分渠道只能落观看人次, 分渠道观看人数拿不到(设计表也只要 *_watch_pv)。
# 关键坑 6: 页面实际渠道是 13 个, 里面没有「千川」「品牌广告」两个渠道,
#           整体行的 stat_cost 是千川消耗(不是千川 GMV)。qianchuan_sale_amount /
#           brand_ad_sale_amount 在本接口拿不到, 只能留 None, 原始串看 live_traffic_sale_trend。
# 关键坑 7: 本模块所有数值都是原始值, price 单位是分(588940013 -> 5889400.13), 走 by_value 还原。

BASIC_INFO_PATH = '/compass_api/author/live/live_room_detail/basic_info'
CORE_GROUP_PATH = '/compass_api/author/live/live_room_detail/core_group_info'
TRADE_INFO_PATH = '/compass_api/author/live/live_room_detail/trade_info'
REPLAY_INFO_PATH = '/compass_api/author/live/live_room_detail/replay_info'
FLOW_ANALYSIS_PATH = '/compass_api/author/live/live_room_detail/flow/flow_analysis'
TREND_PATH = '/compass_api/author/live/live_room_detail/flow/trend_analysis_v2'
CHANNEL_FLOW_PATH = '/compass_api/content_live/author/live_room_detail/channel_flow'
USER_PORTRAIT_PATH = '/compass_api/content_live/author/live_room_detail/user_portrait'

DETAIL_REFERER = BASE_COMPASS + '/talent/live-statement'

# core_group_info 里的指标数组, index_group 是带分组名的另一套(退款指标只在这套里)
CORE_INDEX_LISTS = ('flow_index_list', 'interaty_index_list', 'portrait_index_list',
                    'product_index_list', 'refund_index_list')

# trend_analysis_v2 支持小时粒度的指标(catalog 里 no_hour_index != True 的那批),
# 带 no_hour_index=True 的(viewing_rate/gpm/互动率/人均观看时长...)只有分钟粒度, 传了也没数据。
TREND_HOUR_INDEXES = [
    'watch_ucnt',           # 进入直播间人数
    'incr_fans_cnt',        # 新增粉丝数
    'fans_club_ucnt',       # 新加直播团人数
    'comment_cnt',          # 评论次数
    'like_cnt',             # 点赞次数
    'product_show_ucnt',    # 商品曝光人数
    'product_click_ucnt',   # 商品点击人数
    'pay_cnt',              # 成交订单数
    'pay_ucnt',             # 成交人数
    'pay_amt',              # 成交金额
]

# trend 指标 -> 设计表字段名
TREND_FIELD_MAP = {
    'pay_amt': 'live_sale_amount',
    'pay_cnt': 'deal_order_count',
    'pay_ucnt': 'deal_user_count',
    'watch_ucnt': 'live_watch_uv',
    'incr_fans_cnt': 'live_fans_add',
    'fans_club_ucnt': 'live_fans_club_add',
    'comment_cnt': 'comment_count',
    'like_cnt': 'like_count',
    'product_show_ucnt': 'product_show_uv',
    'product_click_ucnt': 'product_click_uv',
}

# 渠道文案 -> 设计表里的字段前缀。页面文案变动时只改这里
CHANNEL_MAP = {
    '推荐feed': 'feed',
    '搜索': 'search',
    '关注': 'follow',
    '短视频引流': 'short_video',
    '千川': 'qianchuan',
    '品牌广告': 'brand_ad',
}
CHANNEL_ALL = '整体'
# 付费渠道: 自然总GMV = 整体 - 付费渠道之和(全域投放后页面已不给「自然流量」合计行)
CHANNEL_PAID = ('qianchuan', 'brand_ad')


def dy_by_basic_info(session, by_cp, live_room_id):
    """场次基础信息: 开播/下播时间、直播时长、标题、封面、是否在播"""
    return dy_by_get(session, by_cp, BASE_COMPASS, BASIC_INFO_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_core_group_info(session, by_cp, live_room_id):
    """核心数据: 曝光/观看/互动/粉丝/商品/售后 全部指标"""
    return dy_by_get(session, by_cp, BASE_COMPASS, CORE_GROUP_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_trade_info(session, by_cp, live_room_id):
    """交易信息: GPM、退款金额、预估佣金、T+7 结算有效成交"""
    return dy_by_get(session, by_cp, BASE_COMPASS, TRADE_INFO_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_channel_flow(session, by_cp, live_room_id):
    """全场流量结构: 一个渠道一行, 同时给观看人次和成交金额。注意入参名是 room_id"""
    return dy_by_get(session, by_cp, BASE_COMPASS, CHANNEL_FLOW_PATH,
                     params={'room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_flow_analysis(session, by_cp, live_room_id):
    """
    观看-成交漏斗。指标与 core_group_info 高度重合, 但 index_name 是中文文案不是英文 code,
    所以落库一律走 core_group_info, 这个只在核对口径时用。
    """
    return dy_by_get(session, by_cp, BASE_COMPASS, FLOW_ANALYSIS_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_trend_analysis(session, by_cp, live_room_id, trend_gap='hour', indexes=None):
    """
    趋势数据, data_type=hour 的唯一来源。trend_gap: hour / minute。
    index_selected 不传只返回指标目录(index_groups), 不返回 trend_map。
    """
    params = {
        'live_room_id': live_room_id,
        'trend_gap': trend_gap,
        'index_selected': ','.join(indexes if indexes is not None else TREND_HOUR_INDEXES),
    }
    return dy_by_get(session, by_cp, BASE_COMPASS, TREND_PATH,
                     params=params, referer=DETAIL_REFERER)


def dy_by_replay_info(session, by_cp, live_room_id):
    """讲解回放数据(不落库, 需求明确不采录屏), 留着排查讲解商品时间轴用"""
    return dy_by_get(session, by_cp, BASE_COMPASS, REPLAY_INFO_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_user_portrait(session, by_cp, live_room_id):
    """观众画像(不落库, 设计表「飞瓜有、百应刻意不做」里已排除), 仅调试用"""
    return dy_by_get(session, by_cp, BASE_COMPASS, USER_PORTRAIT_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


# ───────────────────── 解析 ─────────────────────


def _raw_index(response_data):
    """
    把 core_group_info 的全部指标拍平成 {index_name: 原始 value}(不标准化)。
    自算比率时要拿原始 0~1 小数, 标准化后的 '6.42%' 字符串没法反推。
    """
    data = dy_by_data(response_data)
    raw = {}

    def _put(item):
        if not isinstance(item, dict):
            return
        name = (item.get('index_name') or '').strip()
        value = item.get('value') or {}
        if name and value.get('unit') not in (None, 'nan'):
            raw[name] = value.get('value')

    for key in CORE_INDEX_LISTS:
        for item in data.get(key) or []:
            _put(item)
    # 退款指标只在这层嵌套里, 上面 5 个数组里没有
    for group in data.get('index_group') or []:
        for item in (group or {}).get('index_group') or []:
            _put(item)
    return raw


def _std_index(response_data):
    """同 _raw_index 但走 by_value 标准化, 作为落库值"""
    data = dy_by_data(response_data)
    std = {}
    for key in CORE_INDEX_LISTS:
        std.update(by_index(data.get(key)))
    for group in data.get('index_group') or []:
        std.update(by_index((group or {}).get('index_group')))
    return std


def dy_by_basic_info_parse(response_data):
    """basic_info -> 场次基础字段。live_duration 是接口给的真实秒数, 不用首尾相减"""
    base = dy_by_data(response_data).get('live_room_base_info') or {}
    duration = by_value(base.get('live_duration'))
    return {
        'title': base.get('title'),
        'cover': base.get('cover_img_url'),
        'live_app_id': base.get('app_id'),
        'is_living': '1' if base.get('is_living') else '0',
        'live_start_time': by_time(by_value(base.get('start_time'))),
        'live_end_time': by_time(by_value(base.get('end_time'))),
        'live_duration': duration,
        'live_duration_hour': by_hour(duration),
    }


def dy_by_core_group_parse(response_data):
    """
    core_group_info -> 流量/互动/粉丝/商品/售后 字段(设计表命名)。
    product_show_uv 接口不直接给, 用 商品点击人数 ÷ 商品曝光-点击率 反推,
    所以 watch_product_show_rate_uv 也是自算的(需求 3.5)。
    """
    std = _std_index(response_data)
    raw = _raw_index(response_data)

    watch_uv = std.get('watch_ucnt')
    show_uv = None
    click_rate = raw.get('product_show_click_ucnt_ratio')
    if raw.get('product_click_ucnt') and click_rate:
        show_uv = int(round(raw['product_click_ucnt'] / click_rate))

    return {
        'exposure_pv': std.get('live_show_cnt'),
        'exposure_uv': std.get('live_show_ucnt'),
        'live_watch_uv': watch_uv,
        'live_peak': std.get('pcu'),
        'avg_online_count': std.get('acu'),
        'avg_stay_duration': std.get('avg_watch_duration'),
        'exposure_view_rate_uv': by_ratio_of(watch_uv, std.get('live_show_ucnt')),

        'live_fans_add': std.get('follow_anchor_ucnt'),
        'fans_add_rate': std.get('watch_follow_ucnt_ratio'),
        # fans_club_join_ucnt 是「新加直播团」, ecom_live_ecf_joinclub_ucnt_td 才是需求的「新加购物团」
        'live_fans_club_add': std.get('fans_club_join_ucnt'),
        'live_fans_group_add': std.get('ecom_live_ecf_joinclub_ucnt_td'),
        'live_interact_rate_uv': std.get('watch_interact_ucnt_ratio'),
        'comment_count': std.get('comment_cnt'),
        'like_count': std.get('like_cnt'),

        'deal_user_count': std.get('pay_ucnt'),
        'customer_price': std.get('avg_pay_user_amt'),
        'refund_user_count': std.get('refund_ucnt'),
        'refund_order_count': std.get('refund_cnt'),
        'old_fans_deal_user_rate': std.get('old_fans_pay_ucnt_ratio'),
        'old_fans_deal_amount_rate': std.get('old_fans_pay_amt_ratio'),

        'product_show_uv': show_uv,
        'product_click_uv': std.get('product_click_ucnt'),
        'watch_product_show_rate_uv': by_ratio_of(show_uv, watch_uv),
        'product_show_click_rate_uv': std.get('product_show_click_ucnt_ratio'),
        'product_click_deal_rate_uv': std.get('product_click_pay_ucnt_ratio'),
        'watch_deal_rate_uv': std.get('watch_pay_ucnt_ratio'),
    }


def dy_by_trade_info_parse(response_data):
    """trade_info -> GPM / 退款GMV / 佣金。结算有效成交是 T+7 口径, 当日跑一定是 nan"""
    trade = by_index(dy_by_data(response_data).get('trade_list'))
    return {
        'gpm': trade.get('gpm'),
        'live_refund_amount': trade.get('real_refund_amt'),
        'estimate_commission': trade.get('estimate_commission'),
        'settle_valid_amount': trade.get('t7payin8d_predstl_ord_amt'),
        'settle_valid_order_count': trade.get('t7payin8d_predstl_ord_cnt'),
    }


def _cf_cell(cell_info, key):
    """
    channel_flow 的值埋了两层且 key 自带后缀:
      cell_type=1(文本) cell_info[key][key+'_value'].value          -> {'unit':1,'value_str':'整体'}
      cell_type=2(指标) cell_info[key][key+'_index_value'].index_values.value -> {'unit':3,'value':...}
    """
    wrap = (cell_info or {}).get(key) or {}
    cell = wrap.get(key + '_index_value') or wrap.get(key + '_value') or {}
    if cell.get('cell_type') == 1:
        return cell.get('value')
    return (cell.get('index_values') or {}).get('value')


def dy_by_channel_flow_parse(response_data):
    """
    channel_flow -> 分渠道 GMV / 观看人次 + 整体口径的 GMV / 观看人次 / 成交订单数。
    固定 7 个渠道字段取不到时为 None, 原始渠道串一律落在 live_traffic_*_trend 里不丢数。
    """
    send_data = {}
    rows = dy_by_data(response_data)
    if not isinstance(rows, list):
        return send_data

    sale_pairs, watch_pairs = [], []
    hit = {}
    for row in rows:
        cell_info = row.get('cell_info') or {}
        name = (_cf_cell(cell_info, 'channel_name') or {}).get('value_str')
        if not name:
            continue
        sale = by_value(_cf_cell(cell_info, 'pay_amt'))
        watch_pv = by_value(_cf_cell(cell_info, 'watch_cnt'))

        if name == CHANNEL_ALL:
            send_data['live_sale_amount'] = sale
            send_data['live_watch_pv'] = watch_pv
            send_data['live_watch_uv'] = by_value(_cf_cell(cell_info, 'watch_ucnt'))
            send_data['deal_order_count'] = by_value(_cf_cell(cell_info, 'pay_cnt'))
            send_data['qianchuan_cost'] = by_value(_cf_cell(cell_info, 'stat_cost'))
            continue

        sale_pairs.append((name, sale))
        watch_pairs.append((name, watch_pv))
        prefix = CHANNEL_MAP.get(name)
        if prefix:
            hit[prefix] = (sale, watch_pv)

    for prefix in set(CHANNEL_MAP.values()):
        sale, watch_pv = hit.get(prefix, (None, None))
        send_data[f'{prefix}_sale_amount'] = sale
        send_data[f'{prefix}_watch_pv'] = watch_pv

    # 自然流量合计: 整体减掉付费渠道; 付费渠道一个都没出现时就等于整体
    total_sale = send_data.get('live_sale_amount')
    total_watch = send_data.get('live_watch_pv')
    paid_sale = [send_data.get(f'{p}_sale_amount') for p in CHANNEL_PAID]
    paid_watch = [send_data.get(f'{p}_watch_pv') for p in CHANNEL_PAID]
    send_data['natural_sale_amount'] = (
        round(total_sale - sum(v for v in paid_sale if v), 2) if total_sale is not None else None)
    send_data['natural_watch_pv'] = (
        total_watch - sum(v for v in paid_watch if v) if total_watch is not None else None)

    send_data['live_traffic_sale_trend'] = by_kv(sale_pairs)
    send_data['live_traffic_watch_trend'] = by_kv(watch_pairs)
    return send_data


def dy_by_trend_parse(response_data):
    """
    trend_analysis_v2 -> {'2026-09-21 08': {设计表字段: 值, ...}, ...}, 键是自然小时起点。

    trend_map 按 unit 分组(number / price / time / ratio), 每组是一个打平的点列表,
    point_name 才是指标名, 所以要按 point_name 重新归组。
    单位还原借 by_value: 构造 {'unit': 组名, 'value': vertical} 交给它, price 自动分转元。

    注意: trend_gap=hour 返回的已经是「时段增量」而不是当日累计(实测各小时 watch_ucnt
    一升一降、非单调, 且逐时求和 ≈ 场次总计), 所以设计表 3.4 的「累计值做差」在这里不需要。
    但逐时求和与场次总计有 3%~5% 偏差(UV 跨小时去重 + 成交 T+ 回调), 小时值不要反推日值。
    """
    send_data = {}
    trend_map = dy_by_data(response_data).get('trend_map') or {}
    for unit, points in trend_map.items():
        for point in points or []:
            field = TREND_FIELD_MAP.get(point.get('point_name'))
            hour_key = by_time(point.get('date_time'))
            if not field or not hour_key:
                continue
            send_data.setdefault(hour_key[:13], {})[field] = by_value(
                {'unit': unit, 'value': point.get('vertical')})
    return send_data


def dy_by_live_trend(session, by_cp, live_room_id, trend_gap='hour'):
    """单场次的分时段数据, 返回 {'2026-09-21 08': {...}} 供 dy_by_info 按自然小时汇总"""
    response_data = dy_by_trend_analysis(session, by_cp, live_room_id, trend_gap=trend_gap)
    if not dy_by_ok(response_data):
        return {}
    return dy_by_trend_parse(response_data)


def dy_by_live_detail(session, by_cp, live_room_id):
    """
    单场次复盘全量, 返回一个已按设计表命名的 dict(场次级口径)。
    日粒度的多场汇总、时段差值在 dy_by_info 里做, 这里只负责单场。
    state_desc 记失败模块, 供上层置 crawl_status / is_fallback。
    """
    send_data = {'live_id': str(live_room_id), 'state_desc': 'ok'}
    fails = []

    steps = (
        ('basic_info', dy_by_basic_info, dy_by_basic_info_parse),
        ('core_group_info', dy_by_core_group_info, dy_by_core_group_parse),
        ('trade_info', dy_by_trade_info, dy_by_trade_info_parse),
        ('channel_flow', dy_by_channel_flow, dy_by_channel_flow_parse),
    )
    for name, request_func, parse_func in steps:
        response_data = request_func(session, by_cp, live_room_id)
        if not dy_by_ok(response_data):
            fails.append(f'{name}: {dy_by_error(response_data)}')
            continue
        send_data.update(parse_func(response_data))

    # 曝光-观看率(次数): 观看人次在 channel_flow, 曝光次数在 core_group_info, 拿齐了才能算
    send_data['exposure_view_rate_pv'] = by_ratio_of(send_data.get('live_watch_pv'),
                                                     send_data.get('exposure_pv'))
    # 去退GMV(需求 3.5), 两个都有值才算
    sale, refund = send_data.get('live_sale_amount'), send_data.get('live_refund_amount')
    send_data['live_settle_amount'] = round(sale - refund, 2) if None not in (sale, refund) else None

    if fails:
        send_data['state_desc'] = '；'.join(fails)
    return send_data


if __name__ == '__main__':
    session = requests.Session()
    by_cp = {'cookies': dy_by_debug_cookies(), 'proxies': {}}

    detail = dy_by_live_detail(session, by_cp, TEST_LIVE_ROOM_ID)
    for key, value in detail.items():
        print(f'{key}: {value}')

    print('--- 分时段')
    trend = dy_by_live_trend(session, by_cp, TEST_LIVE_ROOM_ID)
    for hour_key in sorted(trend)[:5]:
        print(f'{hour_key}: {trend[hour_key]}')

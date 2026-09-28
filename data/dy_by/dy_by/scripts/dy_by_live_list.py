import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import datetime

import requests

from dy_by_common import (dy_by_get, dy_by_data, dy_by_ok, dy_by_error, BASE_BUYIN,
                          by_num, by_money, by_rate, by_duration, by_time, by_date,
                          by_value, by_join, TEST_COOKIES)

# ───────────────────── 巨量百应 · 直播明细(场次列表) ─────────────────────
# 页面: https://buyin.jinritemai.com/dashboard/compass-home/live-list
# 本模块是整条链路的入口: 先拿到当日/区间内的全部 live_id, 后面的场次复盘、商品明细
# 都要靠 live_id 去 compass.jinritemai.com 请求。
#
# 关键坑 1: history_live 不支持任意自定义日区间。date_type 是预置窗口枚举,
#           begin_date 必须等于 data_range_v2 返回的 data_range_map[date_type].min_date,
#           传别的值一律 100003 参数校验失败。所以日粒度过滤只能在本地按开播时间做。
#           实测可用: 21=近7天  23=近30天  24=近90天 (需求的 30 天回溯用 23 即可)。
# 关键坑 2: 列表指标默认只给 7 列, 想要 GMV/退款/成交人数这些必须显式传 index_selected,
#           可选项在响应的 index_groups 里。这里默认把需求用得到的全塞进去。
# 关键坑 3: 列表值是格式化后的字符串(¥5,889,380.73 / 817.49万 / 1天9小时11分29秒),
#           不是原始数值, 必须走 by_money / by_num / by_duration 还原。
#           today_live_room 反过来给的是 {'unit','value'} 原始结构, 用 by_value。
# 关键坑 4: 万/亿 单位是四舍五入后的展示值(817.49万 还原回来是 8174900, 真值 8174932),
#           所以本模块的人数/次数类字段只做场次发现和时间线用, 落库的精确值一律取
#           compass 侧 core_group_info / trade_info 的原始数值。

LIVE_LIST_PATH = '/compass_api/content_live/author/live_detail/history_live'
DATA_RANGE_PATH = '/compass_api/config_center/data_range_v2'
QUICK_FILTER_PATH = '/compass_api/content_live/author/live_detail/pc/quick_filter_list'
TODAY_LIVE_PATH = '/compass_api/author/live/live_detail/today_live_room'

LIVE_LIST_REFERER = BASE_BUYIN + '/dashboard/compass-home/live-list'
LIVE_LIST_PAGE_PATH = '/dashboard/compass-home/live-list'

# 预置日期窗口, history_live 只认这几个
DATE_TYPE_7D = 21
DATE_TYPE_30D = 23
DATE_TYPE_90D = 24

# 跨零点归属阈值: 开播时间早于该小时的场次算前一日(需求 2.1.2 的 24:00~次日08:00 规则)
# 需求原文写的是 8 点, 但实测 vivo 官方旗舰店每天 07:59~08:01 开播, 卡 8 点会把
# 09-21 07:59 那场误归到 09-20(而 09-20 08:00 自己已经有一场), 一天两场、一天零场。
# 所以阈值下调到 6 点: 凌晨 0~6 点开播的才算前一日的深夜续播, 6 点后开播的算当日。
# 该阈值待业务确认, 见 抖音百应字段设计表.md 「六、待确认」。
CROSS_DAY_HOUR = 6

# index_selected 全量: 需求 Sheet1/Sheet2/Sheet3 用得到的场次级指标
LIVE_LIST_INDEXES = [
    'watch_ucnt',                       # 直播间观看人数
    'watch_cnt',                        # 直播间观看人次
    'pcu',                              # 最高在线人数
    'acu',                              # 平均在线人数
    'avg_watch_duration',               # 人均观看时长
    'incr_fans_cnt',                    # 新增粉丝数
    'decr_fans_cnt',                    # 取关粉丝数
    'fans_club_ucnt',                   # 新加直播团人数(注意不是购物团)
    'ecom_live_ecf_joinclub_ucnt_td',   # 新加购物团人数 -> live_fans_group_add
    'comment_cnt',                      # 评论次数
    'pay_gmv',                          # 直播间成交金额
    'refund_gmv',                       # 直播间退款金额
    'pay_order_cnt',                    # 直播间成交订单数
    'refund_cnt',                       # 直播间退款订单数
    'pay_ucnt',                         # 直播间成交人数
    'refund_ucnt',                      # 直播间订单退款人数
    'pay_product_cnt',                  # 直播间成交件数
    'product_show_ucnt',                # 商品曝光人数
    'product_click_ucnt',               # 商品点击人数
    'product_click_rate',               # 商品曝光-点击率(人数)
    'product_conversation_rate',        # 商品点击-成交转化率(人数)
    'watch_ucnt_to_pay_rate_in_live',   # 观看-成交转化率(人数)
    'price_per_pay_combo_in_live',      # 成交件单价
    'popular_product_cnt',              # 带货商品数
]


def dy_by_data_range(session, by_cp, data_type='author_live_list', path=LIVE_LIST_PAGE_PATH):
    """可选日期窗口, 返回里的 data_range_map[date_type].min_date 就是 history_live 要的 begin_date"""
    params = {'data_type': data_type, 'path': path}
    return dy_by_get(session, by_cp, BASE_BUYIN, DATA_RANGE_PATH,
                     params=params, referer=LIVE_LIST_REFERER)


def dy_by_begin_date(session, by_cp, date_type=DATE_TYPE_30D):
    """按 date_type 取该窗口的起始 unix 秒, 拿不到时返回 None(调用方自己兜底)"""
    data = dy_by_data(dy_by_data_range(session, by_cp))
    range_map = data.get('data_range_map') or {}
    item = range_map.get(str(date_type)) or {}
    return item.get('min_date')


def dy_by_today_live_room(session, by_cp):
    """今日直播卡片(含正在直播的场次), live_status=true 表示还没下播"""
    return dy_by_get(session, by_cp, BASE_BUYIN, TODAY_LIVE_PATH, referer=LIVE_LIST_REFERER)


def dy_by_quick_filter_list(session, by_cp, begin_date, date_type=DATE_TYPE_30D):
    """快捷筛选项(活动场/诊断标签), 不落库"""
    params = {'begin_date': begin_date, 'date_type': date_type}
    return dy_by_get(session, by_cp, BASE_BUYIN, QUICK_FILTER_PATH,
                     params=params, referer=LIVE_LIST_REFERER)


def dy_by_history_live(session, by_cp, begin_date, date_type=DATE_TYPE_30D,
                       page_no=1, page_size=20, indexes=None, is_asc='false', filter_type=0):
    """历史场次列表。begin_date 必须与 date_type 的 min_date 一致, 否则 100003"""
    begin_format = datetime.datetime.fromtimestamp(int(begin_date)).strftime('%Y-%m-%dT%H:%M:%S+08:00')
    params = {
        'is_asc': is_asc,
        'page_no': page_no,
        'page_size': page_size,
        'date_type': date_type,
        'begin_date': begin_date,
        'begin_date_format': begin_format,
        'index_selected': ','.join(indexes if indexes is not None else LIVE_LIST_INDEXES),
        'filter_type': filter_type,
    }
    return dy_by_get(session, by_cp, BASE_BUYIN, LIVE_LIST_PATH,
                     params=params, referer=LIVE_LIST_REFERER)


# ───────────────────── 解析 ─────────────────────


def by_belong_date(start_time):
    """
    开播时间 -> 归属自然日(需求 2.1.2): 00:00~08:00 开播的算前一日, 其余算当日。
    入参是 by_time 输出的 '%Y-%m-%d %H:%M:%S'
    """
    if not start_time:
        return None
    try:
        dt = datetime.datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return by_date(start_time)
    if dt.hour < CROSS_DAY_HOUR:
        dt -= datetime.timedelta(days=1)
    return dt.strftime('%Y-%m-%d')


def dy_by_today_live_parse(response_data):
    """today_live_room -> {'items': [...]}, 字段少但值是原始结构, 用来判断是否还在直播"""
    send_data = {'items': []}
    data = dy_by_data(response_data)
    for card in data.get('card_list') or []:
        start_time = by_time(card.get('start_time'))
        send_data['items'].append({
            'live_id': card.get('live_id'),
            'title': card.get('live_title'),
            'is_living': '1' if card.get('live_status') else '0',
            'live_start_time': start_time,
            'stat_date': by_belong_date(start_time),
            'live_duration': by_duration(card.get('live_duration')),
            'live_watch_uv': by_value(card.get('watch_ucnt')),
            'live_fans_add': by_value(card.get('incr_fans_cnt')),
            'live_sale_amount': by_value(card.get('pay_order_gmv')),
            'phone_sale_order_count': by_value(card.get('pay_order_cnt')),
        })
    return send_data


def dy_by_history_live_parse(response_data):
    """
    history_live -> {'total': n, 'items': [...]}
    item 里的字段名与 by_info 对齐, 场次级(单场)口径; 日粒度汇总在 dy_by_info 里做。
    live_end_time 是 开播时间 + 直播时长 算出来的, 列表本身不给下播时间。
    """
    send_data = {'total': 0, 'items': []}
    data = dy_by_data(response_data)
    if not data:
        return send_data

    send_data['total'] = (data.get('page_result') or {}).get('total') or 0
    for row in data.get('data_result') or []:
        operation = row.get('operation') or {}
        start = row.get('start_time') or {}
        start_time = by_time(start.get('start_time'))
        duration = by_duration(start.get('live_duration'))
        end_time = None
        if start_time and duration:
            end_time = (datetime.datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
                        + datetime.timedelta(seconds=duration)).strftime('%Y-%m-%d %H:%M:%S')

        item = {
            'live_id': operation.get('live_id'),
            'live_app_id': operation.get('live_app_id'),
            'title': row.get('live_room'),
            'cover': row.get('cover_img_uri'),
            'live_start_time': start_time,
            'live_end_time': end_time,
            'live_duration': duration,
            'stat_date': by_belong_date(start_time),
            # 开播日与下播日不同即为跨零点场次
            'is_cross_day': '1' if (start_time and end_time and start_time[:10] != end_time[:10]) else '0',

            'live_watch_uv': by_num(row.get('watch_ucnt')),
            'live_watch_pv': by_num(row.get('watch_cnt')),
            'live_peak': by_num(row.get('pcu')),
            'avg_online_count': by_num(row.get('acu')),
            'avg_stay_duration': by_duration(row.get('avg_watch_duration')),
            'live_fans_add': by_num(row.get('incr_fans_cnt')),
            'live_fans_dec': by_num(row.get('decr_fans_cnt')),
            # fans_club_ucnt 是「新加直播团」, ecom_live_ecf_joinclub_ucnt_td 才是需求要的「新加购物团」
            'live_fans_club_add': by_num(row.get('fans_club_ucnt')),
            'live_fans_group_add': by_num(row.get('ecom_live_ecf_joinclub_ucnt_td')),
            'comment_count': by_num(row.get('comment_cnt')),

            'live_sale_amount': by_money(row.get('pay_gmv')),
            'live_refund_amount': by_money(row.get('refund_gmv')),
            'deal_order_count': by_num(row.get('pay_order_cnt')),
            'refund_order_count': by_num(row.get('refund_cnt')),
            'deal_user_count': by_num(row.get('pay_ucnt')),
            'refund_user_count': by_num(row.get('refund_ucnt')),
            'deal_product_count': by_num(row.get('pay_product_cnt')),
            'product_count': by_num(row.get('popular_product_cnt')),
            'product_price_avg': by_money(row.get('price_per_pay_combo_in_live')),

            'product_show_uv': by_num(row.get('product_show_ucnt')),
            'product_click_uv': by_num(row.get('product_click_ucnt')),
            'product_show_click_rate_uv': by_rate(row.get('product_click_rate')),
            'product_click_deal_rate_uv': by_rate(row.get('product_conversation_rate')),
            'watch_deal_rate_uv': by_rate(row.get('watch_ucnt_to_pay_rate_in_live')),
        }
        send_data['items'].append(item)
    return send_data


def dy_by_live_list_all(session, by_cp, date_type=DATE_TYPE_30D, begin_date=None,
                        page_size=20, max_page=20, indexes=None):
    """
    翻页拉完窗口内全部场次。begin_date 不传就自动去 data_range_v2 取。
    返回 {'total': n, 'items': [...], 'state_desc': ''}
    """
    send_data = {'total': 0, 'items': [], 'state_desc': 'ok'}
    if begin_date is None:
        begin_date = dy_by_begin_date(session, by_cp, date_type)
    if not begin_date:
        send_data['state_desc'] = 'live_list: 取不到 data_range_v2 的 begin_date'
        return send_data

    for page_no in range(1, max_page + 1):
        response_data = dy_by_history_live(session, by_cp, begin_date, date_type=date_type,
                                           page_no=page_no, page_size=page_size, indexes=indexes)
        if not dy_by_ok(response_data):
            send_data['state_desc'] = f'live_list: {dy_by_error(response_data)}'
            break
        page_data = dy_by_history_live_parse(response_data)
        send_data['total'] = page_data['total']
        send_data['items'].extend(page_data['items'])
        if len(send_data['items']) >= page_data['total'] or not page_data['items']:
            break
    return send_data


def dy_by_live_list_by_date(session, by_cp, stat_date, date_type=DATE_TYPE_30D, **kwargs):
    """
    取某个自然日归属的全部场次(已按 2.1.2 跨零点规则归日)。
    返回 {'items': [...], 'live_ids': '..%@..', 'live_count': n,
          'live_start_time', 'live_end_time', 'live_duration', 'is_cross_day'}
    live_duration 是各场时长之和(需求 2.1.3), 不是首尾相减。
    """
    all_data = dy_by_live_list_all(session, by_cp, date_type=date_type, **kwargs)
    items = [i for i in all_data['items'] if i.get('stat_date') == stat_date]
    items.sort(key=lambda i: i.get('live_start_time') or '')

    durations = [i['live_duration'] for i in items if i.get('live_duration')]
    send_data = {
        'items': items,
        'state_desc': all_data['state_desc'],
        'live_count': len(items),
        'live_ids': by_join([i.get('live_id') for i in items]),
        'live_start_time': items[0].get('live_start_time') if items else None,
        'live_end_time': max((i.get('live_end_time') for i in items if i.get('live_end_time')), default=None),
        'live_duration': sum(durations) if durations else None,
        'is_cross_day': '1' if any(i.get('is_cross_day') == '1' for i in items) else '0',
    }
    return send_data


if __name__ == '__main__':
    session = requests.Session()
    by_cp = {'cookies': TEST_COOKIES, 'proxies': {}}

    begin_date = dy_by_begin_date(session, by_cp, DATE_TYPE_30D)
    print('begin_date:', begin_date)
    print('today:', dy_by_today_live_parse(dy_by_today_live_room(session, by_cp)))
    print('page1:', dy_by_history_live_parse(
        dy_by_history_live(session, by_cp, begin_date, page_size=2))['items'])
    print('by_date:', {k: v for k, v in
                       dy_by_live_list_by_date(session, by_cp, '2026-09-21').items() if k != 'items'})

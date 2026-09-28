import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import re
import json

import requests

from dy_by_common import (dy_by_get, dy_by_data, dy_by_ok, dy_by_error, BASE_COMPASS,
                          by_num, by_money, by_rate, by_value, by_index, by_time,
                          by_kv, by_json, by_ratio_of,
                          TEST_LIVE_ROOM_ID, dy_by_debug_cookies)

# ───────────────────── 巨量百应 · 商品明细与机型归类(单场次) ─────────────────────
# 页面: https://compass.jinritemai.com/talent/live-statement?live_room_id=xxx
# 注意: 商品数据在复盘页上**不会自动请求**, 页面三个 tab(直播诊断/核心数据/讲解回放数据)
#       都不触发商品接口, 路径是从 talent_live_statement.*.js 的路由注册表里挖出来的。
#
# 关键坑 1: 入参名与路径前缀的对应关系是反的, 和 dy_by_live_detail 的经验相悖:
#           /compass_api/content_live/.../products_list_detail 是 content_live 前缀,
#           但入参名是 live_room_id(不是 channel_flow 那样的 room_id), 传 room_id 直接 621000601。
# 关键坑 2: products_card_detail 不管传什么都是 621000602 参数非法,
#           product/sku_detail 恒定 11001(同一轮里 product/detail 签名正常返回 200, 不是签名问题)。
#           这两个接口拿不到, 机型归类只能靠商品标题, 不能靠 SKU 规格。
# 关键坑 3: 列表值全是格式化字符串(¥3,852,451.82 / 7.0%), 走 by_money / by_num / by_rate 还原;
#           product/detail 反过来给 {'unit','value'} 原始结构, 走 by_value。
# 关键坑 4: 列表**没有** 成交订单数 / 商品曝光人数, 只有成交件数和曝光-点击率。
#           要精确订单数得逐个商品调 product/detail(一次 node 签名 1.5~3 秒),
#           所以做成 with_detail 开关, 默认关掉, 只在需要 phone_*_order_count 时开。
# 关键坑 5: 光靠「实付≥1000元」筛不出手机单。实测 vivo 官方旗舰店挂了三个
#           「【新品预约】... 即将上市」占位商品, 标价 ¥999,999; 还有 ¥9,999 的定金预约权益包。
#           这些标题里都带真实机型名, 只卡价格会把它们算成手机销量。
#           所以判定是 价格≥1000 且 命中机型 且 不含排除词(预约/定金/权益/套装/耳机/手表/平板...)。
# 关键坑 6: 机型匹配必须**长词优先**, 否则 'X500 Pro Max' 会被 'X500' 先吃掉,
#           'X200 Ultra' / 'X200s' / 'X200 Pro' 同理。MODEL_CONFIG 里不用管顺序, 代码会按长度排。
# 关键坑 7: 退款口径。需求 3.1 要的是「当场直播时段内产生的退款」, 但接口不给退款时间。
#           列表给的是按场次归因的 售中退款(salingrefund_cnt) + 售后退款(saledrefund_cnt),
#           这里两者相加当作 refund_num, 属于近似口径, 见 抖音百应字段设计表.md「六、待确认」。

PRODUCTS_LIST_PATH = '/compass_api/content_live/author/live_room_detail/products_list_detail'
PRODUCTS_SORT_PATH = '/compass_api/author/live/live_room_detail/products_list_sort_type'
PRODUCT_DETAIL_PATH = '/compass_api/author/live/live_room_detail/product/detail'
# 下面两个实测取不到, 留着备查, 不要在流程里调
PRODUCTS_CARD_PATH = '/compass_api/author/live/live_room_detail/products_card_detail'
PRODUCT_SKU_PATH = '/compass_api/author/live/live_room_detail/product/sku_detail'

DETAIL_REFERER = BASE_COMPASS + '/talent/live-statement'
PRODUCT_URL_TPL = 'https://haohuo.jinritemai.com/views/product/item2?id={}'

# 需求 3.1: 只统计实付金额 ≥ 1000 元的手机订单
PHONE_MIN_PRICE = 1000

# 机型配置外置文件, 存在就整份覆盖 DEFAULT_MODEL_CONFIG(需求「支持机型动态新增, 无需修改代码」)
MODEL_CONFIG_FILE = os.path.join(os.path.dirname(file_path), 'dy_by_model.json')

# 机型配置: model_name 落库名, model_series 系列, keywords 标题命中词(不填就用 model_name)
# 新增机型改这里或改 dy_by_model.json, 不用动解析代码。
DEFAULT_MODEL_CONFIG = [
    {'model_name': 'X500 Pro Max', 'model_series': 'X系列'},
    {'model_name': 'X500 Pro', 'model_series': 'X系列'},
    {'model_name': 'X500', 'model_series': 'X系列'},
    {'model_name': 'X300 Pro', 'model_series': 'X系列'},
    {'model_name': 'X300 E', 'model_series': 'X系列'},
    {'model_name': 'X300', 'model_series': 'X系列'},
    {'model_name': 'X200 Ultra', 'model_series': 'X系列'},
    {'model_name': 'X200 Pro', 'model_series': 'X系列'},
    {'model_name': 'X200s', 'model_series': 'X系列'},
    {'model_name': 'X200', 'model_series': 'X系列'},
    {'model_name': 'X Fold6', 'model_series': 'X系列'},
    {'model_name': 'S60', 'model_series': 'S系列'},
    {'model_name': 'S50 Pro mini', 'model_series': 'S系列'},
    {'model_name': 'S50t', 'model_series': 'S系列'},
    {'model_name': 'S50', 'model_series': 'S系列'},
]

# 命中机型名但不是手机整机的商品: 预约占位、定金权益、配件、周边品类
NON_PHONE_WORDS = ('预约', '定金', '权益', '套装', '配件', '耳机', '手表', '平板',
                   '保护', '充电', '数据线', '贴膜', '支架', '电源',
                   'WATCH', 'TWS', 'PAD', '影音')


def dy_by_model_config():
    """机型配置, dy_by_model.json 存在就整份覆盖默认值; 文件坏了不阻断采集, 回落默认"""
    try:
        with open(MODEL_CONFIG_FILE, encoding='utf-8') as config_file:
            config = json.load(config_file)
        if isinstance(config, list) and config:
            return config
    except Exception:
        pass
    return DEFAULT_MODEL_CONFIG


def _norm(text):
    """标题归一化: 大写 + 压掉所有空白, 这样 'X500 Pro Max' 与 'X500ProMax' 都能命中"""
    return re.sub(r'\s+', '', str(text or '')).upper()


def _model_rules(config):
    """展开成 [(归一化关键词, model_name, model_series)], 按关键词长度倒序 -> 长词优先"""
    rules = []
    for item in config or []:
        name = item.get('model_name')
        if not name:
            continue
        series = item.get('model_series')
        for keyword in item.get('keywords') or [name]:
            rules.append((_norm(keyword), name, series))
    rules.sort(key=lambda r: len(r[0]), reverse=True)
    return rules


def by_match_model(title, rules):
    """
    商品标题 -> (model_name, model_series)。命中不了或不是手机整机时返回 (None, None)。
    排除词优先于机型词: 「【新品预约】vivo X500 Pro Max 新品手机」带真实机型名, 但它是占位商品。
    """
    text = _norm(title)
    if not text:
        return None, None
    for word in NON_PHONE_WORDS:
        if _norm(word) in text:
            return None, None
    for keyword, name, series in rules:
        if keyword and keyword in text:
            return name, series
    return None, None


# ───────────────────── 请求 ─────────────────────


def dy_by_products_list(session, by_cp, live_room_id, page_no=1, page_size=20,
                        sort_field='pay_amt', is_asc='false'):
    """场次商品明细一页。入参名是 live_room_id, 虽然路径前缀是 content_live"""
    params = {
        'live_room_id': live_room_id,
        'page_no': page_no,
        'page_size': page_size,
        'sort_field': sort_field,
        'is_asc': is_asc,
    }
    return dy_by_get(session, by_cp, BASE_COMPASS, PRODUCTS_LIST_PATH,
                     params=params, referer=DETAIL_REFERER)


def dy_by_products_sort_type(session, by_cp, live_room_id):
    """可用排序字段目录(pay_amt / pay_combo_cnt / product_click_ucnt / gpm ...), 不落库"""
    return dy_by_get(session, by_cp, BASE_COMPASS, PRODUCTS_SORT_PATH,
                     params={'live_room_id': live_room_id}, referer=DETAIL_REFERER)


def dy_by_product_detail(session, by_cp, live_room_id, product_id):
    """单商品概览, 给列表拿不到的 成交订单数/成交人数/商品曝光人数/退款订单数(原始值)"""
    params = {'live_room_id': live_room_id, 'product_id': product_id}
    return dy_by_get(session, by_cp, BASE_COMPASS, PRODUCT_DETAIL_PATH,
                     params=params, referer=DETAIL_REFERER)


# ───────────────────── 解析 ─────────────────────


def dy_by_products_list_parse(response_data, rules=None):
    """products_list_detail 一页 -> {'total': n, 'items': [...]}, items 已按设计表子字段命名"""
    send_data = {'total': 0, 'items': []}
    data = dy_by_data(response_data)
    if not data:
        return send_data
    if rules is None:
        rules = _model_rules(dy_by_model_config())

    send_data['total'] = (data.get('page_result') or {}).get('total') or 0
    for row in data.get('data_result') or []:
        product_id = row.get('product_id')
        title = row.get('product_name')
        model_name, model_series = by_match_model(title, rules)
        price = by_money(row.get('price'))
        sale_num = by_num(row.get('pay_combo_cnt'))
        # 当场退款: 售中 + 售后, 接口不给退款时间, 属近似口径(见文件头 关键坑 7)
        refund_num = sum(v for v in (by_num(row.get('salingrefund_cnt')),
                                     by_num(row.get('saledrefund_cnt'))) if v) or 0

        send_data['items'].append({
            'product_id': product_id,
            'product_url': PRODUCT_URL_TPL.format(product_id) if product_id else None,
            'product_title': title,
            'product_cover': row.get('product_img'),
            'product_price': price,
            'sale_num': sale_num,
            'refund_num': refund_num,
            'settle_num': sale_num - refund_num if sale_num is not None else None,
            'sale_amount': by_money(row.get('pay_amt')),
            'refund_amount': sum(v for v in (by_money(row.get('real_salingrefund_amt')),
                                             by_money(row.get('real_saledrefund_amt'))) if v) or 0,
            'model_name': model_name,
            'model_series': model_series,
            # 是否计入 phone_*: 价格达标 + 命中机型(排除词已在 by_match_model 里挡掉)
            'is_phone': bool(model_name and price is not None and price >= PHONE_MIN_PRICE),
            'explain_count': by_num(row.get('explain_cnt')),
            'product_click_uv': by_num(row.get('product_click_ucnt')),
            'product_show_click_rate_uv': by_rate(row.get('product_show_click_ucnt_ratio')),
            'product_click_deal_rate_uv': by_rate(row.get('product_click_pay_ucnt_ratio')),
            'gpm': by_money(row.get('gpm')),
            'product_bind_time': by_time(row.get('product_bind_time')),
        })
    return send_data


def dy_by_product_detail_parse(response_data):
    """product/detail -> 列表里拿不到的那几个原始值字段"""
    data = dy_by_data(response_data)
    std = by_index(data.get('product_overview_data'))
    return {
        'product_title': data.get('product_name'),
        'product_cover': data.get('product_img'),
        'deal_order_count': std.get('pay_cnt'),
        'deal_user_count': std.get('pay_ucnt'),
        'refund_order_count': std.get('refund_cnt'),
        'refund_user_count': std.get('refund_ucnt'),
        'refund_amount': std.get('real_refund_amt'),
        'product_show_uv': std.get('product_show_ucnt'),
        'product_click_uv': std.get('product_click_ucnt'),
        'sale_amount': std.get('pay_amt'),
        'sale_num': std.get('pay_combo_cnt'),
        'gpm': std.get('gpm'),
    }


def dy_by_model_summary(items, config=None):
    """
    商品明细 -> 机型/系列汇总。配置表里有的机型即使当场 0 销量也要出现(设计表明确要求),
    所以先用配置铺满再累加, 不是按命中的机型动态建桶。
    """
    config = config or dy_by_model_config()
    buckets = {}
    order = []
    for item in config:
        name = item.get('model_name')
        if not name or name in buckets:
            continue
        order.append(name)
        buckets[name] = {'model_name': name, 'model_series': item.get('model_series'),
                         'sale_num': 0, 'refund_num': 0, 'settle_num': 0, 'sale_amount': 0.0}

    for item in items or []:
        if not item.get('is_phone'):
            continue
        bucket = buckets.get(item.get('model_name'))
        if bucket is None:
            continue
        bucket['sale_num'] += item.get('sale_num') or 0
        bucket['refund_num'] += item.get('refund_num') or 0
        bucket['sale_amount'] += item.get('sale_amount') or 0

    series = {}
    for name in order:
        bucket = buckets[name]
        bucket['settle_num'] = bucket['sale_num'] - bucket['refund_num']
        bucket['sale_amount'] = round(bucket['sale_amount'], 2)
        key = bucket['model_series']
        if key:
            series[key] = series.get(key, 0) + bucket['sale_num']

    model_list = [buckets[name] for name in order]
    return {
        'model_sale_list': by_json(model_list),
        'model_sale_trend': by_kv([(b['model_name'], b['sale_num']) for b in model_list]),
        'series_sale_trend': by_kv(list(series.items())),
    }


def dy_by_product_summary(items):
    """商品明细 -> 手机口径汇总(需求 3.1)。台数走件数, 订单数要 with_detail 才有"""
    phones = [i for i in items or [] if i.get('is_phone')]
    sale_num = sum(i.get('sale_num') or 0 for i in phones)
    refund_num = sum(i.get('refund_num') or 0 for i in phones)
    sale_order = [i.get('deal_order_count') for i in phones if i.get('deal_order_count') is not None]
    refund_order = [i.get('refund_order_count') for i in phones if i.get('refund_order_count') is not None]
    return {
        'phone_sale_num': sale_num,
        'phone_refund_num': refund_num,
        'phone_settle_num': sale_num - refund_num,
        'phone_sale_amount': round(sum(i.get('sale_amount') or 0 for i in phones), 2),
        # 订单数只有逐个商品调 product/detail 才拿得到, 没开 with_detail 时留 None 不落 0
        'phone_sale_order_count': sum(sale_order) if sale_order else None,
        'phone_refund_order_count': sum(refund_order) if refund_order else None,
        'phone_settle_order_count': (sum(sale_order) - sum(refund_order)
                                     if sale_order and refund_order else None),
        'product_count': len(items or []),
        'phone_product_count': len(phones),
    }


def dy_by_live_product(session, by_cp, live_room_id, page_size=20, max_page=20,
                       with_detail=False):
    """
    单场次商品与机型全量, 返回已按设计表命名的 dict。
    with_detail=True 时逐个手机商品补调 product/detail 拿精确订单数,
    一次 node 签名 1.5~3 秒, 20 个手机商品就是一分钟, 批量跑要算进耗时预算。
    """
    send_data = {'live_id': str(live_room_id), 'state_desc': 'ok'}
    config = dy_by_model_config()
    rules = _model_rules(config)
    items, fails = [], []
    # 零 GMV 的商品在 pay_amt 排序里并列, 翻页时次序会抖, 实测同一行出现在两页、另一行被跳过,
    # 所以按 product_id 去重(销量会被重复累加成两倍, 不去重直接影响 phone_sale_num)
    seen = set()

    for page_no in range(1, max_page + 1):
        response_data = dy_by_products_list(session, by_cp, live_room_id,
                                            page_no=page_no, page_size=page_size)
        if not dy_by_ok(response_data):
            fails.append(f'products_list: {dy_by_error(response_data)}')
            break
        page_data = dy_by_products_list_parse(response_data, rules=rules)
        for item in page_data['items']:
            if item['product_id'] in seen:
                continue
            seen.add(item['product_id'])
            items.append(item)
        if len(items) >= page_data['total'] or not page_data['items']:
            break

    if with_detail:
        for item in items:
            if not item.get('is_phone') or not item.get('product_id'):
                continue
            response_data = dy_by_product_detail(session, by_cp, live_room_id, item['product_id'])
            if not dy_by_ok(response_data):
                fails.append(f"product_detail {item['product_id']}: {dy_by_error(response_data)}")
                continue
            item.update({k: v for k, v in dy_by_product_detail_parse(response_data).items()
                         if v is not None})

    send_data.update(dy_by_product_summary(items))
    send_data.update(dy_by_model_summary(items, config))
    # product_list 落全部商品(含非手机), 机型归类的原始依据要可溯源
    send_data['product_list'] = by_json([
        {k: item[k] for k in ('product_id', 'product_url', 'product_title', 'product_cover',
                              'product_price', 'sale_num', 'refund_num', 'settle_num',
                              'sale_amount', 'model_name')}
        for item in items])
    send_data['items'] = items

    if fails:
        send_data['state_desc'] = '；'.join(fails)
    return send_data


if __name__ == '__main__':
    session = requests.Session()
    by_cp = {'cookies': dy_by_debug_cookies(), 'proxies': {}}

    result = dy_by_live_product(session, by_cp, TEST_LIVE_ROOM_ID)
    for key, value in result.items():
        if key == 'items':
            continue
        print(f'{key}: {value}')

    print('--- 手机商品归类')
    for item in result['items']:
        if item['is_phone']:
            print(f"  {item['model_name']:<14} {item['product_price']:>9} "
                  f"销{item['sale_num']:>5} 退{item['refund_num']:>5} {item['product_title'][:34]}")
    print('--- 未命中机型(不计入 phone_*)')
    for item in result['items']:
        if not item['is_phone'] and item['sale_num']:
            print(f"  {item['product_price']:>9} 销{item['sale_num']:>5} {item['product_title'][:40]}")

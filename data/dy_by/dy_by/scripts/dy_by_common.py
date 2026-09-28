import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import re
import json
import time
import datetime
from urllib.parse import urlencode

from dy_by_sign import by_need_sign, by_sign_url

# ───────────────────── 巨量百应 / 电商罗盘 公共配置 ─────────────────────
# 站点分两个 host, 两边共用同一套登录 cookie(sessionid / sid_guard / ecom_us_lt_*):
#   buyin.jinritemai.com    直播明细(场次列表), 入口 /dashboard/compass-home/live-list
#   compass.jinritemai.com  直播复盘(场次内各模块), 入口 /talent/live-statement?live_room_id=xxx
#
# 请求签名: 页面上所有 xhr 都带 _lid / verifyFp / fp / msToken / a_bogus。
# /compass_api/content_live/** 那套裸请求(只带 cookie)就能 200, 但 /compass_api/author/**
# 强制校验 a_bogus, 不带一律 {"code":11001,"msg":"当前网络不稳定"}(HTTP 仍是 200)。
# 所以 dy_by_get 对命中 SIGN_PREFIXES 的路径过一遍 dy_by_sign.by_sign_url(node+jsdom 跑
# BDMS 1.0.1.20), 其余路径裸发省掉几秒 node 冷启。verifyFp/fp 取自 cookie 里的 s_v_web_id。
#
# 响应统一信封: {"BaseResp":{"StatusCode":0,"StatusMessage":""},"data":{...},"msg":"","st":0}
# StatusCode != 0 即失败, 621000601 = 参数校验失败(一般是 live_room_id / room_id 传错名),
# 11001 = 缺 a_bogus 被风控。注意 11001 这种响应没有 BaseResp, 只有顶层 code/st。

BASE_BUYIN = 'https://buyin.jinritemai.com'
BASE_COMPASS = 'https://compass.jinritemai.com'

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Google Chrome\";v=\"153\", \"Not_A Brand\";v=\"8\", \"Chromium\";v=\"153\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
}

# 直播明细列表的日期类型是预置窗口枚举, 不支持自定义区间(实测传别的 begin_date 直接 100003)
# 21=近7天  23=近30天  24=近90天, 各自的 begin_date 见 data_range_v2, 详见 dy_by_live_list.py
DATE_TYPE_30D = 23
# 达人侧 app_id, 场次列表 operation.live_app_id 固定为 1128
AUTHOR_APP_ID = 1128

SEP = '%@'

# 数据来源 / 平台映射值, 见 抖音百应字段设计表.md 「九、目标与元字段」
DATA_SOURCE = '巨量百应'
PLAT_TYPE = '1'
VALUE_TYPE = 'exact'

# 数值口径标签: 百应同一份响应里混用了字符串枚举和数字枚举两套 unit
#   字符串枚举(core_group_info / trade_info / basic_info)
#   数字枚举(channel_flow 的 index_values.value.unit)
_UNIT_STR = {'number': 'number', 'ratio': 'ratio', 'time': 'time', 'price': 'price', 'nan': 'nan'}
_UNIT_INT = {1: 'str', 2: 'time', 3: 'price', 4: 'ratio', 5: 'number', 6: 'nan'}


def dy_by_sign_params(by_cp):
    """
    补齐百应的通用查询参数。verifyFp / fp 就是 cookie 里的 s_v_web_id,
    _lid 是前端自增的请求序号, 服务端不校验值只要求存在。
    msToken / a_bogus 由 dy_by_sign 签出来, 这里不管;
    by_cp 里显式给了就直接用(跳过 node, 调试时省时间)。
    """
    cookies = by_cp.get('cookies') or {}
    web_id = cookies.get('s_v_web_id') or ''
    params = {'_lid': str(int(time.time() * 1000))[-12:]}
    if web_id:
        params['verifyFp'] = web_id
        params['fp'] = web_id
    for key in ('msToken', 'a_bogus'):
        if by_cp.get(key):
            params[key] = by_cp[key]
    return params


def dy_by_json(response):
    """
    响应转 json。路径写错会返回纯文本 404, 风控挑战会返回 HTML,
    这两种直接 .json() 会抛异常炸掉整轮采集, 统一兜成失败信封让 dy_by_ok 判 False。
    """
    try:
        return response.json()
    except ValueError:
        return {'st': -1, 'code': -1, 'data': None,
                'msg': f'非 json 响应 HTTP {response.status_code}: {response.text[:200]}'}


_RAW_SEQ = [0]


def by_dump_raw(by_cp, path, params, response_data):
    """
    by_cp['raw_dir'] 给了就把这一条裸响应落盘, 文件名 序号_接口名_时间戳.json。
    落的是 .json() 的结果而不是行组装后的数据, 出问题时可以直接对着原始信封查。
    序号是进程内自增的, 保证同一轮采集里的文件按请求顺序排列。
    """
    raw_dir = by_cp.get('raw_dir')
    if not raw_dir:
        return None
    try:
        os.makedirs(raw_dir, exist_ok=True)
        _RAW_SEQ[0] += 1
        name = re.sub(r'[^0-9A-Za-z]+', '_', path.strip('/')).strip('_')[-60:]
        file_name = f'{_RAW_SEQ[0]:03d}_{name}_{datetime.datetime.now():%H%M%S}.json'
        full_path = os.path.join(raw_dir, file_name)
        with open(full_path, 'w', encoding='utf-8') as f:
            json.dump({'path': path, 'params': params,
                       'crawl_time': by_now(), 'response': response_data},
                      f, ensure_ascii=False, indent=2)
        return full_path
    except OSError:
        # 落盘失败不能影响采集主流程
        return None


def dy_by_get(session, by_cp, base_url, path, params=None, referer=None):
    """百应 GET 请求统一入口, 自动补签名参数与 referer; author 系路径顺带过一遍 a_bogus"""
    cookies = by_cp['cookies']
    proxies = by_cp.get('proxies') or {}
    query = dy_by_sign_params(by_cp)
    query.update(params or {})
    headers = dict(HEADERS)
    headers['referer'] = referer or (base_url + '/')
    url = base_url + path
    # 签完的 URL 必须原样发出去(a_bogus 对整条 query 串原样签名), 所以这里不能再传 params
    if by_need_sign(path) and 'a_bogus' not in query:
        url = by_sign_url(f'{url}?{urlencode(query)}', cookies, page_url=headers['referer'])
        query = None
    response = session.get(url, headers=headers, cookies=cookies,
                           params=query, proxies=proxies)
    response_data = dy_by_json(response)
    by_dump_raw(by_cp, path, params, response_data)
    return response_data


def dy_by_post(session, by_cp, base_url, path, data=None, params=None, referer=None):
    """百应 POST 请求统一入口, body 为 json"""
    cookies = by_cp['cookies']
    proxies = by_cp.get('proxies') or {}
    query = dy_by_sign_params(by_cp)
    query.update(params or {})
    headers = dict(HEADERS)
    headers['referer'] = referer or (base_url + '/')
    headers['content-type'] = 'application/json'
    body = json.dumps(data or {}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    url = base_url + path
    if by_need_sign(path) and 'a_bogus' not in query:
        url = by_sign_url(f'{url}?{urlencode(query)}', cookies, page_url=headers['referer'])
        query = None
    response = session.post(url, headers=headers, cookies=cookies,
                            params=query, data=body, proxies=proxies)
    response_data = dy_by_json(response)
    by_dump_raw(by_cp, path, dict(params or {}, **{'_body': data}), response_data)
    return response_data


def dy_by_ok(response_data):
    """判断百应信封是否成功。11001/-1 这类没有 BaseResp, 只能看顶层 st"""
    if not isinstance(response_data, dict):
        return False
    base = response_data.get('BaseResp') or {}
    code = base.get('StatusCode')
    if code is None:
        code = response_data.get('st')
    if code is None:
        code = response_data.get('code')
    return int(code or 0) == 0


def dy_by_error(response_data):
    """失败原因文案, 供上层拼 state_desc。BaseResp 缺失时回落到顶层 code/msg"""
    if not isinstance(response_data, dict):
        return '非法响应'
    base = response_data.get('BaseResp') or {}
    code = base.get('StatusCode')
    message = base.get('StatusMessage')
    if code is None:
        code = response_data.get('st') or response_data.get('code')
        message = response_data.get('msg')
    return f'{code} {message}'


def dy_by_data(response_data):
    """统一取 data 节点"""
    if not isinstance(response_data, dict):
        return {}
    data = response_data.get('data')
    return data if data is not None else {}


# ───────────────────── 字段值标准化工具 (见 抖音百应字段设计表.md 「二、百应字段值标准补充」) ─────────────────────

_UNIT_MAP = {'亿': 100000000, '万': 10000, 'w': 10000, 'W': 10000, '千': 1000, 'k': 1000, 'K': 1000}
_EMPTY = ('', '-', '--', '暂无', '未知', 'nan', 'None')


def by_num(text):
    """
    整数标准化(台数/人数/次数/订单数):
      '1,073.8万' -> 10738000
      '158382'    -> 158382
      1908        -> 1908
      -/--/空     -> None
    """
    if text is None or isinstance(text, bool):
        return None
    if isinstance(text, (int, float)):
        return int(text)
    s = str(text).strip().replace(',', '').replace(' ', '')
    if s in _EMPTY:
        return None
    m = re.match(r'^(-?\d+(?:\.\d+)?)([亿万wWkK千]?)$', s)
    if not m:
        return None
    return int(float(m.group(1)) * _UNIT_MAP.get(m.group(2), 1))


def by_money(text, is_cent=False):
    """
    金额标准化, 统一输出 float 元 保留 2 位:
      '¥3,852,451.82' -> 3852451.82
      '¥2.97w'        -> 29700.00
      588390113 + is_cent=True -> 5883901.13   (罗盘 unit=price 的原始值单位是分)
    """
    if text is None or isinstance(text, bool):
        return None
    if isinstance(text, (int, float)):
        val = float(text) / 100 if is_cent else float(text)
        return round(val, 2)
    s = str(text).strip().replace(',', '').replace(' ', '').lstrip('¥￥')
    if s in _EMPTY:
        return None
    m = re.match(r'^(-?\d+(?:\.\d+)?)([亿万wWkK千]?)$', s)
    if not m:
        return None
    val = float(m.group(1)) * _UNIT_MAP.get(m.group(2), 1)
    return round(val / 100 if is_cent else val, 2)


def by_rate(value):
    """
    比率标准化, 统一输出带 % 的字符串保留 2 位(设计表要求禁止转 float):
      0.000214686 -> '0.02%'     (罗盘 unit=ratio 的原始值是 0~1 小数)
      '7.0%'      -> '7.00%'
      None/nan    -> None
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return f'{round(float(value) * 100, 2):.2f}%'
    s = str(value).strip()
    if s in _EMPTY:
        return None
    try:
        return f'{round(float(s.rstrip("%")), 2):.2f}%'
    except (TypeError, ValueError):
        return None


def by_ratio_of(numerator, denominator):
    """按需求 3.5 自算比率, 分母为 0 或为空时返回 None(不落 0)"""
    if numerator is None or not denominator:
        return None
    return f'{round(numerator / denominator * 100, 2):.2f}%'


def by_div(numerator, denominator, digits=2):
    """按需求 3.5 自算比值(UV价值/客单价/时均), 分母为 0 或为空时返回 None"""
    if numerator is None or not denominator:
        return None
    return round(numerator / denominator, digits)


def by_duration(text):
    """
    时长转秒:
      '1天9小时2分26秒' -> 118946
      '55:02:49'        -> 198169
      119241            -> 119241
    """
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return int(text)
    s = str(text).strip()
    if s in _EMPTY:
        return None
    if re.match(r'^\d+(\.\d+)?$', s):
        return int(float(s))
    if ':' in s:
        total = 0
        for p in s.split(':'):
            total = total * 60 + int(p or 0)
        return total
    total = 0
    for val, unit in re.findall(r'(\d+(?:\.\d+)?)\s*(天|小时|时|分钟|分|秒)', s):
        total += float(val) * {'天': 86400, '小时': 3600, '时': 3600, '分钟': 60, '分': 60, '秒': 1}[unit]
    return int(total) if total else None


def by_hour(seconds, digits=2):
    """秒 -> 小时(float 2 位), 供 live_duration_hour 及时均类公式使用"""
    if not seconds:
        return None
    return round(seconds / 3600, digits)


def by_time(value):
    """unix 秒 / '2026/09/21 07:59' -> '%Y-%m-%d %H:%M:%S'"""
    if value in (None, 0, ''):
        return None
    if isinstance(value, (int, float)):
        return datetime.datetime.fromtimestamp(int(value)).strftime('%Y-%m-%d %H:%M:%S')
    s = str(value).strip().replace('/', '-')
    if re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$', s):
        return s + ':00'
    return s


def by_date(value):
    """unix 秒 / '2026/09/21 07:59' / 20260921 -> '%Y-%m-%d'"""
    if value in (None, 0, ''):
        return None
    if isinstance(value, (int, float)):
        s = str(int(value))
        if len(s) == 8:
            return f'{s[:4]}-{s[4:6]}-{s[6:]}'
        return datetime.datetime.fromtimestamp(int(value)).strftime('%Y-%m-%d')
    return str(value).strip().replace('/', '-')[:10]


def by_value(value_obj):
    """
    罗盘指标值统一还原, 入参形如 {'unit': 'price', 'value': 335263.92} 或 {'unit': 3, 'value': ...}
    按 unit 落成设计表要求的类型:
      number -> int        ratio -> '12.34%'
      time   -> int(秒)     price -> float(元, 原始单位是分)
      nan / str 无值 -> None
    """
    if not isinstance(value_obj, dict):
        return None
    unit = value_obj.get('unit')
    unit = _UNIT_STR.get(unit) if isinstance(unit, str) else _UNIT_INT.get(unit)
    if unit in (None, 'nan'):
        return None
    value = value_obj.get('value')
    if unit == 'str':
        return value_obj.get('value_str') or None
    if value is None:
        return None
    if unit == 'ratio':
        return by_rate(value)
    if unit == 'price':
        return by_money(value, is_cent=True)
    if unit == 'time':
        return int(value)
    return by_num(value)


def by_index(index_list):
    """
    罗盘指标数组拍平成 {index_name: 标准化值}。
    index_name 带首尾空格是百应的历史脏数据(如 'product_show_click_ucnt_ratio '), 必须 strip。
    """
    result = {}
    for item in index_list or []:
        if not isinstance(item, dict):
            continue
        name = (item.get('index_name') or '').strip()
        if not name:
            continue
        result[name] = by_value(item.get('value'))
    return result


def by_kv(items, key='name', value='value', fmt=None):
    """占比/趋势型字段拼接: -> '直播推荐:44.13%@搜索:9.51'"""
    parts = []
    for it in items or []:
        if isinstance(it, dict):
            k, v = it.get(key), it.get(value)
        elif isinstance(it, (list, tuple)) and len(it) >= 2:
            k, v = it[0], it[1]
        else:
            continue
        if k in (None, ''):
            continue
        if fmt:
            v = fmt(v)
        parts.append(f'{k}:{"" if v is None else v}')
    return SEP.join(parts) if parts else None


def by_join(items):
    """多值字段拼接: ['123', '456'] -> '123%@456'"""
    vals = [str(i) for i in (items or []) if i not in (None, '')]
    return SEP.join(vals) if vals else None


def by_json(obj):
    """列表型字段序列化为 json 字符串入库"""
    if not obj:
        return None
    return json.dumps(obj, ensure_ascii=False)


def by_id(*parts):
    """_id 拼接: by_kol_id%@data_type%@日期(%@小时 / %@主播名)"""
    return SEP.join(str(p) for p in parts if p not in (None, ''))


def by_now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


# ───────────────────── 本地调试用测试账号 (正式跑从 cookies_platform 取, platform='巨量百应') ─────────────────────
# 两个 host 的登录态是分开的, 必须把 buyin 和 compass 两边的 cookie 合起来用:
#   buyin   需要 ecom_us_lt_buyin* / ucas_c0_*buyin / SASID / BUYIN_SASID / buyin_app_id 这组
#   compass 需要 ecom_us_lt_compass* / ucas_c0_*compass / LUOPAN_DT 这组
# 只带 sessionid + ecom_us_lt_* 是不够的, 实测会拿到 data 为空的 200。
# dy_by_login.py 目前只开了 buyin 一个 tab, 取 cookie 时要顺带开一次 compass 才能拿全。

TEST_COOKIES = {
    "s_v_web_id": "verify_mth0j8iy_XTsj3QRW_sEoW_4DEg_9CCy_6149EQxCsbVj",
    "sessionid": "940f20dc1091d054232c70a25029192a",
    "sessionid_ss": "940f20dc1091d054232c70a25029192a",
    "sid_tt": "940f20dc1091d054232c70a25029192a",
    "sid_guard": "940f20dc1091d054232c70a25029192a%7C1790068025%7C5184000%7CSat%2C+21-Nov-2026+09%3A07%3A05+GMT",
    "uid_tt": "2b60f390fba283205e4c04d4ecc8f244",
    "uid_tt_ss": "2b60f390fba283205e4c04d4ecc8f244",
    "csrf_session_id": "ab73b66ffba51695639f90815586c3ff",
    "odin_tt": "77abed42b472fcb27284e13eb37566cc89f1e600cc8f0b0a7f8db6fed9995cb089047f543ecd2acd511f4716d3488a8f",
    "ttwid": "1%7CyYaMzlaKTlhpszLI6Udg_YyMAPPbVHn-DriRlcYKIqc%7C1790065066%7C4c97ef913ec18e90638acbac6608e6a84fdaeb3c5d19fb9c37e9d36316c69ea5",

    "ecom_us_lt_buyin": "7750efcca985c55eef937e98e2641266e1554fd61c478591e59ec441c6b01d7e",
    "ecom_us_lt_ss_buyin": "7750efcca985c55eef937e98e2641266e1554fd61c478591e59ec441c6b01d7e",
    "ecom_us_lt_buyin_top": "7750efcca985c55eef937e98e2641266e1554fd61c478591e59ec441c6b01d7e",
    "ecom_us_lt_ss_buyin_top": "7750efcca985c55eef937e98e2641266e1554fd61c478591e59ec441c6b01d7e",
    "ucas_c0_buyin": "Cj4KBTEuMC4wEI-IgdaYtY7Zahi9LyDQkbDk5o2YBiiPETD-2dftFkCs88jVBkisp4XYBlCovJCs4ras82BYfhIUnFoeOE4vM0EAvRYxXtOii_dYTC8",
    "ucas_c0_ss_buyin": "Cj4KBTEuMC4wEI-IgdaYtY7Zahi9LyDQkbDk5o2YBiiPETD-2dftFkCs88jVBkisp4XYBlCovJCs4ras82BYfhIUnFoeOE4vM0EAvRYxXtOii_dYTC8",
    "SASID": "SID2_7688270681087852823",
    "BUYIN_SASID": "SID2_7688270681087852823",
    "buyin_shop_type": "24",
    "buyin_shop_type_v2": "24",
    "buyin_account_child_type": "1128",
    "buyin_account_child_type_v2": "1128",
    "buyin_app_id": "1128",
    "buyin_app_id_v2": "1128",

    "ecom_us_lt_compass": "8164d7acea0f4556f03d4ec6e29caad9f9bfd9f71d919f05043406a26d3cc12c",
    "ecom_us_lt_ss_compass": "8164d7acea0f4556f03d4ec6e29caad9f9bfd9f71d919f05043406a26d3cc12c",
    "ucas_c0_compass": "Cj4KBTEuMC4wEK6IjJTVppHZahi9LyDQkbDk5o2YBiiPETD-2dftFkC5isnVBki5voXYBlCovJCs4ras82BYfhIULSnGEPW4onS-Q3RXySojgFY4CX0",
    "ucas_c0_ss_compass": "Cj4KBTEuMC4wEK6IjJTVppHZahi9LyDQkbDk5o2YBiiPETD-2dftFkC5isnVBki5voXYBlCovJCs4ras82BYfhIULSnGEPW4onS-Q3RXySojgFY4CX0",
    "LUOPAN_DT": "session_7688283028829978882",
    "COMPASS_LUOPAN_DT": "session_7688283028829978882",
}


def dy_by_debug_cookies(port=9222):
    """
    调试用: 直接从已登录的 Chromium 里把两个 host 的 cookie 合起来, 免得 TEST_COOKIES 过期。
    取不到浏览器时回落到 TEST_COOKIES。
    """
    try:
        from DrissionPage import Chromium
        browser = Chromium(port)
        cookies = {}
        for tab in browser.get_tabs():
            if 'jinritemai' in (tab.url or ''):
                cookies.update(tab.cookies().as_dict())
        return cookies or dict(TEST_COOKIES)
    except Exception:
        return dict(TEST_COOKIES)

# 测试直播间: vivo官方旗舰店
TEST_KOL_ID = '77172059529'
TEST_LIVE_ROOM_ID = '7687771249879141129'
TEST_STAT_DATE = '2026-09-21'

import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import json
import glob
import argparse
import datetime

import requests
import pandas

from dy_by_common import DATA_SOURCE
from dy_by_live_list import DATE_TYPE_30D
from dy_by_info import (DATA_TYPES, FIELD_MATRIX, FIELD_CN, TYPE_INDEX, NO_COLUMN,
                        dy_by_info)

# ───────────────────── 巨量百应 · 自动化采集入口 ─────────────────────
# 本模块是 dy_by_auto skill 的执行端, 串起「读 cookie -> 采集 -> 解析落盘 -> 导出 excel」。
# 登录和 cookie 获取不在这里, 由同目录的 dy_by_login.py 负责, 两边共用同一个 by_cookies.json。
#
# 目录约定(全部挂在 skill 根的 data/ 下, 与 dy_by_login.py 的 COOKIE_FILE 同根):
#   data/by_cookies.json        登录脚本写的 cookie, 本模块只读
#   data/raw/<stat_date>/       裸响应, 由 dy_by_common.by_dump_raw 按请求顺序落盘
#   data/parse/                 by_info 落库行(json), 一天一个文件
#   data/excel/                 汇总工作簿, 一个 data_type 一个 sheet
#
# 关键坑 1: raw 的落盘是靠 by_cp['raw_dir'] 触发的, 这个 key 必须在调 dy_by_info 之前塞进
#           by_cp —— 请求层拿不到就静默不落盘, 不会报错, 很容易以为是采集没跑。
# 关键坑 2: 每个 stat_date 用独立的 raw 子目录。同一天重跑会在目录里叠新文件而不是覆盖,
#           排查时以序号最大的那批为准; 要干净重跑就先删掉该日目录。
# 关键坑 3: excel 每个 sheet 只输出该粒度矩阵标 1 的列(hour 有 36 个 no_column,
#           product 有 55 个), 全列输出会糊成一片没法看。json 落的是全量字段, 以它为准。
# 关键坑 4: 单日采集要发 1 + 3N 个请求(N=场次数), 其中 author 系路径每个都要过一次
#           node+jsdom 签名, 冷启 1.5~3 秒。一天一场的情况整轮大约 10~20 秒,
#           跑多天时不要并发 —— 百应对同 cookie 的高频请求会直接返 11001。

SKILL_ROOT = os.path.dirname(os.path.dirname(file_path))
DATA_ROOT = os.path.join(SKILL_ROOT, 'data')
RAW_DIR = os.path.join(DATA_ROOT, 'raw')
PARSE_DIR = os.path.join(DATA_ROOT, 'parse')
EXCEL_DIR = os.path.join(DATA_ROOT, 'excel')
COOKIE_FILE = os.path.join(DATA_ROOT, 'by_cookies.json')

# excel 的 sheet 名。data_type 本身是英文枚举, 工作簿是给人看的, 一并中文化
SHEET_CN = {'day': '每日', 'hour': '分时', 'anchor': '主播', 'product': '商品'}

# 采集账号与项目归属, 正式跑从 cookies_platform / 项目配置取, 这里给 vivo 官方旗舰店做默认
DEFAULT_ACCOUNT = {
    'by_kol_id': '77172059529',
    'by_account': 'vivo官方旗舰店',
    'kol_id': '77172059529',
    'nickname': 'vivo官方旗舰店',
    'brand_name': 'vivo',
    'project_id': 1,
    'project_name': 'vivo抖音直播间监控',
}


def dy_by_make_dirs():
    """建目录。data/raw、data/parse、data/excel 三个一起建, 缺一个后面就写不下去"""
    for path in (DATA_ROOT, RAW_DIR, PARSE_DIR, EXCEL_DIR):
        os.makedirs(path, exist_ok=True)
    return {'data': DATA_ROOT, 'raw': RAW_DIR, 'parse': PARSE_DIR, 'excel': EXCEL_DIR}


def dy_by_load_cookies(cookie_file=COOKIE_FILE):
    """
    读登录脚本落的 cookie。文件不存在或者结构不对都直接抛, 不要用半套 cookie 去发请求 ——
    只带 buyin 那半套时 compass 接口会返回 data 为空的 200, 看起来像「这天没数据」。
    """
    if not os.path.isfile(cookie_file):
        raise FileNotFoundError(f'cookie 文件不存在: {cookie_file}，请先运行 dy_by_login.py')
    with open(cookie_file, encoding='utf-8') as f:
        payload = json.load(f)
    cookies = payload.get('cookies') or {}
    if not cookies.get('sessionid'):
        raise ValueError(f'cookie 文件缺少 sessionid，登录态无效: {cookie_file}')
    missing = [k for k in ('ecom_us_lt_buyin', 'ecom_us_lt_compass') if k not in cookies]
    if missing:
        print(f'[warn] cookie 缺少 {missing}，compass 侧接口可能取不到数据，建议重新登录')
    return payload


def dy_by_date_range(start_date, end_date):
    start = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.datetime.strptime(end_date, '%Y-%m-%d').date()
    if end < start:
        start, end = end, start
    return [(start + datetime.timedelta(days=i)).strftime('%Y-%m-%d')
            for i in range((end - start).days + 1)]


def dy_by_save_parse(rows, stat_date, parse_dir=PARSE_DIR):
    """解析后的落库行按日落 json, 全量字段(含 no_column), 以它为准而不是 excel"""
    os.makedirs(parse_dir, exist_ok=True)
    full_path = os.path.join(parse_dir, f'by_info_{stat_date}.json')
    with open(full_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    return full_path


def dy_by_collect_date(session, by_cp, stat_date, data_types=DATA_TYPES, shifts=None,
                       date_type=DATE_TYPE_30D, with_product_detail=False,
                       raw_dir=RAW_DIR, parse_dir=PARSE_DIR):
    """采一天: 裸响应进 raw/<stat_date>/, 落库行进 parse/by_info_<stat_date>.json"""
    day_cp = dict(by_cp)
    day_cp['raw_dir'] = os.path.join(raw_dir, stat_date)
    rows = dy_by_info(session, day_cp, stat_date, data_types=data_types, shifts=shifts,
                      date_type=date_type, with_product_detail=with_product_detail)
    parse_file = dy_by_save_parse(rows, stat_date, parse_dir=parse_dir)
    raw_count = len(glob.glob(os.path.join(day_cp['raw_dir'], '*.json')))
    return {'stat_date': stat_date, 'rows': rows, 'parse_file': parse_file,
            'raw_dir': day_cp['raw_dir'], 'raw_count': raw_count}


def dy_by_columns(data_type):
    """该粒度实际有值的列, 顺序按 FIELD_MATRIX(即设计表字段顺序)"""
    idx = TYPE_INDEX[data_type] + 1
    return [field[0] for field in FIELD_MATRIX if field[idx]]


def dy_by_to_excel(rows, excel_file):
    """
    汇总工作簿: 一个 data_type 一个 sheet, 列按设计表顺序且只留该粒度有的列。
    表头用设计表的中文名(FIELD_CN), 字段名对不上时回落英文名 —— 宁可表头难看,
    也不要因为漏配中文名就把这一列丢掉。落库/parse 的 json 仍然是英文字段名。
    没有任何行的粒度不建空 sheet(openpyxl 允许空 sheet, 但看起来像采漏了)。
    """
    os.makedirs(os.path.dirname(excel_file), exist_ok=True)
    grouped = {}
    for row in rows:
        grouped.setdefault(row['data_type'], []).append(row)

    with pandas.ExcelWriter(excel_file, engine='openpyxl') as writer:
        for data_type in DATA_TYPES:
            type_rows = grouped.get(data_type)
            if not type_rows:
                continue
            columns = dy_by_columns(data_type)
            frame = pandas.DataFrame(
                [{col: row.get(col) for col in columns} for row in type_rows],
                columns=columns)
            frame.columns = [FIELD_CN.get(col, col) for col in columns]
            frame.to_excel(writer, sheet_name=SHEET_CN.get(data_type, data_type), index=False)
    return excel_file


def dy_by_run(start_date, end_date=None, data_types=DATA_TYPES, account=None, shifts=None,
              cookie_file=COOKIE_FILE, date_type=DATE_TYPE_30D, with_product_detail=False,
              proxies=None):
    """
    一轮完整采集。返回 {'dirs', 'dates', 'rows', 'parse_files', 'excel_file', 'fails'}。
    某一天炸了不中断整轮, 记到 fails 里继续下一天。
    """
    dirs = dy_by_make_dirs()
    payload = dy_by_load_cookies(cookie_file)

    by_cp = dict(DEFAULT_ACCOUNT)
    by_cp.update(account or {})
    by_cp['cookies'] = payload['cookies']
    by_cp['proxies'] = proxies or {}

    dates = dy_by_date_range(start_date, end_date or start_date)
    session = requests.Session()
    result = {'dirs': dirs, 'dates': dates, 'rows': [], 'parse_files': [], 'fails': [],
              'cookie_time': payload.get('update_time')}

    for stat_date in dates:
        try:
            day = dy_by_collect_date(session, by_cp, stat_date, data_types=data_types,
                                     shifts=shifts, date_type=date_type,
                                     with_product_detail=with_product_detail,
                                     raw_dir=dirs['raw'], parse_dir=dirs['parse'])
        except Exception as e:
            result['fails'].append(f'{stat_date} {type(e).__name__}: {e}')
            print(f'[fail] {stat_date} {type(e).__name__}: {e}')
            continue
        result['rows'].extend(day['rows'])
        result['parse_files'].append(day['parse_file'])
        bad = [r['state_desc'] for r in day['rows'] if r.get('crawl_status') != '1']
        print(f"[ok] {stat_date} 行数={len(day['rows'])} 裸响应={day['raw_count']} "
              f"异常={bad[0] if bad else '无'}")

    if result['rows']:
        stamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
        name = f'dy_by_{dates[0]}_{dates[-1]}_{stamp}.xlsx'
        result['excel_file'] = dy_by_to_excel(result['rows'],
                                              os.path.join(dirs['excel'], name))
    else:
        result['excel_file'] = None
    return result


if __name__ == '__main__':
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
    parser = argparse.ArgumentParser(description=f'{DATA_SOURCE}直播数据采集')
    parser.add_argument('--start-date', default=yesterday, help='起始日期 YYYY-MM-DD，默认昨天')
    parser.add_argument('--end-date', default=None, help='结束日期 YYYY-MM-DD，默认与起始日期相同')
    parser.add_argument('--data-types', default='day,hour,product',
                        help='粒度，逗号分隔，可选 day/hour/anchor/product（anchor 需排班表）')
    parser.add_argument('--by-kol-id', default=None, help='达人ID，默认用内置 vivo 官方旗舰店')
    parser.add_argument('--by-account', default=None, help='达人账号名')
    parser.add_argument('--cookie-file', default=COOKIE_FILE, help='cookie 文件路径')
    parser.add_argument('--with-product-detail', action='store_true',
                        help='额外采商品明细（请求量翻倍，默认关）')
    parser.add_argument('--make-dirs-only', action='store_true', help='只建目录不采集')
    args = parser.parse_args()

    if args.make_dirs_only:
        for key, path in dy_by_make_dirs().items():
            print(f'{key}={path}')
        sys.exit(0)

    account = {}
    if args.by_kol_id:
        account.update({'by_kol_id': args.by_kol_id, 'kol_id': args.by_kol_id})
    if args.by_account:
        account.update({'by_account': args.by_account, 'nickname': args.by_account})

    result = dy_by_run(args.start_date, args.end_date,
                       data_types=tuple(t.strip() for t in args.data_types.split(',') if t.strip()),
                       account=account, cookie_file=args.cookie_file,
                       with_product_detail=args.with_product_detail)

    print(f'\nDATA_DIR={result["dirs"]["data"]}')
    print(f'RAW_DIR={result["dirs"]["raw"]}')
    print(f'PARSE_FILES={len(result["parse_files"])}')
    print(f'ROWS={len(result["rows"])}')
    print(f'EXCEL_FILE={result["excel_file"]}')
    if result['fails']:
        print('FAILS=' + ' | '.join(result['fails']))
    sys.exit(1 if result['fails'] or not result['rows'] else 0)

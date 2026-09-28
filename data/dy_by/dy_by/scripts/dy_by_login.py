import os
import sys
import json
import time
import logging
import argparse
import datetime
import traceback

from DrissionPage import Chromium

file_path = os.path.abspath(__file__)
SKILL_ROOT = os.path.dirname(os.path.dirname(file_path))

# skill 要能单独打包发给别人，这里不依赖项目里的 all_utils，用标准库自己起一个 logger。
# 接回内部项目时把这段换成 all_utils.get_logger('dy_by_login.log') 即可，其余代码不用动。
logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                    format='%(asctime)s | %(levelname)-7s | %(message)s')
logger = logging.getLogger('dy_by_login')

# 达人工作台登录页(抖音App扫码)，二维码在 open.douyin.com/qrconnect 的 iframe 里
BY_LOGIN_URL = 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24'
# 登录后的工作台首页，未登录访问会被重定向到 www.douyinec.com(抖音电商官网)
BY_HOME_URL = 'https://buyin.jinritemai.com/dashboard'
# 电商罗盘首页。buyin 和 compass 是两套独立登录态，只拿 buyin 的 cookie
# 调 /compass_api/** 会得到 data 为空的 200，所以必须顺带开一次 compass 把
# ecom_us_lt_compass / ucas_c0_compass / LUOPAN_DT 这组也带回来。
COMPASS_HOME_URL = 'https://compass.jinritemai.com/'

DEFAULT_PORT = 9222
# 默认落盘位置，dy_by_run.py 从同一个路径读
COOKIE_FILE = os.path.join(SKILL_ROOT, 'data', 'by_cookies.json')


def dy_by_is_login(tab):
    # 通过URL判断是否登录：
    # 未登录访问 /dashboard 会被踢到 https://www.douyinec.com/
    # 未登录停留在登录页时URL为 https://buyin.jinritemai.com/mpa/account/xxx
    # 已登录时URL在 buyin.jinritemai.com 的业务路径下
    url = tab.url

    if 'douyinec.com' in url:
        return '未登录'
    elif '/mpa/account/' in url:
        return '未登录'
    elif 'buyin.jinritemai.com' in url:
        return '已登录'
    else:
        return '未知情况'


def dy_by_open_login(tab):
    """只把扫码页打开就返回，不阻塞等待。skill 流程里由用户扫完码再回来重新判断"""
    if '/mpa/account/login' not in tab.url:
        tab.get(BY_LOGIN_URL)
        tab.wait.doc_loaded()
        time.sleep(2)
    return tab.url


def dy_by_login(tab, wait_timeout=300, check_interval=10):
    # 不做账号密码自动登录，只负责把扫码页打开，然后每 check_interval 秒扫描一次登录状态，
    # 等人工用抖音App扫码；扫码成功后页面会自己跳回 buyin.jinritemai.com 业务页
    dy_by_open_login(tab)

    logger.info(f'请使用抖音App扫码登录，最多等待{wait_timeout}秒，每{check_interval}秒检查一次......')

    end_time = time.time() + wait_timeout
    while time.time() < end_time:
        time.sleep(check_interval)
        # 注意：这里只读URL，不能refresh，刷新会导致二维码重置
        login_info = dy_by_is_login(tab)
        left_time = int(end_time - time.time())
        logger.info(f'扫码等待中，当前状态：{login_info}，当前URL：{tab.url}，剩余{left_time}秒')
        if login_info == '已登录':
            # 等跳转后的业务页加载完，cookie 才是全的
            tab.wait.doc_loaded()
            time.sleep(3)
            return '已登录'

    return f'等待扫码超时({wait_timeout}秒)'


def dy_by_compass_cookies(browser):
    """
    顺带开一次电商罗盘，把 compass 那套登录态 cookie 带回来。
    buyin 已登录时 compass 会自动复用同一个 sessionid 完成鉴权，不需要再扫一次码。
    """
    tab = None
    try:
        tabs = browser.get_tabs(url='compass.jinritemai.com')
        if tabs:
            tab = tabs[-1]
            tab.get(COMPASS_HOME_URL)
        else:
            tab = browser.new_tab(url=COMPASS_HOME_URL)
        tab.wait.doc_loaded()
        time.sleep(3)
        return tab.cookies().as_dict()
    except Exception as e:
        logger.error(f'获取电商罗盘cookie失败：{e}')
        return {}


def dy_by_get_cookies(browser, user_name='', wait_timeout=300, check_interval=10):
    send_data = {}
    browser_tabs = browser.get_tabs(url='buyin.jinritemai.com')
    if browser_tabs:
        browser_tab = browser_tabs[-1]
    else:
        browser.new_tab(url=BY_HOME_URL)
        browser_tab = browser.get_tab(url='buyin.jinritemai.com')

    browser.activate_tab(browser_tab)
    time.sleep(1)

    # 先用首页探一次登录态：已登录会停在 buyin，未登录会被重定向到 douyinec.com
    browser_tab.get(BY_HOME_URL)
    browser_tab.wait.load_start(timeout=20)
    browser_tab.wait.doc_loaded()
    browser_tab.wait(0.5)
    time.sleep(2)

    login_info = ''
    try:
        login_info = dy_by_is_login(browser_tab)
        logger.info(f'{user_name}当前是否登录结果为：{login_info}')

        if login_info == '未登录':
            if wait_timeout:
                login_info = dy_by_login(browser_tab, wait_timeout=wait_timeout,
                                         check_interval=check_interval)
                logger.info(f'{user_name}扫码登录结果为：{login_info}')
            else:
                # wait_timeout=0 是 skill 的非阻塞模式：只把二维码亮出来就返回，
                # 交给上层提示用户扫码，扫完再调一次本函数重新判断
                dy_by_open_login(browser_tab)
                logger.info(f'{user_name}已打开扫码页，等待人工扫码后重新检查')
        elif login_info == '未知情况':
            logger.error(f'{user_name}巨量百应自动登录出现未知情况，当前URL：{browser_tab.url}')
    except Exception as e:
        logger.error(f'{user_name}登录时出现错误：{e}\n{traceback.format_exc()}')

    login_info = dy_by_is_login(browser_tab)
    send_data['login_info'] = login_info

    if login_info == '已登录':
        cookies = browser_tab.cookies().as_dict()
        cookies.update(dy_by_compass_cookies(browser))
        send_data['cookies'] = cookies
    else:
        # send_info = send_feishu_message(f'{user_name}巨量百应登录出现问题，请及时查看\n登录信息为:\n{login_info}')
        # logger.info(f'发送飞书结果为：{send_info}')
        logger.error(f'{user_name}巨量百应登录失败，信息为：{login_info}')
    return send_data


def dy_by_save_cookies(cookies, cookie_file=COOKIE_FILE):
    """cookie 落盘，供 dy_by_run.py 直接读取"""
    os.makedirs(os.path.dirname(cookie_file), exist_ok=True)
    with open(cookie_file, 'w', encoding='utf-8') as f:
        json.dump({'platform': '巨量百应',
                   'update_time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                   'cookies': cookies}, f, ensure_ascii=False, indent=2)
    return cookie_file


def dy_by_run_login(port=DEFAULT_PORT, user_name='', wait_timeout=0, check_interval=10,
                    cookie_file=COOKIE_FILE):
    """
    连上指定调试端口的浏览器走一遍登录检查。
    wait_timeout=0 为非阻塞模式：未登录时只弹二维码就返回，由调用方提示人工扫码后重试。
    """
    browser = Chromium(port)
    send_data = dy_by_get_cookies(browser, user_name=user_name,
                                  wait_timeout=wait_timeout, check_interval=check_interval)
    if send_data.get('cookies'):
        send_data['cookie_file'] = dy_by_save_cookies(send_data['cookies'], cookie_file)
    return send_data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='巨量百应登录态检查与 cookie 获取')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT,
                        help=f'Chrome 远程调试端口，默认 {DEFAULT_PORT}')
    parser.add_argument('--user-name', default='测试账号', help='账号标识，仅用于日志')
    parser.add_argument('--wait-timeout', type=int, default=0,
                        help='未登录时阻塞等待扫码的秒数，0 表示只弹二维码就返回（默认）')
    parser.add_argument('--check-interval', type=int, default=10, help='阻塞模式下的轮询间隔秒数')
    parser.add_argument('--cookie-file', default=COOKIE_FILE, help='cookie 落盘路径')
    args = parser.parse_args()

    send_data = dy_by_run_login(port=args.port, user_name=args.user_name,
                                wait_timeout=args.wait_timeout,
                                check_interval=args.check_interval,
                                cookie_file=args.cookie_file)

    login_info = send_data.get('login_info') or '未知情况'
    print(f'STATE={login_info}')
    print(f'COOKIE_COUNT={len(send_data.get("cookies") or {})}')
    if send_data.get('cookie_file'):
        print(f'COOKIE_FILE={send_data["cookie_file"]}')
    # 已登录 0 / 未登录 2 / 其他 1，供 skill 分支判断
    sys.exit(0 if login_info == '已登录' else (2 if login_info == '未登录' else 1))

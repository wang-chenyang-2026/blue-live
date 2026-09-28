import os
import sys
file_path = os.path.abspath(__file__)
# skill 自带的模块目录, 保证从任何 cwd 直接跑脚本都能 import 到同级的 dy_by_*
sys.path.insert(0, os.path.dirname(file_path))

import json
import subprocess

# ───────────────────── 巨量百应 a_bogus 签名桥 ─────────────────────
# /compass_api/author/** 前缀强制校验 a_bogus, 裸请求返回 st=11001「当前网络不稳定」。
# 签名算法是 BDMS 1.0.1.20 的 JSVMP, 没有公开实现, 走 node + jsdom 黑盒复用,
# 细节见 by_sign/pure-by-abogus.js 的注释。
#
# 关键坑 1: a_bogus 对整条 query 串原样签名, 签完的 URL 必须原样发出去:
#           不能改参数顺序、不能补参数、不能二次 urlencode, 否则照样 11001。
#           所以本模块返回的是完整 URL 字符串, 上层不要再传 params。
# 关键坑 2: 签名带时效(实测分钟级), 不能缓存复用, 每个请求签一次。
# 关键坑 3: node 进程冷启约 1.5~3 秒, 一场次 4 个接口就是十几秒。
#           所以 dy_by_get 只在 SIGN_PREFIXES 命中的路径上签, 其余裸发。
# 关键坑 4: jsdom 装在 npm 全局(npm install -g jsdom), 而 node 默认只沿 cwd 往上找
#           node_modules, 找不到全局目录。所以必须把 `npm root -g` 塞进子进程的
#           NODE_PATH, 否则签名器 require('jsdom') 直接抛, by_sign_url 静默回落
#           未签名 URL, 表现就是接口全返 11001。

SIGN_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'by_sign', 'pure-by-abogus.js')

# 需要 a_bogus 的路径前缀。content_live 那套实测不校验, 别白等 node
SIGN_PREFIXES = ('/compass_api/author/',)

NODE_TIMEOUT = 60

# npm root -g 要起一次 npm 进程(约 1 秒), 全局目录一个进程内不会变, 查一次就够
_NODE_PATH = []


def by_node_path():
    """npm 全局 node_modules 目录, 查不到返回 '' """
    if not _NODE_PATH:
        try:
            result = subprocess.run('npm root -g', shell=True, capture_output=True, timeout=30)
            root = result.stdout.decode('utf-8', 'ignore').strip()
            _NODE_PATH.append(root if os.path.isdir(root) else '')
        except Exception:
            _NODE_PATH.append('')
    return _NODE_PATH[0]


def by_node_env(extra=None):
    """子进程环境: 把 npm 全局目录并进 NODE_PATH, 让 require('jsdom') 能找到全局包"""
    env = dict(os.environ)
    paths = [p for p in (by_node_path(), env.get('NODE_PATH')) if p]
    if paths:
        env['NODE_PATH'] = os.pathsep.join(paths)
    env.update(extra or {})
    return env


def by_need_sign(path):
    """判断该路径是否必须带 a_bogus"""
    return any(path.startswith(prefix) for prefix in SIGN_PREFIXES)


def by_cookie_header(cookies):
    """dict -> 'k=v; k=v', 给 node 侧 document.cookie 用"""
    if not cookies:
        return ''
    return '; '.join(f'{k}={v}' for k, v in cookies.items())


def by_sign_url(url, cookies=None, page_url=None, node='node'):
    """
    把未签名的完整 URL 交给 node 签名, 返回带 msToken + a_bogus 的完整 URL。
    签失败(node 不在 / 超时 / SDK 没产出)时原样返回入参, 由上层拿 11001 去记 state_desc。
    """
    cookie_file = None
    try:
        cmd = [node, SIGN_SCRIPT, url]
        if cookies:
            import tempfile
            fd, cookie_file = tempfile.mkstemp(suffix='.txt')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(by_cookie_header(cookies))
            cmd.append(cookie_file)
        env = by_node_env({'BY_PAGE_URL': page_url} if page_url else None)
        result = subprocess.run(cmd, capture_output=True, timeout=NODE_TIMEOUT,
                                cwd=os.path.dirname(SIGN_SCRIPT), env=env)
        data = json.loads(result.stdout.decode('utf-8', 'ignore').strip() or '{}')
        return data.get('finalUrl') or url
    except Exception:
        return url
    finally:
        if cookie_file and os.path.exists(cookie_file):
            os.remove(cookie_file)


if __name__ == '__main__':
    from dy_by_common import BASE_COMPASS, dy_by_debug_cookies, TEST_LIVE_ROOM_ID

    test_url = (f'{BASE_COMPASS}/compass_api/author/live/live_room_detail/basic_info'
                f'?live_room_id={TEST_LIVE_ROOM_ID}&_lid=692038304879')
    print(by_sign_url(test_url, dy_by_debug_cookies()))

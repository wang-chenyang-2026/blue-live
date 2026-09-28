import os
import sys
import json
import shutil
import subprocess
import importlib.util

# ───────────────────── dy_by_auto · 环境自检 ─────────────────────
# skill 第一步跑这个。只探测不安装, 把缺什么打出来交给上层问用户是否安装。
# 退出码: 0 = 全通过, 2 = 有必需项缺失, 3 = 只有可选项缺失(登录态/浏览器)。
#
# 关键坑: jsdom 是签名器 by_sign/pure-by-abogus.js 的硬依赖, 缺了 /compass_api/author/**
#         全部返 11001(HTTP 仍是 200), 表现是「接口通但没数据」, 很难往环境上想。

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_DIR = os.path.join(PROJECT_ROOT, 'scripts')

PY_PACKAGES = ('requests', 'DrissionPage', 'pandas', 'openpyxl')
NODE_PACKAGES = ('jsdom',)
REQUIRED_FILES = (
    os.path.join(SCRIPT_DIR, 'dy_by_login.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_common.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_info.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_live_list.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_live_detail.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_product.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_run.py'),
    os.path.join(SCRIPT_DIR, 'dy_by_sign.py'),
    os.path.join(SCRIPT_DIR, 'by_sign', 'pure-by-abogus.js'),
)


def check_python():
    items = [{'name': 'python', 'ok': sys.version_info >= (3, 8),
              'detail': sys.version.split()[0], 'fix': '需要 Python 3.8+'}]
    for module in PY_PACKAGES:
        ok = importlib.util.find_spec(module) is not None
        items.append({'name': f'py:{module}', 'ok': ok,
                      'detail': '已安装' if ok else '未安装',
                      'fix': 'pip install -r requirements.txt（在 skill 根目录）'})
    return items


def check_node():
    node = shutil.which('node')
    items = [{'name': 'node', 'ok': bool(node), 'detail': node or '未找到',
              'fix': '安装 Node.js 18+ 并加入 PATH'}]
    if not node:
        for package in NODE_PACKAGES:
            items.append({'name': f'node:{package}', 'ok': False, 'detail': 'node 缺失无法检查',
                          'fix': 'npm install -g jsdom'})
        return items
    # 探测方式必须和 dy_by_sign.by_sign_url 一致(同样带上 NODE_PATH),
    # 否则这里报 OK 而实际签名时 require 不到, 会以为是风控问题
    sys.path.insert(0, SCRIPT_DIR)
    from dy_by_sign import by_node_env, by_node_path
    env = by_node_env()
    items.append({'name': 'npm root -g', 'ok': bool(by_node_path()),
                  'detail': by_node_path() or '未取到（全局包将无法被 require）',
                  'fix': '确认 npm 在 PATH 里'})
    for package in NODE_PACKAGES:
        proc = subprocess.run([node, '-e', f'require.resolve("{package}")'],
                              cwd=os.path.join(SCRIPT_DIR, 'by_sign'),
                              env=env, capture_output=True, text=True)
        ok = proc.returncode == 0
        items.append({'name': f'node:{package}', 'ok': ok,
                      'detail': '可解析' if ok else '未安装',
                      'fix': 'npm install -g jsdom'})
    return items


def check_files():
    return [{'name': os.path.relpath(path, PROJECT_ROOT), 'ok': os.path.isfile(path),
             'detail': '存在' if os.path.isfile(path) else '缺失',
             'fix': '仓库文件缺失，检查代码是否完整'} for path in REQUIRED_FILES]


def check_browser(port=9222):
    """浏览器是可选项: 没开只是不能扫码登录, 已有 cookie 时照样能采"""
    try:
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=5) as resp:
            info = json.loads(resp.read().decode('utf-8'))
        return [{'name': f'chrome:{port}', 'ok': True, 'optional': True,
                 'detail': info.get('Browser', ''), 'fix': ''}]
    except Exception as e:
        return [{'name': f'chrome:{port}', 'ok': False, 'optional': True,
                 'detail': f'未连上({type(e).__name__})',
                 'fix': f'以 --remote-debugging-port={port} 启动 Chrome'}]


def check_cookie():
    path = os.path.join(PROJECT_ROOT, 'data', 'by_cookies.json')
    if not os.path.isfile(path):
        return [{'name': 'cookie', 'ok': False, 'optional': True, 'detail': '未获取',
                 'fix': 'python scripts/dy_by_login.py --port 9222'}]
    try:
        with open(path, encoding='utf-8') as f:
            payload = json.load(f)
        cookies = payload.get('cookies') or {}
        both = all(k in cookies for k in ('ecom_us_lt_buyin', 'ecom_us_lt_compass'))
        return [{'name': 'cookie', 'ok': both, 'optional': True,
                 'detail': f"{len(cookies)} 条 更新于 {payload.get('update_time')}"
                           + ('' if both else '（缺 buyin/compass 其一）'),
                 'fix': 'python scripts/dy_by_login.py --port 9222'}]
    except (OSError, ValueError) as e:
        return [{'name': 'cookie', 'ok': False, 'optional': True, 'detail': f'读取失败 {e}',
                 'fix': 'python scripts/dy_by_login.py --port 9222'}]


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9222
    items = check_python() + check_node() + check_files() + check_browser(port) + check_cookie()

    for item in items:
        flag = 'OK  ' if item['ok'] else ('WARN' if item.get('optional') else 'MISS')
        print(f"{flag} {item['name']}: {item['detail']}")

    required_missing = [i for i in items if not i['ok'] and not i.get('optional')]
    optional_missing = [i for i in items if not i['ok'] and i.get('optional')]

    if required_missing:
        print('\nREQUIRED_MISSING=' + ','.join(i['name'] for i in required_missing))
        print('FIX=' + ' ; '.join(sorted({i['fix'] for i in required_missing})))
    if optional_missing:
        print('\nOPTIONAL_MISSING=' + ','.join(i['name'] for i in optional_missing))
        print('OPTIONAL_FIX=' + ' ; '.join(sorted({i['fix'] for i in optional_missing})))
    if not required_missing and not optional_missing:
        print('\nENV=ready')

    return 2 if required_missing else (3 if optional_missing else 0)


if __name__ == '__main__':
    sys.exit(main())

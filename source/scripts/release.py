#!/usr/bin/env python3
"""Đẩy core mới vào repo cập nhật: python3 scripts/release.py <thư mục repo> "ghi chú" [minBase]"""
import hashlib, json, os, shutil, sys, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'nameoncar---update'))
notes = sys.argv[2] if len(sys.argv) > 2 else ''
min_base = sys.argv[3] if len(sys.argv) > 3 else '1.1.0'
APP_FILES = ['core.js', 'preload.js', 'display.html', 'control.html', 'control.js', 'dist/display.bundle.js', 'assets.json', 'fonts/fonts.css', 'fonts/fonts.json'] \
    + sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'fonts/files/*.woff2')))
SRC_FILES = ['main.js', 'core.js', 'preload.js', 'display.html', 'control.html', 'control.js', 'src/display.js', 'assets.json',
             'package.json', 'package-lock.json', 'HUONG-DAN.txt', 'scripts/release.py', 'scripts/optimize-car.mjs']
version = json.load(open(os.path.join(ROOT, 'package.json')))['version']
shutil.rmtree(os.path.join(repo, 'app'), ignore_errors=True)
files = []
for f in APP_FILES:
    dst = os.path.join(repo, 'app', f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
    files.append({'path': f.replace(os.sep, '/'), 'sha256': hashlib.sha256(open(dst, 'rb').read()).hexdigest()})
for f in SRC_FILES:
    if not os.path.exists(os.path.join(ROOT, f)): continue
    dst = os.path.join(repo, 'source', f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
# model 3D: chỉ copy khi thay đổi (app tải 1 lần rồi cache theo sha256)
os.makedirs(os.path.join(repo, 'assets'), exist_ok=True)
for a in json.load(open(os.path.join(ROOT, 'assets.json'))):
    dst = os.path.join(repo, 'assets', a['file'])
    if not os.path.exists(dst) or hashlib.sha256(open(dst, 'rb').read()).hexdigest() != a['sha256']:
        shutil.copy2(os.path.join(ROOT, 'assets', a['file']), dst)
json.dump({'version': version, 'minBase': min_base, 'notes': notes, 'files': files}, open(os.path.join(repo, 'version.json'), 'w'), indent=2, ensure_ascii=False)
print('release', version, len(files), 'files ->', repo)

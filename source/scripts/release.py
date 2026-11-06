#!/usr/bin/env python3
"""Đẩy core mới vào repo cập nhật: python3 scripts/release.py <thư mục repo> "ghi chú" [minBase]"""
import hashlib, json, os, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'nameoncar---update'))
notes = sys.argv[2] if len(sys.argv) > 2 else ''
min_base = sys.argv[3] if len(sys.argv) > 3 else '1.1.0'
APP_FILES = ['core.js', 'preload.js', 'display.html', 'control.html', 'control.js', 'dist/display.bundle.js']
SRC_FILES = ['main.js', 'core.js', 'preload.js', 'display.html', 'control.html', 'control.js', 'src/display.js',
             'package.json', 'package-lock.json', 'HUONG-DAN.txt', 'scripts/release.py']
version = json.load(open(os.path.join(ROOT, 'package.json')))['version']
shutil.rmtree(os.path.join(repo, 'app'), ignore_errors=True)
files = []
for f in APP_FILES:
    dst = os.path.join(repo, 'app', f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
    files.append({'path': f, 'sha256': hashlib.sha256(open(dst, 'rb').read()).hexdigest()})
for f in SRC_FILES:
    dst = os.path.join(repo, 'source', f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
json.dump({'version': version, 'minBase': min_base, 'notes': notes, 'files': files}, open(os.path.join(repo, 'version.json'), 'w'), indent=2, ensure_ascii=False)
print('release', version, len(files), 'files ->', repo)

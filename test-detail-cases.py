#!/usr/bin/env python3
import subprocess
import re
import time
import json
import os
from pathlib import Path

CASES = [
    'AC-001','AC-002','AC-003','AC-004','AC-005','AC-006','AC-007','AC-008','AC-009','AC-010',
    'AU-002','AU-007','AU-008','AU-011',
    'EC-002','EC-012','EC-020','EC-021','EC-022','EC-029',
    'ED-002','ED-005','ED-020',
    'FN-002','FN-003','FN-005','FN-007','FN-008',
    'FN-010','FN-015','FN-018',
    'FW-001','FW-002','FW-003','FW-004','FW-005','FW-006','FW-007','FW-008','FW-009',
    'FW-011','FW-012','FW-013','FW-014','FW-015','FW-016','FW-017','FW-018','FW-019','FW-020',
    'GV-002','GV-003','GV-005','GV-013',
    'HE-002','HE-005',
]

env = os.environ.copy()
env['AGENT_BROWSER_EXECUTABLE_PATH'] = '/Applications/Chromium.app/Contents/MacOS/Chromium'

def run_cmd(cmd, timeout=30):
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env
        )
        return result.stdout + result.stderr
    except subprocess.TimeoutExpired as e:
        return e.stdout + e.stderr if e.stdout or e.stderr else ""

print(f"{'CASE_ID':<10} | {'STATUS':<8} | {'FIELDS':<6} | NOTES")
print(f"{'-'*10}-+-{'-'*8}-+-{'-'*6}-+-{'-'*50}")

pass_count = 0
fail_count = 0
partial_count = 0
error_count = 0

for case_id in CASES:
    url = f"http://localhost:3000/crawler-practice/dynamic/{case_id}"

    # Open page
    run_cmd(f'agent-browser open "{url}"', timeout=20)

    # Wait for content
    time.sleep(2)

    # Get body length
    body_len_output = run_cmd('agent-browser eval "document.body.textContent.length"', timeout=10)
    bl_match = re.search(r'\d+', body_len_output)
    body_len = int(bl_match.group(0)) if bl_match else 0

    # Check for error
    body_text = run_cmd('agent-browser eval "document.body.textContent"', timeout=10)
    is_err = '模板渲染错误' in body_text

    if is_err:
        print(f"{case_id:<10} | {'ERROR':<8} | {'0':<6} | Template render error")
        error_count += 1
        continue

    # Get field count
    eval_cmd = f'agent-browser eval "document.querySelectorAll(\'.detail-field, [class*=field], [class*=info] dd, [class*=meta] span, [class*=prop], [class*=spec], [class*=param], [class*=attr], [class*=detail]\').length"'
    field_output = run_cmd(eval_cmd, timeout=10)
    f_match = re.search(r'\d+', field_output)
    field_count = int(f_match.group(0)) if f_match else 0

    # Get title
    title_cmd = 'agent-browser eval "document.querySelector(\'.detail-title, h1, h2, [class*=title]\')?.textContent?.trim().substring(0,40)"'
    title_output = run_cmd(title_cmd, timeout=10)
    title = title_output.strip().strip('"').strip()
    if not title or 'null' in title or 'undefined' in title:
        title = '(no title)'

    # Determine status
    if body_len > 200 and field_count > 0:
        status = 'PASS'
        notes = title
        pass_count += 1
    elif body_len > 200:
        status = 'PARTIAL'
        notes = f"content ok, no matched fields | {title}"
        partial_count += 1
    else:
        status = 'FAIL'
        notes = f"bodyLen={body_len} | {title}"
        fail_count += 1

    print(f"{case_id:<10} | {status:<8} | {field_count:<6} | {notes}")

print()
print("=== SUMMARY ===")
print(f"PASS:    {pass_count}")
print(f"PARTIAL: {partial_count}")
print(f"FAIL:    {fail_count}")
print(f"ERROR:   {error_count}")
print(f"TOTAL:   {len(CASES)}")

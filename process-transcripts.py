#!/usr/bin/env python3

import json
import subprocess
import sys
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.absolute()
AUDIO_TO_TEXT_SCRIPT = SCRIPT_DIR / "audio-to-text.sh"

def clean_transcript(text):
    ansi_escape = re.compile(r'\x1b\[[0-9;]*m')
    text = ansi_escape.sub('', text)
    
    lines = text.split('\n')
    cleaned_lines = []
    
    skip_patterns = [
        r'^✓',
        r'^\[CLI\]',
        r'^===',
        r'^Browser',
        r'^Stream Server',
        r'^大模型服务平台',
        r'^体验中心',
        r'^文档',
        r'^API',
        r'^产品与服务',
        r'^登录',
        r'^温馨提示',
        r'^Request ID',
        r'^人工智能',
        r'^模型服务',
        r'^https://',
        r'^http://',
        r'^www\.',
    ]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        skip = False
        for pattern in skip_patterns:
            if re.match(pattern, line):
                skip = True
                break
        
        if not skip and len(line) > 20:
            cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)

def load_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(file_path, data):
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())

def get_transcript(audio_url):
    print(f"  Getting transcript...")
    
    try:
        result = subprocess.run(
            [str(AUDIO_TO_TEXT_SCRIPT), audio_url],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        transcript = clean_transcript(result.stdout)
        
        if transcript and len(transcript) > 100:
            return transcript
        
        return None
        
    except subprocess.TimeoutExpired:
        print(f"  Error: Timeout")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

def process_videos(json_path, force=False):
    data = load_json(json_path)
    videos = data.get('videos', [])
    
    updated_count = 0
    skipped_count = 0
    failed_count = 0
    
    for i, video in enumerate(videos):
        video_id = video.get('id', 'unknown')
        desc = video.get('desc', '')[:50]
        audio_url = video.get('audio', {}).get('url', '')
        
        print(f"\n[{i+1}/{len(videos)}] Video {video_id}")
        print(f"  Desc: {desc}...")
        
        if video.get('transcript') and not force:
            existing = video.get('transcript', '')
            if len(existing) > 100 and not existing.startswith('===') and not existing.startswith('✓') and not existing.startswith('http'):
                print(f"  Already has transcript ({len(existing)} chars), skipping")
                skipped_count += 1
                continue
            else:
                print(f"  Has invalid transcript, re-processing...")
        
        if not audio_url:
            print(f"  No audio URL, skipping")
            skipped_count += 1
            continue
        
        transcript = get_transcript(audio_url)
        
        if transcript:
            video['transcript'] = transcript
            print(f"  Transcript added ({len(transcript)} chars)", flush=True)
            updated_count += 1
            save_json(json_path, data)
        else:
            print(f"  Failed to get transcript")
            failed_count += 1
    
    print(f"\n=== Summary ===")
    print(f"Updated: {updated_count} videos")
    print(f"Failed: {failed_count} videos")
    print(f"Skipped: {skipped_count} videos")
    print(f"Saved to: {json_path}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python process-transcripts.py <json_file> [--force]")
        print("Example: python process-transcripts.py /tmp/douyin-videos.json")
        print("         python process-transcripts.py /tmp/douyin-videos.json --force")
        sys.exit(1)
    
    json_path = sys.argv[1]
    force = '--force' in sys.argv
    
    if not os.path.exists(json_path):
        print(f"Error: File not found: {json_path}")
        sys.exit(1)
    
    if not AUDIO_TO_TEXT_SCRIPT.exists():
        print(f"Error: audio-to-text.sh not found at {AUDIO_TO_TEXT_SCRIPT}")
        sys.exit(1)
    
    print(f"Processing: {json_path}")
    if force:
        print("Force mode: will re-process all videos")
    
    process_videos(json_path, force)

if __name__ == "__main__":
    main()

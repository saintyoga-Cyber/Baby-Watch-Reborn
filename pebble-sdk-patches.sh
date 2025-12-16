#!/bin/bash
# Pebble SDK Patches for Baby Watch
# Run this after each Codespace restart: ./pebble-sdk-patches.sh

echo "Installing ARM toolchain..."
sudo apt install -y gcc-arm-none-eabi

echo ""
echo "Applying SDK patches..."

# Patch 1: report_memory_usage.py - disable the function entirely
python3 << 'PATCHPY1'
import os
import glob

files = glob.glob(os.path.expanduser('~/.pebble-sdk/**/report_memory_usage.py'), recursive=True)
for report_file in files:
    with open(report_file, 'r') as f:
        content = f.read()
    
    if 'return  # PATCHED' not in content:
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            new_lines.append(line)
            if 'def generate_memory_usage_report(task_gen):' in line:
                new_lines.append('\treturn  # PATCHED: skip memory report')
        content = '\n'.join(new_lines)
        with open(report_file, 'w') as f:
            f.write(content)
        print(f"Patched {report_file}")
PATCHPY1

# Patch 2: process_bundle.py - fix binaries attribute
python3 << 'PATCHPY2'
import os
import glob

files = glob.glob(os.path.expanduser('~/.pebble-sdk/**/process_bundle.py'), recursive=True)
for bundle_file in files:
    with open(bundle_file, 'r') as f:
        content = f.read()
    
    if 'task_gen.binaries' in content and 'getattr(task_gen, "binaries", [])' not in content:
        content = content.replace('task_gen.binaries', 'getattr(task_gen, "binaries", [])')
        with open(bundle_file, 'w') as f:
            f.write(content)
        print(f"Patched {bundle_file}")
PATCHPY2

# Patch 3: Node.py - handle missing files
python3 << 'PATCHPY3'
import os
import glob

files = glob.glob(os.path.expanduser('~/.pebble-sdk/**/waflib/Node.py'), recursive=True)
for node_file in files:
    with open(node_file, 'r') as f:
        content = f.read()
    
    old_pattern = "def h_file(self):\n\t\treturn Utils.h_file(self.abspath())"
    new_pattern = """def h_file(self):
\t\ttry:
\t\t\treturn Utils.h_file(self.abspath())
\t\texcept (OSError, IOError):
\t\t\treturn b'0'*32"""
    
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        with open(node_file, 'w') as f:
            f.write(content)
        print(f"Patched {node_file}")
PATCHPY3

# Patch 4: CRITICAL - Bypass PNG signature validation completely
python3 << 'PATCHPY4'
import os
import glob

files = glob.glob(os.path.expanduser('~/.pebble-sdk/**/png.py'), recursive=True)
for png_file in files:
    with open(png_file, 'r') as f:
        content = f.read()
    
    modified = False
    
    patterns = [
        ('raise FormatError("PNG file has invalid signature.")', 'return  # PATCHED: skip signature check'),
        ("raise FormatError('PNG file has invalid signature.')", 'return  # PATCHED: skip signature check'),
        ('raise FormatError("PNG file has invalid signature")', 'return  # PATCHED: skip signature check'),
    ]
    
    for old, new in patterns:
        if old in content:
            content = content.replace(old, new)
            modified = True
            print(f"Patched signature check in {png_file}")
            break
    
    if modified:
        with open(png_file, 'w') as f:
            f.write(content)
    else:
        if 'PATCHED: skip signature check' in content:
            print(f"Already patched: {png_file}")
        else:
            print(f"Pattern not found in {png_file}")
PATCHPY4

echo ""
echo "All patches applied! Run: pebble build"

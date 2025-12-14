#!/bin/bash
# Pebble SDK Patches for Baby Watch
# Run this after each Codespace restart: ./pebble-sdk-patches.sh

echo "Installing ARM toolchain..."
sudo apt install -y gcc-arm-none-eabi

echo ""
echo "Applying SDK patches..."

# Patch 1: report_memory_usage.py - disable PLATFORM dict usage
REPORT_FILE=$(find ~/.pebble-sdk -name "report_memory_usage.py" 2>/dev/null | head -1)
if [ -n "$REPORT_FILE" ]; then
  sed -i 's/def generate_memory_usage_report(task_gen):/def generate_memory_usage_report(task_gen):\n    return/g' "$REPORT_FILE"
  echo "Patched report_memory_usage.py"
fi

# Patch 2: process_bundle.py - fix binaries attribute
BUNDLE_FILE=$(find ~/.pebble-sdk -name "process_bundle.py" 2>/dev/null | head -1)
if [ -n "$BUNDLE_FILE" ]; then
  sed -i 's/task_gen\.binaries/getattr(task_gen, "binaries", [])/g' "$BUNDLE_FILE"
  echo "Patched process_bundle.py"
fi

# Patch 3: Node.py - handle missing files
NODE_FILE=$(find ~/.pebble-sdk -path "*waflib/Node.py" 2>/dev/null | head -1)
if [ -n "$NODE_FILE" ]; then
  python3 << 'PATCH'
import os
node_file = os.popen("find ~/.pebble-sdk -path '*waflib/Node.py' | head -1").read().strip()
with open(node_file, 'r') as f:
    content = f.read()
old = "def h_file(self):\n\t\treturn Utils.h_file(self.abspath())"
new = """def h_file(self):
\t\ttry:
\t\t\treturn Utils.h_file(self.abspath())
\t\texcept (OSError, IOError):
\t\t\treturn b'0'*32"""
if old in content:
    content = content.replace(old, new)
    with open(node_file, 'w') as f:
        f.write(content)
    print("Patched Node.py")
PATCH
fi

echo ""
echo "All patches applied! Run: pebble build"

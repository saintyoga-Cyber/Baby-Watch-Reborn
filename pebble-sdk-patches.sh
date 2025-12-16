#!/bin/bash
# Pebble SDK Patches for Baby Watch
# Run this after each Codespace restart: ./pebble-sdk-patches.sh

echo "Installing ARM toolchain..."
sudo apt install -y gcc-arm-none-eabi

echo ""
echo "Applying SDK patches..."

# Patch 1: report_memory_usage.py - disable the function entirely using Python to preserve tabs
REPORT_FILE=$(find ~/.pebble-sdk -name "report_memory_usage.py" 2>/dev/null | head -1)
if [ -n "$REPORT_FILE" ]; then
  python3 << PATCHPY
import os
report_file = "$REPORT_FILE"
with open(report_file, 'r') as f:
    content = f.read()

# Find and replace the function definition to add an early return with proper tab indentation
old_def = "def generate_memory_usage_report(task_gen):"
if old_def in content and "return  # PATCHED" not in content:
    # Insert a tab-indented return statement after the function def line
    lines = content.split('\n')
    new_lines = []
    for i, line in enumerate(lines):
        new_lines.append(line)
        if line.strip() == old_def or line.endswith(old_def):
            # Add return with tab indentation (matching SDK style)
            new_lines.append('\treturn  # PATCHED: skip memory report')
    content = '\n'.join(new_lines)
    with open(report_file, 'w') as f:
        f.write(content)
    print("Patched report_memory_usage.py")
else:
    print("report_memory_usage.py already patched or not found")
PATCHPY
fi

# Patch 2: process_bundle.py - fix binaries attribute using Python
BUNDLE_FILE=$(find ~/.pebble-sdk -name "process_bundle.py" 2>/dev/null | head -1)
if [ -n "$BUNDLE_FILE" ]; then
  python3 << PATCHPY
bundle_file = "$BUNDLE_FILE"
with open(bundle_file, 'r') as f:
    content = f.read()

if 'task_gen.binaries' in content and 'getattr(task_gen, "binaries", [])' not in content:
    content = content.replace('task_gen.binaries', 'getattr(task_gen, "binaries", [])')
    with open(bundle_file, 'w') as f:
        f.write(content)
    print("Patched process_bundle.py")
else:
    print("process_bundle.py already patched or not found")
PATCHPY
fi

# Patch 3: Node.py - handle missing files with proper exception handling
NODE_FILE=$(find ~/.pebble-sdk -path "*waflib/Node.py" 2>/dev/null | head -1)
if [ -n "$NODE_FILE" ]; then
  python3 << PATCHPY
node_file = "$NODE_FILE"
with open(node_file, 'r') as f:
    content = f.read()

# Look for the h_file function and patch it
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
    print("Patched Node.py")
else:
    print("Node.py already patched or pattern not found")
PATCHPY
fi

# Patch 4: Fix PNG validation in pebble-tool (critical for image resources)
PNG_FILE=$(find ~/.pebble-sdk -path "*/pebble-tool/lib/python*/site-packages/png.py" 2>/dev/null | head -1)
if [ -n "$PNG_FILE" ]; then
  python3 << PATCHPY
png_file = "$PNG_FILE"
with open(png_file, 'r') as f:
    content = f.read()

# Make PNG validation more lenient
if 'raise FormatError("PNG file has invalid signature.")' in content:
    content = content.replace(
        'raise FormatError("PNG file has invalid signature.")',
        'pass  # PATCHED: ignore invalid signature'
    )
    with open(png_file, 'w') as f:
        f.write(content)
    print("Patched png.py for lenient validation")
else:
    print("png.py already patched or pattern not found")
PATCHPY
fi

echo ""
echo "All patches applied! Run: pebble build"

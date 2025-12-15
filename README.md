# Baby Watch Reborn

A revival of the Pebby app - Baby tracking for Pebble smartwatches.

Track bottle feedings, diaper changes, and sleep sessions right from your wrist!

## Features

- **Bottle Tracking**: Log feeding times with one button press
- **Diaper Changes**: Track diaper changes easily
- **Sleep Sessions**: Start and stop sleep tracking
- **Settings Page**: View your logged data on your phone

## Supported Platforms

- Pebble Original (aplite)
- Pebble Time / Time Steel (basalt)
- Pebble Time Round (chalk)
- Pebble 2 (diorite)
- Pebble Time 2 (emery)

## Building the App

### Prerequisites

Use a GitHub Codespace with pebble-codespace template.

### Build Steps

After the Codespace starts (or restarts), run these commands:

```bash
# Navigate to project
cd /workspaces/Baby-Watch-Reborn

# Pull latest code
git pull

# Apply SDK patches (required after every Codespace restart)
chmod +x pebble-sdk-patches.sh
./pebble-sdk-patches.sh

# Build the app
pebble build
```

### Testing

```bash
# Test on emulator (choose your platform)
pebble install --emulator basalt
```

### Download the .pbw file

After building, the .pbw file is located at:
`build/Baby-Watch-Reborn.pbw`

To download:
1. In VS Code sidebar, navigate to `build/` folder
2. Right-click `Baby-Watch-Reborn.pbw`
3. Select "Download..." from the context menu

## IMPORTANT: Enable GitHub Pages for Settings

The settings page is hosted on GitHub Pages. You MUST enable this for the settings to work:

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar)
4. Under "Source", select **Deploy from a branch**
5. Under "Branch", select **main** and **/ (root)**
6. Click **Save**
7. Wait a few minutes for deployment

After enabling, your settings page will be available at:
`https://saintyoga-cyber.github.io/Baby-Watch-Reborn/settings.html`

## Usage

1. Install the .pbw file on your Pebble watch
2. Open the app - you'll see three tracking options
3. Use the side buttons to log:
   - Top button: Bottle/feeding
   - Middle button: Diaper change
   - Bottom button: Start/stop sleep
4. Open settings on phone to view your logged data

## Credits

Original Pebby app by mig.jcb@gmail.com
Revived as Baby Watch Reborn by saintyoga-Cyber

# FLODE Debug Mode

This document explains how to enable verbose debug logging in FLODE.

## How to Enable Debugging

### Option 1: URL Parameter (Recommended)

Add `?debug=true` to the URL when accessing the panel:

```
http://your-ha-instance:8123/flode
```

Append `?debug=true` to the iframe URL in your browser's address bar.

### Option 2: Browser Console

Open the browser's developer tools and run:

```javascript
flodeLogger.setEnabled(true);
```

### Option 3: Local Storage

Set the debug flag in browser's local storage:

```javascript
localStorage.setItem('flode_debug', 'true');
```

## What Gets Logged

The debug system tracks:

### 1. Custom Element Lifecycle

- When the `flode-panel` element is constructed, connected, disconnected
- When the `hass` property is set on the custom element
- What data is in the hass object (states count, services count, etc.)

### 2. App Component Flow

- Whether external hass is provided vs hook hass
- Mode detection (standalone, remote, external)
- Global hass instance setting

### 3. useHass Hook Behavior

- Configuration loading
- Home Assistant environment detection
- Mode determination logic
- WebSocket connection attempts (if applicable)

### 4. Data Flow Tracking

- Global hass instance setting/getting
- States and services availability
- Connection status and errors

## Expected Debug Output

When working correctly, you should see:

```
[FLODE] FlodePanel custom element registered successfully
[FLODE] Setting hass object in custom element { hasHass: true, statesCount: 378, ... }
[FLODE] App component rendering { hasExternalHass: true, ... }
[FLODE] Setting global hass instance { source: 'external', statesCount: 378, ... }
[FLODE] Global hass instance set successfully
```

## Disabling Debug Mode

To turn off debugging:

```javascript
flodeLogger.setEnabled(false);
```

or remove the `debug=true` parameter from the URL.

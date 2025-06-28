# Setup Guide for 3D Runner Game

## Quick Start (No Installation Required)

If you don't have Node.js installed, you can play the game immediately by opening `standalone-game.html` in your web browser. This version includes all the game features and works without any installation.

## Full SvelteKit Setup (Recommended)

### Step 1: Install Node.js

1. Go to [https://nodejs.org/](https://nodejs.org/)
2. Download the LTS (Long Term Support) version
3. Run the installer and follow the setup wizard
4. Verify installation by opening a terminal/command prompt and running:
   ```bash
   node --version
   npm --version
   ```

### Step 2: Install Dependencies

Open a terminal/command prompt in the project directory and run:

```bash
npm install
```

### Step 3: Start Development Server

```bash
npm run dev
```

The game will be available at `http://localhost:5173`

### Step 4: Build for Production

```bash
npm run build
```

## Troubleshooting

### Node.js not found
- Make sure Node.js is installed and added to your system PATH
- Restart your terminal/command prompt after installation
- On Windows, you may need to restart your computer

### Port already in use
- The development server uses port 5173 by default
- If the port is busy, the server will automatically try the next available port
- Check the terminal output for the correct URL

### Three.js errors
- Make sure you have a modern browser that supports WebGL
- Try updating your browser to the latest version
- Check browser console for any error messages

## Browser Compatibility

The game works best in modern browsers:
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Mobile Support

The game includes touch controls and works on mobile devices:
- Swipe left/right to move
- Tap to jump
- Responsive design adapts to screen size

## Performance Tips

- Close other browser tabs to free up memory
- Use a wired internet connection for better performance
- Update your graphics drivers for optimal WebGL performance 
# 3D Runner Game

A fun 3D runner game built with **SvelteKit** and **Three.js**. Navigate through obstacles, collect power-ups, and try to achieve the highest score!

## 🎮 Game Features

- **3D Graphics**: Beautiful 3D environment with lighting and shadows
- **Smooth Controls**: Keyboard and touch controls for desktop and mobile
- **Progressive Difficulty**: Game gets harder as you progress
- **Score System**: Collect yellow spheres to increase your score
- **Lives System**: Avoid red obstacles to stay alive
- **Pause/Resume**: Take a break anytime with the pause feature
- **Responsive Design**: Works on desktop and mobile devices

## 🎯 How to Play

### Controls
- **A/D** or **←/→** : Move left/right
- **Space** : Jump
- **ESC** : Pause/Resume game
- **Touch Controls** : Swipe left/right to move, tap to jump (mobile)

### Objective
- Control the green cube (your character)
- Avoid red obstacles
- Collect yellow spheres for points
- Survive as long as possible!

## 🚀 Getting Started

### Prerequisites
- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd 3d-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## 🛠️ Tech Stack

- **Frontend Framework**: SvelteKit
- **3D Graphics**: Three.js
- **Language**: TypeScript
- **Styling**: CSS with modern features
- **Build Tool**: Vite

## 📁 Project Structure

```
3d-game/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   └── Game.svelte          # Main game component
│   │   └── game/
│   │       └── GameEngine.ts        # Three.js game engine
│   ├── routes/
│   │   ├── +layout.svelte           # App layout
│   │   └── +page.svelte             # Main page
│   ├── app.css                      # Global styles
│   └── app.html                     # HTML template
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## 🎨 Game Mechanics

### Core Systems
- **Player Movement**: Smooth left/right movement with jumping
- **Obstacle Generation**: Randomly spawned red obstacles
- **Collectible System**: Yellow spheres that give points
- **Collision Detection**: Precise collision detection between objects
- **Difficulty Scaling**: Speed and spawn rate increase over time

### Visual Features
- **Dynamic Lighting**: Ambient and directional lighting
- **Shadows**: Real-time shadow casting
- **Smooth Animations**: Fluid movement and transitions
- **Responsive UI**: Modern, glassmorphism-style interface

## 🎯 Future Enhancements

- [ ] Sound effects and background music
- [ ] Power-ups and special abilities
- [ ] Multiple character skins
- [ ] Leaderboard system
- [ ] Different game modes
- [ ] Particle effects
- [ ] More complex level design

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- 3D graphics powered by [Three.js](https://threejs.org/)
- Inspired by classic runner games

---

**Enjoy playing! 🎮** 
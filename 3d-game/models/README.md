# Character Models Directory

This directory is for your 3D character models in GLB/GLTF format.

## How to Add a Character Model

1. **Download a character model** from one of these sources:
   - [Mixamo](https://www.mixamo.com/) - Free, high-quality animated characters
   - [Sketchfab](https://sketchfab.com/3d-models?features=downloadable&sort_by=-likeCount&type=models) - Free and paid models
   - [Unity Asset Store](https://assetstore.unity.com/3d/characters) - Professional game models

2. **Rename the model** to `player.glb` and place it in this directory

3. **Recommended models for this game**:
   - **Mixamo "Y Bot"** - Perfect male character with animations
   - **Mixamo "Remy"** - Realistic male character
   - **Mixamo "Alicia"** - Realistic female character

## Supported Animation Names

The game automatically detects and plays these animations:
- `idle` / `idle_01` / `idle_02` - Standing still
- `walk` / `walk_01` - Walking
- `run` / `run_01` - Running
- `jump` - Jumping
- `fall` - Falling

## Model Requirements

- **Format**: GLB or GLTF
- **Rigging**: Must be properly rigged for animations
- **Scale**: Should be reasonably sized (around 1-2 units tall)
- **Animations**: Include at least idle and walk animations

## Troubleshooting

- If the model doesn't load, check the browser console for errors
- Make sure the file is named exactly `player.glb`
- Ensure the model is in GLB/GLTF format
- The game will fall back to a placeholder character if the model fails to load

## Example Mixamo Setup

1. Go to [Mixamo](https://www.mixamo.com/)
2. Choose a character (Y Bot, Remy, etc.)
3. Download with these animations:
   - Idle
   - Walk
   - Run
   - Jump
4. Export as GLB format
5. Rename to `player.glb` and place in this directory 
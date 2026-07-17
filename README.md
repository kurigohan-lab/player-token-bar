# Player Token Bar

A system-agnostic Foundry VTT module that displays player-owned tokens from the active scene in a movable bar.

## Installation

1. Copy the `player-token-bar` folder into Foundry's `Data/modules/` directory.
2. Restart Foundry VTT.
3. Enable **Player Token Bar** in the world's Manage Modules screen.
4. Configure it under **Game Settings → Configure Settings → Module Settings**.

## Notes

- The module tries several common system data paths for health: `system.attributes.hp`, `system.health`, `system.resources.health`, `system.stats.health`, and `system.hp`.
- For a system with a different health schema, edit the `getHealth(actor)` function in `scripts/player-token-bar.js`.
- Settings are client-scoped, so each user can choose their own color, opacity, combat visibility, and saved position.

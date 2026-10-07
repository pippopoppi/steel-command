# Steel Command

A small real-time strategy game for phones and browsers. Build a base, harvest supplies, train infantry and vehicles, pick a General, and destroy the enemy commander's base at the other end of the map.

**Play it:** https://pippopoppi.github.io/steel-command/

No install, no build step, no dependencies. One HTML page plus one JavaScript file on an HTML5 canvas. All art is drawn in code and the game is an original design.

## How to play

- **Drag** the map to scroll, or tap the **minimap**. Your base is at the bottom, the enemy at the top.
- **Harvesters** collect supply piles and bring credits back to a Supply Center.
- Tap a **building** to train units from it. Tap a **unit** to select it, then tap the ground to move (attack-move) or an enemy to attack. **SELECT ARMY** grabs every combat unit.
- With a **Dozer** alive, pick a building in the panel, tap the map to position it, then **BUILD HERE**. Buildings must be near your base and are constructed over time by the Dozer.
- Destroy every enemy building to win. Lose your Command Center and the battle is lost.

## Generals

| General | Bonus |
|---|---|
| Armor | Tanks and buggies +25% hull, War Factory 20% cheaper |
| Infantry | Infantry 30% cheaper and trains twice as fast |
| Defense | Turrets 40% cheaper with +30% range, buildings +25% hull |

## Buildings and units

Command Center (Dozer), Supply Center (Harvester), Barracks (Rifleman, Rocket Trooper), War Factory (Battle Tank, Rocket Buggy), Gun Turret. Rockets are strong against vehicles and weak against infantry; rifles are the reverse.

## Enemy AI

The enemy commander harvests, produces a mix of infantry and vehicles, and sends attack waves that grow with each level. Higher levels start it with a War Factory, turrets, and a second Barracks.

## Running locally

```
python3 -m http.server 8000
```

then open http://localhost:8000/.

## Regenerating the share image

```
python3 tools/make_og.py
```

needs Pillow and writes `og.png` and `icon-180.png`.

## Licence

MIT

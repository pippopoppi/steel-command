# Steel Command

A small real-time strategy game for phones and browsers. Build a base, harvest supplies, train infantry and vehicles, pick a General, and destroy the enemy commander's base at the other end of the map.

**Play it:** https://pippopoppi.github.io/steel-command/

No install, no build step, no dependencies. One HTML page plus one JavaScript file on an HTML5 canvas. All art is drawn in code and the game is an original design.

## How to play

- **Drag** the map to scroll, or tap the **minimap**. Your base is at the bottom, the enemy at the top.
- **Harvesters** collect supply piles and bring credits back to a Supply Center.
- Tap a **building** to train units from it. Tap a **unit** to select it, then tap the ground to move (attack-move) or an enemy to attack. **SELECT ARMY** grabs every combat unit.
- With a **Dozer** alive, pick a building in the panel, tap the map to position it, then **BUILD HERE**. Buildings must be near your base and are constructed over time by the Dozer.
- The **Dozer repairs** too: select it and tap a damaged building (costs a quarter of the building's price for a full repair). An idle Dozer automatically patches up damaged buildings near it.
- **Rally points:** select a Barracks, War Factory or Command Center and tap the map to plant a flag. New units attack-move to it. Tap the building again or use **DESELECT** to stop, **CLEAR RALLY** to remove the flag.
- Every production building has a yellow **exit ramp**. New units leave from that side, which always faces open ground, so you can build right against the map edge.
- **Airfield** ($1500) builds aircraft. Aircraft fly straight over buildings and units and ignore the ground. Only Rocket Troopers, Rocket Buggies, Gun Turrets and Gunships can shoot them; Riflemen and tanks cannot.
  - **Gunship** ($1000): a helicopter with rockets, strong against infantry, fires continuously.
  - **Strike Jet** ($1400): fast, carries four bombs that hit vehicles and buildings hard, then flies back to the Airfield to rearm (three seconds on the runway). No Airfield, no bombs.
- Destroy every enemy building to win. Lose your Command Center and the battle is lost.

## Generals

| General | Bonus |
|---|---|
| Armor | Tanks and buggies +25% hull, War Factory 20% cheaper |
| Infantry | Infantry 30% cheaper and trains twice as fast |
| Defense | Turrets 40% cheaper with +30% range, buildings +25% hull |

## Buildings and units

Command Center (Dozer), Supply Center (Harvester), Barracks (Rifleman, Rocket Trooper), War Factory (Battle Tank, Rocket Buggy), Gun Turret, Airfield (Gunship, Strike Jet). Rockets are strong against vehicles and weak against infantry; rifles are the reverse. Rocket Troopers are the bigger infantry with the shoulder launcher and orange markings; they fire slow, heavy rockets, so pick them when tanks show up and Riflemen when it is enemy infantry.

## Enemy AI

The enemy commander harvests, produces a mix of infantry and vehicles, and sends attack waves that grow with each level. Higher levels start it with a War Factory, turrets, an Airfield with gunships and jets from level 4, and a second Barracks.

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

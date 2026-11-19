import math
import os
import sys
from typing import Callable

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector

import environment_kit
from environment_kit import Kit, export

environment_kit.PALETTE["patch"] = ((0.34, 0.33, 0.31), 0.0, 0.9, False)
environment_kit.PALETTE["bone"] = ((0.72, 0.68, 0.58), 0.0, 0.9, False)
environment_kit.PALETTE["moss"] = ((0.17, 0.23, 0.1), 0.0, 1.0, False)

LINK_LENGTH: float = 0.17
LINK_WIDTH: float = 0.105
LINK_WIRE: float = 0.017
LINK_SIDES: int = 6
LINK_PITCH: float = 0.128


def chain_link(kit: Kit, at: Vector, along: Vector, roll: float) -> None:
    axis: Vector = along.normalized()
    side: Vector = axis.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 0.01:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    up: Vector = axis.cross(side).normalized()
    across: Vector = side * math.cos(roll) + up * math.sin(roll)
    ring: list[Vector] = []
    for index in range(LINK_SIDES):
        angle: float = index * math.tau / LINK_SIDES
        ring.append(at + axis * (math.cos(angle) * LINK_LENGTH / 2.0) + across * (math.sin(angle) * LINK_WIDTH / 2.0))
    for index in range(LINK_SIDES):
        start: Vector = ring[index]
        end: Vector = ring[(index + 1) % LINK_SIDES]
        kit.rod("iron", (start.x, start.y, start.z), (end.x, end.y, end.z), LINK_WIRE, segments=3)


def chain_along(kit: Kit, points: list[Vector]) -> None:
    travelled: float = 0.0
    index: int = 0
    for first, second in zip(points, points[1:]):
        run: Vector = second - first
        length: float = run.length
        position: float = travelled
        while position < length:
            at: Vector = first + run * (position / length)
            chain_link(kit, at, run, (index % 2) * math.pi / 2.0)
            index += 1
            position += LINK_PITCH
        travelled = position - length


def chain_coil(kit: Kit) -> None:
    points: list[Vector] = []
    turns: float = 1.5
    steps: int = 18
    for index in range(steps + 1):
        share: float = index / steps
        angle: float = share * turns * math.tau
        reach: float = 0.12 + 0.34 * share
        lift: float = LINK_WIRE * 2.0 + (0.022 if index % 5 == 0 else 0.0)
        points.append(Vector((math.cos(angle) * reach + kit.spread(0.02), math.sin(angle) * reach + kit.spread(0.02), lift)))
    chain_along(kit, points)
    tail: Vector = points[-1]
    chain_along(kit, [tail, tail + Vector((0.6, 0.12, 0.0))])


def chain_gibbet(kit: Kit) -> None:
    kit.box("wood", 0.0, 0.0, 0.0, 0.2, 0.2, 2.7, tilt_x=0.04, jitter=0.01)
    kit.box("wood", 0.0, 0.0, 0.0, 0.46, 0.46, 0.16)
    kit.beam("wood", (0.0, 0.0, 2.45), (1.15, 0.0, 2.62), 0.14, 0.16)
    kit.beam("wood", (0.0, 0.0, 1.8), (0.7, 0.0, 2.5), 0.1, 0.12)
    kit.cylinder("iron", 1.12, 0.0, 2.36, 0.05, 0.12, segments=6)
    chain_along(kit, [Vector((1.12, 0.0, 2.34)), Vector((1.1, 0.0, 1.5)), Vector((1.13, 0.02, 0.92))])
    kit.cylinder("iron", 1.13, 0.02, 0.8, 0.09, 0.1, segments=8)
    kit.cylinder("iron", 1.13, 0.02, 0.63, 0.07, 0.14, segments=8)
    kit.box("iron", 1.13, 0.02, 0.56, 0.2, 0.07, 0.05)


def puddle(kit: Kit, lobes: list[tuple[float, float, float, float]], height: float, rough: float) -> None:
    for x, y, rx, ry in lobes:
        kit.blob("patch", x, y, 0.0, rx, ry, height, rough, detail=2, yaw=kit.spread(math.pi))


def puddle_a(kit: Kit) -> None:
    puddle(kit, [(0.0, 0.0, 0.95, 0.7), (0.55, 0.25, 0.5, 0.4)], 0.03, 0.07)


def puddle_b(kit: Kit) -> None:
    puddle(kit, [(0.0, 0.0, 1.5, 0.85), (-0.7, 0.4, 0.6, 0.5), (0.9, -0.3, 0.55, 0.45)], 0.03, 0.08)


def puddle_c(kit: Kit) -> None:
    puddle(kit, [(0.0, 0.0, 0.55, 0.42), (0.35, 0.1, 0.28, 0.24)], 0.025, 0.05)


def moss_bank(kit: Kit, radius: float, tufts: int, tuft_height: float) -> None:
    kit.blob("moss", 0.0, 0.0, 0.0, radius, radius * 0.78, 0.035, 0.06, detail=2, yaw=kit.spread(math.pi))
    for _ in range(tufts):
        angle: float = kit.rng.random() * math.tau
        reach: float = math.sqrt(kit.rng.random()) * radius * 0.75
        size: float = 0.1 + kit.rng.random() * 0.14
        kit.blob("moss", math.cos(angle) * reach, math.sin(angle) * reach * 0.8, 0.0, size, size, tuft_height * (0.6 + kit.rng.random() * 0.8), 0.05, detail=1)


def moss_bank_a(kit: Kit) -> None:
    moss_bank(kit, 0.9, 9, 0.07)


def moss_bank_b(kit: Kit) -> None:
    moss_bank(kit, 0.55, 6, 0.08)


def slab_pile(kit: Kit, count: int) -> None:
    kit.blob("stone", 0.0, 0.0, 0.0, 0.7, 0.55, 0.08, 0.1, detail=1)
    for index in range(count):
        angle: float = index * 2.4 + kit.spread(0.4)
        reach: float = 0.1 + kit.rng.random() * 0.4
        kit.box("stone", math.cos(angle) * reach, math.sin(angle) * reach, 0.04 + index * 0.1, 0.8 + kit.spread(0.2), 0.55 + kit.spread(0.12), 0.1, yaw=angle, tilt_x=kit.spread(0.2), tilt_y=kit.spread(0.2), jitter=0.02)


def slab_pile_a(kit: Kit) -> None:
    slab_pile(kit, 4)


def slab_pile_b(kit: Kit) -> None:
    slab_pile(kit, 6)


def rubble_heap(kit: Kit, count: int, spread: float) -> None:
    kit.blob("stone", 0.0, 0.0, 0.0, spread, spread * 0.8, 0.16, 0.12, detail=1)
    for _ in range(count):
        angle: float = kit.rng.random() * math.tau
        reach: float = math.sqrt(kit.rng.random()) * spread
        size: float = 0.1 + kit.rng.random() * 0.22
        kit.box("stone", math.cos(angle) * reach, math.sin(angle) * reach * 0.8, (1.0 - reach / spread) * 0.12, size * 1.4, size, size * 0.7, yaw=kit.rng.random() * math.tau, tilt_x=kit.spread(0.5), tilt_y=kit.spread(0.5), jitter=size * 0.08)


def rubble_heap_a(kit: Kit) -> None:
    rubble_heap(kit, 16, 0.8)


def rubble_heap_b(kit: Kit) -> None:
    rubble_heap(kit, 26, 1.25)


def plank_pile(kit: Kit) -> None:
    for index in range(7):
        kit.box("wood", kit.spread(0.18), kit.spread(0.22), index * 0.045, 1.0 + kit.rng.random() * 0.6, 0.15 + kit.spread(0.03), 0.045, yaw=kit.spread(0.9), tilt_x=kit.spread(0.06), jitter=0.006)
    kit.box("wood", -0.1, 0.05, 0.3, 1.5, 0.12, 0.12, yaw=0.5, tilt_x=0.25)
    kit.box("iron", 0.15, -0.1, 0.32, 0.12, 0.04, 0.03, yaw=0.9)


def barrel_wreck(kit: Kit) -> None:
    staves: int = 10
    for index in range(staves):
        angle: float = index * math.tau / staves
        fallen: bool = index in (2, 3, 7)
        if fallen:
            kit.box("wood", math.cos(angle) * 0.62, math.sin(angle) * 0.62, 0.0, 0.14, 0.05, 0.68, yaw=angle + 1.57, tilt_x=1.45, jitter=0.008)
        else:
            height: float = 0.55 + kit.rng.random() * 0.3
            kit.box("wood", math.cos(angle) * 0.34, math.sin(angle) * 0.34, 0.0, 0.17, 0.05, height, yaw=angle + 1.57, tilt_x=0.07, jitter=0.008)
    for height in (0.22, 0.5):
        kit.cylinder("iron", 0.0, 0.0, height, 0.36, 0.035, segments=12, top=0.355)
    kit.cylinder("wood", 0.0, 0.0, 0.0, 0.33, 0.04, segments=10)


def shield_broken(kit: Kit) -> None:
    kit.cylinder("wood", 0.0, 0.0, 0.06, 0.42, 0.04, segments=12, tilt_x=0.3)
    kit.cylinder("iron", 0.0, 0.03, 0.11, 0.1, 0.07, segments=8, top=0.05, tilt_x=0.3)
    kit.box("iron", 0.0, 0.0, 0.1, 0.8, 0.07, 0.025, tilt_x=0.3)
    kit.box("wood", 0.38, 0.28, 0.0, 0.3, 0.2, 0.04, yaw=0.6, tilt_x=0.1)


def spear_down(kit: Kit) -> None:
    kit.rod("wood", (-0.8, 0.0, 0.05), (0.7, 0.15, 0.04), 0.025, segments=5)
    kit.rod("iron", (0.7, 0.15, 0.04), (0.98, 0.17, 0.04), 0.045, segments=4, top=0.0)
    kit.rod("wood", (-0.8, 0.0, 0.05), (-0.95, -0.02, 0.05), 0.03, segments=5)


def pickaxe_head_pile(kit: Kit) -> None:
    kit.rod("wood", (-0.5, -0.1, 0.04), (0.35, 0.2, 0.04), 0.03, segments=5)
    kit.box("iron", 0.3, 0.19, 0.06, 0.34, 0.05, 0.05, yaw=0.9)
    kit.box("iron", -0.45, -0.1, 0.0, 0.12, 0.1, 0.08, yaw=0.3)


BONE_PILE_COUNT: int = 30


def bone_pile(kit: Kit) -> None:
    radius: float = 1.35
    for _ in range(BONE_PILE_COUNT):
        angle: float = kit.rng.random() * math.tau
        reach: float = math.sqrt(kit.rng.random()) * radius
        rise: float = (1.0 - reach / radius) * 0.7 + kit.rng.random() * 0.18 + 0.04
        heading: float = kit.rng.random() * math.tau
        tilt: float = kit.spread(0.5)
        length: float = 0.45 + kit.rng.random() * 0.7
        start: Vector = Vector((math.cos(angle) * reach, math.sin(angle) * reach * 0.85, rise))
        end: Vector = start + Vector((math.cos(heading) * length, math.sin(heading) * length, tilt * length))
        end.z = max(0.03, end.z)
        kit.rod("bone", (start.x, start.y, start.z), (end.x, end.y, end.z), 0.032 + kit.rng.random() * 0.02, segments=4)
    for index in range(4):
        angle = index * 1.7 + 0.4
        reach = 0.25 + kit.rng.random() * 0.55
        kit.blob("bone", math.cos(angle) * reach, math.sin(angle) * reach, 0.5 - reach * 0.3, 0.17, 0.2, 0.15, 0.03, detail=1, yaw=angle)
    for index in range(2):
        yaw: float = index * 2.2 + 0.5
        for rib in range(5):
            share: float = rib / 4.0
            along: float = -0.4 + share * 0.8
            base: Vector = Vector((math.cos(yaw) * along, math.sin(yaw) * along, 0.55))
            side: Vector = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
            top: Vector = base + side * 0.5 + Vector((0.0, 0.0, 0.55))
            far: Vector = base + side * 0.95 + Vector((0.0, 0.0, 0.18))
            kit.rod("bone", (base.x, base.y, base.z), (top.x, top.y, top.z), 0.035, segments=4)
            kit.rod("bone", (top.x, top.y, top.z), (far.x, far.y, far.z), 0.03, segments=4)


def root_mass(kit: Kit, limbs: int, reach: float) -> None:
    kit.blob("bark", 0.0, 0.0, 0.0, 0.8, 0.7, 0.4, 0.12, detail=1)
    for index in range(limbs):
        angle: float = index * math.tau / limbs + kit.spread(0.4)
        start: Vector = Vector((math.cos(angle) * 0.25, math.sin(angle) * 0.25, 0.12))
        heading: Vector = Vector((math.cos(angle) * 0.7, math.sin(angle) * 0.7, 0.55))
        kit.limb("bark", start, heading, reach * (0.8 + kit.rng.random() * 0.5), 0.24 + kit.rng.random() * 0.06, 0)


def root_mass_a(kit: Kit) -> None:
    root_mass(kit, 6, 2.2)


def root_mass_b(kit: Kit) -> None:
    root_mass(kit, 8, 2.8)


def stalagmite_cluster(kit: Kit, spires: int, tallest: float) -> None:
    kit.blob("stone", 0.0, 0.0, 0.0, 1.1, 0.95, 0.35, 0.12, detail=1)
    for index in range(spires):
        angle: float = index * math.tau / spires + kit.spread(0.5)
        reach: float = 0.0 if index == 0 else 0.45 + kit.rng.random() * 0.6
        height: float = tallest * (1.0 if index == 0 else 0.35 + kit.rng.random() * 0.5)
        radius: float = 0.18 + height * 0.1
        kit.cylinder("stone", math.cos(angle) * reach, math.sin(angle) * reach, 0.0, radius, height, segments=7, top=0.03, tilt_x=kit.spread(0.1), tilt_y=kit.spread(0.1))


def stalagmite_cluster_a(kit: Kit) -> None:
    stalagmite_cluster(kit, 6, 3.4)


def stalagmite_cluster_b(kit: Kit) -> None:
    stalagmite_cluster(kit, 8, 2.6)


def mine_support(kit: Kit) -> None:
    kit.box("wood", -1.5, 0.0, 0.0, 0.32, 0.32, 2.5, tilt_y=0.05, jitter=0.01)
    kit.box("wood", 1.4, 0.1, 0.0, 0.32, 0.32, 1.2, tilt_y=-0.35, jitter=0.01)
    kit.beam("wood", (-1.55, 0.0, 2.35), (0.9, 0.2, 1.75), 0.34, 0.28)
    kit.box("wood", 0.2, -0.3, 0.0, 1.7, 0.16, 0.12, yaw=0.5, tilt_x=0.1)
    kit.box("wood", 0.9, 0.5, 0.0, 1.2, 0.14, 0.1, yaw=-0.7)
    kit.beam("wood", (-1.5, 0.1, 1.3), (-0.5, 0.35, 0.18), 0.1, 0.1)


MODELS: dict[str, Callable[[Kit], None]] = {
    "chain_coil": chain_coil,
    "chain_gibbet": chain_gibbet,
    "puddle_a": puddle_a,
    "puddle_b": puddle_b,
    "puddle_c": puddle_c,
    "moss_bank_a": moss_bank_a,
    "moss_bank_b": moss_bank_b,
    "slab_pile_a": slab_pile_a,
    "slab_pile_b": slab_pile_b,
    "rubble_heap_a": rubble_heap_a,
    "rubble_heap_b": rubble_heap_b,
    "plank_pile": plank_pile,
    "barrel_wreck": barrel_wreck,
    "shield_broken": shield_broken,
    "spear_down": spear_down,
    "pickaxe_head_pile": pickaxe_head_pile,
    "bone_pile": bone_pile,
    "root_mass_a": root_mass_a,
    "root_mass_b": root_mass_b,
    "stalagmite_cluster_a": stalagmite_cluster_a,
    "stalagmite_cluster_b": stalagmite_cluster_b,
    "mine_support": mine_support,
}


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) < 1:
        raise SystemExit("usage: blender -b --factory-startup --python blender/build_cave_dressing.py -- <output dir> [only=<id>,<id>]")
    target: str = arguments[0]
    only: set[str] = set()
    for argument in arguments[1:]:
        if argument.startswith("only="):
            only.update(argument[5:].split(","))
    os.makedirs(target, exist_ok=True)
    for index, (name, build) in enumerate(MODELS.items()):
        if only and name not in only:
            continue
        kit: Kit = Kit(7000 + index)
        build(kit)
        triangles: int = export(kit, os.path.join(target, f"{name}.glb"))
        print(f"built {name}: {triangles} triangles")


main()

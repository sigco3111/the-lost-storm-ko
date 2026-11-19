import math
import os
import sys
from typing import Callable

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from bmesh.types import BMesh, BMVert
from bpy.types import Object
from mathutils import Matrix, Vector

import environment_kit
from environment_kit import Kit, clear_scene, material, sharpen, unwrap

FRONT: float = -1.0
INLAY: float = 0.012

environment_kit.PALETTE["glyph"] = ((0.07, 0.075, 0.08), 0.0, 0.8, False)
environment_kit.PALETTE["crystal"] = ((0.2, 0.24, 0.27), 0.05, 0.3, False)
environment_kit.PALETTE["monument"] = ((0.5, 0.48, 0.45), 0.0, 0.9, False)
environment_kit.PALETTE["veil"] = ((0.0, 0.0, 0.0), 0.0, 0.99, False)


class Node:
    def __init__(self, name: str, kit: Kit | None, at: tuple[float, float, float] = (0.0, 0.0, 0.0), turn: tuple[float, float, float] = (0.0, 0.0, 0.0), parent: str | None = None) -> None:
        self.name: str = name
        self.kit: Kit | None = kit
        self.at: tuple[float, float, float] = at
        self.turn: tuple[float, float, float] = turn
        self.parent: str | None = parent


def wedge(kit: Kit, name: str, cz: float, inner: float, outer: float, a0: float, a1: float, y0: float, y1: float) -> None:
    target: BMesh = kit.mesh(name)
    ring: list[tuple[float, float]] = [(math.cos(a0) * inner, math.sin(a0) * inner), (math.cos(a0) * outer, math.sin(a0) * outer), (math.cos(a1) * outer, math.sin(a1) * outer), (math.cos(a1) * inner, math.sin(a1) * inner)]
    front: list[BMVert] = [target.verts.new((x, y0, cz + z)) for x, z in ring]
    back: list[BMVert] = [target.verts.new((x, y1, cz + z)) for x, z in ring]
    target.faces.new(front[::-1])
    target.faces.new(back)
    for index in range(4):
        following: int = (index + 1) % 4
        target.faces.new((front[index], front[following], back[following], back[index]))


def bipyramid(kit: Kit, name: str, sides: int, top: float, crown: float, crown_radius: float, girdle_radius: float, bottom: float) -> None:
    target: BMesh = kit.mesh(name)
    apex: BMVert = target.verts.new((0.0, 0.0, top))
    foot: BMVert = target.verts.new((0.0, 0.0, -bottom))
    upper: list[BMVert] = [target.verts.new((math.cos((index + 0.5) * math.tau / sides) * crown_radius, math.sin((index + 0.5) * math.tau / sides) * crown_radius, crown)) for index in range(sides)]
    girdle: list[BMVert] = [target.verts.new((math.cos(index * math.tau / sides) * girdle_radius, math.sin(index * math.tau / sides) * girdle_radius, 0.0)) for index in range(sides)]
    for index in range(sides):
        following: int = (index + 1) % sides
        target.faces.new((upper[index], upper[following], apex))
        target.faces.new((girdle[index], girdle[following], upper[index]))
        target.faces.new((upper[index], girdle[following], upper[following]))
        target.faces.new((girdle[following], girdle[index], foot))


def quad(kit: Kit, name: str, corners: list[tuple[float, float, float]], uvs: list[tuple[float, float]]) -> None:
    target: BMesh = kit.mesh(name)
    layer = target.loops.layers.uv.verify()
    face = target.faces.new([target.verts.new(corner) for corner in corners])
    for loop, uv in zip(face.loops, uvs):
        loop[layer].uv = uv


def chevron(kit: Kit, x: float, y: float, z: float, size: float, pointing: float) -> None:
    low: float = z if pointing > 0.0 else z + size * 0.6
    high: float = z + size * 0.6 if pointing > 0.0 else z
    for side in (-1.0, 1.0):
        kit.beam("glyph", (x + side * size * 0.5, y, low), (x, y, high), 0.07, 0.05)


def waypoint() -> list[Node]:
    base: Kit = Kit(41)
    base.cylinder("stone", 0.0, 0.0, 0.0, 1.62, 0.2, segments=8, yaw=math.pi / 8.0)
    base.cylinder("stone", 0.0, 0.0, 0.2, 1.3, 0.18, segments=8, top=1.25, yaw=math.pi / 8.0)
    for index in range(4):
        angle: float = math.pi / 4.0 + index * math.pi / 2.0
        x: float = math.cos(angle) * 1.4
        y: float = math.sin(angle) * 1.4
        base.cylinder("stone", x, y, 0.2, 0.17, 0.62, segments=4, top=0.11, yaw=angle + math.pi / 4.0)
        base.cylinder("glyph", x, y, 0.82, 0.1, 0.05, segments=4, top=0.0, yaw=angle + math.pi / 4.0)
    base.cylinder("stone", 0.0, 0.0, 0.38, 0.46, 0.24, segments=8, top=0.36, yaw=math.pi / 8.0)
    base.cylinder("stone", 0.0, 0.0, 0.62, 0.3, 0.1, segments=8, top=0.36, yaw=math.pi / 8.0)
    for index in range(4):
        angle = index * math.pi / 2.0
        base.rod("stone", (math.cos(angle) * 0.28, math.sin(angle) * 0.28, 0.66), (math.cos(angle) * 0.4, math.sin(angle) * 0.4, 1.0), 0.055, segments=4, top=0.02)
    for index in range(8):
        angle = index * math.pi / 4.0 + math.pi / 8.0
        base.box("glyph", math.cos(angle) * 0.86, math.sin(angle) * 0.86, 0.38 - INLAY, 0.07, 0.34, INLAY * 2.0, yaw=angle + math.pi / 2.0)
        between: float = angle + math.pi / 8.0
        base.cylinder("glyph", math.cos(between) * 1.1, math.sin(between) * 1.1, 0.38 - INLAY, 0.05, INLAY * 2.0, segments=6)
    for index in range(8):
        angle = index * math.pi / 4.0
        base.box("glyph", math.cos(angle) * 0.42, math.sin(angle) * 0.42, 0.43, 0.06, 0.03, 0.14, yaw=angle + math.pi / 2.0)
    focal: Kit = Kit(42)
    bipyramid(focal, "crystal", 8, 0.62, 0.17, 0.2, 0.28, 0.46)
    return [Node("dais", base), Node("focal", focal, (0.0, 0.0, 1.14))]

Point = tuple[float, float]


def prism(kit: Kit, name: str, footprint: list[Point], z0: float, z1: float, shape: Matrix, taper: float = 1.0, jag: float = 0.0, slope: Point = (0.0, 0.0), bevel: float = 0.0) -> None:
    target: BMesh = kit.mesh(name)
    low: list[BMVert] = [target.verts.new(shape @ Vector((x, y, z0))) for x, y in footprint]
    high: list[BMVert] = [target.verts.new(shape @ Vector((x * taper, y * taper, z1 + x * slope[0] + y * slope[1] + kit.spread(jag)))) for x, y in footprint]
    count: int = len(footprint)
    made: list = [target.faces.new(low[::-1]), target.faces.new(high)]
    for index in range(count):
        following: int = (index + 1) % count
        made.append(target.faces.new((low[index], low[following], high[following], high[index])))
    if bevel > 0.0:
        edges: set = set()
        for face in made:
            edges.update(face.edges)
        bmesh.ops.bevel(target, geom=list(edges), offset=bevel, segments=1, affect="EDGES", profile=0.5)


def ngon(kit: Kit, sides: int, rx: float, ry: float, wobble: float) -> list[Point]:
    turn: float = kit.rng.random() * math.tau
    points: list[Point] = []
    for index in range(sides):
        angle: float = turn + index * math.tau / sides + kit.spread(0.35 / sides * math.tau)
        reach: float = 1.0 - kit.rng.random() * wobble
        points.append((math.cos(angle) * rx * reach, math.sin(angle) * ry * reach))
    return points


def sector(kit: Kit, inner: float, outer: float, a0: float, a1: float, wobble: float) -> list[Point]:
    middle: float = (a0 + a1) / 2.0
    return [
        (math.cos(a0) * (inner + kit.spread(wobble)), math.sin(a0) * (inner + kit.spread(wobble))),
        (math.cos(a0) * (outer + kit.spread(wobble)), math.sin(a0) * (outer + kit.spread(wobble))),
        (math.cos(middle) * (outer + kit.spread(wobble * 2.0)), math.sin(middle) * (outer + kit.spread(wobble * 2.0))),
        (math.cos(a1) * (outer + kit.spread(wobble)), math.sin(a1) * (outer + kit.spread(wobble))),
        (math.cos(a1) * (inner + kit.spread(wobble)), math.sin(a1) * (inner + kit.spread(wobble))),
    ]


def settled(x: float, y: float, z: float, yaw: float = 0.0, tilt_x: float = 0.0, tilt_y: float = 0.0) -> Matrix:
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(tilt_x, 4, "X") @ Matrix.Rotation(tilt_y, 4, "Y")


def rubble(kit: Kit, count: int, inner: float, outer: float, low: float, high: float, skip: tuple[float, float] | None = None) -> None:
    placed: int = 0
    while placed < count:
        angle: float = kit.rng.random() * math.tau
        if skip is not None and skip[0] < angle < skip[1]:
            continue
        reach: float = inner + kit.rng.random() * (outer - inner)
        size: float = low + kit.rng.random() * (high - low)
        kit.blob("stone", math.cos(angle) * reach, math.sin(angle) * reach, -size * 0.35, size * (1.0 + kit.rng.random() * 0.5), size, size * 0.7, size * 0.35, detail=1, yaw=kit.rng.random() * math.pi)
        placed += 1


PAD_TOP: float = 0.07
PAD_SINK: float = 0.3


def pad(kit: Kit, centre: float, outer: float, slabs: int, missing: set[int], heaved: set[int]) -> None:
    prism(kit, "monument", ngon(kit, 9, centre, centre, 0.06), -PAD_SINK, PAD_TOP, Matrix.Identity(4), bevel=0.02)
    gap: float = 0.035
    for index in range(slabs):
        if index in missing:
            continue
        a0: float = index * math.tau / slabs + gap
        a1: float = (index + 1) * math.tau / slabs - gap
        middle: float = (a0 + a1) / 2.0
        lift: float = 0.0
        tilt: float = 0.0
        if index in heaved:
            lift = 0.06 + kit.rng.random() * 0.06
            tilt = 0.12 + kit.rng.random() * 0.1
        shape: Matrix = Matrix.Rotation(middle, 4, "Z") @ Matrix.Translation((0.0, 0.0, lift)) @ Matrix.Rotation(-tilt, 4, "Y") @ Matrix.Rotation(-middle, 4, "Z")
        prism(kit, "stone", sector(kit, centre + gap, outer, a0, a1, 0.05), -PAD_SINK, PAD_TOP - 0.02 + kit.spread(0.025), shape, jag=0.015, bevel=0.018)


def pad_marks(kit: Kit, radius: float, count: int) -> None:
    for index in range(count):
        angle: float = index * math.tau / count
        kit.box("glyph", math.cos(angle) * radius, math.sin(angle) * radius, PAD_TOP - INLAY, 0.075, 0.26, INLAY * 2.0, yaw=angle + math.pi / 2.0)
    for index in range(count * 2):
        angle = (index + 0.5) * math.tau / (count * 2)
        kit.cylinder("glyph", math.cos(angle) * radius * 0.62, math.sin(angle) * radius * 0.62, PAD_TOP - INLAY, 0.05, INLAY * 2.0, segments=6)
    kit.cylinder("glyph", 0.0, 0.0, PAD_TOP - INLAY, 0.11, INLAY * 2.0, segments=count)


def shard(kit: Kit, height: float, width: float) -> None:
    bipyramid(kit, "crystal", 5, height * 0.62, height * 0.2, width * 0.55, width, height * 0.38)
    target: BMesh = kit.mesh("crystal")
    for vert in target.verts:
        vert.co += Vector((kit.spread(width * 0.12), kit.spread(width * 0.12), kit.spread(height * 0.04)))


def face_mark(kit: Kit, shape: Matrix, x0: float, x1: float, z0: float, z1: float, face: float) -> None:
    prism(kit, "glyph", [(x0, face - INLAY), (x1, face - INLAY), (x1, face + INLAY), (x0, face + INLAY)], z0, z1, shape)


def menhir(kit: Kit, x: float, y: float, width: float, depth: float, height: float, yaw: float, lean: float, broken: float, marks: int) -> None:
    shape: Matrix = settled(x, y, -PAD_SINK, yaw, lean, kit.spread(0.05))
    half_w: float = width / 2.0
    half_d: float = depth / 2.0
    footprint: list[Point] = [(-half_w + kit.spread(0.04), -half_d), (half_w + kit.spread(0.04), -half_d), (half_w * 1.05, half_d + kit.spread(0.03)), (-half_w * 0.95, half_d + kit.spread(0.03))]
    prism(kit, "monument", footprint, 0.0, height + PAD_SINK, shape, taper=0.72, jag=broken, slope=(broken * 0.6, 0.0), bevel=0.025)
    for index in range(marks):
        z: float = PAD_SINK + 0.3 + index * 0.28
        if z > height + PAD_SINK - 0.25:
            break
        scale: float = 1.0 - (z / (height + PAD_SINK)) * 0.28
        lean_in: float = -half_d * scale - 0.004
        face_mark(kit, shape, -0.035, 0.035, z, z + 0.18, lean_in)
        face_mark(kit, shape, -0.12 * scale, 0.12 * scale, z + 0.2, z + 0.24, lean_in)


def waypoint_circle() -> list[Node]:
    base: Kit = Kit(81)
    pad(base, 0.62, 1.45, 9, {6}, {2, 7})
    pad_marks(base, 0.42, 6)
    menhir(base, 0.1, 1.85, 0.62, 0.36, 1.75, math.pi, -0.06, 0.18, 4)
    menhir(base, -1.7, -0.55, 0.5, 0.32, 1.05, math.pi / 2.0 + 1.05, 0.05, 0.22, 2)
    menhir(base, 1.62, -0.7, 0.52, 0.34, 0.42, -math.pi / 2.0 - 1.0, 0.12, 0.25, 0)
    prism(base, "monument", ngon(base, 5, 0.42, 0.22, 0.15), -0.12, 0.16, settled(1.95, 0.25, 0.0, 0.7, 0.3, 1.35), bevel=0.02)
    rubble(base, 9, 1.45, 2.2, 0.08, 0.2)
    focal: Kit = Kit(82)
    shard(focal, 0.95, 0.24)
    return [Node("dais", base), Node("focal", focal, (0.0, 0.0, 1.75))]


def obelisk_mark(kit: Kit, shape: Matrix, half: float, top_half: float, height: float, z0: float, z1: float, x0: float, x1: float) -> None:
    face0: float = -(half + (top_half - half) * z0 / height) - 0.004
    face1: float = -(half + (top_half - half) * z1 / height) - 0.004
    target: BMesh = kit.mesh("glyph")
    corners: list[Vector] = [Vector((x0, face0, z0)), Vector((x1, face0, z0)), Vector((x1, face1, z1)), Vector((x0, face1, z1))]
    front: list[BMVert] = [target.verts.new(shape @ (corner + Vector((0.0, -INLAY, 0.0)))) for corner in corners]
    back: list[BMVert] = [target.verts.new(shape @ (corner + Vector((0.0, INLAY * 2.0, 0.0)))) for corner in corners]
    target.faces.new(front[::-1])
    target.faces.new(back)
    for index in range(4):
        following: int = (index + 1) % 4
        target.faces.new((front[index], front[following], back[following], back[index]))


SHAFT_RING: list[Point] = [(-1.0, -1.0), (0.0, -1.0), (1.0, -1.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (-1.0, 1.0), (-1.0, 0.0)]


def shaft_segment(kit: Kit, shape: Matrix, half: float, top_half: float, height: float, low: list[float], high: list[float], peak: float | None) -> None:
    target: BMesh = kit.mesh("monument")

    def ring(heights: list[float]) -> list[BMVert]:
        made: list[BMVert] = []
        for (x, y), z in zip(SHAFT_RING, heights):
            width: float = half + (top_half - half) * z / height
            made.append(target.verts.new(shape @ Vector((x * width, y * width, z))))
        return made

    bottom: list[BMVert] = ring(low)
    top: list[BMVert] = ring(high)
    target.faces.new(bottom[::-1])
    for index in range(8):
        following: int = (index + 1) % 8
        target.faces.new((bottom[index], bottom[following], top[following], top[index]))
    if peak is None:
        target.faces.new(top)
        return
    tip: BMVert = target.verts.new(shape @ Vector((0.03, 0.02, peak)))
    for index in range(8):
        target.faces.new((top[index], top[(index + 1) % 8], tip))


def broken_cut(kit: Kit, at: float, depth: float) -> list[float]:
    return [at + kit.spread(depth) for _ in SHAFT_RING]


def piece_shape(shape: Matrix, centre: float) -> tuple[Matrix, tuple[float, float, float]]:
    pivot: Vector = shape @ Vector((0.0, 0.0, centre))
    return Matrix.Translation(-pivot) @ shape, (pivot.x, pivot.y, pivot.z)


def waypoint_obelisk() -> list[Node]:
    base: Kit = Kit(91)
    pad(base, 0.66, 1.4, 8, {5}, {1, 6})
    pad_marks(base, 0.44, 4)
    back: float = 1.55
    plinth: Matrix = settled(0.0, back, -PAD_SINK, 0.08, 0.0, 0.0)
    prism(base, "monument", [(-0.62, -0.6), (0.05, -0.6), (-0.1, 0.6), (-0.62, 0.6)], 0.0, PAD_SINK + 0.34, plinth, jag=0.02, bevel=0.025)
    prism(base, "monument", [(0.09, -0.6), (0.62, -0.6), (0.62, 0.6), (-0.05, 0.6)], 0.0, PAD_SINK + 0.27, settled(0.04, back, -PAD_SINK, 0.08, 0.04, 0.09), jag=0.02, bevel=0.025)
    height: float = 2.35
    half: float = 0.3
    top_half: float = 0.22
    shape: Matrix = settled(-0.08, back + 0.05, 0.3, 0.08, -0.05, 0.035)
    first: list[float] = broken_cut(base, 0.86, 0.07)
    second: list[float] = broken_cut(base, 1.8, 0.06)
    seam: float = 0.006
    rim: list[float] = [height - 0.12, height + 0.05, height - 0.32, height - 0.42, height - 0.22, height - 0.02, height + 0.08, height - 0.05]
    shaft_segment(base, shape, half, top_half, height, [0.0] * 8, first, None)
    obelisk_mark(base, shape, half, top_half, height, 0.35, 0.74, -0.03, 0.03)
    obelisk_mark(base, shape, half, top_half, height, 0.55, 0.6, -0.13, 0.13)
    drum: Kit = Kit(93)
    drum_shape, drum_at = piece_shape(shape, 1.33)
    shaft_segment(drum, drum_shape, half, top_half, height, [z + seam for z in first], second, None)
    obelisk_mark(drum, drum_shape, half, top_half, height, 0.98, 1.7, -0.03, 0.03)
    for z in (1.05, 1.45):
        obelisk_mark(drum, drum_shape, half, top_half, height, z, z + 0.05, -0.12, 0.12)
    crown: Kit = Kit(94)
    crown_shape, crown_at = piece_shape(shape, 2.05)
    shaft_segment(crown, crown_shape, half, top_half, height, [z + seam for z in second], rim, height - 0.2)
    obelisk_mark(crown, crown_shape, half, top_half, height, 1.92, 2.02, -0.07, 0.07)
    rubble(base, 10, 1.4, 2.15, 0.07, 0.19)
    focal: Kit = Kit(92)
    shard(focal, 0.7, 0.2)
    return [
        Node("dais", base),
        Node("drum", drum, drum_at),
        Node("crown", crown, crown_at),
        Node("drum_fallen", None, (0.78, back - 0.72, 0.31), (-1.5, 0.12, 0.55)),
        Node("crown_fallen", None, (-0.95, back - 0.62, 0.27), (1.42, -0.3, -0.85)),
        Node("focal", focal, (-0.08, back + 0.12, 2.95)),
    ]


def column(kit: Kit, x: float, y: float, height: float, radius: float, jag: float, bands: list[float]) -> None:
    prism(kit, "monument", ngon(kit, 4, 0.55, 0.55, 0.05), -PAD_SINK, 0.2, settled(x, y, 0.0, math.pi / 4.0 + kit.spread(0.1)), bevel=0.025)
    shape: Matrix = settled(x, y, 0.18, kit.spread(0.2), kit.spread(0.03), kit.spread(0.03))
    circle: list[Point] = [(math.cos(index * math.tau / 14) * radius, math.sin(index * math.tau / 14) * radius) for index in range(14)]
    prism(kit, "monument", circle, 0.0, height, shape, taper=0.9, jag=jag, slope=(jag * 0.5, -jag * 0.4))
    for z in bands:
        reach: float = radius * (1.0 - 0.1 * z / height) + 0.012
        ring: list[Point] = [(math.cos(index * math.tau / 14) * reach, math.sin(index * math.tau / 14) * reach) for index in range(14)]
        prism(kit, "glyph", ring, z, z + 0.06, shape)


def waypoint_columns() -> list[Node]:
    base: Kit = Kit(101)
    pad(base, 0.64, 1.35, 8, {3}, {0, 5})
    pad_marks(base, 0.43, 8)
    column(base, -1.55, 0.75, 2.2, 0.26, 0.28, [0.5, 1.45])
    column(base, 1.55, 0.75, 0.75, 0.26, 0.22, [0.5])
    drum: Matrix = settled(2.05, -0.35, 0.12, 0.35, math.pi / 2.0, 0.0)
    circle: list[Point] = [(math.cos(index * math.tau / 14) * 0.25, math.sin(index * math.tau / 14) * 0.25) for index in range(14)]
    prism(base, "monument", circle, -0.32, 0.32, drum, jag=0.03)
    prism(base, "glyph", [(x * 1.05, y * 1.05) for x, y in circle], -0.03, 0.03, drum)
    prism(base, "monument", ngon(base, 5, 0.22, 0.16, 0.2), -0.1, 0.13, settled(1.1, 1.35, 0.0, 0.2, 0.4, -0.7), bevel=0.02)
    rubble(base, 10, 1.35, 2.15, 0.07, 0.19)
    focal: Kit = Kit(102)
    shard(focal, 0.85, 0.22)
    return [Node("dais", base), Node("focal", focal, (0.0, 0.75, 1.75))]


def waypoint_cairn() -> list[Node]:
    base: Kit = Kit(111)
    pad(base, 0.6, 1.3, 7, {4}, {1})
    pad_marks(base, 0.4, 5)
    back: float = 1.6
    base.blob("monument", 0.0, back, 0.05, 0.85, 0.7, 0.5, 0.18, detail=2, yaw=0.3)
    base.blob("monument", -0.42, back + 0.12, 0.05, 0.45, 0.42, 0.42, 0.12, detail=2, yaw=1.1)
    base.blob("monument", 0.48, back - 0.05, 0.02, 0.4, 0.38, 0.32, 0.12, detail=2, yaw=2.0)
    base.blob("monument", 0.05, back + 0.05, 0.55, 0.55, 0.48, 0.36, 0.12, detail=2, yaw=0.8)
    base.blob("monument", -0.05, back, 0.95, 0.36, 0.32, 0.26, 0.08, detail=2, yaw=2.4)
    base.blob("monument", 0.02, back + 0.02, 1.22, 0.22, 0.2, 0.18, 0.06, detail=1, yaw=0.5)
    face: Matrix = settled(0.0, back - 0.68, -0.25, 0.0, 0.32, 0.0)
    prism(base, "monument", [(-0.4, -0.08), (0.42, -0.08), (0.38, 0.08), (-0.36, 0.08)], 0.0, 1.15, face, taper=0.82, jag=0.05, slope=(0.08, 0.0), bevel=0.02)
    for index, z in enumerate((0.48, 0.74, 1.0)):
        width: float = 0.17 - index * 0.03
        prism(base, "glyph", [(-width, -0.08 - INLAY * 2.0), (width, -0.08 - INLAY * 2.0), (width, -0.08 + INLAY), (-width, -0.08 + INLAY)], z, z + 0.045, face)
    prism(base, "glyph", [(-0.03, -0.08 - INLAY * 2.0), (0.03, -0.08 - INLAY * 2.0), (0.03, -0.08 + INLAY), (-0.03, -0.08 + INLAY)], 0.42, 1.07, face)
    rubble(base, 14, 1.3, 2.2, 0.08, 0.24)
    focal: Kit = Kit(112)
    shard(focal, 0.75, 0.22)
    return [Node("dais", base), Node("focal", focal, (0.0, back, 1.6))]


Rect = tuple[float, float, float, float]


def block(kit: Kit, name: str, x: float, y: float, sx: float, sy: float, z0: float, z1: float, yaw: float = 0.0, tilt_x: float = 0.0, tilt_y: float = 0.0, jag: float = 0.0, bevel: float = 0.02) -> Matrix:
    shape: Matrix = settled(x, y, 0.0, yaw, tilt_x, tilt_y)
    prism(kit, name, [(-sx / 2.0, -sy / 2.0), (sx / 2.0, -sy / 2.0), (sx / 2.0, sy / 2.0), (-sx / 2.0, sy / 2.0)], z0, z1, shape, jag=jag, bevel=bevel)
    return shape


def flagstones(kit: Kit, at: Point, reach: Point, cell: float, holes: list[Rect], missing: float, heaved: float) -> None:
    gap: float = 0.03
    rows: int = int(reach[1] * 2.0 / cell) + 1
    for row in range(rows):
        y0: float = -reach[1] + row * cell
        y1: float = y0 + cell
        x0: float = -reach[0] - kit.rng.random() * cell
        while x0 < reach[0]:
            x1: float = x0 + cell * (0.7 + kit.rng.random() * 0.6)
            cx: float = (x0 + x1) / 2.0
            cy: float = (y0 + y1) / 2.0
            edge: float = (cx / reach[0]) ** 2 + (cy / reach[1]) ** 2
            covered: bool = any(x1 > hx0 and x0 < hx1 and y1 > hy0 and y0 < hy1 for hx0, hx1, hy0, hy1 in holes)
            outside: bool = edge > 0.7 + kit.rng.random() * 0.4
            lost: bool = kit.rng.random() < missing
            if not covered and not outside and not lost:
                lift: float = 0.0
                tilt: float = 0.0
                if kit.rng.random() < heaved:
                    lift = 0.04 + kit.rng.random() * 0.05
                    tilt = 0.08 + kit.rng.random() * 0.1
                sink: float = max(0.0, edge - 0.5) * 0.1
                footprint: list[Point] = [(x0 + gap - cx + kit.spread(0.03), y0 + gap - cy + kit.spread(0.03)), (x1 - gap - cx + kit.spread(0.03), y0 + gap - cy + kit.spread(0.03)), (x1 - gap - cx + kit.spread(0.03), y1 - gap - cy + kit.spread(0.03)), (x0 + gap - cx + kit.spread(0.03), y1 - gap - cy + kit.spread(0.03))]
                shape: Matrix = settled(at[0] + cx, at[1] + cy, lift, kit.spread(0.05), kit.spread(tilt), kit.spread(tilt))
                prism(kit, "stone", footprint, -PAD_SINK, PAD_TOP - 0.02 - sink + kit.spread(0.02), shape, jag=0.012, bevel=0.015)
            x0 = x1


def chips(kit: Kit, at: Point, count: int, reach: float, low: float, high: float) -> None:
    for _ in range(count):
        angle: float = kit.rng.random() * math.tau
        distance: float = reach * (0.4 + kit.rng.random() * 0.6)
        size: float = low + kit.rng.random() * (high - low)
        prism(kit, "monument", ngon(kit, 4 + kit.rng.randrange(2), size, size * 0.75, 0.25), -0.08, size * 0.55, settled(at[0] + math.cos(angle) * distance, at[1] + math.sin(angle) * distance, 0.0, kit.rng.random() * math.pi, kit.spread(0.5), kit.spread(0.5)), bevel=0.012)


ARCH_HALF: float = 1.05
ARCH_SPRING: float = 2.35
ARCH_RING: float = 0.6
ARCH_DEPTH: float = 0.8
ARCH_PLINTH: float = 0.42
ARCH_STONES: int = 9
ARCH_PIER: float = 0.62


def way_up() -> list[Node]:
    frame: Kit = Kit(51)
    flagstones(frame, (0.0, -0.3), (3.1, 2.5), 0.66, [(-1.95, 1.95, -1.15, 0.95)], 0.1, 0.16)
    for x0, x1, drop in ((-1.78, -0.62, 0.03), (-0.6, 0.64, 0.0), (0.66, 1.8, 0.05)):
        block(frame, "monument", (x0 + x1) / 2.0, frame.spread(0.02), x1 - x0, 1.2, -PAD_SINK, ARCH_PLINTH - drop, yaw=frame.spread(0.015), bevel=0.025)
    for index, (depth, height) in enumerate(((0.36, 0.28), (0.36, 0.14))):
        y: float = FRONT * (0.6 + 0.18 + index * 0.36)
        span: float = 1.3 - index * 0.1
        cuts: list[float] = [-span, -span * 0.3 + frame.spread(0.1), span * 0.35 + frame.spread(0.1), span]
        for piece in range(3):
            if index == 1 and piece == 2:
                continue
            x0, x1 = cuts[piece] + 0.02, cuts[piece + 1] - 0.02
            block(frame, "monument", (x0 + x1) / 2.0, y + frame.spread(0.02), x1 - x0, depth - 0.03, -PAD_SINK, height - frame.rng.random() * 0.03, yaw=frame.spread(0.04), tilt_y=frame.spread(0.03), jag=0.015, bevel=0.02)
    chips(frame, (1.05, FRONT * 1.15), 3, 0.25, 0.08, 0.14)
    for side in (-1.0, 1.0):
        inner: float = ARCH_HALF + 0.005
        base_outer: float = inner + 0.8
        block(frame, "monument", side * (inner + base_outer) / 2.0 - side * 0.1, 0.0, 0.8, 0.98, ARCH_PLINTH - 0.05, ARCH_PLINTH + 0.28, bevel=0.025)
        courses: list[float] = [ARCH_PLINTH + 0.28, ARCH_PLINTH + 0.74, ARCH_PLINTH + 1.12, ARCH_PLINTH + 1.55, ARCH_SPRING - 0.18]
        for low, high in zip(courses, courses[1:]):
            outer: float = inner + ARCH_PIER - 0.04 + frame.rng.random() * 0.08
            block(frame, "monument", side * (inner + outer) / 2.0, frame.spread(0.015), outer - inner, ARCH_DEPTH, low, high - 0.012, bevel=0.022)
        capital_jag: float = 0.06 if side > 0.0 else 0.0
        block(frame, "monument", side * (ARCH_HALF + 0.31), 0.0, 0.84, 0.98, ARCH_SPRING - 0.18, ARCH_SPRING, jag=capital_jag, bevel=0.02)
        face: float = FRONT * (ARCH_DEPTH / 2.0) - INLAY
        pier: float = ARCH_HALF + 0.31
        frame.box("glyph", side * pier, face, ARCH_PLINTH + 0.5, 0.07, INLAY * 2.0, 1.05)
        for z in (ARCH_PLINTH + 0.62, ARCH_PLINTH + 0.95, ARCH_PLINTH + 1.28):
            frame.box("glyph", side * pier, face, z, 0.3, INLAY * 2.0, 0.06)
    gap: float = 0.012
    for index in range(ARCH_STONES):
        a0: float = math.pi * index / ARCH_STONES + gap
        a1: float = math.pi * (index + 1) / ARCH_STONES - gap
        key: bool = index == ARCH_STONES // 2
        broken: bool = index == 1
        outer: float = ARCH_HALF + ARCH_RING + (0.14 if key else frame.spread(0.07)) - (0.24 if broken else 0.0)
        sag: float = -0.05 if key else 0.0
        reach: float = ARCH_DEPTH / 2.0 + (0.06 if key else frame.spread(0.02))
        wedge(frame, "monument", ARCH_SPRING + sag, ARCH_HALF, outer, a0, a1, FRONT * reach, reach)
    chevron(frame, 0.0, FRONT * (ARCH_DEPTH / 2.0 + 0.06) - INLAY, ARCH_SPRING + ARCH_HALF + 0.15, 0.34, 1.0)
    block(frame, "monument", 2.05, -0.95, 0.55, 0.4, -0.12, 0.3, yaw=0.6, tilt_x=0.25, tilt_y=0.5, jag=0.04, bevel=0.02)
    chips(frame, (1.9, -0.6), 4, 0.5, 0.07, 0.15)
    rubble(frame, 12, 2.3, 3.2, 0.07, 0.2)
    top: float = ARCH_SPRING + ARCH_HALF
    veil: Kit = Kit(52)
    quad(veil, "veil", [(-ARCH_HALF, 0.0, ARCH_PLINTH), (ARCH_HALF, 0.0, ARCH_PLINTH), (ARCH_HALF, 0.0, top), (-ARCH_HALF, 0.0, top)], [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])
    seal: Kit = Kit(53)
    seal.box("stone", 0.0, 0.0, ARCH_PLINTH, ARCH_HALF * 2.0 - 0.04, 0.24, ARCH_SPRING - ARCH_PLINTH, jitter=0.006)
    seal.cylinder("stone", 0.0, 0.12, ARCH_SPRING, ARCH_HALF - 0.02, 0.24, segments=18, tilt_x=math.pi / 2.0)
    seal.box("glyph", 0.0, FRONT * 0.12 - INLAY, ARCH_PLINTH + 1.1, 1.3, INLAY * 2.0, 0.08)
    seal.box("glyph", 0.0, FRONT * 0.12 - INLAY, ARCH_PLINTH + 0.5, 0.08, INLAY * 2.0, 1.4)
    return [Node("frame", frame), Node("veil", veil), Node("seal", seal)]


WELL_HALF: float = 1.0
WELL_FRONT: float = FRONT * 1.3
WELL_BACK: float = 1.0
WELL_RIM: float = 0.46
WELL_COPING: float = 0.1
WELL_CORNER: float = 0.82
WELL_WALL: float = 0.5


def coping(kit: Kit, x: float, y0: float, y1: float, top: float, slumped: bool) -> None:
    centre: float = (y0 + y1) / 2.0
    length: float = y1 - y0 - 0.03
    height: float = top - (0.24 if slumped else kit.rng.random() * 0.04)
    tilt: float = 0.16 if slumped else kit.spread(0.02)
    shape: Matrix = block(kit, "monument", x, centre, WELL_WALL, length, -PAD_SINK, height, yaw=kit.spread(0.012), tilt_y=tilt * (1.0 if x > 0.0 else -1.0), bevel=0.022)
    if not slumped:
        prism(kit, "glyph", [(-0.04, -length * 0.3), (0.04, -length * 0.3), (0.04, length * 0.3), (-0.04, length * 0.3)], height - INLAY, height + INLAY, shape)


def well_post(kit: Kit, x: float, y: float, height: float, broken: bool, lit: bool) -> None:
    shape: Matrix = block(kit, "monument", x, y, 0.68, 0.68, -PAD_SINK, height, yaw=kit.spread(0.06), tilt_x=kit.spread(0.04), tilt_y=kit.spread(0.04), jag=0.12 if broken else 0.0, bevel=0.025)
    if broken:
        return
    prism(kit, "monument", [(-0.3, -0.3), (0.3, -0.3), (0.3, 0.3), (-0.3, 0.3)], height, height + 0.12, shape, bevel=0.02)
    if lit:
        prism(kit, "glyph", [(-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15)], height + 0.12 - INLAY, height + 0.12 + INLAY, shape)
        face_mark(kit, shape, -0.035, 0.035, 0.2, height - 0.15, -0.34)


def way_down() -> list[Node]:
    frame: Kit = Kit(61)
    top: float = WELL_RIM + WELL_COPING
    flagstones(frame, (0.0, 0.0), (2.75, 2.7), 0.62, [(-1.7, 1.7, -1.85, 1.95)], 0.1, 0.16)
    for side in (-1.0, 1.0):
        x: float = side * (WELL_HALF + 0.28)
        cuts: list[float] = [WELL_FRONT + 0.15, WELL_FRONT + 0.85 + frame.spread(0.08), 0.2 + frame.spread(0.08), WELL_BACK + 0.05]
        for piece in range(3):
            coping(frame, x, cuts[piece], cuts[piece + 1], top, side > 0.0 and piece == 1)
    back: float = WELL_BACK + 0.32
    for x0, x1 in ((-WELL_HALF - 0.05, -0.42), (0.42, WELL_HALF + 0.05)):
        block(frame, "monument", (x0 + x1) / 2.0, back, x1 - x0 - 0.03, WELL_WALL, -PAD_SINK, top - frame.rng.random() * 0.05, yaw=frame.spread(0.02), jag=0.02, bevel=0.022)
    block(frame, "monument", 0.0, back + 0.04, 0.8, WELL_WALL + 0.08, -PAD_SINK, top + 0.04, bevel=0.022)
    for side in (-1.0, 1.0):
        frame.beam("glyph", (side * 0.3, back - 0.2, top + 0.04 - INLAY), (0.0, back + 0.18, top + 0.04 - INLAY), 0.07, INLAY * 2.0)
    for x0, x1 in ((-1.22, -0.35), (-0.32, 0.48)):
        block(frame, "monument", (x0 + x1) / 2.0, WELL_FRONT - 0.12, x1 - x0, 0.26, -PAD_SINK, 0.1 - frame.rng.random() * 0.02, yaw=frame.spread(0.03), jag=0.01, bevel=0.015)
    chips(frame, (0.85, WELL_FRONT - 0.3), 3, 0.3, 0.06, 0.12)
    corner_x: float = WELL_HALF + 0.32
    well_post(frame, -corner_x, WELL_FRONT - 0.2, WELL_CORNER, False, True)
    well_post(frame, corner_x, WELL_FRONT - 0.2, 0.42, True, False)
    well_post(frame, -corner_x, back, WELL_CORNER + 0.32, False, True)
    block(frame, "monument", corner_x, back, 0.68, 0.68, -PAD_SINK, 0.16, yaw=0.2, jag=0.05, bevel=0.02)
    block(frame, "monument", corner_x + 0.95, back - 0.05, 0.62, 0.62, -0.32, 0.32, yaw=0.5, tilt_x=math.pi / 2.0 - 0.15, tilt_y=0.2, jag=0.03, bevel=0.025)
    chips(frame, (corner_x + 0.6, back + 0.4), 4, 0.5, 0.07, 0.15)
    chips(frame, (corner_x + 0.3, WELL_FRONT - 0.5), 3, 0.4, 0.07, 0.14)
    rubble(frame, 12, 2.2, 3.0, 0.07, 0.2)
    veil: Kit = Kit(62)
    wall: float = WELL_BACK + 0.07 - 0.01
    quad(veil, "veil", [(-WELL_HALF, WELL_FRONT, 0.02), (WELL_HALF, WELL_FRONT, 0.02), (WELL_HALF, wall, 0.02), (-WELL_HALF, wall, 0.02)], [(0.0, 0.0), (1.0, 0.0), (1.0, 0.5), (0.0, 0.5)])
    quad(veil, "veil", [(-WELL_HALF, wall, 0.02), (WELL_HALF, wall, 0.02), (WELL_HALF, wall, WELL_RIM), (-WELL_HALF, wall, WELL_RIM)], [(0.0, 0.5), (1.0, 0.5), (1.0, 1.0), (0.0, 1.0)])
    seal: Kit = Kit(63)
    seal.box("stone", 0.0, (WELL_FRONT + wall) / 2.0, 0.0, WELL_HALF * 2.0 - 0.04, wall - WELL_FRONT - 0.04, 0.18, jitter=0.006)
    seal.box("glyph", 0.0, (WELL_FRONT + wall) / 2.0, 0.18 - INLAY, 1.3, 0.08, INLAY * 2.0)
    seal.box("glyph", 0.0, (WELL_FRONT + wall) / 2.0, 0.18 - INLAY, 0.08, 1.6, INLAY * 2.0)
    return [Node("frame", frame), Node("veil", veil), Node("seal", seal)]


def checkpoint() -> list[Node]:
    stone: Kit = Kit(71)
    back: float = 1.9
    flagstones(stone, (0.0, back), (1.25, 1.05), 0.5, [(-0.55, 0.55, -0.36, 0.36)], 0.12, 0.2)
    block(stone, "monument", 0.0, back, 1.0, 0.66, -PAD_SINK, 0.22, yaw=0.06, tilt_y=0.03, jag=0.03, bevel=0.025)
    shape: Matrix = settled(0.02, back + 0.03, 0.14, 0.06, -0.07, 0.04)
    prism(stone, "monument", [(-0.32, -0.15), (0.32, -0.15), (0.32, 0.15), (-0.32, 0.15)], 0.0, 1.62, shape, jag=0.05, slope=(-0.22, 0.0), bevel=0.025)
    face_mark(stone, shape, -0.03, 0.03, 0.3, 1.12, -0.15)
    for z, width in ((0.58, 0.16), (0.82, 0.12)):
        face_mark(stone, shape, -width, width, z, z + 0.05, -0.15)
    face_mark(stone, shape, -0.09, 0.09, 1.22, 1.32, -0.15)
    chips(stone, (0.55, back - 0.45), 3, 0.35, 0.07, 0.13)
    chips(stone, (-0.5, back + 0.3), 2, 0.3, 0.06, 0.11)
    return [Node("stele", stone)]


MODELS: dict[str, Callable[[], list[Node]]] = {
    "waypoint": waypoint,
    "waypoint_circle": waypoint_circle,
    "waypoint_obelisk": waypoint_obelisk,
    "waypoint_columns": waypoint_columns,
    "waypoint_cairn": waypoint_cairn,
    "way_up": way_up,
    "way_down": way_down,
    "checkpoint_stone": checkpoint,
}


def node_object(node: Node) -> tuple[Object, int]:
    if node.kit is None:
        empty: Object = bpy.data.objects.new(node.name, None)
        empty.location = Vector(node.at)
        empty.rotation_euler = node.turn
        bpy.context.scene.collection.objects.link(empty)
        return empty, 0
    mesh = bpy.data.meshes.new(node.name)
    combined: BMesh = bmesh.new()
    triangles: int = 0
    for index, (name, made) in enumerate(node.kit.parts.items()):
        if len(made.faces) == 0:
            made.free()
            continue
        if name != "veil":
            bmesh.ops.recalc_face_normals(made, faces=made.faces[:])
        made.normal_update()
        if name != "veil":
            unwrap(made)
        sharpen(made)
        bmesh.ops.triangulate(made, faces=made.faces[:])
        triangles += len(made.faces)
        for face in made.faces:
            face.material_index = len(mesh.materials)
        part = bpy.data.meshes.new(f"{node.name}_{name}")
        made.to_mesh(part)
        made.free()
        combined.from_mesh(part)
        bpy.data.meshes.remove(part)
        mesh.materials.append(material(name))
    combined.to_mesh(mesh)
    combined.free()
    obj: Object = bpy.data.objects.new(node.name, mesh)
    obj.location = Vector(node.at)
    bpy.context.scene.collection.objects.link(obj)
    return obj, triangles


def export_nodes(nodes: list[Node], path: str) -> int:
    clear_scene()
    triangles: int = 0
    made: dict[str, Object] = {}
    for node in nodes:
        obj, count = node_object(node)
        made[node.name] = obj
        triangles += count
    for node in nodes:
        if node.parent is not None:
            made[node.name].parent = made[node.parent]
    for obj in made.values():
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
    return triangles


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) < 1:
        raise SystemExit("usage: blender -b --factory-startup --python blender/build_markers.py -- <output dir>")
    target: str = arguments[0]
    os.makedirs(target, exist_ok=True)
    for name, build in MODELS.items():
        triangles: int = export_nodes(build(), os.path.join(target, f"{name}.glb"))
        print(f"built {name}: {triangles} triangles")


main()

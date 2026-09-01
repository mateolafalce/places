#!/usr/bin/env python3
"""Orchard House cast: pixel portraits + seated floorplan, in the Munder Difflin style.

Guests are not name chips. Each one is a recipe (skin, hair, clothes, face)
rendered as an 18×32 sprite — front for the near side of a table, back for the
far side — then planted around the Saturday room.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_CAST = ROOT / "docs" / "media" / "cast"
OUT_FLOOR = ROOT / "docs" / "media" / "floor.png"
OUT_ROSTER = ROOT / "docs" / "media" / "roster.png"
OUT_SVG = ROOT / "docs" / "media" / "floor.svg"

PORTRAIT_W, PORTRAIT_H = 18, 28
SCENE_W, SCENE_H = 18, 32
HX0, HX1 = 4, 13
OUTLINE = (38, 34, 46)
SHOE = (44, 40, 48)
RGB = tuple[int, int, int]
Buf = bytearray

SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"

WAX, GOLD, PAPER, INK = "#8C2F39", "#C9A227", "#F4EFE4", "#2C2416"
MUTED, LINE, CARD = "#7A6E5C", "#C9B89A", "#FFFEFA"
ROOM, OUTER, WOOD = "#F3EBDC", "#D7CBB4", "#B58958"

CUR_W, CUR_H = PORTRAIT_W, PORTRAIT_H


def clamp(v: float) -> int:
    return 0 if v < 0 else 255 if v > 255 else int(round(v))


def shades(rgb: RGB, dl: float = 1.22, dd: float = 0.68) -> tuple[RGB, RGB, RGB]:
    return (
        (clamp(rgb[0] * dl), clamp(rgb[1] * dl), clamp(rgb[2] * dl)),
        rgb,
        (clamp(rgb[0] * dd), clamp(rgb[1] * dd), clamp(rgb[2] * dd)),
    )


def _i(x: int, y: int) -> int:
    return (y * CUR_W + x) * 4


def setp(buf: Buf, x: int, y: int, c: RGB, a: int = 255) -> None:
    if x < 0 or x >= CUR_W or y < 0 or y >= CUR_H:
        return
    i = _i(x, y)
    buf[i] = c[0]
    buf[i + 1] = c[1]
    buf[i + 2] = c[2]
    buf[i + 3] = a


def alpha_at(buf: Buf, x: int, y: int) -> int:
    if x < 0 or x >= CUR_W or y < 0 or y >= CUR_H:
        return 0
    return buf[_i(x, y) + 3]


def rgb_at(buf: Buf, x: int, y: int) -> RGB:
    i = _i(x, y)
    return (buf[i], buf[i + 1], buf[i + 2])


def eq(a: RGB, b: RGB) -> bool:
    return a[0] == b[0] and a[1] == b[1] and a[2] == b[2]


def rect(buf: Buf, x0: int, y0: int, x1: int, y1: int, c: RGB) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            setp(buf, x, y, c)


def new_buf(w: int, h: int) -> Buf:
    return bytearray(w * h * 4)


SKIN = {
    "light": {"hi": (255, 221, 189), "base": (247, 201, 170), "sh": (212, 158, 126), "line": (168, 112, 82)},
    "tan": {"hi": (232, 182, 136), "base": (214, 162, 116), "sh": (176, 126, 86), "line": (138, 92, 60)},
    "brown": {"hi": (180, 130, 94), "base": (158, 112, 78), "sh": (124, 86, 58), "line": (90, 60, 40)},
    "dark": {"hi": (142, 98, 70), "base": (120, 80, 56), "sh": (94, 62, 42), "line": (64, 42, 28)},
}


def draw_head(buf: Buf, skin: str) -> None:
    s = SKIN[skin]
    for y in range(4, 17):
        for x in range(HX0, HX1 + 1):
            if ((x in (HX0, HX1) and y in (4, 5, 16)) or (x in (5, 12) and y == 4)):
                continue
            setp(buf, x, y, s["base"])
    for y in range(6, 12):
        setp(buf, 5, y, s["hi"])
    setp(buf, 6, 5, s["hi"])
    setp(buf, 7, 5, s["hi"])
    for y in range(6, 15):
        setp(buf, 12, y, s["sh"])
    for x in range(7, 12):
        setp(buf, x, 16, s["sh"])
    for ex in (HX0 - 1, HX1 + 1):
        setp(buf, ex, 9, s["base"])
        setp(buf, ex, 10, s["base"])
        setp(buf, ex, 11, s["sh"])
    rect(buf, 7, 17, 10, 18, s["sh"])
    rect(buf, 7, 17, 9, 17, s["base"])


def draw_heavy_face(buf: Buf, skin: str) -> None:
    s = SKIN[skin]
    for y in range(11, 16):
        setp(buf, HX0 - 1, y, s["base"])
        setp(buf, HX1 + 1, y, s["base"])
    setp(buf, HX0 - 1, 15, s["sh"])
    setp(buf, HX1 + 1, 15, s["sh"])
    for x in (5, 6, 11, 12):
        setp(buf, x, 16, s["base"])
    rect(buf, 6, 17, 11, 18, s["base"])
    for x in range(6, 12):
        setp(buf, x, 18, s["sh"])
    setp(buf, 7, 17, s["sh"])
    setp(buf, 10, 17, s["sh"])


def draw_face(buf: Buf, skin: str, brow: str, mouth: str, blush: bool, lashes: bool) -> None:
    s = SKIN[skin]
    white, pup = (250, 248, 244), (46, 38, 42)
    for a, b, p in ((5, 6, 6), (10, 11, 10)):
        setp(buf, a, 9, white)
        setp(buf, b, 9, white)
        setp(buf, p, 9, pup)
    if lashes:
        lash, glint = (54, 40, 48), (252, 250, 248)
        for x in (5, 6, 10, 11):
            setp(buf, x, 8, lash)
        setp(buf, 4, 8, lash)
        setp(buf, 12, 8, lash)
        setp(buf, 5, 9, glint)
        setp(buf, 10, 9, glint)
    if brow == "flat":
        for x in (5, 6, 10, 11):
            setp(buf, x, 7, s["line"])
    elif brow == "angry":
        setp(buf, 5, 8, s["line"])
        setp(buf, 6, 7, s["line"])
        setp(buf, 10, 7, s["line"])
        setp(buf, 11, 8, s["line"])
    elif brow == "raised":
        for x in (5, 6, 10, 11):
            setp(buf, x, 6, s["line"])
    elif brow == "soft":
        for x in (5, 11):
            setp(buf, x, 7, s["line"])
        for x in (6, 10):
            setp(buf, x, 7, s["sh"])
    setp(buf, 8, 11, s["sh"])
    setp(buf, 8, 12, s["sh"])
    setp(buf, 7, 12, s["sh"])
    mc = (158, 86, 80)
    mouths = {
        "neutral": [(7, 14), (8, 14), (9, 14), (10, 14)],
        "smile": [(7, 14), (8, 14), (9, 14), (10, 14), (6, 13), (11, 13)],
        # corners sit lower than the lip (y grows down) so it reads as a frown
        "frown": [(7, 14), (8, 14), (9, 14), (10, 14), (6, 15), (11, 15)],
        "grin": [(7, 14), (8, 14), (9, 14), (10, 14), (7, 13), (8, 13), (9, 13), (10, 13), (6, 13), (11, 13)],
    }
    for x, y in mouths[mouth]:
        setp(buf, x, y, mc)
    if blush:
        for x in (5, 12):
            setp(buf, x, 12, (235, 150, 140), 140)


def style_short(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, sh = shades(color)
    part, recede = a.get("part", "L"), a.get("recede", 0)
    rect(buf, HX0, 2, HX1, 4, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 3, base)
    rect(buf, HX0 - 1, 4, HX1 + 1, 5, base)
    for y in range(6, 9):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    if recede:
        for y in range(3, 6):
            for x in range(6, 12):
                if eq(rgb_at(buf, x, y), base):
                    setp(buf, x, y, skin_base)
        setp(buf, 8, 5, base)
    hx = 6 if part == "L" else 11
    for y in range(2, 6):
        setp(buf, hx, y, sh)
    for x in range(HX0, hx):
        if alpha_at(buf, x, 3):
            setp(buf, x, 3, hi)
    for x in range(HX0, HX1 + 1):
        if alpha_at(buf, x, 2):
            setp(buf, x, 2, hi)


def style_floppy(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, _ = shades(color)
    rect(buf, HX0, 2, HX1, 4, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 3, base)
    rect(buf, HX0 - 1, 4, HX1 + 1, 5, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    for x in range(6, 13):
        setp(buf, x, 6, base)
    setp(buf, 9, 7, base)
    setp(buf, 10, 7, base)
    setp(buf, 11, 7, base)
    for y in range(6, 9):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    for x in range(HX0, HX1 + 1):
        if alpha_at(buf, x, 2):
            setp(buf, x, 2, hi)
    for x in (7, 8, 9):
        setp(buf, x, 6, hi)


def style_frame(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, sh = shades(color)
    length, vol = a.get("length", 17), a.get("vol", 1)
    rect(buf, HX0 - 1, 2, HX1 + 1, 5, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 3, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    for x in range(6, 12):
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for y in range(6, length + 1):
        for dx in range(vol):
            setp(buf, HX0 - 1 - dx, y, base)
            setp(buf, HX1 + 1 + dx, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
    for x in range(HX0 - 1, HX0 + 1):
        setp(buf, x, length + 1, base)
    for x in range(HX1, HX1 + 2):
        setp(buf, x, length + 1, base)
    for y in range(2, 6):
        if alpha_at(buf, HX1, y):
            setp(buf, HX1, y, sh)
    for x in range(HX0, 9):
        if alpha_at(buf, x, 2):
            setp(buf, x, 2, hi)


def style_bun(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, _ = shades(color)
    rect(buf, HX0, 3, HX1, 5, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 4, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    for x in range(6, 12):
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for y in range(6, 9):
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
    rect(buf, 7, 1, 10, 2, base)
    for x in range(HX0, HX1 + 1):
        if alpha_at(buf, x, 3):
            setp(buf, x, 3, hi)


def style_curly(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, _ = shades(color)
    pts = [
        (4, 3), (5, 2), (6, 3), (7, 2), (8, 3), (9, 2), (10, 3), (11, 2), (12, 3), (13, 3),
        (3, 4), (4, 4), (13, 4), (14, 4), (3, 5), (4, 5), (13, 5), (14, 5),
        (3, 6), (13, 6), (4, 6), (12, 6), (3, 7), (13, 7), (4, 7),
    ]
    rect(buf, HX0, 3, HX1, 5, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 4, base)
    for x, y in pts:
        setp(buf, x, y, base)
    for x in range(6, 12):
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for x in (5, 7, 9, 11):
        setp(buf, x, 2, hi)


def style_messy(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, _ = shades(color)
    length = a.get("length", 8)
    rect(buf, HX0 - 1, 2, HX1 + 1, 5, base)
    spikes = [(3, 2), (5, 1), (7, 2), (9, 1), (11, 2), (13, 1), (14, 2), (4, 2), (12, 2)]
    for x, y in spikes:
        setp(buf, x, y, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    for x in range(6, 12):
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for y in range(6, length + 1):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    for x, y in spikes:
        setp(buf, x, y, hi)


def style_recede(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    _, base, sh = shades(color)
    for y in range(4, 10):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 4, base)
    for x in range(HX0 + 1, HX1):
        setp(buf, x, 5, base)
    for y in range(5, 9):
        for x in range(6, 12):
            if eq(rgb_at(buf, x, y), base):
                setp(buf, x, y, skin_base)
    for x in range(HX0, HX1 + 1):
        if alpha_at(buf, x, 4):
            setp(buf, x, 4, sh)


def style_spiky(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, _ = shades(color)
    rect(buf, HX0, 3, HX1, 5, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 4, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
    spikes = [(5, 2), (7, 1), (9, 2), (11, 1), (6, 2), (8, 2), (10, 2), (12, 2)]
    for x, y in spikes:
        setp(buf, x, y, base)
    for x in range(6, 12):
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for y in range(6, 8):
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
    for x, y in spikes:
        setp(buf, x, y, hi)


def style_bald(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    shi, sbase, ssh = shades(skin_base, 1.1, 0.82)
    for x in range(6, 12):
        setp(buf, x, 2, sbase)
    for x in range(5, 13):
        setp(buf, x, 3, sbase)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 4, sbase)
    for x in (7, 8, 9):
        setp(buf, x, 2, shi)
    setp(buf, 6, 3, shi)
    setp(buf, 7, 3, shi)
    setp(buf, 5, 3, ssh)
    setp(buf, 12, 3, ssh)
    setp(buf, HX1, 4, ssh)
    _, base, sh = shades(color)
    top = 8 if a.get("recede") else 6
    for y in range(top, 11):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
        setp(buf, HX0 - 1, y, sh)
        setp(buf, HX1 + 1, y, sh)


def style_bob(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, sh = shades(color)
    rect(buf, HX0 - 1, 2, HX1 + 1, 6, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 6, base)
    for x in range(6, 12):
        setp(buf, x, 7, base)
    setp(buf, 8, 7, skin_base)
    setp(buf, 9, 7, skin_base)
    for y in range(6, 12):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    rect(buf, HX0 - 1, 11, HX0 + 1, 12, base)
    rect(buf, HX1 - 1, 11, HX1 + 1, 12, base)
    for x in range(HX0, HX1 + 1):
        if alpha_at(buf, x, 2):
            setp(buf, x, 2, hi)
    for y in range(4, 11):
        setp(buf, HX1 + 1, y, sh)


def style_pigtails(buf: Buf, color: RGB, skin_base: RGB, a: dict) -> None:
    hi, base, sh = shades(color)
    rect(buf, HX0, 2, HX1, 5, base)
    for x in range(HX0 - 1, HX1 + 2):
        setp(buf, x, 3, base)
    for x in range(HX0, HX1 + 1):
        setp(buf, x, 5, base)
        setp(buf, x, 6, base)
    setp(buf, 8, 6, skin_base)
    setp(buf, 9, 6, skin_base)
    for y in range(6, 9):
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
    # stems from the ears, then two round tails that clear the head
    for x, y in ((3, 8), (3, 9), (14, 8), (14, 9)):
        setp(buf, x, y, base)
    for cx, cy in ((1, 11), (16, 11)):
        for y in range(cy - 2, cy + 3):
            for x in range(cx - 1, cx + 2):
                setp(buf, x, y, base)
        setp(buf, cx, cy - 2, hi)
        setp(buf, cx, cy + 2, sh)
        setp(buf, cx, cy, hi)
    for x in range(HX0, 10):
        if alpha_at(buf, x, 2):
            setp(buf, x, 2, hi)


HAIR_FNS: dict[str, Callable] = {
    "short": style_short,
    "floppy": style_floppy,
    "frame": style_frame,
    "bun": style_bun,
    "curly": style_curly,
    "messy": style_messy,
    "recede": style_recede,
    "spiky": style_spiky,
    "bald": style_bald,
    "bob": style_bob,
    "pigtails": style_pigtails,
}


def draw_facial(buf: Buf, kind: str, color: RGB) -> None:
    _, base, sh = shades(color)
    if kind == "mustache":
        for x in range(6, 11):
            setp(buf, x, 13, base)
        setp(buf, 6, 12, base)
        setp(buf, 10, 12, base)
    elif kind == "mustacheSm":
        for x in (7, 8, 9):
            setp(buf, x, 13, base)
    elif kind == "stubble":
        for x, y in ((5, 14), (6, 15), (7, 15), (8, 15), (9, 15), (10, 15), (11, 14), (12, 13), (4, 13), (5, 15), (10, 15)):
            setp(buf, x, y, sh, 150)
    elif kind == "goatee":
        for x in (8, 9):
            setp(buf, x, 15, base)
        setp(buf, 8, 14, base)
        setp(buf, 9, 14, base)
        for x in range(7, 11):
            setp(buf, x, 13, base)


def draw_glasses(buf: Buf) -> None:
    frame, glint = (60, 54, 62), (236, 240, 246)
    for x in (5, 6):
        setp(buf, x, 8, frame)
        setp(buf, x, 10, frame)
    setp(buf, 4, 9, frame)
    setp(buf, 7, 9, frame)
    setp(buf, 4, 8, frame)
    setp(buf, 7, 8, frame)
    for x in (10, 11):
        setp(buf, x, 8, frame)
        setp(buf, x, 10, frame)
    setp(buf, 9, 9, frame)
    setp(buf, 12, 9, frame)
    setp(buf, 9, 8, frame)
    setp(buf, 12, 8, frame)
    setp(buf, 8, 8, frame)
    setp(buf, 3, 9, frame)
    setp(buf, 13, 9, frame)
    setp(buf, 4, 8, glint)
    setp(buf, 9, 8, glint)


def body_shape(buf: Buf, col: RGB, heavy: bool = False) -> None:
    _, base, sh = shades(col)
    rows = (
        [(19, 5, 12), (20, 3, 14), (21, 2, 15), (22, 1, 16), (23, 1, 16), (24, 0, 17), (25, 0, 17), (26, 0, 17), (27, 0, 17)]
        if heavy
        else [(19, 6, 11), (20, 4, 13), (21, 3, 14), (22, 2, 15), (23, 2, 15), (24, 1, 16), (25, 1, 16), (26, 1, 16), (27, 1, 16)]
    )
    for y, a, b in rows:
        rect(buf, a, y, b, y, base)
    lo, hi = (1, 16) if heavy else (2, 15)
    for y in range(22, 28):
        setp(buf, lo, y, sh)
        setp(buf, hi, y, sh)


def draw_clothing(buf: Buf, kind: str, c1: RGB, c2: RGB | None, tie: RGB | None, skin: str, heavy: bool) -> None:
    hi, base, sh = shades(c1)
    body_shape(buf, c1, heavy)
    if kind == "suit":
        white = (238, 238, 236)
        for x, y in ((8, 19), (9, 19), (7, 20), (8, 20), (9, 20), (10, 20), (8, 21), (9, 21)):
            setp(buf, x, y, white)
        for x, y in ((6, 20), (7, 21), (11, 20), (10, 21), (6, 21), (11, 21)):
            setp(buf, x, y, sh)
        if tie:
            for y in range(20, 26):
                setp(buf, 8, y, tie)
                setp(buf, 9, y, tie)
            setp(buf, 8, 20, shades(tie)[0])
        else:
            for y in range(22, 26):
                setp(buf, 8, y, white)
                setp(buf, 9, y, white)
    elif kind == "dressshirt":
        for x, y in ((6, 19), (7, 19), (10, 19), (11, 19), (7, 20), (10, 20)):
            setp(buf, x, y, sh)
        for y in range(20, 27, 2):
            setp(buf, 8, y, sh)
        if tie:
            for y in range(19, 26):
                setp(buf, 8, y, tie)
                setp(buf, 9, y, tie)
    elif kind in ("polo", "hoodie"):
        for x, y in ((6, 19), (7, 19), (10, 19), (11, 19)):
            setp(buf, x, y, hi)
        setp(buf, 8, 20, sh)
        setp(buf, 8, 22, sh)
        accent = shades(c2)[1] if c2 else hi
        setp(buf, 7, 20, accent)
        setp(buf, 9, 20, accent)
    elif kind == "blouse":
        s = SKIN[skin]
        for x, y in ((7, 19), (8, 19), (9, 19), (10, 19), (8, 20), (9, 20)):
            setp(buf, x, y, s["sh"])
        for x in range(5, 13):
            if eq(rgb_at(buf, x, 20), base):
                setp(buf, x, 20, hi)
    elif kind == "cardigan":
        inner = shades(c2)[1] if c2 else (235, 233, 226)
        for y in range(19, 27):
            setp(buf, 8, y, inner)
            setp(buf, 9, y, inner)
        for x, y in ((6, 19), (7, 19), (10, 19), (11, 19)):
            setp(buf, x, y, sh)
    elif kind == "sweater":
        for x in range(6, 12):
            setp(buf, x, 19, sh)


def collar_neck(buf: Buf, skin: str) -> None:
    rect(buf, 7, 18, 10, 19, SKIN[skin]["sh"])


def draw_hood(buf: Buf, c1: RGB) -> None:
    """Folded-down hood: a cloth cap on the crown + a collar, not ear-cups."""
    hi, base, sh = shades(c1)
    for x in range(5, 13):
        if alpha_at(buf, x, 1) == 0:
            setp(buf, x, 1, base)
    for x in range(4, 14):
        if alpha_at(buf, x, 2) == 0:
            setp(buf, x, 2, hi)
    # collar / drawstrings at the neck, not the ears
    setp(buf, 6, 18, sh)
    setp(buf, 11, 18, sh)
    setp(buf, 7, 19, hi)
    setp(buf, 10, 19, hi)


def draw_scene_legs(buf: Buf, pants: RGB, phase: int, kid: bool) -> None:
    _, base, sh = shades(pants)
    # seated: short thighs. Kids sit even shorter so they read smaller.
    y0, y1 = (24, 26) if kid else (25, 28)
    for lx0, lx1 in ((5, 7), (10, 12)):
        rect(buf, lx0, y0, lx1, y1, base)
        for y in range(y0, y1 + 1):
            setp(buf, lx1, y, sh)
    foot = y1 + 1
    rect(buf, 5, foot, 7, foot, SHOE)
    rect(buf, 10, foot, 12, foot, SHOE)


def draw_wheelchair(buf: Buf) -> None:
    tire, hub, seat, chrome = (40, 38, 44), (176, 168, 158), (118, 96, 70), (90, 86, 92)
    rect(buf, 5, 24, 12, 26, seat)
    rect(buf, 6, 26, 11, 27, chrome)
    for cx, cy in ((2, 28), (15, 28)):
        for y in range(cy - 4, cy + 5):
            for x in range(cx - 3, cx + 4):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if d2 <= 14:
                    setp(buf, x, y, tire)
                if d2 <= 4:
                    setp(buf, x, y, hub)
    rect(buf, 6, 30, 11, 31, chrome)


def draw_scene_torso(buf: Buf, r: dict, back: bool) -> None:
    hi, base, sh = shades(r["c1"])
    if r.get("heavy"):
        rect(buf, 3, 18, 14, 18, base)
        rect(buf, 2, 19, 15, 19, base)
        rect(buf, 2, 20, 15, 24, base)
        for y in range(20, 25):
            setp(buf, 2, y, sh)
            setp(buf, 15, y, sh)
            setp(buf, 14, y, sh)
    else:
        rect(buf, 4, 18, 13, 18, base)
        rect(buf, 3, 19, 14, 19, base)
        rect(buf, 4, 20, 13, 24, base)
        for y in range(20, 25):
            setp(buf, 3, y, sh)
            setp(buf, 14, y, sh)
            setp(buf, 13, y, sh)
    if back:
        rect(buf, 6, 18, 11, 18, sh)
        for y in range(19, 25):
            setp(buf, 8, y, sh)
        return
    skin = SKIN[r["skin"]]
    cloth = r["cloth"]
    if cloth == "suit":
        white = (238, 238, 236)
        for x, y in ((8, 18), (9, 18), (7, 19), (8, 19), (9, 19), (10, 19), (8, 20), (9, 20)):
            setp(buf, x, y, white)
        for x, y in ((6, 19), (7, 20), (11, 19), (10, 20)):
            setp(buf, x, y, sh)
        if r.get("tie"):
            for y in range(19, 25):
                setp(buf, 8, y, r["tie"])
                setp(buf, 9, y, r["tie"])
            setp(buf, 8, 19, shades(r["tie"])[0])
    elif cloth == "dressshirt":
        for x, y in ((6, 18), (7, 18), (10, 18), (11, 18), (7, 19), (10, 19)):
            setp(buf, x, y, sh)
        if r.get("tie"):
            for y in range(18, 25):
                setp(buf, 8, y, r["tie"])
                setp(buf, 9, y, r["tie"])
        else:
            for y in range(20, 25, 2):
                setp(buf, 8, y, sh)
    elif cloth in ("polo", "hoodie"):
        for x, y in ((6, 18), (7, 18), (10, 18), (11, 18)):
            setp(buf, x, y, hi)
        setp(buf, 8, 19, sh)
        setp(buf, 8, 21, sh)
    elif cloth == "blouse":
        for x, y in ((7, 18), (8, 18), (9, 18), (10, 18), (8, 19), (9, 19)):
            setp(buf, x, y, skin["sh"])
        for x in range(5, 13):
            if eq(rgb_at(buf, x, 19), base):
                setp(buf, x, 19, hi)
    elif cloth == "cardigan":
        inner = shades(r["c2"])[1] if r.get("c2") else (235, 233, 226)
        for y in range(18, 25):
            setp(buf, 8, y, inner)
            setp(buf, 9, y, inner)
        for x, y in ((6, 18), (7, 18), (10, 18), (11, 18)):
            setp(buf, x, y, sh)
    elif cloth == "sweater":
        for x in range(6, 12):
            setp(buf, x, 18, sh)


def draw_head_back(buf: Buf, r: dict) -> None:
    s = SKIN[r["skin"]]
    if r["hair"] == "bald":
        draw_head_back_bald(buf, r)
        return
    hi, base, sh = shades(r["hairc"])
    rows = [
        (2, 6, 11), (3, 5, 12), (4, 4, 13), (5, 4, 13), (6, 4, 13), (7, 4, 13), (8, 4, 13),
        (9, 4, 13), (10, 4, 13), (11, 4, 13), (12, 4, 13), (13, 5, 12), (14, 6, 11),
    ]
    for y, a, b in rows:
        rect(buf, a, y, b, y, base)
    length = 0
    if r["hair"] == "frame":
        length = r.get("hairargs", {}).get("length", 17)
    elif r["hair"] == "messy":
        length = r.get("hairargs", {}).get("length", 9)
    elif r["hair"] in ("bob", "pigtails"):
        length = 11
    for y in range(11, length + 1):
        setp(buf, HX0 - 1, y, base)
        setp(buf, HX0, y, base)
        setp(buf, HX1, y, base)
        setp(buf, HX1 + 1, y, base)
    if r["hair"] == "pigtails":
        for cx, cy in ((1, 11), (16, 11)):
            for y in range(cy - 2, cy + 3):
                for x in range(cx - 1, cx + 2):
                    setp(buf, x, y, base)
            setp(buf, 3, 9, base)
            setp(buf, 14, 9, base)
    if r["hair"] == "curly":
        for x, y in ((3, 4), (14, 4), (3, 6), (14, 6), (4, 2), (13, 2)):
            setp(buf, x, y, base)
    for y in range(4, 13):
        setp(buf, 4, y, sh)
        setp(buf, 13, y, sh)
    for x, y in ((5, 3), (12, 3), (5, 13), (12, 13), (6, 14), (11, 14)):
        setp(buf, x, y, sh)
    for x, y in ((7, 2), (8, 2), (9, 2), (10, 2), (7, 3), (8, 3), (9, 3)):
        setp(buf, x, y, hi)
    for y in range(4, 12):
        setp(buf, 9, y, hi)
    for y in range(4, 13):
        setp(buf, 8, y, sh)
    rect(buf, 7, 14, 10, 14, sh)
    rect(buf, 7, 15, 10, 17, s["sh"])
    rect(buf, 7, 15, 9, 15, s["base"])


def draw_head_back_bald(buf: Buf, r: dict) -> None:
    s = SKIN[r["skin"]]
    shi, sbase, ssh = shades(s["base"], 1.1, 0.82)
    rows = [
        (2, 6, 11), (3, 5, 12), (4, 4, 13), (5, 4, 13), (6, 4, 13), (7, 4, 13), (8, 4, 13),
        (9, 4, 13), (10, 4, 13), (11, 4, 13), (12, 4, 13), (13, 5, 12), (14, 6, 11),
    ]
    for y, a, b in rows:
        rect(buf, a, y, b, y, sbase)
    for y in range(4, 13):
        setp(buf, 4, y, ssh)
        setp(buf, 13, y, ssh)
    for x, y in ((7, 2), (8, 2), (9, 2), (8, 3), (9, 4), (9, 5)):
        setp(buf, x, y, shi)
    _, base, sh = shades(r["hairc"])
    for x in range(4, 14):
        setp(buf, x, 11, base)
        setp(buf, x, 12, base)
    for x in (4, 13):
        setp(buf, x, 11, sh)
        setp(buf, x, 12, sh)
    rect(buf, 7, 14, 10, 14, s["sh"])
    rect(buf, 7, 15, 10, 17, s["sh"])
    rect(buf, 7, 15, 9, 15, s["base"])


def outline_pass(buf: Buf) -> None:
    pts: list[tuple[int, int]] = []
    for y in range(CUR_H):
        for x in range(CUR_W):
            if alpha_at(buf, x, y) != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if alpha_at(buf, x + dx, y + dy) == 255:
                    pts.append((x, y))
                    break
    for x, y in pts:
        setp(buf, x, y, OUTLINE)


def draw_head_group(buf: Buf, r: dict) -> None:
    skin_base = SKIN[r["skin"]]["base"]
    draw_head(buf, r["skin"])
    if r.get("heavy"):
        draw_heavy_face(buf, r["skin"])
    draw_face(buf, r["skin"], r.get("brow", "flat"), r.get("mouth", "neutral"), r.get("blush", False), r.get("lashes", False))
    if r.get("facial"):
        draw_facial(buf, r["facial"], r["hairc"])
    HAIR_FNS[r["hair"]](buf, r["hairc"], skin_base, r.get("hairargs") or {})
    if r.get("glasses"):
        draw_glasses(buf)
    if r["cloth"] == "hoodie":
        draw_hood(buf, r["c1"])


def default_pants(r: dict) -> RGB:
    if r.get("pants"):
        return r["pants"]
    return shades(r["c1"])[2] if r["cloth"] == "suit" else (54, 56, 70)


def compose_portrait(r: dict) -> Buf:
    global CUR_W, CUR_H
    CUR_W, CUR_H = PORTRAIT_W, PORTRAIT_H
    buf = new_buf(PORTRAIT_W, PORTRAIT_H)
    draw_clothing(buf, r["cloth"], r["c1"], r.get("c2"), r.get("tie"), r["skin"], r.get("heavy", False))
    collar_neck(buf, r["skin"])
    draw_head_group(buf, r)
    outline_pass(buf)
    return buf


def compose_scene(r: dict, back: bool = False) -> Buf:
    global CUR_W, CUR_H
    CUR_W, CUR_H = SCENE_W, SCENE_H
    buf = new_buf(SCENE_W, SCENE_H)
    draw_scene_torso(buf, r, back)
    if r.get("wheelchair"):
        draw_wheelchair(buf)
    else:
        draw_scene_legs(buf, default_pants(r), 0, r.get("kid", False))
    if back:
        draw_head_back(buf, r)
    else:
        draw_head_group(buf, r)
    outline_pass(buf)
    return buf


def buf_to_image(buf: Buf, w: int, h: int, scale: int) -> Image.Image:
    img = Image.frombytes("RGBA", (w, h), bytes(buf))
    if scale != 1:
        img = img.resize((w * scale, h * scale), Image.Resampling.NEAREST)
    return img


# ─── the Saturday cast ────────────────────────────────────────────────────────
# Distinct people, not a CSV. Tags drive seating law; the recipe is the face.

GUESTS: dict[str, dict] = {
    "mabel": {
        "display": "Mabel", "role": "grandparent", "blurb": "Window or bust.",
        "skin": "light", "hairc": (214, 208, 196), "hair": "curly",
        "cloth": "cardigan", "c1": (168, 96, 118), "c2": (244, 236, 226),
        "glasses": True, "brow": "soft", "mouth": "smile", "lashes": True, "pinned": True,
    },
    "harold": {
        "display": "Harold", "role": "grandparent", "blurb": "Sits with Mabel.",
        "skin": "light", "hairc": (196, 192, 184), "hair": "recede",
        "cloth": "sweater", "c1": (62, 78, 112),
        "glasses": True, "facial": "mustache", "brow": "soft", "mouth": "smile",
    },
    "pip": {
        "display": "Pip", "role": "kid", "blurb": "Will steal dessert.",
        "skin": "light", "hairc": (92, 58, 32), "hair": "messy",
        "cloth": "sweater", "c1": (212, 168, 58),
        "brow": "raised", "mouth": "grin", "kid": True,
    },
    "nell": {
        "display": "Nell", "role": "kid", "blurb": "Asks for seconds.",
        "skin": "light", "hairc": (168, 64, 48), "hair": "pigtails",
        "cloth": "blouse", "c1": (86, 140, 96),
        "brow": "soft", "mouth": "smile", "blush": True, "lashes": True, "kid": True,
    },
    "theo": {
        "display": "Theo", "role": "kid", "blurb": "Wants the kitchen.",
        "skin": "dark", "hairc": (28, 22, 20), "hair": "short", "hairargs": {"part": "L"},
        "cloth": "polo", "c1": (70, 118, 186),
        "brow": "flat", "mouth": "grin", "kid": True,
    },
    "dot": {
        "display": "Dot", "role": "kid", "blurb": "Quiet. Sticky fingers.",
        "skin": "tan", "hairc": (24, 18, 16), "hair": "bob",
        "cloth": "sweater", "c1": (220, 120, 150),
        "brow": "soft", "mouth": "smile", "lashes": True, "kid": True,
    },
    "rex": {
        "display": "Rex", "role": "do_not_seat", "blurb": "Not next to Vivian.",
        "skin": "light", "hairc": (36, 28, 24), "hair": "spiky",
        "cloth": "dressshirt", "c1": (48, 48, 54),
        "facial": "stubble", "brow": "angry", "mouth": "frown",
    },
    "vivian": {
        "display": "Vivian", "role": "do_not_seat", "blurb": "Not next to Rex.",
        "skin": "light", "hairc": (42, 32, 28), "hair": "frame", "hairargs": {"length": 18, "vol": 2},
        "cloth": "blouse", "c1": (140, 48, 62),
        "brow": "angry", "mouth": "frown", "lashes": True,
    },
    "arthur": {
        "display": "Arthur", "role": "wheelchair", "blurb": "Needs the aisle.",
        "skin": "light", "hairc": (180, 176, 168), "hair": "bald",
        "cloth": "suit", "c1": (118, 96, 70), "tie": (140, 52, 52),
        "glasses": True, "brow": "soft", "mouth": "smile", "wheelchair": True,
    },
    "kit": {
        "display": "Kit", "role": "plus_one", "blurb": "Showed up with Otis.",
        "skin": "tan", "hairc": (48, 36, 28), "hair": "floppy",
        "cloth": "polo", "c1": (72, 140, 128),
        "brow": "raised", "mouth": "smile",
    },
    "ivy": {
        "display": "Ivy", "role": "host_pin", "blurb": "Sits with you, period.",
        "skin": "light", "hairc": (96, 58, 36), "hair": "frame", "hairargs": {"length": 19, "vol": 1},
        "cloth": "cardigan", "c1": (120, 148, 96), "c2": (244, 236, 220),
        "brow": "soft", "mouth": "smile", "blush": True, "lashes": True,
    },
    "jules": {
        "display": "Jules", "role": "", "blurb": "Brought the wine.",
        "skin": "tan", "hairc": (176, 92, 48), "hair": "short", "hairargs": {"part": "R"},
        "cloth": "polo", "c1": (86, 110, 74),
        "brow": "flat", "mouth": "smile",
    },
    "pearl": {
        "display": "Pearl", "role": "", "blurb": "Knows everyone's business.",
        "skin": "light", "hairc": (176, 156, 108), "hair": "bun",
        "cloth": "blouse", "c1": (214, 168, 176),
        "glasses": True, "brow": "soft", "mouth": "smile", "lashes": True, "heavy": True,
    },
    "marlo": {
        "display": "Marlo", "role": "", "blurb": "Laughs too loud.",
        "skin": "brown", "hairc": (32, 22, 16), "hair": "curly",
        "cloth": "polo", "c1": (196, 140, 52),
        "brow": "raised", "mouth": "grin",
    },
    "otis": {
        "display": "Otis", "role": "", "blurb": "Brought Kit.",
        "skin": "light", "hairc": (74, 52, 34), "hair": "short", "hairargs": {"part": "L", "recede": 1},
        "cloth": "sweater", "c1": (92, 70, 56),
        "facial": "goatee", "brow": "flat", "mouth": "smile", "heavy": True,
    },
    "willa": {
        "display": "Willa", "role": "", "blurb": "Late, never empty-handed.",
        "skin": "light", "hairc": (198, 162, 88), "hair": "frame", "hairargs": {"length": 20, "vol": 2},
        "cloth": "blouse", "c1": (90, 130, 168),
        "brow": "soft", "mouth": "smile", "blush": True, "lashes": True,
    },
    "quinn": {
        "display": "Quinn", "role": "", "blurb": "Will rearrange the cutlery.",
        "skin": "dark", "hairc": (22, 18, 16), "hair": "short", "hairargs": {"part": "L"},
        "cloth": "dressshirt", "c1": (62, 148, 148),
        "glasses": True, "brow": "flat", "mouth": "neutral",
    },
    "sable": {
        "display": "Sable", "role": "", "blurb": "Black turtleneck energy.",
        "skin": "light", "hairc": (28, 22, 24), "hair": "bob",
        "cloth": "sweater", "c1": (36, 32, 38),
        "brow": "flat", "mouth": "neutral", "lashes": True,
    },
    "felix": {
        "display": "Felix", "role": "", "blurb": "Uninvited opinions.",
        "skin": "light", "hairc": (176, 78, 42), "hair": "floppy",
        "cloth": "sweater", "c1": (62, 122, 86),
        "brow": "raised", "mouth": "smile",
    },
    "nora": {
        "display": "Nora", "role": "", "blurb": "Remembers every birthday.",
        "skin": "brown", "hairc": (28, 18, 14), "hair": "frame", "hairargs": {"length": 17, "vol": 1},
        "cloth": "cardigan", "c1": (156, 122, 186), "c2": (244, 238, 230),
        "brow": "soft", "mouth": "smile", "lashes": True,
    },
    "birdie": {
        "display": "Birdie", "role": "", "blurb": "Aunt energy. Kitchen spy.",
        "skin": "light", "hairc": (168, 86, 48), "hair": "curly",
        "cloth": "blouse", "c1": (196, 86, 92),
        "glasses": True, "brow": "raised", "mouth": "smile", "lashes": True, "heavy": True,
    },
    "cal": {
        "display": "Cal", "role": "", "blurb": "On kid duty, unofficially.",
        "skin": "tan", "hairc": (120, 88, 52), "hair": "short", "hairargs": {"part": "L"},
        "cloth": "hoodie", "c1": (70, 90, 128),
        "brow": "flat", "mouth": "smile",
    },
}

# Six seats around a round table, clockwise from north. Far side shows backs.
SEAT_LAYOUT = [
    ("N",  0, -1, True),
    ("NE", 1, -0.45, True),
    ("SE", 1,  0.45, False),
    ("S",  0,  1, False),
    ("SW", -1, 0.45, False),
    ("NW", -1, -0.45, True),
]

TABLES = [
    {"n": 1, "cx": 248, "cy": 300, "window": True,
     "seats": ["mabel", "harold", "ivy", "jules", "arthur", "pearl"]},
    {"n": 2, "cx": 560, "cy": 300, "window": False,
     "seats": ["rex", "kit", "marlo", None, "otis", "willa"]},
    {"n": 3, "cx": 248, "cy": 562, "window": False,
     "seats": ["vivian", "quinn", "sable", None, "felix", "nora"]},
    {"n": 4, "cx": 560, "cy": 562, "window": False, "kids": True,
     "seats": ["pip", "nell", "theo", "birdie", "cal", "dot"]},
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def save_cast_pngs() -> dict[str, dict[str, Image.Image]]:
    OUT_CAST.mkdir(parents=True, exist_ok=True)
    sprites: dict[str, dict[str, Image.Image]] = {}
    for gid, r in GUESTS.items():
        portrait = buf_to_image(compose_portrait(r), PORTRAIT_W, PORTRAIT_H, 4)
        front = buf_to_image(compose_scene(r, back=False), SCENE_W, SCENE_H, 2)
        back = buf_to_image(compose_scene(r, back=True), SCENE_W, SCENE_H, 2)
        portrait.save(OUT_CAST / f"{gid}.png")
        front.save(OUT_CAST / f"{gid}-front.png")
        back.save(OUT_CAST / f"{gid}-back.png")
        sprites[gid] = {"portrait": portrait, "front": front, "back": back}
    return sprites


def render_roster(sprites: dict[str, dict[str, Image.Image]]) -> Image.Image:
    cols, rows = 8, 3
    card_w, card_h = 148, 168
    pad, gap = 16, 8
    w = pad * 2 + cols * card_w + (cols - 1) * gap
    h = pad * 2 + rows * card_h + (rows - 1) * gap
    img = Image.new("RGB", (w, h), "#F6F0E4")
    d = ImageDraw.Draw(img)
    names = list(GUESTS.keys())
    f_name = font(SERIF, 13)
    f_blurb = font(SERIF_I, 11)
    last_row = (len(names) - 1) // cols
    last_count = len(names) - last_row * cols
    last_offset = ((cols - last_count) * (card_w + gap)) // 2 if last_count < cols else 0
    for i, gid in enumerate(names):
        c, r = i % cols, i // cols
        x = pad + c * (card_w + gap) + (last_offset if r == last_row else 0)
        y = pad + r * (card_h + gap)
        d.rounded_rectangle((x, y, x + card_w, y + card_h), 10, fill=CARD, outline=LINE)
        g = GUESTS[gid]
        port = sprites[gid]["portrait"]
        px = x + (card_w - port.width) // 2
        py = y + 8
        img.paste(port, (px, py), port)
        d.text((x + card_w / 2, y + 128), g["display"], font=f_name, fill=INK, anchor="mm")
        d.text((x + card_w / 2, y + 146), g["blurb"], font=f_blurb, fill=MUTED, anchor="mm")
        if g.get("pinned"):
            d.ellipse((x + card_w - 18, y + 8, x + card_w - 6, y + 20), fill=GOLD, outline="#8A7018")
            d.ellipse((x + card_w - 15, y + 11, x + card_w - 11, y + 15), fill="#F4E08A")
    img.save(OUT_ROSTER)
    return img


def _hex(c: str) -> RGB:
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


def draw_table(base: Image.Image, cx: int, cy: int, n: int, selected: bool = False) -> None:
    d = ImageDraw.Draw(base)
    if selected:
        d.ellipse((cx - 66, cy - 66, cx + 66, cy + 66), outline=_hex(GOLD), width=3)
    # wood disc
    for i, col in enumerate(((205, 176, 122), (181, 137, 88), (158, 115, 72))):
        rr = 62 - i * 8
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=col)
    d.ellipse((cx - 62, cy - 62, cx + 62, cy + 62), outline=(138, 106, 66), width=2)
    d.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=(232, 213, 176))
    d.text((cx, cy + 1), str(n), font=font(SERIF, 13), fill=(92, 70, 48), anchor="mm")


def opaque_bottom(sprite: Image.Image) -> int:
    alpha = sprite.getchannel("A")
    for y in range(sprite.height - 1, -1, -1):
        if any(alpha.getpixel((x, y)) for x in range(sprite.width)):
            return y + 1
    return sprite.height


def scale_guest(sprite: Image.Image, g: dict) -> Image.Image:
    if not g.get("kid"):
        return sprite
    w, h = max(1, round(sprite.width * 0.78)), max(1, round(sprite.height * 0.78))
    return sprite.resize((w, h), Image.Resampling.NEAREST)


def blit(base: Image.Image, sprite: Image.Image, cx: int, cy: int) -> None:
    x = int(cx - sprite.width / 2)
    y = int(cy - opaque_bottom(sprite) + 4)
    base.paste(sprite, (x, y), sprite)


def caption(d: ImageDraw.ImageDraw, text: str, x: float, y: float, f: ImageFont.FreeTypeFont) -> None:
    d.text((x, y), text, font=f, fill=INK, anchor="mm")


def render_floor(sprites: dict[str, dict[str, Image.Image]]) -> Image.Image:
    W, H = 1240, 720
    img = Image.new("RGB", (W, H), OUTER)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((24, 18, 1216, 702), 18, fill="#F6F0E4", outline="#C9B89A")

    # title
    d.ellipse((40, 34, 64, 58), outline=_hex(WAX), width=2)
    d.rounded_rectangle((45, 41, 59, 50), 1, fill="#F6F0E4", outline=_hex(INK))
    d.ellipse((53, 37, 59, 43), fill=_hex(GOLD))
    d.text((72, 46), "Places", font=font(SERIF, 20), fill=INK, anchor="lm")
    d.rounded_rectangle((1094, 32, 1192, 60), 7, fill=PAPER, outline=LINE)
    d.text((1143, 46), "Reset seed", font=font(SERIF, 12), fill=WAX, anchor="mm")
    d.line((24, 74, 1216, 74), fill="#E2D6C2")

    # room
    d.rounded_rectangle((44, 90, 872, 682), 12, fill=ROOM, outline="#D4C6AE")

    # windows
    d.rounded_rectangle((68, 106, 696, 154), 5, fill="#EFE6D4", outline="#D4C6AE")
    for i in range(6):
        x = 84 + i * 102
        d.rounded_rectangle((x, 114, x + 90, 146), 2, fill="#D4E0EA", outline="#A9B7C4")
        d.line((x + 45, 114, x + 45, 146), fill="#A9B7C4")
        d.line((x, 130, x + 90, 130), fill="#A9B7C4")
    d.text((382, 168), "WINDOW", font=font(SERIF, 10), fill="#8A7B68", anchor="mm")

    # kitchen
    d.rounded_rectangle((790, 248, 848, 356), 3, fill="#EFE6D4", outline=_hex(WAX))
    d.rounded_rectangle((798, 258, 840, 346), 2, fill="#F6F0E4", outline=LINE)
    d.ellipse((827, 301, 833, 307), fill=_hex(GOLD))
    d.text((819, 370), "KITCHEN", font=font(SERIF, 10), fill="#8A7B68", anchor="mm")

    # door
    d.rounded_rectangle((68, 632, 152, 648), 2, fill="#E4D9C4", outline="#B7A48A")
    d.text((110, 662), "DOOR", font=font(SERIF, 10), fill="#8A7B68", anchor="mm")

    f_name = font(SERIF, 11)
    radius = 68

    def seat_xy(cx: int, cy: int, dx: float, dy: float) -> tuple[float, float]:
        return cx + dx * radius, cy + dy * radius

    def draw_empty(sx: float, sy: float) -> None:
        d.ellipse((sx - 12, sy - 6, sx + 12, sy + 8), outline=_hex(LINE), width=1)
        d.text((sx, sy + 16), "empty", font=f_name, fill="#A89880", anchor="mm")

    def draw_pin(sx: float, sy: float, sprite: Image.Image) -> None:
        pin_x = sx + sprite.width / 2 - 8
        pin_y = sy - opaque_bottom(sprite) + 10
        d.ellipse((pin_x - 5, pin_y - 5, pin_x + 6, pin_y + 6), fill=_hex(GOLD), outline="#8A7018")
        d.ellipse((pin_x - 2, pin_y - 2, pin_x + 2, pin_y + 2), fill="#F4E08A")

    def name_xy(sx: float, sy: float, dx: float, dy: float, sprite: Image.Image | None) -> tuple[float, float]:
        # Keep names off the glass and off the sprite. North sits under the window,
        # so the caption goes beside the head instead of above it.
        if dy < 0 and abs(dx) < 0.2:
            return sx + 26, sy - 22
        if dy > 0 and abs(dx) < 0.2:
            return sx, sy + 16
        return sx + (34 if dx > 0 else -34), sy - 8

    for table in TABLES:
        cx, cy = table["cx"], table["cy"]
        # far side (backs) first, then the table, then the near side — seated at the rim
        for i, gid in enumerate(table["seats"]):
            _, dx, dy, is_back = SEAT_LAYOUT[i]
            if not is_back:
                continue
            sx, sy = seat_xy(cx, cy, dx, dy)
            if gid is None:
                draw_empty(sx, sy)
                continue
            sprite = scale_guest(sprites[gid]["back"], GUESTS[gid])
            blit(img, sprite, int(sx), int(sy))
            if GUESTS[gid].get("pinned"):
                draw_pin(sx, sy, sprite)
        draw_table(img, cx, cy, table["n"], selected=table["n"] == 1)
        for i, gid in enumerate(table["seats"]):
            _, dx, dy, is_back = SEAT_LAYOUT[i]
            if is_back:
                continue
            sx, sy = seat_xy(cx, cy, dx, dy)
            if gid is None:
                draw_empty(sx, sy)
                continue
            sprite = scale_guest(sprites[gid]["front"], GUESTS[gid])
            blit(img, sprite, int(sx), int(sy))
            if GUESTS[gid].get("pinned"):
                draw_pin(sx, sy, sprite)
        for i, gid in enumerate(table["seats"]):
            _, dx, dy, is_back = SEAT_LAYOUT[i]
            sx, sy = seat_xy(cx, cy, dx, dy)
            if gid is None:
                continue
            sprite = scale_guest(sprites[gid]["back" if is_back else "front"], GUESTS[gid])
            nx, ny = name_xy(sx, sy, dx, dy, sprite)
            caption(d, GUESTS[gid]["display"], nx, ny, f_name)
        if table.get("kids"):
            d.text((cx, cy + 112), "kids · kitchen", font=font(SERIF, 10), fill="#8A7B68", anchor="mm")

    # timeline
    d.rounded_rectangle((888, 90, 1196, 682), 12, fill=CARD, outline="#E2D6C2")
    d.text((1042, 116), "TIMELINE", font=font(SERIF, 12), fill=WAX, anchor="mm")
    d.line((908, 130, 1176, 130), fill="#E2D6C2")

    events = [
        (GOLD, "Agent seated 24 people.", "Two tables went red."),
        (WAX, "You pinned Mabel", "to the window table."),
        (GOLD, "Fix the violations.", "Don’t move anyone I pinned."),
        (WAX, "move_guest(Mabel)", "→ pinned_by_human"),
        (GOLD, "Rex changes table.", "The red clears."),
    ]
    y = 160
    f_e = font(SERIF, 13)
    f_s = font(SERIF, 12)
    for col, a, b in events:
        d.ellipse((915, y - 5, 925, y + 5), fill=_hex(col))
        d.text((934, y), a, font=f_e, fill=INK, anchor="lm")
        d.text((934, y + 18), b, font=f_s, fill=WAX if b.startswith("→") else MUTED, anchor="lm")
        y += 64

    d.rounded_rectangle((908, 500, 1176, 572), 8, fill=PAPER, outline="#E2D6C2")
    d.text((1042, 526), "0 violations", font=font(SERIF, 14), fill=INK, anchor="mm")
    d.text((1042, 548), "1 pin · 2 empty seats", font=font(SERIF, 12), fill=MUTED, anchor="mm")
    d.text((1042, 646), "One state. Two hands.", font=font(SERIF, 12), fill="#A89880", anchor="mm")

    img.save(OUT_FLOOR)
    return img


def render_svg() -> None:
    """Keep a vector companion that references the sprite PNGs."""
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1240 720" width="1240" height="720" role="img" aria-label="Places floorplan: the Orchard House Saturday. Pixel-art guests seated at four tables. Mabel pinned at the window, kids by the kitchen, Rex away from Vivian, two empty seats.">',
        "<defs>",
        '<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#CDB07A"/><stop offset="55%" stop-color="#B58958"/><stop offset="100%" stop-color="#9E7348"/></linearGradient>',
        '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#2C2416" flood-opacity="0.16"/></filter>',
        "</defs>",
        '<rect width="1240" height="720" fill="#D7CBB4"/>',
        '<rect x="24" y="18" width="1192" height="684" rx="18" fill="#F6F0E4" stroke="#C9B89A" stroke-width="1.25"/>',
        '<text x="72" y="52" font-family="Georgia, serif" font-size="20" fill="#2C2416">Places</text>',
        '<rect x="44" y="90" width="828" height="592" rx="12" fill="#F3EBDC" stroke="#D4C6AE"/>',
        '<text x="382" y="174" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="2.8" fill="#8A7B68">WINDOW</text>',
        '<text x="819" y="376" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="1.5" fill="#8A7B68">KITCHEN</text>',
        '<text x="110" y="666" text-anchor="middle" font-family="Georgia, serif" font-size="10" letter-spacing="1.5" fill="#8A7B68">DOOR</text>',
    ]
    radius = 68
    for table in TABLES:
        cx, cy = table["cx"], table["cy"]
        parts.append(f'<g transform="translate({cx},{cy})">')
        if table["n"] == 1:
            parts.append('<circle r="66" fill="none" stroke="#C9A227" stroke-width="3" opacity="0.55"/>')
        parts.append('<circle r="62" fill="url(#wood)" stroke="#8A6A42" stroke-width="2" filter="url(#soft)"/>')
        parts.append(f'<text y="4" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="#5C4630">{table["n"]}</text>')
        for i, gid in enumerate(table["seats"]):
            _, dx, dy, is_back = SEAT_LAYOUT[i]
            sx, sy = dx * radius, dy * radius
            if gid is None:
                parts.append(f'<text x="{sx:.0f}" y="{sy + 4:.0f}" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#A89880">empty</text>')
                continue
            face = "back" if is_back else "front"
            # sprites are 36×64; plant feet at the seat
            parts.append(
                f'<image href="cast/{gid}-{face}.png" x="{sx - 18:.0f}" y="{sy - 58:.0f}" width="36" height="64"/>'
            )
            g = GUESTS[gid]
            ny = sy + 10 if dy > 0 else sy - 62
            parts.append(
                f'<text x="{sx:.0f}" y="{ny:.0f}" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#2C2416">{g["display"]}</text>'
            )
        parts.append("</g>")
    parts.append('<rect x="888" y="90" width="308" height="592" rx="12" fill="#FFFEFA" stroke="#E2D6C2"/>')
    parts.append('<text x="1042" y="122" text-anchor="middle" font-family="Georgia, serif" font-size="12" letter-spacing="2" fill="#8C2F39">TIMELINE</text>')
    parts.append("</svg>\n")
    OUT_SVG.write_text("\n".join(parts), encoding="utf-8")


def main() -> None:
    sprites = save_cast_pngs()
    render_roster(sprites)
    render_svg()
    print(f"wrote {len(GUESTS)} guests → {OUT_CAST}")
    print(f"wrote {OUT_ROSTER}")
    print(f"wrote {OUT_SVG}")


if __name__ == "__main__":
    main()

"""Generate the Entrelinhas SVG, platform icons and social preview from one drawing."""
from pathlib import Path
from math import hypot
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
GREEN = "#285448"
PAPER = "#fff8e8"
PATHS = [
    ("fill", PAPER, 0, [
        ("M", 224, 336), ("C", 320, 306, 408, 315, 500, 364),
        ("L", 500, 728), ("C", 406, 681, 316, 682, 224, 712), ("Z",),
    ]),
    ("fill", PAPER, 0, [
        ("M", 524, 364), ("C", 616, 315, 704, 306, 800, 336),
        ("L", 800, 712), ("C", 708, 682, 618, 681, 524, 728), ("Z",),
    ]),
    ("stroke", GREEN, 17, [("M", 284, 417), ("Q", 362, 402, 440, 437)]),
    ("stroke", GREEN, 17, [("M", 284, 495), ("Q", 362, 480, 440, 515)]),
    ("stroke", GREEN, 17, [("M", 284, 573), ("Q", 362, 558, 415, 583)]),
    ("stroke", GREEN, 17, [("M", 584, 437), ("Q", 610, 425, 633, 420)]),
    ("stroke", GREEN, 17, [("M", 584, 515), ("Q", 662, 480, 740, 495)]),
    ("stroke", GREEN, 17, [("M", 584, 593), ("Q", 662, 558, 715, 568)]),
    ("fill", "#c78c62", 0, [
        ("M", 664, 320), ("Q", 687, 319, 710, 322),
        ("L", 710, 459), ("L", 687, 442), ("L", 664, 459), ("Z",),
    ]),
]


def sample(commands):
    points = []
    current = start = (0, 0)
    for command in commands:
        op, *values = command
        if op == "M":
            current = start = tuple(values)
            points.append(current)
        elif op == "L":
            current = tuple(values)
            points.append(current)
        elif op in ("Q", "C"):
            controls = [current] + list(zip(values[::2], values[1::2]))
            for i in range(1, 65):
                t = i / 64
                level = controls
                while len(level) > 1:
                    level = [((1-t)*a[0]+t*b[0], (1-t)*a[1]+t*b[1]) for a,b in zip(level, level[1:])]
                points.append(level[0])
            current = controls[-1]
        elif op == "Z":
            points.append(start)
            current = start
    return points


def svg(mask=False):
    body = [] if mask else ['<rect width="1024" height="1024" rx="224" fill="' + GREEN + '"/>']
    for kind, color, width, commands in PATHS:
        if mask and kind != "fill":
            continue
        d = " ".join(command[0] + " ".join(str(value) for value in command[1:]) for command in commands)
        paint = 'fill="' + ("#000" if mask else color) + '"' if kind == "fill" else 'fill="none" stroke="' + color + '" stroke-width="' + str(width) + '" stroke-linecap="round" stroke-linejoin="round"'
        body.append('<path d="' + d + '" ' + paint + '/>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' + "".join(body) + "</svg>\n"


def render_icon(rounded):
    scale = 4
    image = Image.new("RGBA", (1024*scale, 1024*scale))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle((0, 0, image.width-1, image.height-1), radius=224*scale, fill=GREEN)
    else:
        draw.rectangle((0, 0, image.width, image.height), fill=GREEN)
    for kind, color, width, commands in PATHS:
        points = [(x*scale, y*scale) for x,y in sample(commands)]
        if kind == "fill":
            draw.polygon(points, fill=color)
        else:
            draw.line(points, fill=color, width=width*scale, joint="curve")
            radius = width*scale/2
            for x,y in points:
                draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)
    return image.resize((1024, 1024), Image.Resampling.LANCZOS)


def font(name, size):
    return ImageFont.truetype("C:/Windows/Fonts/" + name, size)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "social").mkdir(exist_ok=True)
    (PUBLIC / "icon.svg").write_text(svg(), encoding="utf-8")
    (PUBLIC / "safari-pinned-tab.svg").write_text(svg(mask=True), encoding="utf-8")
    rounded = render_icon(True)
    opaque = render_icon(False).convert("RGB")
    for size in (48, 96, 128, 192, 256, 384, 512, 1024):
        rounded.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"icon-{size}.png", optimize=True)
    for size in (192, 512):
        opaque.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"maskable-{size}.png", optimize=True)
    for size in (120, 152, 167, 180):
        opaque.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"apple-touch-icon-{size}.png", optimize=True)
    for size in (16, 32):
        rounded.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"favicon-{size}.png", optimize=True)
    rounded.save(PUBLIC / "favicon.ico", sizes=[(16,16),(32,32),(48,48)])
    shutil.copyfile(ICONS / "apple-touch-icon-180.png", PUBLIC / "apple-touch-icon.png")
    opaque.resize((150,150), Image.Resampling.LANCZOS).save(ICONS / "mstile-150.png", optimize=True)

    preview = Image.new("RGB", (1200, 630), "#f5f3ec")
    draw = ImageDraw.Draw(preview)
    draw.text((72, 65), "entrelinhas.", font=font("georgia.ttf", 64), fill="#2b332f")
    draw.text((76, 206), "SEU ESPAÇO DE LEITURA", font=font("arialbd.ttf", 15), fill=GREEN)
    draw.text((70, 267), "Abra um livro.", font=font("georgia.ttf", 74), fill="#2b332f")
    draw.text((70, 357), "Fique um pouco.", font=font("georgiai.ttf", 74), fill=GREEN)
    draw.text((76, 478), "Sua biblioteca EPUB, no seu ritmo.", font=font("arial.ttf", 24), fill="#6d756d")
    draw.text((76, 552), "LEITURA OFFLINE  ·  SEM CONTA  ·  NO SEU DISPOSITIVO", font=font("arial.ttf", 13), fill="#607264")
    draw.line((813, 170, 813, 486), fill="#dcded3", width=2)
    logo = rounded.resize((260,260), Image.Resampling.LANCZOS)
    preview.paste(logo, (866, 195), logo)
    draw.text((996, 490), "Uma página de cada vez.", font=font("georgiai.ttf", 17), fill="#6d756d", anchor="mt")
    preview.save(PUBLIC / "social" / "entrelinhas-og.png", optimize=True)

    radius = max(hypot(x-512, y-512) for kind,color,width,commands in PATHS for x,y in sample(commands))
    assert radius < 409.6, radius
    print("Generated SVG, 17 PNG platform icons, favicon.ico, Apple fallback and Open Graph (1200x630).")
    print("Artwork safe-zone radius:", round(radius, 1), "/ 409.6")


if __name__ == "__main__":
    main()

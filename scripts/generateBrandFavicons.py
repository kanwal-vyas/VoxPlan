import os
from PIL import Image, ImageDraw, ImageFont

def render_badge(size):
    """
    Renders the exact canonical VoxPlan brand badge:
    - Warm yellow rounded square: #FFE58A
    - 1px subtle dark border: rgba(37, 36, 42, 0.12)
    - 2px bottom shadow: rgba(37, 36, 42, 0.8)
    - Dark four-pointed sparkle: #25242A in center
    """
    scale = 8 if size <= 64 else 4
    w = size * scale
    h = size * scale

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # In 64x64 coordinates:
    # margin_x = 4, margin_y = 4, box_w = 56, box_h = 52, shadow_offset = 4
    # radius = 17.5 / 56 * box_w
    shadow_offset = int(h * 4 / 64)
    margin_x = int(w * 4 / 64)
    margin_y = int(h * 4 / 64)
    box_w = int(w * 56 / 64)
    box_h = int(h * 52 / 64)
    radius = int(box_w * 17.5 / 56)

    # 1. Shadow
    draw.rounded_rectangle(
        [margin_x, margin_y + shadow_offset, margin_x + box_w, margin_y + shadow_offset + box_h],
        radius=radius,
        fill=(37, 36, 42, 204)
    )

    # 2. Face
    border_w = max(1, int(scale * (2 if size <= 64 else 1.5)))
    draw.rounded_rectangle(
        [margin_x, margin_y, margin_x + box_w, margin_y + box_h],
        radius=radius,
        fill=(255, 229, 138, 255),
        outline=(37, 36, 42, 31),
        width=border_w
    )

    # 3. Sparkle text
    font_size = int(scale * 32 * (size / 64.0))
    font = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", font_size)
    cx = margin_x + (box_w / 2)
    cy = margin_y + (box_h / 2)
    draw.text((cx, cy), "\u2726", font=font, anchor="mm", fill=(37, 36, 42, 255))

    return img.resize((size, size), Image.Resampling.LANCZOS)

def render_maskable(size):
    """
    PWA maskable icon: icon placed within standard 80% safe zone on theme background #FFF8EF.
    """
    bg = Image.new("RGBA", (size, size), (255, 248, 239, 255))
    icon_size = int(size * 0.72)
    icon = render_badge(icon_size)
    offset = (size - icon_size) // 2
    bg.paste(icon, (offset, offset), icon)
    return bg

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_dir = os.path.join(repo_root, "public")

    # 1. 32x32 PNG favicon
    fav32 = render_badge(32)
    fav32.save(os.path.join(public_dir, "favicon-32x32.png"), format="PNG")

    # 2. Multi-size ICO (16, 32, 48)
    fav16 = render_badge(16)
    fav48 = render_badge(48)
    fav32.save(
        os.path.join(public_dir, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[fav16, fav48]
    )

    # 3. PWA 192x192
    pwa192 = render_badge(192)
    pwa192.save(os.path.join(public_dir, "pwa-192x192.png"), format="PNG")

    # 4. PWA 512x512
    pwa512 = render_badge(512)
    pwa512.save(os.path.join(public_dir, "pwa-512x512.png"), format="PNG")

    # 5. Maskable 512x512
    mask512 = render_maskable(512)
    mask512.save(os.path.join(public_dir, "maskable-icon-512x512.png"), format="PNG")

    print("All favicon and PWA assets generated successfully in", public_dir)

if __name__ == "__main__":
    main()

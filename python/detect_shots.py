#!/usr/bin/env python3
import sys
import json
from dataclasses import dataclass
from typing import Iterable, Tuple

import cv2
import numpy as np
from pathlib import Path


def log(*args):
    print(*args, file=sys.stderr)


@dataclass(frozen=True)
class ColourRule:
    """HSV range describing a colour blob we expect to see on the target."""

    name: str
    hsv_lower: Tuple[int, int, int]
    hsv_upper: Tuple[int, int, int]


# The automatic detector assumes a beige/black 10m pistol target. Markers must
# contrast sharply with those tones, so we explicitly track the high-contrast
# blobs we support. The hue ranges mirror the user guidance documented in
# docs/DETECTION_NOTES.md.
MARKER_COLOUR_RULES: Tuple[ColourRule, ...] = (
    ColourRule(
        name="bright_white",
        hsv_lower=(0, 0, 215),
        hsv_upper=(179, 40, 255),
    ),
    # Neon / saturated tapes and sticky notes rarely match the beige target.
    ColourRule(
        name="neon_pink",
        hsv_lower=(150, 120, 150),
        hsv_upper=(179, 255, 255),
    ),
    ColourRule(
        name="neon_orange",
        hsv_lower=(5, 150, 180),
        hsv_upper=(25, 255, 255),
    ),
    ColourRule(
        name="neon_green",
        hsv_lower=(35, 120, 160),
        hsv_upper=(85, 255, 255),
    ),
    ColourRule(
        name="neon_blue",
        hsv_lower=(85, 120, 160),
        hsv_upper=(130, 255, 255),
    ),
    # Metallic stickers behave like white specular highlights, so we give them a
    # slightly more permissive value band while keeping saturation low.
    ColourRule(
        name="metallic_reflection",
        hsv_lower=(0, 0, 200),
        hsv_upper=(179, 80, 255),
    ),
)

# Relative contour area thresholds (computed against the detected target
# radius).  "min" is intentionally tiny so we can still pick up raw pellet
# holes when a shooter forgets to cover them with tape.  "max" remains tight so
# that large table edges or target borders are ignored.
MIN_AREA_FACTOR = 0.00012
MAX_AREA_FACTOR = 0.035

BACKGROUND_SWATCHES: Tuple[ColourRule, ...] = (
    # Target beige paper (and most wooden benches) cluster in this range.
    ColourRule(
        name="target_beige",
        hsv_lower=(10, 20, 80),
        hsv_upper=(35, 160, 230),
    ),
    # Very dark cloth/leather benches shouldn't register as markers either.
    ColourRule(
        name="dark_tabletop",
        hsv_lower=(0, 0, 0),
        hsv_upper=(179, 255, 70),
    ),
)


def stack_masks(masks: Iterable[np.ndarray]) -> np.ndarray:
    mask = None
    for m in masks:
        mask = m if mask is None else cv2.bitwise_or(mask, m)
    if mask is None:
        mask = np.zeros((1, 1), dtype=np.uint8)
    return mask


def build_marker_mask(hsv_img: np.ndarray) -> np.ndarray:
    colour_masks = [
        cv2.inRange(
            hsv_img,
            np.array(rule.hsv_lower, dtype=np.uint8),
            np.array(rule.hsv_upper, dtype=np.uint8),
        )
        for rule in MARKER_COLOUR_RULES
    ]
    combined_marker_mask = stack_masks(colour_masks)

    background_masks = [
        cv2.inRange(
            hsv_img,
            np.array(rule.hsv_lower, dtype=np.uint8),
            np.array(rule.hsv_upper, dtype=np.uint8),
        )
        for rule in BACKGROUND_SWATCHES
    ]
    combined_background_mask = stack_masks(background_masks)

    # Remove the beige/dark ranges so coloured bench mats only register when the
    # hue/value contrast is extreme (neon edge pressed over a hole).
    clean_mask = cv2.bitwise_and(
        combined_marker_mask, cv2.bitwise_not(combined_background_mask)
    )

    # Close tiny gaps inside rings/holes so we end up with solid contours even
    # when the marker is only a thin neon outline.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    clean_mask = cv2.morphologyEx(clean_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    clean_mask = cv2.medianBlur(clean_mask, 3)
    return clean_mask


def save_debug_image(
    img,
    cx: float,
    cy: float,
    target_r: float,
    contours,
    shots,
    image_path: str,
):
    """
    Create a debug image showing:
    - main target circle (green)
    - all candidate contours (blue)
    - accepted shot centers (red dots)
    Saved into uploads/debug as <original_name>_debug.jpg
    """
    try:
        debug = img.copy()

        # 1) Draw detected / fallback target circle (green)
        cv2.circle(
            debug,
            (int(cx), int(cy)),
            int(target_r),
            (0, 255, 0),  # BGR: green
            2,
        )

        # 2) Draw all contours used for detection (blue)
        cv2.drawContours(debug, contours, -1, (255, 0, 0), 1)  # blue

        # 3) Draw accepted shots (red), using normalized coordinates
        for s in shots:
            # convert from normalized [-1,1] back to pixel coordinates
            x_px = int(cx + s["positionX"] * target_r)
            y_px = int(cy + s["positionY"] * target_r)
            cv2.circle(
                debug,
                (x_px, y_px),
                6,
                (0, 0, 255),  # red
                -1,
            )

        # 4) Build output path: uploads/debug/<original_stem>_debug.jpg
        img_path = Path(image_path)
        debug_dir = img_path.parent.parent / "debug"  # if img in uploads/targets
        debug_dir.mkdir(parents=True, exist_ok=True)

        out_path = debug_dir / f"{img_path.stem}_debug.jpg"
        cv2.imwrite(str(out_path), debug)

        log(f"Saved debug image to {out_path}")

    except Exception as e:
        log("Failed to save debug image:", e)


def detect_shots(image_path: str):
    """
    v1.1 detector tuned for white patches on a 10m pistol target image:
    - load image
    - detect main circular target (outer scoring ring)
    - detect bright circular spots (white shots)
    - return list of {score, positionX, positionY},
      with normalized coords in [-1, 1] relative to target center.
    """
    # --- 1. Load image ---
    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    # Optional: downscale very large images to speed up processing
    max_dim = max(h, w)
    if max_dim > 1600:
        scale = 1600.0 / max_dim
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]

    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # --- 2. Detect main circular target (outer ring) ---
    # We choose the circle whose center is closest to image center,
    # with a plausible radius range.
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(h, w) / 4,
        param1=100,
        param2=30,
        minRadius=int(min(h, w) * 0.15),
        maxRadius=int(min(h, w) * 0.35),
    )

    if circles is None:
        # Fallback: use image center and radius based on size
        log("No circle found, using fallback center/radius")
        cx, cy = w / 2.0, h / 2.0
        target_r = min(h, w) * 0.35
    else:
        circles = np.round(circles[0, :]).astype("int")
        img_cx, img_cy = w / 2.0, h / 2.0
        # choose the circle whose center is closest to the image center
        chosen = min(
            circles,
            key=lambda c: (c[0] - img_cx) ** 2 + (c[1] - img_cy) ** 2,
        )
        cx, cy, target_r = float(chosen[0]), float(chosen[1]), float(chosen[2])
        log(f"Detected circle center=({cx:.1f},{cy:.1f}), r={target_r:.1f}")

    # --- 3. Detect high-contrast spots (white or coloured shots) ---
    # Strategy: start with colour-aware masks that mirror the "bright white or
    # saturated neon" guidance shared with users. Each range corresponds to the
    # bright markers listed in docs/DETECTION_NOTES.md. We also strip out beige
    # and near-black backgrounds so coloured bench mats only register when they
    # are truly neon or metallic.
    combined_mask = build_marker_mask(hsv)

    contours = []
    cnts, _ = cv2.findContours(
        combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if cnts:
        contours = cnts
        largest = max(cv2.contourArea(c) for c in contours)
        target_area = np.pi * (target_r ** 2)
        if largest > target_area * 0.6:
            log(
                "Colour mask latched onto the whole target; discarding and trying grayscale"
            )
            contours = []

    if not contours:
        log("Colour mask failed; falling back to bright grayscale threshold")
        for thr in [250, 245, 240]:
            _, bright = cv2.threshold(blur, thr, 255, cv2.THRESH_BINARY)
            cnts, _ = cv2.findContours(
                bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if len(cnts) >= 3:
                contours = cnts
                break

    # Many shooters do not place white pasters on every hole; when both colour
    # and bright-threshold detection fail we attempt to find the *dark* pellet
    # holes directly.  This keeps the script useful for default targets instead
    # of bailing out and returning an empty shot list (which causes the Node
    # layer to drop back to fake detections).
    if not contours:
        log(
            "Bright markers not found; searching for dark pellet holes with adaptive threshold"
        )
        for block_size in [11, 15, 21]:
            dark = cv2.adaptiveThreshold(
                blur,
                255,
                cv2.ADAPTIVE_THRESH_MEAN_C,
                cv2.THRESH_BINARY_INV,
                block_size,
                5,
            )
            dark = cv2.medianBlur(dark, 5)
            cnts, _ = cv2.findContours(
                dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if len(cnts) >= 3:
                contours = cnts
                break

    if not contours:
        log("No bright or dark blobs found for shots")
        contours = []

    shots = []

    # Area thresholds relative to target size:
    # for your sample image, shots are ~1600 px area.
    min_area = (target_r ** 2) * MIN_AREA_FACTOR
    max_area = (target_r ** 2) * MAX_AREA_FACTOR

    if contours:
        log(
            f"Found {len(contours)} potential blobs before filtering (area range {min_area:.1f}-{max_area:.1f})"
        )

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        (x, y), radius = cv2.minEnclosingCircle(cnt)

        # distance from target center
        dist_center = np.hypot(x - cx, y - cy)

        # Only ignore absolutely crazy far blobs
        if dist_center > target_r * 1.5:
            continue

        # --- 4. Normalize coordinates to [-1, 1] ---
        # x: left (-1) to right (+1), y: top (-1) to bottom (+1)
        norm_x = (x - cx) / target_r
        norm_y = (y - cy) / target_r

        # --- 5. Scoring based on distance ratio ---
        ratio = dist_center / target_r

        if ratio <= 1.0:
            # Inside target: linear mapping center=10, edge=1
            ratio_clamped = max(0.0, min(1.0, ratio))
            score = 10.0 - 9.0 * ratio_clamped
        else:
            # Outside official scoring rings → score 0
            score = 0.0

        score = round(float(score), 1)

        shots.append(
            {
                "score": float(score),
                "positionX": float(norm_x),
                "positionY": float(norm_y),
            }
        )

    # sort inner to outer
    shots.sort(key=lambda s: abs(s["score"] - 10.0))

    # --- 6. Save debug image with circles, contours, and shot dots ---
    save_debug_image(
        img=img,
        cx=cx,
        cy=cy,
        target_r=target_r,
        contours=contours,
        shots=shots,
        image_path=image_path,
    )

    log(f"Returning {len(shots)} detected shots")
    return shots


def main():
    if len(sys.argv) < 2:
        print("Usage: detect_shots.py <image_path>", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[0 if False else 1]  # keep simple
    try:
        shots = detect_shots(image_path)
        result = {"shots": shots}
        print(json.dumps(result))
    except Exception as e:
        log("Error in detect_shots:", e)
        # On error, still output a valid JSON so Node can decide to fallback
        print(json.dumps({"shots": [], "error": str(e)}))
        sys.exit(0)


if __name__ == "__main__":
    main()

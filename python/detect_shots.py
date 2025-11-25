#!/usr/bin/env python3
import sys
import json
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

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

# ISSF 10m air pistol scoring ring radii in millimetres.
ISSF_AIR_PISTOL_RING_RADII_MM = {
    10: 5.75,
    9: 13.75,
    8: 21.75,
    7: 29.75,
    6: 37.75,
    5: 45.75,
    4: 53.75,
    3: 61.75,
    2: 69.75,
    1: 77.75,
}
MAX_RADIUS_MM = ISSF_AIR_PISTOL_RING_RADII_MM[1]


def stack_masks(masks: Iterable[np.ndarray]) -> np.ndarray:
    mask = None
    for m in masks:
        mask = m if mask is None else cv2.bitwise_or(mask, m)
    if mask is None:
        mask = np.zeros((1, 1), dtype=np.uint8)
    return mask


def load_image(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise RuntimeError(f"Could not read image: {path}")
    return img


def resize_if_needed(img: np.ndarray, max_dim: int = 1600) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img

    scale = max_dim / float(max(h, w))
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h))


def order_corners(corners: np.ndarray) -> np.ndarray:
    """Return corners ordered as TL, TR, BR, BL."""
    rect = np.zeros((4, 2), dtype="float32")
    s = corners.sum(axis=1)
    rect[0] = corners[np.argmin(s)]
    rect[2] = corners[np.argmax(s)]

    diff = np.diff(corners, axis=1)
    rect[1] = corners[np.argmin(diff)]
    rect[3] = corners[np.argmax(diff)]
    return rect


def find_paper_corners(image: np.ndarray) -> Optional[np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            return order_corners(approx.reshape(4, 2))
    return None


def warp_to_top_down(image: np.ndarray, corners: np.ndarray, size: int = 1000) -> np.ndarray:
    dst_pts = np.float32([[0, 0], [size, 0], [size, size], [0, size]])
    src_pts = np.float32(corners)
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    return cv2.warpPerspective(image, M, (size, size))


def preprocess_image(img: np.ndarray) -> dict:
    resized = resize_if_needed(img)
    corners = find_paper_corners(resized)
    img_flat = warp_to_top_down(resized, corners) if corners is not None else resized

    gray = cv2.cvtColor(img_flat, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    hsv = cv2.cvtColor(img_flat, cv2.COLOR_BGR2HSV)

    return {
        "img": img_flat,
        "gray": gray,
        "blur": blur,
        "hsv": hsv,
        "corners": corners,
    }


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


def detect_target_center_and_scale(processed: dict) -> Tuple[float, float, float, float]:
    gray = processed["gray"]
    blur = processed["blur"]
    h, w = gray.shape[:2]

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
        log("No circle found, using fallback center/radius")
        cx, cy = w / 2.0, h / 2.0
        target_r = min(h, w) * 0.35
    else:
        circles = np.round(circles[0, :]).astype("int")
        img_cx, img_cy = w / 2.0, h / 2.0
        chosen = min(circles, key=lambda c: (c[0] - img_cx) ** 2 + (c[1] - img_cy) ** 2)
        cx, cy, target_r = float(chosen[0]), float(chosen[1]), float(chosen[2])
        log(f"Detected circle center=({cx:.1f},{cy:.1f}), r={target_r:.1f}")

    pixels_per_mm = target_r / MAX_RADIUS_MM
    return cx, cy, pixels_per_mm, target_r


def detect_target_geometry(processed: dict) -> dict:
    cx, cy, pixels_per_mm, target_r = detect_target_center_and_scale(processed)
    return {
        "center_x": cx,
        "center_y": cy,
        "pixels_per_mm": pixels_per_mm,
        "target_radius_px": target_r,
    }


def detect_shots(processed: dict, geom: dict) -> List[dict]:
    img = processed["img"]
    blur = processed["blur"]
    hsv = processed["hsv"]

    cx = geom["center_x"]
    cy = geom["center_y"]
    target_r = geom["target_radius_px"]

    combined_mask = build_marker_mask(hsv)

    contours = []
    cnts, _ = cv2.findContours(combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if cnts:
        contours = cnts
        largest = max(cv2.contourArea(c) for c in contours)
        target_area = np.pi * (target_r ** 2)
        if largest > target_area * 0.6:
            log("Colour mask latched onto the whole target; discarding and trying grayscale")
            contours = []

    if not contours:
        log("Colour mask failed; falling back to bright grayscale threshold")
        for thr in [250, 245, 240]:
            _, bright = cv2.threshold(blur, thr, 255, cv2.THRESH_BINARY)
            cnts, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(cnts) >= 3:
                contours = cnts
                break

    if not contours:
        log("Bright markers not found; searching for dark pellet holes with adaptive threshold")
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
            cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(cnts) >= 3:
                contours = cnts
                break

    if not contours:
        log("No bright or dark blobs found for shots")
        contours = []

    shots: List[dict] = []

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
        dist_center = np.hypot(x - cx, y - cy)

        if dist_center > target_r * 1.5:
            continue

        shots.append({"x_px": float(x), "y_px": float(y), "contour_radius": float(radius)})

    processed["last_contours"] = contours
    return shots


def compute_score_for_radius_mm(r_mm: float) -> float:
    for score in range(10, 0, -1):
        ring_r = ISSF_AIR_PISTOL_RING_RADII_MM[score]
        if r_mm <= ring_r:
            return float(score)
    return 0.0


def score_shots(shots: List[dict], geom: dict) -> List[dict]:
    cx = geom["center_x"]
    cy = geom["center_y"]
    ppm = geom["pixels_per_mm"]

    scored: List[dict] = []
    target_r_px = ppm * MAX_RADIUS_MM

    for shot in shots:
        dx_px = shot["x_px"] - cx
        dy_px = shot["y_px"] - cy

        r_px = (dx_px ** 2 + dy_px ** 2) ** 0.5
        r_mm = r_px / ppm if ppm else 0.0

        score = compute_score_for_radius_mm(r_mm)

        r_norm = r_mm / MAX_RADIUS_MM if MAX_RADIUS_MM else 0.0
        x_norm = (dx_px / ppm) / MAX_RADIUS_MM if ppm else 0.0
        y_norm = (dy_px / ppm) / MAX_RADIUS_MM if ppm else 0.0

        scored.append(
            {
                "x_px": shot["x_px"],
                "y_px": shot["y_px"],
                "x_norm": x_norm,
                "y_norm": y_norm,
                "r_mm": r_mm,
                "score": score,
                "target_radius_px": target_r_px,
            }
        )

    scored.sort(key=lambda s: s.get("r_mm", 0.0))
    return scored


def format_output(scored_shots: List[dict]) -> dict:
    return {
        "shots": [
            {"x": s.get("x_norm", 0.0), "y": s.get("y_norm", 0.0), "score": s.get("score", 0.0)}
            for s in scored_shots
        ],
        "count": len(scored_shots),
    }


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
            x_norm = s.get("x_norm")
            y_norm = s.get("y_norm")
            if x_norm is None or y_norm is None:
                continue
            x_px = int(cx + x_norm * target_r)
            y_px = int(cy + y_norm * target_r)
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


def main():
    if len(sys.argv) < 2:
        print("Usage: detect_shots.py <image_path>", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        raw_img = load_image(image_path)
        processed = preprocess_image(raw_img)
        geom = detect_target_geometry(processed)
        shot_candidates = detect_shots(processed, geom)
        scored_shots = score_shots(shot_candidates, geom)

        save_debug_image(
            img=processed["img"],
            cx=geom["center_x"],
            cy=geom["center_y"],
            target_r=geom["pixels_per_mm"] * MAX_RADIUS_MM,
            contours=processed.get("last_contours", []),
            shots=scored_shots,
            image_path=image_path,
        )

        result = format_output(scored_shots)
        log(f"Returning {len(result['shots'])} detected shots")
        print(json.dumps(result))
    except Exception as e:
        log("Error in detect_shots:", e)
        # On error, still output a valid JSON so Node can decide to fallback
        print(json.dumps({"shots": [], "error": str(e)}))
        sys.exit(0)


if __name__ == "__main__":
    main()

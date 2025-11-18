#!/usr/bin/env python3
import sys
import json
import cv2
import numpy as np
from pathlib import Path


def log(*args):
    print(*args, file=sys.stderr)


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
        cv2.imwrite(
            str(out_path),
            debug,
            [
                int(cv2.IMWRITE_JPEG_QUALITY),
                60,
                int(cv2.IMWRITE_JPEG_OPTIMIZE),
                1,
            ],
        )

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

    # --- 3. Detect bright spots (white shots) ---
    # Strategy: try high thresholds; we want only the brightest highlights
    # (the white patches), not the whole beige card.
    contours = []
    for thr in [250, 245, 240]:
        _, bright = cv2.threshold(blur, thr, 255, cv2.THRESH_BINARY)
        cnts, _ = cv2.findContours(
            bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        # If we get "enough" blobs, stop lowering the threshold.
        if len(cnts) >= 3:
            contours = cnts
            break

    if not contours:
        log("No bright blobs found for shots")
        contours = []

    shots = []

    # Area thresholds relative to target size:
    # for your sample image, shots are ~1600 px area.
    min_area = (target_r ** 2) * 0.0005
    max_area = (target_r ** 2) * 0.02

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

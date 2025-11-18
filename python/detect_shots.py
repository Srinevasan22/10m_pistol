#!/usr/bin/env python3
import sys
import json
import cv2
import numpy as np
from pathlib import Path


def log(*args):
    print(*args, file=sys.stderr)


def detect_shots(image_path: str):
    """
    v1 detector:
    - load image
    - find main circular target
    - within that circle, find dark-ish blobs as "shots"
    - return list of {score, positionX, positionY}
      where positionX/Y are normalized [-1, 1] with (0,0) at target center.
    """
    # --- 1. Load image ---
    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    # --- 2. Blur slightly to reduce noise ---
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # --- 3. Try to detect the main circular target using HoughCircles ---
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(h, w) / 4,
        param1=100,
        param2=30,
        minRadius=int(min(h, w) * 0.2),
        maxRadius=int(min(h, w) * 0.49),
    )

    if circles is None:
        # Fallback: use image center and a radius based on image size
        log("No circle found, using fallback center/radius")
        cx, cy = w / 2.0, h / 2.0
        target_r = min(h, w) * 0.4
    else:
        circles = np.round(circles[0, :]).astype("int")
        # take the largest detected circle
        c = max(circles, key=lambda c: c[2])
        cx, cy, target_r = float(c[0]), float(c[1]), float(c[2])
        log(f"Detected circle center=({cx:.1f},{cy:.1f}), r={target_r:.1f}")

    # --- 4. Threshold to highlight darker areas (rings + holes) ---
    # For pistol targets, the center is black, holes slightly lighter – we do a simple inverse binary
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Create a mask for the target circle
    mask = np.zeros_like(th)
    cv2.circle(mask, (int(cx), int(cy)), int(target_r), 255, thickness=-1)

    # Restrict thresholded image to inside the target
    target_only = cv2.bitwise_and(th, th, mask=mask)

    # --- 5. Find contours → potential shots ---
    contours, _ = cv2.findContours(target_only, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    shots = []
    # These size thresholds are heuristic and will need tuning with real photos
    min_area = (target_r ** 2) * 0.0002  # too small = noise
    max_area = (target_r ** 2) * 0.02    # too big = ring segments

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        (x, y), radius = cv2.minEnclosingCircle(cnt)
        # Ensure this is reasonably inside the target
        dist_center = np.hypot(x - cx, y - cy)
        if dist_center > target_r * 1.05:
            continue

        # --- 6. Normalize coordinates to [-1, 1] ---
        # x: left (-1) to right (+1), y: top (-1) to bottom (+1)
        norm_x = (x - cx) / target_r
        norm_y = (y - cy) / target_r

        # --- 7. Rough scoring based on distance ratio ---
        # ratio 0 = center, 1 = edge -> map to score 10..1
        ratio = dist_center / target_r
        ratio = max(0.0, min(1.0, ratio))

        # simple linear mapping: center=10, edge=1
        score = 10.0 - 9.0 * ratio
        # round to one decimal for now
        score = round(score, 1)

        shots.append({
            "score": score,
            "positionX": float(norm_x),
            "positionY": float(norm_y),
        })

    # Optional: sort shots by distance from center (inner first)
    shots.sort(key=lambda s: abs(s["score"] - 10.0))

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

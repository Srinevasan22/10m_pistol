#!/usr/bin/env python3
import sys
import json
import math
import cv2
import numpy as np
from pathlib import Path


# --- Target geometry helpers -------------------------------------------------

OFFICIAL_RING_DIAMETERS_MM = {
    10: 11.5,
    9: 27.5,
    8: 43.5,
    7: 59.5,
    6: 75.5,
    5: 91.5,
    4: 107.5,
    3: 123.5,
    2: 139.5,
    1: 155.5,
}


def build_ring_ratio_thresholds():
    outer_radius_mm = OFFICIAL_RING_DIAMETERS_MM[1] / 2.0
    return sorted(
        (
            (score_val, (diameter / 2.0) / outer_radius_mm)
            for score_val, diameter in OFFICIAL_RING_DIAMETERS_MM.items()
        ),
        key=lambda item: item[0],
        reverse=True,
    )


RING_RATIO_THRESHOLDS = build_ring_ratio_thresholds()


def log(*args):
    print(*args, file=sys.stderr)


# --- Global detector limits --------------------------------------------------

MAX_SHOTS_PER_TARGET = 15  # hard ceiling per scanned card


def limit_shots(shots, max_shots=MAX_SHOTS_PER_TARGET):
    """Keep at most max_shots, prioritising shots closest to 10."""
    if len(shots) <= max_shots:
        return shots

    # shots are already sorted by closeness to 10 below; we only log & slice
    limited = shots[:max_shots]
    log(f"[scan] Limiting shots from {len(shots)} to {len(limited)}")
    return limited


def detect_target_circle(gray):
    """Detect the main target circle using Hough transform."""
    blur = cv2.GaussianBlur(gray, (9, 9), 0)
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.5,
        minDist=gray.shape[0] // 2,
        param1=80,
        param2=40,
        minRadius=gray.shape[0] // 4,
        maxRadius=0,
    )
    if circles is None:
        return None

    circles = np.uint16(np.around(circles))
    x, y, r = circles[0][0]
    return float(x), float(y), float(r)


def split_inner_outer(roi):
    """Return binary masks for inner (black) and outer (beige) regions."""
    _, thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    inner_mask = (roi < thresh).astype(np.uint8)
    outer_mask = (roi >= thresh).astype(np.uint8)
    return inner_mask, outer_mask


def estimate_pellet_radius_px(target_radius_px: float) -> int:
    """Estimate the pellet radius (px) based on the detected target radius."""
    return max(6, int(target_radius_px * 0.025))


def sample_paper_mean(hsv_img, cx: float, cy: float, target_r: float):
    """Estimate the beige paper colour by sampling boxes near the target edges."""

    h, w = hsv_img.shape[:2]
    x0 = max(int(cx - target_r), 0)
    y0 = max(int(cy - target_r), 0)
    x1 = min(int(cx + target_r), w)
    y1 = min(int(cy + target_r), h)

    sample_w = max(6, int((x1 - x0) * 0.15))
    sample_h = max(6, int((y1 - y0) * 0.15))

    boxes = []
    boxes.append(hsv_img[y0 : y0 + sample_h, x0 : x0 + sample_w])
    boxes.append(hsv_img[y0 : y0 + sample_h, max(x1 - sample_w, x0) : x1])
    boxes.append(hsv_img[max(y1 - sample_h, y0) : y1, x0 : x0 + sample_w])
    boxes.append(
        hsv_img[
            max(y1 - sample_h, y0) : y1,
            max(x1 - sample_w, x0) : x1,
        ]
    )

    valid = [b.reshape(-1, 3) for b in boxes if b.size > 0]
    if not valid:
        return tuple(np.mean(hsv_img.reshape(-1, 3), axis=0).tolist())

    stacked = np.concatenate(valid, axis=0)
    mean_color = tuple(np.mean(stacked, axis=0).tolist())
    return mean_color


def build_white_marker_mask(hsv_img, paper_mean):
    """Return a binary mask for pixels that are much brighter and less saturated."""

    if paper_mean is None:
        return np.zeros(hsv_img.shape[:2], dtype=np.uint8)

    _, paper_sat, paper_val = paper_mean

    sat_threshold = min(60.0, max(5.0, paper_sat - 20.0))
    val_threshold = max(200.0, paper_val + 30.0)

    sat_channel = hsv_img[:, :, 1].astype(np.float32)
    val_channel = hsv_img[:, :, 2].astype(np.float32)

    mask = np.zeros_like(sat_channel, dtype=np.uint8)
    bright = val_channel >= val_threshold
    desat = sat_channel <= sat_threshold
    mask[np.logical_and(bright, desat)] = 255

    return mask


def detect_markers_using_env_color(hsv_img, env_color=None, tolerances=(10, 40, 40)):
    """
    Build a mask around a sampled environment colour.
    Not yet used in V1, but kept for future extension.
    """

    if env_color is None:
        return np.zeros(hsv_img.shape[:2], dtype=np.uint8)

    he, se, ve = env_color
    d_h, d_s, d_v = tolerances

    h_channel = hsv_img[:, :, 0].astype(np.int16)
    s_channel = hsv_img[:, :, 1].astype(np.int16)
    v_channel = hsv_img[:, :, 2].astype(np.int16)

    # Hue is circular (0-179). Handle wrap-around by checking both distances.
    hue_diff = np.minimum(
        np.abs(h_channel - int(he)), 180 - np.abs(h_channel - int(he))
    )

    mask = (
        (hue_diff <= int(d_h))
        & (np.abs(s_channel - int(se)) <= int(d_s))
        & (np.abs(v_channel - int(ve)) <= int(d_v))
    )

    out = np.zeros_like(h_channel, dtype=np.uint8)
    out[mask] = 255
    return out


def detect_markers_using_white(img, hsv_img, cx: float, cy: float, target_r: float):
    """
    Detect high-contrast white markers on the target surface and return shot dicts.
    """

    paper_mean = sample_paper_mean(hsv_img, cx, cy, target_r)
    marker_mask = build_white_marker_mask(hsv_img, paper_mean)

    if marker_mask is None or cv2.countNonZero(marker_mask) == 0:
        return [], []

    circle_mask = np.zeros_like(marker_mask, dtype=np.uint8)
    cv2.circle(
        circle_mask,
        (int(round(cx)), int(round(cy))),
        int(round(target_r * 1.2)),
        255,
        -1,
    )
    marker_mask = cv2.bitwise_and(marker_mask, circle_mask)

    kernel = np.ones((3, 3), np.uint8)
    marker_mask = cv2.morphologyEx(marker_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    marker_mask = cv2.morphologyEx(marker_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    marker_mask = cv2.GaussianBlur(marker_mask, (5, 5), 0)
    _, marker_mask = cv2.threshold(marker_mask, 127, 255, cv2.THRESH_BINARY)

    cnts, _ = cv2.findContours(
        marker_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    if not cnts:
        return [], []

    pellet_radius_px = estimate_pellet_radius_px(target_r)
    expected_marker_area = np.pi * (pellet_radius_px ** 2)
    min_area = expected_marker_area * 0.45
    max_area = expected_marker_area * 2.5

    shots = []
    kept_contours = []

    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        circularity = 4.0 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.5:
            continue

        (x, y), _ = cv2.minEnclosingCircle(cnt)
        dist_center = np.hypot(x - cx, y - cy)
        if dist_center > target_r * 1.2:
            continue

        norm_x = (x - cx) / target_r
        norm_y = (y - cy) / target_r
        ring_score, decimal_score, is_inner_ten = compute_scores_from_normalized(
            norm_x, norm_y
        )

        shots.append(
            {
                "score": ring_score,
                "ringScore": ring_score,
                "decimalScore": decimal_score,
                "positionX": float(norm_x),
                "positionY": float(norm_y),
                "scoreSource": "white-marker",
                "isInnerTen": bool(is_inner_ten),
            }
        )
        kept_contours.append(cnt)

    log(
        f"[white-marker] detected {len(shots)} shots out of {len(cnts)} candidate blobs"
    )

    return shots, kept_contours


def detect_holes_in_mask(
    roi,
    mask,
    hole_is_dark=True,
    pellet_radius_px=10,
):
    """Detect hole centers within a masked region of interest."""

    sub = roi.copy()
    sub[mask == 0] = 255 if hole_is_dark else 0

    if not hole_is_dark:
        sub = 255 - sub

    sub_blur = cv2.GaussianBlur(sub, (5, 5), 0)
    th = cv2.adaptiveThreshold(
        sub_blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2,
    )

    kernel = np.ones((3, 3), np.uint8)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=1)

    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(th)

    holes = []
    one_hole_area = np.pi * (pellet_radius_px ** 2)
    max_holes_per_component = 10

    for i in range(1, num_labels):
        stat_area = stats[i, cv2.CC_STAT_AREA]
        if stat_area < 0.3 * one_hole_area:
            continue

        component_mask = (labels == i).astype(np.uint8)

        comp_contours, _ = cv2.findContours(
            component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not comp_contours:
            continue

        comp_cnt = max(comp_contours, key=cv2.contourArea)
        contour_area = cv2.contourArea(comp_cnt)
        perimeter = cv2.arcLength(comp_cnt, True) if comp_cnt is not None else 0.0
        if perimeter <= 0.0:
            continue

        circularity = 4.0 * np.pi * contour_area / (perimeter * perimeter)

        # NEW: be stricter – keep only very round blobs
        if circularity < 0.70:
            continue

        area = contour_area

        peaks = []

        if area > 1.5 * one_hole_area:
            dist = cv2.distanceTransform(component_mask, cv2.DIST_L2, 5)
            dist = dist.astype(np.float32)
            dilated = cv2.dilate(dist, np.ones((3, 3), np.uint8))

            min_peak_radius = max(1.0, pellet_radius_px * 0.45)
            local_max = (
                (dist >= min_peak_radius)
                & np.isclose(dist, dilated, atol=1e-2)
            )

            peak_mask = np.zeros_like(component_mask, dtype=np.uint8)
            peak_mask[local_max] = 1
            num_peaks, _, _, peak_centroids = cv2.connectedComponentsWithStats(
                peak_mask
            )
            for j in range(1, num_peaks):
                px, py = peak_centroids[j]
                peaks.append((px, py))

        # NEW: fallback only for “hole-sized” circular blobs.
        # Anything much smaller or larger is treated as noise (ring segments, etc.).
        if not peaks:
            x_c, y_c = centroids[i]

            if 0.5 * one_hole_area <= area <= 2.0 * one_hole_area:
                # one physical pellet hole
                n_est = 1
                peaks = [(x_c, y_c)] * n_est
            else:
                # too small or too big → probably not a single pellet hole
                # legacy logic kept here for reference:
                # n_est = max(1, int(round(area / one_hole_area)))
                # n_est = min(n_est, max_holes_per_component)
                # peaks = [(x_c, y_c)] * n_est
                continue

        for (px, py) in peaks:
            holes.append((px, py))

    return holes, cnts


def merge_close_points(points, min_dist):
    """Merge nearby detections so each physical hole yields one point."""

    merged = []

    for x, y in points:
        if not merged:
            merged.append([x, y, 1])
            continue

        found = False
        for cluster in merged:
            cx, cy, cnt = cluster
            if (x - cx) ** 2 + (y - cy) ** 2 <= min_dist ** 2:
                new_cnt = cnt + 1
                cluster[0] = (cx * cnt + x) / new_cnt
                cluster[1] = (cy * cnt + y) / new_cnt
                cluster[2] = new_cnt
                found = True
                break

        if not found:
            merged.append([x, y, 1])

    return [(cx, cy, cnt) for cx, cy, cnt in merged]


def compute_scores_from_normalized(dx, dy):
    dist_ratio = np.hypot(dx, dy)
    if dist_ratio > 1.0:
        return 0.0, 0.0, False

    ring_score = 0.0
    for score_val, threshold in RING_RATIO_THRESHOLDS:
        if dist_ratio <= threshold:
            ring_score = float(score_val)
            break

    decimal_score = max(0.0, 10.9 - dist_ratio * 10.9)
    is_inner_ten = decimal_score > 10.5
    return ring_score, decimal_score, is_inner_ten


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

        # Downscale very large debug overlays so they are lighter to store
        max_dim = 1200
        h_dbg, w_dbg = debug.shape[:2]
        if max(h_dbg, w_dbg) > max_dim:
            scale = max_dim / max(h_dbg, w_dbg)
            new_size = (int(w_dbg * scale), int(h_dbg * scale))
            debug = cv2.resize(debug, new_size, interpolation=cv2.INTER_AREA)

        # Save with a balanced JPEG quality to keep files readable but compact
        cv2.imwrite(
            str(out_path),
            debug,
            [int(cv2.IMWRITE_JPEG_QUALITY), 80],
        )

        log(f"Saved debug image to {out_path}")

    except Exception as e:
        log("Failed to save debug image:", e)


def detect_shots_two_pass(gray, cx, cy, target_r):
    x0 = max(int(cx - target_r), 0)
    y0 = max(int(cy - target_r), 0)
    x1 = min(int(cx + target_r), gray.shape[1])
    y1 = min(int(cy + target_r), gray.shape[0])

    roi = gray[y0:y1, x0:x1]
    if roi.size == 0:
        return [], []

    inner_mask, outer_mask = split_inner_outer(roi)
    pellet_radius_px = estimate_pellet_radius_px(target_r)

    holes_outer, cnts_outer = detect_holes_in_mask(
        roi, outer_mask, hole_is_dark=True, pellet_radius_px=pellet_radius_px
    )
    holes_inner, cnts_inner = detect_holes_in_mask(
        roi, inner_mask, hole_is_dark=False, pellet_radius_px=pellet_radius_px
    )

    all_holes = holes_outer + holes_inner
    log(
        f"Two-pass: outer={len(holes_outer)}, inner={len(holes_inner)}, "
        f"total_raw={len(all_holes)}"
    )
    merged_points = merge_close_points(
        all_holes, min_dist=pellet_radius_px * 0.8
    )

    log(f"[scan] raw points={len(all_holes)}, merged={len(merged_points)}")

    contours = []
    for cnt in cnts_outer + cnts_inner:
        if cnt.size == 0:
            continue
        contours.append(cnt + np.array([[[x0, y0]]]))

    shots = []
    for (x, y, count) in merged_points:
        x_global = x + x0
        y_global = y + y0
        norm_x = (x_global - cx) / target_r
        norm_y = (y_global - cy) / target_r
        ring_score, decimal_score, is_inner_ten = compute_scores_from_normalized(
            norm_x, norm_y
        )

        for _ in range(max(1, int(round(count)))):
            shots.append(
                {
                    "score": ring_score,
                    "ringScore": ring_score,
                    "decimalScore": decimal_score,
                    "positionX": float(norm_x),
                    "positionY": float(norm_y),
                    "scoreSource": "computed",
                    "isInnerTen": bool(is_inner_ten),
                }
            )

    return shots, contours


def detect_shots(image_path: str):
    """
    v1.2 detector tuned for multi-pass hole detection on a 10m pistol target image:
    - load image
    - detect main circular target (outer scoring ring)
    - detect holes both on the beige outer rings and inside the black center
    - return list of {score, positionX, positionY},
      with normalized coords in [-1, 1] relative to target center.
    """
    # --- 1. Load image ---
    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, w = gray.shape[:2]

    # Optional: downscale very large images to speed up processing
    max_dim = max(h, w)
    if max_dim > 1600:
        scale = 1600.0 / max_dim
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        h, w = gray.shape[:2]

    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # --- 2. Detect main circular target (outer ring) ---
    circle = detect_target_circle(gray)
    if circle is None:
        log("No circle found via helper, falling back to legacy search")
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
            chosen = min(
                circles,
                key=lambda c: (c[0] - img_cx) ** 2 + (c[1] - img_cy) ** 2,
            )
            cx, cy, target_r = (
                float(chosen[0]),
                float(chosen[1]),
                float(chosen[2]),
            )
            log(
                f"Detected circle center=({cx:.1f},{cy:.1f}) via fallback, r={target_r:.1f}"
            )
    else:
        cx, cy, target_r = circle
        log(f"Detected circle center=({cx:.1f},{cy:.1f}), r={target_r:.1f}")

    # --- 3. Two-pass shot detection (outer beige + inner black) ---
    marker_shots, marker_contours = detect_markers_using_white(
        img=img, hsv_img=hsv, cx=cx, cy=cy, target_r=target_r
    )

    shots = marker_shots
    contours = marker_contours

    if not shots:
        log("White-marker detector found no shots, falling back to hole detector")
        shots, contours = detect_shots_two_pass(gray, cx, cy, target_r)

    if not shots:
        log("Two-pass detector found no shots, falling back to bright-blob mode")
        contours = []
        for thr in [250, 245, 240]:
            _, bright = cv2.threshold(blur, thr, 255, cv2.THRESH_BINARY)
            cnts, _ = cv2.findContours(
                bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if len(cnts) >= 3:
                contours = cnts
                break

        if not contours:
            log("No bright blobs found for shots")
            contours = []

        shots = []
        min_area = (target_r ** 2) * 0.0005
        max_area = (target_r ** 2) * 0.02

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue

            (x, y), radius = cv2.minEnclosingCircle(cnt)

            dist_center = np.hypot(x - cx, y - cy)
            if dist_center > target_r * 1.5:
                continue

            norm_x = (x - cx) / target_r
            norm_y = (y - cy) / target_r
            ring_score, decimal_score, is_inner_ten = compute_scores_from_normalized(
                norm_x, norm_y
            )

            shots.append(
                {
                    "score": decimal_score,
                    "ringScore": ring_score,
                    "decimalScore": decimal_score,
                    "positionX": float(norm_x),
                    "positionY": float(norm_y),
                    "scoreSource": "fallback",
                    "isInnerTen": bool(is_inner_ten),
                }
            )

    # sort inner to outer (closest to 10 first)
    shots.sort(key=lambda s: abs(s.get("ringScore", 0.0) - 10.0))

    log(f"[scan] Total shots before limit: {len(shots)}")

    # NEW: hard cap so we don't save hundreds of artifacts
    shots = limit_shots(shots)

    log(f"[scan] Total shots after limit: {len(shots)}")

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

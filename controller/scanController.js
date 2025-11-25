import mongoose from 'mongoose';
import path from 'path';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import sharp from 'sharp';
import Session from '../model/session.js';
import Shot from '../model/shot.js';
import Target from '../model/target.js';
import { recalculateSessionStats } from '../util/sessionStats.js';
import { computeShotScore, normalizeScoringMode } from '../util/scoring.js';
import { PISTOL_10M_CONFIG } from '../util/scoringConfig.js';
import {
  buildDebugImagePath,
  buildPublicUploadUrl,
  normalizeToUploadsPath,
  toAbsoluteUploadsPath,
} from '../util/uploadPaths.js';

const serializeShot = (shotDoc) => {
  if (!shotDoc) {
    return null;
  }

  const shotObject =
    typeof shotDoc.toObject === 'function'
      ? shotDoc.toObject({ versionKey: false })
      : { ...shotDoc };

  delete shotObject.__v;
  delete shotObject._doc;

  return shotObject;
};

const safeDeleteFile = async (filePath) => {
  if (!filePath) {
    return;
  }

  // Previously we always deleted the uploaded image immediately after processing.
  // For now we keep the file so the Data & Privacy flow can delete images on demand.
  // If you want the old behaviour back, set DELETE_SCAN_IMAGES_IMMEDIATELY=true.
  const shouldDelete = process.env.DELETE_SCAN_IMAGES_IMMEDIATELY === 'true';

  if (!shouldDelete) {
    console.log('[scanTarget] Keeping uploaded image at', filePath);
    return;
  }

  try {
    await fs.unlink(filePath);
    console.log('[scanTarget] Deleted temp image', filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('Failed to delete uploaded file:', err.message);
    }
  }
};

const MIN_IMAGE_BYTES = 15_000;
const MIN_IMAGE_WIDTH = 600;
const MIN_IMAGE_HEIGHT = 600;

const validateImageQuality = async ({ filePath, size }) => {
  if (!filePath) {
    throw new Error('No file provided');
  }

  if (typeof size === 'number' && size < MIN_IMAGE_BYTES) {
    throw new Error('Image file is too small to scan reliably');
  }

  const metadata = await sharp(filePath).metadata();

  if (!metadata?.width || !metadata?.height) {
    throw new Error('Unable to read image dimensions');
  }

  if (metadata.width < MIN_IMAGE_WIDTH || metadata.height < MIN_IMAGE_HEIGHT) {
    throw new Error('Image dimensions are too low for detection');
  }
};

const runOpenCvDetector = (imagePath) => {
  return new Promise((resolve, reject) => {
    try {
      const scriptPath = path.join(process.cwd(), 'python', 'detect_shots.py');
      console.log('[scanTarget] Running OpenCV detector:', scriptPath, imagePath);

      execFile('python3', [scriptPath, imagePath], (error, stdout, stderr) => {
        if (stderr?.trim()) {
          console.warn('[OpenCV detector stderr]:', stderr.trim());
        }

        if (error) {
          console.error('[OpenCV detector] Process error:', error.message);
          return reject(error);
        }

        if (!stdout?.trim()) {
          return reject(new Error('Detector returned no output'));
        }

        try {
          const parsed = JSON.parse(stdout);
          return resolve(parsed);
        } catch (err) {
          console.error('Failed to parse OpenCV detector JSON:', err.message);
          return reject(err);
        }
      });
    } catch (err) {
      console.error('runOpenCvDetector error:', err.message);
      reject(err);
    }
  });
};

const fileExists = async (storedPath) => {
  if (!storedPath) {
    return false;
  }

  try {
    await fs.access(toAbsoluteUploadsPath(storedPath));
    return true;
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('Error checking file existence for', storedPath, err.message);
    }
    return false;
  }
};

const findNextTargetNumber = async ({ sessionId, userId }) => {
  const latestTarget = await Target.findOne({ sessionId, userId })
    .sort({ targetNumber: -1 })
    .lean();

  if (!latestTarget || typeof latestTarget.targetNumber !== 'number') {
    return 0;
  }

  return latestTarget.targetNumber + 1;
};

export const scanTargetAndCreateShots = async (req, res) => {
  let imagePath;
  try {
    const { userId, sessionId } = req.params;
    console.log('[scanTarget] params:', req.params);
    console.log('[scanTarget] file info:', req.file);

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session identifier' });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'You are not allowed to modify this session' });
    }

    imagePath = req.file?.path;
    console.log('[scanTarget] Image uploaded for scanning:', imagePath);

    if (!imagePath) {
      console.warn('[scanTarget] No imagePath found in req.file; aborting scan');
      return res
        .status(400)
        .json({ error: 'No image file was provided for scanning' });
    }

    const scoringMode = normalizeScoringMode(session?.scoringMode);

    try {
      await validateImageQuality({
        filePath: req.file?.path,
        size: req.file?.size,
      });
    } catch (qualityError) {
      console.warn('[scanTarget] Image quality check failed:', qualityError.message);
      return res.status(400).json({
        error:
          'Image quality too low. Please retake the photo closer to the target with good lighting.',
      });
    }

    const normalizedImagePath = normalizeToUploadsPath(imagePath);
    const debugImagePath = buildDebugImagePath(normalizedImagePath);

    let detectorOutput;
    try {
      detectorOutput = await runOpenCvDetector(imagePath);
    } catch (detectorError) {
      console.error('[scanTarget] Shot detection failed:', detectorError.message);
      return res.status(502).json({
        error: 'Shot detection failed. Please try again with a clearer target photo.',
      });
    }

    const detectedShots = Array.isArray(detectorOutput)
      ? detectorOutput
      : detectorOutput?.shots;
    console.log(
      `[scanTarget] OpenCV detector returned ${detectedShots?.length || 0} shots`
    );

    if (!Array.isArray(detectedShots)) {
      console.error(
        '[scanTarget] Shot detection failed – detector returned invalid response'
      );
      return res.status(502).json({
        error:
          'Automatic shot detection failed. Please retake the photo so the target is clearly visible and try again.',
      });
    }

    if (detectedShots.length === 0) {
      console.warn(
        '[scanTarget] Shot detection succeeded but no usable shots were detected'
      );
      return res.status(200).json({
        message:
          'The target image was processed successfully but no shots were detected. Please review the image and try again if necessary.',
        shots: [],
      });
    }

    const normalizedUserId = new mongoose.Types.ObjectId(userId);
    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);

    const nextTargetNumber = await findNextTargetNumber({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    const target = await Target.create({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
      targetNumber: nextTargetNumber,
      shots: [],
      scanImagePath: normalizedImagePath,
      debugImagePath: (await fileExists(debugImagePath)) ? debugImagePath : null,
    });

    if (!Array.isArray(session.targets)) {
      session.targets = [];
    }
    session.targets.push(target._id);

    const createdShots = [];

    for (const detectedShot of detectedShots) {
      const normalizedPositionX =
        typeof detectedShot.x === 'number'
          ? detectedShot.x
          : typeof detectedShot.positionX === 'number'
            ? detectedShot.positionX
            : Number(detectedShot.positionX) || 0;
      const normalizedPositionY =
        typeof detectedShot.y === 'number'
          ? detectedShot.y
          : typeof detectedShot.positionY === 'number'
            ? detectedShot.positionY
            : Number(detectedShot.positionY) || 0;

      const computedScores = computeShotScore({
        x: normalizedPositionX,
        y: normalizedPositionY,
        config: PISTOL_10M_CONFIG,
        mode: scoringMode,
      });

      const shot = new Shot({
        score:
          scoringMode === 'decimal'
            ? computedScores.decimalScore
            : computedScores.ringScore,
        ringScore: computedScores.ringScore,
        decimalScore: computedScores.decimalScore,
        isInnerTen: computedScores.isInnerTen,
        scoreSource: 'computed',
        positionX: normalizedPositionX,
        positionY: normalizedPositionY,
        timestamp: new Date(),
        sessionId: normalizedSessionId,
        userId: normalizedUserId,
        targetId: target._id,
      });

      await shot.save();
      createdShots.push(shot);
      target.shots.push(shot._id);
    }

    await target.save();
    await session.save();
    await recalculateSessionStats(normalizedSessionId);

    console.log(
      `[scanTarget] Saved ${createdShots.length} shots for session ${sessionId}`
    );

    const targetObject = target.toObject({ versionKey: false });

    const enhancedTarget = {
      ...targetObject,
      scanImageUrl: buildPublicUploadUrl(targetObject.scanImagePath),
      debugImageUrl: buildPublicUploadUrl(targetObject.debugImagePath),
    };

    const serializedShots = createdShots
      .map((shot) => serializeShot(shot))
      .filter(Boolean);

    const responseTarget = {
      ...enhancedTarget,
      shots: serializedShots,
    };

    res.status(201).json({
      message: 'Shots detected and saved from scanned target',
      shots: serializedShots,
      target: responseTarget,
    });
  } catch (error) {
    console.error('Error scanning target image', error);
    res.status(500).json({ error: 'Failed to process scanned target image' });
  } finally {
    await safeDeleteFile(imagePath);
  }
};

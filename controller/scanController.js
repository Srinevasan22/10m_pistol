import mongoose from 'mongoose';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs/promises';
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

const fakeDetectShotsFromImage = (imagePath) => {
  if (!imagePath) {
    return [];
  }

  return [
    { score: 9.9, positionX: 0.02, positionY: -0.05 },
    { score: 9.4, positionX: -0.1, positionY: 0.08 },
    { score: 8.6, positionX: 0.3, positionY: 0.2 },
  ];
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

const runOpenCvDetector = (imagePath) => {
  return new Promise((resolve) => {
    try {
      const scriptPath = path.join(process.cwd(), 'python', 'detect_shots.py');
      console.log('[scanTarget] Running OpenCV detector:', scriptPath, imagePath);

      const py = spawn('python3', [scriptPath, imagePath]);

      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', (code) => {
        if (stderr.trim()) {
          console.warn('[OpenCV detector stderr]:', stderr.trim());
        }
        console.log('[OpenCV detector exited with code]', code);

        if (!stdout.trim()) {
          console.warn('[OpenCV detector] No stdout, returning []');
          return resolve([]);
        }

        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed)) {
            return resolve(parsed);
          }
          if (Array.isArray(parsed.shots)) {
            return resolve(parsed.shots);
          }
          console.warn('[OpenCV detector] Parsed JSON has no shots array');
          return resolve([]);
        } catch (err) {
          console.error('Failed to parse OpenCV detector JSON:', err.message);
          return resolve([]);
        }
      });

      py.on('error', (err) => {
        console.error('Failed to start python3 detector:', err.message);
        return resolve([]);
      });
    } catch (err) {
      console.error('runOpenCvDetector error:', err.message);
      resolve([]);
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

    const scoringMode = normalizeScoringMode(session?.scoringMode);

    const normalizedImagePath = normalizeToUploadsPath(imagePath);
    const debugImagePath = buildDebugImagePath(normalizedImagePath);

    let detectedShots = [];
    let usedStub = false;

    if (!imagePath) {
      console.warn(
        '[scanTarget] No imagePath found in req.file; using stub detector'
      );
      usedStub = true;
      detectedShots = fakeDetectShotsFromImage('no-file');
    } else {
      detectedShots = await runOpenCvDetector(imagePath);
      console.log(
        `[scanTarget] OpenCV detector returned ${detectedShots?.length || 0} shots`
      );

      if (!detectedShots || !detectedShots.length) {
        console.warn(
          '[scanTarget] OpenCV detection returned no shots, falling back to fake stub',
        );
        usedStub = true;
        detectedShots = fakeDetectShotsFromImage(imagePath);
      }
    }

    if (!Array.isArray(detectedShots) || detectedShots.length === 0) {
      return res.status(200).json({
        message: 'No shots detected on the image',
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
      debugImagePath:
        (await fileExists(debugImagePath)) && !usedStub ? debugImagePath : null,
    });

    if (!Array.isArray(session.targets)) {
      session.targets = [];
    }
    session.targets.push(target._id);

    const createdShots = [];

    for (const detectedShot of detectedShots) {
      const normalizedPositionX =
        typeof detectedShot.positionX === 'number'
          ? detectedShot.positionX
          : Number(detectedShot.positionX) || 0;
      const normalizedPositionY =
        typeof detectedShot.positionY === 'number'
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
      message: usedStub
        ? 'Shots detected and saved from scanned target (stub)'
        : 'Shots detected and saved from scanned target',
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

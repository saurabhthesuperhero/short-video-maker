import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "fs-extra";
import path from "path";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import { Config } from "../../config";
import mime from "mime-types"; // For robust MIME type detection

// todo abstract class
export class APIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.router = express.Router();
    this.shortCreator = shortCreator;

    this.router.use(express.json());

    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.post(
      "/short-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const input = validateCreateShortInput(req.body);

          logger.info({ input }, "Creating short video");

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
          );

          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error validating input");

          // Handle validation errors specifically
          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
              });
              return;
            } catch (parseError: unknown) {
              logger.error(parseError, "Error parsing validation error");
            }
          }

          // Fallback for other errors
          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/short-video/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        const status = this.shortCreator.status(videoId);
        res.status(200).json({
          status,
        });
      },
    );

    this.router.get(
      "/music-tags",
      (req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json(this.shortCreator.ListAvailableMusicTags());
      },
    );

    this.router.get("/voices", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json(this.shortCreator.ListAvailableVoices());
    });

    this.router.get(
      "/short-videos",
      (req: ExpressRequest, res: ExpressResponse) => {
        const videos = this.shortCreator.listAllVideos();
        res.status(200).json({
          videos,
        });
      },
    );

    this.router.delete(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        this.shortCreator.deleteVideo(videoId);
        res.status(200).json({
          success: true,
        });
      },
    );

    this.router.get(
      "/tmp/:tmpFile",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { tmpFile } = req.params;
        if (!tmpFile) {
          res.status(400).json({
            error: "tmpFile is required",
          });
          return;
        }
        const tmpFilePath = path.join(this.config.tempDirPath, tmpFile);
        if (!fs.existsSync(tmpFilePath)) {
          res.status(404).json({
            error: "tmpFile not found",
          });
          return;
        }

        if (tmpFile.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }
        if (tmpFile.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        }
        if (tmpFile.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }

        const tmpFileStream = fs.createReadStream(tmpFilePath);
        tmpFileStream.on("error", (error) => {
          logger.error(error, "Error reading tmp file");
          res.status(500).json({
            error: "Error reading tmp file",
            tmpFile,
          });
        });
        tmpFileStream.pipe(res);
      },
    );

    this.router.get(
      "/music/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          res.status(400).json({
            error: "fileName is required",
          });
          return;
        }
        const musicFilePath = path.join(this.config.musicDirPath, fileName);
        if (!fs.existsSync(musicFilePath)) {
          res.status(404).json({
            error: "music file not found",
          });
          return;
        }
        const musicFileStream = fs.createReadStream(musicFilePath);
        musicFileStream.on("error", (error) => {
          logger.error(error, "Error reading music file");
          res.status(500).json({
            error: "Error reading music file",
            fileName,
          });
        });
        musicFileStream.pipe(res);
      },
    );

    // <<< NEW ROUTE TO SERVE YOUR AUDIO FILES
    this.router.get(
      "/audio/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          return res.status(400).json({ error: "fileName is required" });
        }
        // Basic security: prevent path traversal
        if (fileName.includes("..") || fileName.includes("/")) {
          return res.status(400).json({ error: "Invalid filename" });
        }

        const audioFilePath = path.join(this.config.audioDirPath, fileName);
        if (!fs.existsSync(audioFilePath)) {
          logger.warn({ audioFilePath }, "Audio file not found for serving");
          return res.status(404).json({ error: "Audio file not found" });
        }
        const mimeType = mime.lookup(audioFilePath) || 'application/octet-stream';
        res.setHeader("Content-Type", mimeType);

        const audioStream = fs.createReadStream(audioFilePath);
        audioStream.on("error", (error) => {
          logger.error(error, "Error reading audio file");
          res.status(500).json({ error: "Error reading audio file", fileName });
        });
        audioStream.pipe(res);
      },
    );

    // this.router.get(
    //   "/static/images/:filename",
    //   (req: ExpressRequest, res: ExpressResponse) => {
    //     const { filename } = req.params;
    //     if (!filename) {
    //       return res.status(400).json({ error: "filename is required" });
    //     }
    //
    //     // Basic security: prevent path traversal
    //     if (filename.includes("..") || filename.includes("/")) {
    //       return res.status(400).json({ error: "Invalid filename" });
    //     }
    //
    //     // const imagePath = path.join(this.config.staticDirPath, "images", filename);
    //     const imagePath = path.join(this.config.staticDirPath, "stoic", filename);
    //
    //     if (!fs.existsSync(imagePath)) {
    //       logger.warn({ imagePath }, "Static image not found for serving");
    //       return res.status(404).json({ error: "Image not found" });
    //     }
    //
    //     const mimeType = mime.lookup(imagePath) || 'application/octet-stream';
    //     res.setHeader("Content-Type", mimeType);
    //
    //     const imageStream = fs.createReadStream(imagePath);
    //     imageStream.on("error", (error) => {
    //       logger.error(error, "Error reading static image file");
    //       res.status(500).json({ error: "Error reading image file", filename });
    //     });
    //     imageStream.pipe(res);
    //   },
    // );

    this.router.get(
      "/static/images/:filename",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { filename } = req.params;
        if (!filename) return res.status(400).json({ error: "filename is required" });

        // 🛡️ simple path-traversal guard
        if (filename.includes("..") || filename.includes("/"))
          return res.status(400).json({ error: "Invalid filename" });

        // We now search BOTH portrait & landscape image folders
        const tryPaths = [
          path.join(this.config.staticDirPath, "stoic",           filename), // portrait
          path.join(this.config.staticDirPath, "stoichorizontal", filename), // landscape
        ];

        const hit = tryPaths.find((p) => fs.existsSync(p));
        if (!hit) {
          logger.warn({ filename }, "Static image not found");
          return res.status(404).json({ error: "Image not found" });
        }

        const mimeType = mime.lookup(hit) || "application/octet-stream";
        res.setHeader("Content-Type", mimeType);

        fs.createReadStream(hit)
          .on("error", (err) => {
            logger.error(err, "Reading static image failed");
            res.status(500).json({ error: "Error reading image file", filename });
          })
          .pipe(res);
      },
    );



    this.router.get(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { videoId } = req.params;
          if (!videoId) {
            res.status(400).json({
              error: "videoId is required",
            });
            return;
          }
          const video = this.shortCreator.getVideo(videoId);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=${videoId}.mp4`,
          );
          res.send(video);
        } catch (error: unknown) {
          logger.error(error, "Error getting video");
          res.status(404).json({
            error: "Video not found",
          });
        }
      },
    );


  }
}

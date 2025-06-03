import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";

const CROSS_FADE_SECONDS = 0.3;
const TRIM_SECONDS = 3; // 🔥 NEW: seconds trimmed off the tail of every render

import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  private availableStaticImages: string[] = []; // Cache available static images

  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
  ) {
    this.loadStaticImages(); // Load images on startup
  }

  private loadStaticImages() {
    // const imagesDir = path.join(this.config.staticDirPath, "images");
    const imagesDir = path.join(this.config.staticDirPath, "stoic");
    if (fs.existsSync(imagesDir)) {
      try {
        this.availableStaticImages = fs
          .readdirSync(imagesDir)
          .filter((file) => /\.(jpe?g|png|gif|webp)$/i.test(file)); // Filter for common image types
        logger.info(
          { count: this.availableStaticImages.length },
          "Loaded static images.",
        );
      } catch (error) {
        logger.error(error, "Failed to read static images directory");
        this.availableStaticImages = [];
      }
    } else {
      logger.warn(
        `Static images directory not found: ${imagesDir}. Feature will be disabled.`,
      );
      this.availableStaticImages = [];
    }
  }

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );

    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );

    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds: string[] = []; // For Pexels, to avoid duplicate videos
    const tempFiles: string[] = [];
    const usedStaticImages: string[] = []; // To avoid reusing the same static image in one short (optional)

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    let index = 0;
    for (const scene of inputScenes) {
      const audio = await this.kokoro.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      // tempVideoFileName is only used for Pexels downloads
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const captions = await this.whisper.CreateCaption(tempWavPath);
      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

      let sceneVisualUrl: string;

      if (scene.useLocalImage && this.availableStaticImages.length > 0) {
        let eligibleImages = this.availableStaticImages.filter(
          (img) => !usedStaticImages.includes(img),
        );
        if (eligibleImages.length === 0) {
          eligibleImages = this.availableStaticImages;
        }
        const selectedImage =
          eligibleImages[Math.floor(Math.random() * eligibleImages.length)];
        usedStaticImages.push(selectedImage);
        sceneVisualUrl = `http://localhost:${this.config.port}/api/static/images/${selectedImage}`;
        logger.debug(
          { image: selectedImage },
          "Using local static image for scene",
        );
      } else {
        if (scene.useLocalImage && this.availableStaticImages.length === 0) {
          logger.warn(
            "Requested local image, but no static images are available or loaded. Falling back to Pexels if search terms provided.",
          );
        }
        if (!scene.searchTerms || scene.searchTerms.length === 0) {
          throw new Error(
            `Scene ${index + 1} has no searchTerms and is not configured to use a local image, or no local images are available.`,
          );
        }

        const tempVideoFileName = `${tempId}.mp4`; // Pexels video needs a temp name
        const tempVideoPath = path.join(
          this.config.tempDirPath,
          tempVideoFileName,
        );
        tempFiles.push(tempVideoPath);

        const pexelsVideo = await this.pexelsApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );
        logger.debug(
          `Downloading Pexels video from ${pexelsVideo.url} to ${tempVideoPath}`,
        );
        await new Promise<void>((resolve, reject) => {
          const fileStream = fs.createWriteStream(tempVideoPath);
          const httpClient = pexelsVideo.url.startsWith("https")
            ? https
            : http;
          httpClient
            .get(pexelsVideo.url, (response: http.IncomingMessage) => {
              if (response.statusCode !== 200) {
                reject(
                  new Error(
                    `Failed to download video: ${response.statusCode}`,
                  ),
                );
                return;
              }
              response.pipe(fileStream);
              fileStream.on("finish", () => {
                fileStream.close();
                logger.debug(
                  `Pexels video downloaded successfully to ${tempVideoPath}`,
                );
                resolve();
              });
            })
            .on("error", (err: Error) => {
              fs.unlink(tempVideoPath, () => {});
              logger.error(err, "Error downloading Pexels video:");
              reject(err);
            });
        });
        excludeVideoIds.push(pexelsVideo.id);
        sceneVisualUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
      }

      scenes.push({
        captions,
        video: sceneVisualUrl,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }

    // ─── adjust for cross-fade overlaps ───
    const overlap = Math.max(0, inputScenes.length - 1) * CROSS_FADE_SECONDS;
    const effectiveDuration = totalDuration - overlap;

    /* 🔥 NEW: subtract TRIM_SECONDS so the rendered video is exactly
       3 seconds shorter (black tail removed) */
    const finalDuration = Math.max(0, effectiveDuration - TRIM_SECONDS);

    // Use trimmed duration when picking music too
    const selectedMusic = this.findMusic(finalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: finalDuration * 1000,
          paddingBack: config.paddingBack, // kept for completeness
          captionBackgroundColor: config.captionBackgroundColor,
          captionPosition: config.captionPosition,
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
    );

    for (const file of tempFiles) {
      logger.debug({ file }, "Removing temporary file");
      fs.removeSync(file);
    }

    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });

    if (musicFiles.length === 0) {
      logger.warn(
        { tag },
        "No music found for the given tag or no music available at all. Proceeding without music.",
      );
      return {
        file: "",
        start: 0,
        end: 0,
        mood: "none",
        url: "",
      };
    }
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }
    const files = fs.readdirSync(this.config.videosDirPath);
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");
        let status: VideoStatus = "ready";
        if (this.queue.find((item) => item.id === videoId)) {
          status = "processing";
        }
        videos.push({ id: videoId, status });
      }
    }
    for (const queueItem of this.queue) {
      if (!videos.find((v) => v.id === queueItem.id)) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }
    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }
}

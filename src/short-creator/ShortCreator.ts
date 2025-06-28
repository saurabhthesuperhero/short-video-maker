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
const TRIM_SECONDS = 3;
const IMAGE_DURATION_SECONDS = 4; // Each image will be displayed for this approximate duration

import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";
import { OrientationEnum } from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  private availableStaticImages: string[] = [];

  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
  ) {
    this.loadStaticImages();
  }

  private loadStaticImages() {
    // Make sure this path is correct for your setup
    const imagesDir = path.join(this.config.staticDirPath, "stoichorizontal");
    if (fs.existsSync(imagesDir)) {
      try {
        this.availableStaticImages = fs
          .readdirSync(imagesDir)
          .filter((file) => /\.(jpe?g|png|gif|webp)$/i.test(file));
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
    logger.debug({ inputScenes, config }, "Creating short video");

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;
    const excludeVideoIds: string[] = [];
    const tempFiles: string[] = [];

    const scenes: Scene[] = [];
    let finalDuration = 0;

    if (config.audioFile) {
      logger.info(
        { audioFile: config.audioFile },
        "Starting audio-first workflow",
      );
      const audioFilePath = path.join(
        this.config.audioDirPath,
        config.audioFile,
      );
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioDuration = await this.ffmpeg.getAudioDuration(audioFilePath);
      const allCaptions = await this.whisper.CreateCaption(audioFilePath);

      finalDuration = audioDuration + (config.paddingBack ?? 0) / 1000;

      // NEW LOGIC: Calculate number of visuals based on audio duration
      const numVisuals = Math.ceil(audioDuration / IMAGE_DURATION_SECONDS);
      if (numVisuals === 0) {
        throw new Error(
          "Cannot create video, audio duration is zero or negative.",
        );
      }

      if (inputScenes.length === 0) {
        throw new Error(
          "The 'scenes' array cannot be empty for audio-first workflow.",
        );
      }

      const sceneConfig = inputScenes[0]; // Use the first scene as a template for all visuals
      const durationPerScene = finalDuration / numVisuals; // Distribute time evenly

      const usedStaticImages: string[] = [];
      for (let i = 0; i < numVisuals; i++) {
        const sceneVisualUrl = await this.getVisualForScene(
          sceneConfig,
          durationPerScene,
          excludeVideoIds,
          usedStaticImages,
          orientation,
          tempFiles,
        );

        scenes.push({
          video: sceneVisualUrl,
          audio: {
            // IMPORTANT: Only attach the master audio URL to the very first scene
            url:
              i === 0
                ? `http://localhost:${this.config.port}/api/audio/${config.audioFile}`
                : "",
            duration: durationPerScene,
          },
          // IMPORTANT: Attach all captions to the first scene as well
          captions: i === 0 ? allCaptions : [],
        });
      }
    } else {
      // This is the original, working TTS workflow. It remains unchanged.
      logger.info("Starting text-to-speech workflow");
      let totalDuration = 0;
      const usedStaticImages: string[] = [];

      let index = 0;
      for (const scene of inputScenes) {
        if (!scene.text) {
          throw new Error(
            `Scene ${index + 1} is missing text for TTS workflow.`,
          );
        }
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
        const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
        const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
        tempFiles.push(tempWavPath, tempMp3Path);

        await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
        const captions = await this.whisper.CreateCaption(tempWavPath);
        await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

        const sceneVisualUrl = await this.getVisualForScene(
          scene,
          audioLength,
          excludeVideoIds,
          usedStaticImages,
          orientation,
          tempFiles,
        );

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

      const overlap =
        Math.max(0, inputScenes.length - 1) * CROSS_FADE_SECONDS;
      const effectiveDuration = totalDuration - overlap;
      finalDuration = Math.max(0, effectiveDuration - TRIM_SECONDS);
    }

    const selectedMusic = this.findMusic(finalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: finalDuration * 1000,
          paddingBack: config.paddingBack,
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

  private async getVisualForScene(
    scene: SceneInput,
    duration: number,
    excludeVideoIds: string[],
    usedStaticImages: string[],
    orientation: OrientationEnum,
    tempFiles: string[],
  ): Promise<string> {
    if (scene.useLocalImage && this.availableStaticImages.length > 0) {
      let eligibleImages = this.availableStaticImages.filter(
        (img) => !usedStaticImages.includes(img),
      );
      if (eligibleImages.length === 0) {
        // If all images have been used, reset and allow reuse
        eligibleImages = this.availableStaticImages;
        usedStaticImages.length = 0;
      }
      const selectedImage =
        eligibleImages[Math.floor(Math.random() * eligibleImages.length)];
      usedStaticImages.push(selectedImage);
      logger.debug(
        { image: selectedImage },
        "Using local static image for scene",
      );
      return `http://localhost:${this.config.port}/api/static/images/${selectedImage}`;
    } else {
      if (scene.useLocalImage && this.availableStaticImages.length === 0) {
        logger.warn(
          "Requested local image, but no static images are available or loaded. Falling back to Pexels if search terms provided.",
        );
      }
      if (!scene.searchTerms || scene.searchTerms.length === 0) {
        throw new Error(
          `Scene has no searchTerms and is not configured to use a local image, or no local images are available.`,
        );
      }

      const tempId = cuid();
      const tempVideoFileName = `${tempId}.mp4`;
      const tempVideoPath = path.join(
        this.config.tempDirPath,
        tempVideoFileName,
      );
      tempFiles.push(tempVideoPath);

      const pexelsVideo = await this.pexelsApi.findVideo(
        scene.searchTerms,
        duration,
        excludeVideoIds,
        orientation,
      );
      excludeVideoIds.push(pexelsVideo.id);

      logger.debug(
        `Downloading Pexels video from ${pexelsVideo.url} to ${tempVideoPath}`,
      );
      await this.downloadFile(pexelsVideo.url, tempVideoPath);

      return `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
    }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(dest);
      const httpClient = url.startsWith("https") ? https : http;
      httpClient
        .get(url, (response: http.IncomingMessage) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `Failed to download file: ${response.statusCode} ${response.statusMessage}`,
              ),
            );
            return;
          }
          response.pipe(fileStream);
          fileStream.on("finish", () => {
            fileStream.close();
            logger.debug(`File downloaded successfully to ${dest}`);
            resolve();
          });
        })
        .on("error", (err: Error) => {
          fs.unlink(dest, () => {});
          logger.error(err, "Error downloading file:");
          reject(err);
        });
    });
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

  private findMusic(
    videoDuration: number,
    tag?: MusicMoodEnum,
  ): MusicForVideo {
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
        mood: "none" as MusicMoodEnum,
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

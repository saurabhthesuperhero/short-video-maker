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
const DEFAULT_STATIC_DURATION_SEC = 4;

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

  private availableStaticImages: Record<OrientationEnum, string[]> = {
    portrait: [],
    landscape: [],
  };

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

  // ────────────────────────────────────────────
  // STATIC IMAGE UTILS
  // ────────────────────────────────────────────
  private loadStaticImages() {
    const portraitDir = path.join(this.config.staticDirPath, "stoic");
    const landscapeDir = path.join(
      this.config.staticDirPath,
      "stoichorizontal",
    );

    const readDir = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      try {
        return fs
          .readdirSync(dir)
          .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
      } catch (err) {
        logger.error(err, "Failed reading static image directory");
        return [];
      }
    };

    this.availableStaticImages.portrait = readDir(portraitDir);
    this.availableStaticImages.landscape = readDir(landscapeDir);

    logger.info(
      {
        portrait: this.availableStaticImages.portrait.length,
        landscape: this.availableStaticImages.landscape.length,
      },
      "Static images loaded",
    );
  }

  private pickRandomStaticImage(
    orientation: OrientationEnum,
    alreadyUsed: string[],
  ): string | null {
    const pool = this.availableStaticImages[orientation].filter(
      (img) => !alreadyUsed.includes(img),
    );
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ────────────────────────────────────────────
  // QUEUE UTILS
  // ────────────────────────────────────────────
  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((q) => q.id === id)) return "processing";
    if (fs.existsSync(videoPath)) return "ready";
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    const id = cuid();
    this.queue.push({ sceneInput, config, id });
    if (this.queue.length === 1) void this.processQueue();
    return id;
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    const { sceneInput, config, id } = this.queue[0];
    try {
      await this.createShort(id, sceneInput, config);
      logger.info({ id }, "Video rendered");
    } catch (err) {
      logger.error(err, "Render failed");
    } finally {
      this.queue.shift();
      void this.processQueue();
    }
  }

  // ────────────────────────────────────────────
  // MAIN: CREATE VIDEO
  // ────────────────────────────────────────────
  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    const orientation: OrientationEnum =
      config.orientation ?? OrientationEnum.portrait;
    const excludeVideoIds: string[] = [];
    const tempFiles: string[] = [];

    const scenes: Scene[] = [];
    let finalDurationSec = 0;

    // ─── AUDIO-FIRST WORKFLOW ──────────────────────
    if (config.audioFile) {
      const audioPath = path.join(this.config.audioDirPath, config.audioFile);
      if (!fs.existsSync(audioPath))
        throw new Error(`Audio file not found: ${audioPath}`);

      const audioDuration = await this.ffmpeg.getAudioDuration(audioPath);
      const captions = await this.whisper.CreateCaption(audioPath);

      finalDurationSec =
        audioDuration + (config.paddingBack ?? 0) / 1000;

      const staticImageSec =
        config.staticImageSec ?? DEFAULT_STATIC_DURATION_SEC;

      const requiredSceneCount = Math.ceil(
        finalDurationSec / staticImageSec,
      );

      const usedImages: string[] = [];
      for (let i = 0; i < requiredSceneCount; i++) {
        const image = this.pickRandomStaticImage(orientation, usedImages);
        if (!image)
          throw new Error(
            `No static images found for orientation ${orientation}`,
          );
        usedImages.push(image);

        const duration =
          i === requiredSceneCount - 1
            ? finalDurationSec - staticImageSec * (requiredSceneCount - 1)
            : staticImageSec;

        scenes.push({
          video: `http://localhost:${this.config.port}/api/static/images/${image}`,
          audio: {
            url:
              i === 0
                ? `http://localhost:${this.config.port}/api/audio/${config.audioFile}`
                : "",
            duration,
          },
          captions: i === 0 ? captions : [],
        });
      }
    }

    // ─── TTS WORKFLOW (unchanged) ───────────────────
    else {
      let totalDuration = 0;
      const usedStaticImages: string[] = [];

      let index = 0;
      for (const scene of inputScenes) {
        if (!scene.text)
          throw new Error(
            `Scene ${index + 1} is missing text for TTS workflow.`,
          );

        const audio = await this.kokoro.generate(
          scene.text,
          config.voice ?? "af_heart",
        );
        let { audioLength } = audio;
        const { audio: audioStream } = audio;

        if (index + 1 === inputScenes.length && config.paddingBack)
          audioLength += config.paddingBack / 1000;

        const tempId = cuid();
        const tempWav = path.join(this.config.tempDirPath, `${tempId}.wav`);
        const tempMp3 = path.join(this.config.tempDirPath, `${tempId}.mp3`);
        tempFiles.push(tempWav, tempMp3);

        await this.ffmpeg.saveNormalizedAudio(audioStream, tempWav);
        const captions = await this.whisper.CreateCaption(tempWav);
        await this.ffmpeg.saveToMp3(audioStream, tempMp3);

        const visualUrl = await this.getVisualForScene(
          scene,
          audioLength,
          excludeVideoIds,
          usedStaticImages,
          orientation,
          tempFiles,
        );

        scenes.push({
          captions,
          video: visualUrl,
          audio: {
            url: `http://localhost:${this.config.port}/api/tmp/${path.basename(
              tempMp3,
            )}`,
            duration: audioLength,
          },
        });

        totalDuration += audioLength;
        index++;
      }

      const overlap = Math.max(0, inputScenes.length - 1) * CROSS_FADE_SECONDS;
      const effectiveDuration = totalDuration - overlap;
      finalDurationSec = Math.max(0, effectiveDuration - TRIM_SECONDS);
    }

    // ─── MUSIC & RENDER ─────────────────────────────
    const music = this.findMusic(finalDurationSec, config.music);

    await this.remotion.render(
      {
        music,
        scenes,
        config: {
          durationMs: finalDurationSec * 1000,
          paddingBack: config.paddingBack,
          captionBackgroundColor: config.captionBackgroundColor,
          captionPosition: config.captionPosition,
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
    );

    tempFiles.forEach((f) => fs.removeSync(f));
    return videoId;
  }

  // ────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────
  private async getVisualForScene(
    scene: SceneInput,
    duration: number,
    excludeVideoIds: string[],
    usedStaticImages: string[],
    orientation: OrientationEnum,
    tempFiles: string[],
  ): Promise<string> {
    if (scene.useLocalImage) {
      const img = this.pickRandomStaticImage(orientation, usedStaticImages);
      if (img) {
        usedStaticImages.push(img);
        return `http://localhost:${this.config.port}/api/static/images/${img}`;
      }
      logger.warn(
        "Requested local image but none available; falling back to Pexels",
      );
    }

    if (!scene.searchTerms || scene.searchTerms.length === 0)
      throw new Error(
        "Scene needs searchTerms when no local image can be provided",
      );

    const tempId = cuid();
    const tempVideo = path.join(
      this.config.tempDirPath,
      `${tempId}.mp4`,
    );
    tempFiles.push(tempVideo);

    const pexelsVideo = await this.pexelsApi.findVideo(
      scene.searchTerms,
      duration,
      excludeVideoIds,
      orientation,
    );
    excludeVideoIds.push(pexelsVideo.id);

    await this.downloadFile(pexelsVideo.url, tempVideo);

    return `http://localhost:${this.config.port}/api/tmp/${path.basename(
      tempVideo,
    )}`;
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      const client = url.startsWith("https") ? https : http;
      client
        .get(url, (resp) => {
          if (resp.statusCode !== 200) {
            reject(
              new Error(
                `Failed to download (${resp.statusCode}) ${resp.statusMessage}`,
              ),
            );
            return;
          }
          resp.pipe(out);
          out.on("finish", () => {
            out.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(dest, () => void 0);
          reject(err);
        });
    });
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    fs.removeSync(this.getVideoPath(videoId));
  }

  public getVideo(videoId: string): Buffer {
    const pathToVideo = this.getVideoPath(videoId);
    if (!fs.existsSync(pathToVideo))
      throw new Error(`Video ${videoId} not found`);
    return fs.readFileSync(pathToVideo);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const list = this.musicManager
      .musicList()
      .filter((m) => (tag ? m.mood === tag : true));
    if (list.length === 0) {
      logger.warn("No music available");
      return {
        file: "",
        start: 0,
        end: 0,
        mood: "none" as MusicMoodEnum,
        url: "",
      };
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((m) => tags.add(m.mood as MusicTag));
    return Array.from(tags);
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const list: { id: string; status: VideoStatus }[] = [];
    if (fs.existsSync(this.config.videosDirPath)) {
      fs.readdirSync(this.config.videosDirPath)
        .filter((f) => f.endsWith(".mp4"))
        .forEach((f) => list.push({ id: f.replace(".mp4", ""), status: "ready" }));
    }
    this.queue.forEach((q) => {
      if (!list.find((v) => v.id === q.id))
        list.push({ id: q.id, status: "processing" });
    });
    return list;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }
}

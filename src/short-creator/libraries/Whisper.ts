import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import path from "path";

import { Config } from "../../config";
import type { Caption } from "../../types/shorts";
import { logger } from "../../logger";

export const ErrorWhisper = new Error("There was an error with WhisperCpp");

export class Whisper {
  constructor(private config: Config) {}

  static async init(config: Config): Promise<Whisper> {
    if (!config.runningInDocker) {
      logger.debug("Installing WhisperCpp");
      await installWhisperCpp({
        to: config.whisperInstallPath,
        version: config.whisperVersion,
        printOutput: true,
      });
      logger.debug("WhisperCpp installed");
      logger.debug("Downloading Whisper model");
      await downloadWhisperModel({
        model: config.whisperModel,
        folder: path.join(config.whisperInstallPath, "models"),
        printOutput: config.whisperVerbose,
        onProgress: (downloadedBytes, totalBytes) => {
          const progress = `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
          logger.debug(
            { progress, model: config.whisperModel },
            "Downloading Whisper model",
          );
        },
      });
      logger.debug("Whisper model downloaded");
    }

    return new Whisper(config);
  }

  async CreateCaption(audioPath: string): Promise<Caption[]> {
    logger.debug({ audioPath }, "Starting to transcribe audio");

    const whisperResult = await transcribe({
      model: this.config.whisperModel,
      language: "hi",
      whisperPath: this.config.whisperInstallPath,
      modelFolder: path.join(this.config.whisperInstallPath, "models"),
      whisperCppVersion: this.config.whisperVersion,
      inputPath: audioPath,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      printOutput: this.config.whisperVerbose,
      onProgress: (progress) => {
        logger.debug({ audioPath }, `Transcribing is ${progress} complete`);
      },
    });

    logger.debug({ audioPath }, "Transcription finished, creating captions using toCaptions().");

    const { captions: processedCaptions } = toCaptions({
      whisperCppOutput: whisperResult,
    });

    const captions: Caption[] = processedCaptions;

    logger.debug({ audioPath, captions }, "Captions created successfully");
    return captions;
  }
}

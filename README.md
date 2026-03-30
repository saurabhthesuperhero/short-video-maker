# Short Video Maker

An open source automated video creation tool for generating short-form video content. Short Video Maker combines text-to-speech, automatic captions, background videos, and music to create engaging short videos from simple text inputs.

This repository was open-sourced by the [AI Agents A-Z Youtube Channel](https://www.youtube.com/channel/UCloXqLhp_KGhHBe1kwaL2Tg). We encourage you to check out the channel for more AI-related content and tutorials.

## Fork Notes

This repository is maintained in the fork at `github.com/saurabhthesuperhero/short-video-maker`.

- Branch: `experiment/longer-duration`
- Purpose: duration and render-length experiments on top of the baseline project
- Bundled custom assets in this branch: none
- Stoic-specific local image workflow: not included on this branch
- Best fit: preserving the earlier duration experiment separately from the Stoic branches

## Hardware requirements

- CPU: at least 2 cores are recommended
- RAM: at least 2 GB is required, but 4 GB is recommended. when using docker, you can limit the memory usage with the `CONCURRENCY` environment variable (see below)
- GPU: optional, makes the caption generation a lot faster (whisper.cpp) and the video rendering somewhat faster

## Software requirements

When running with npx
- ffmpeg
- build-essential, git, cmake, wget to build Whisper.cpp

## Watch the official video on how to generate videos with n8n

[![Automated faceless video generation (n8n + MCP) with captions, background music, local and 100% free](https://img.youtube.com/vi/jzsQpn-AciM/0.jpg)](https://www.youtube.com/watch?v=jzsQpn-AciM)

## Running the Project

### Using NPX (recommended)

The easiest way to run the project with GPU support out of the box:

```bash
LOG_LEVEL=debug PEXELS_API_KEY= npx short-video-maker
```

### Using Docker

> [!IMPORTANT]
> To avoid memory issues, I had to limit the number of concurrent Chrome tabs used for rendering to 1 for both images. If you have more RAM, feel free to experiment with the sweet spot for your machine/VPS.

#### CPU image

To increase the performance, I've set the Whisper model to `base.en` for both Docker images. This model is smaller and faster than the `medium.en` model, however it is somewhat less accurate.

With 2 vCPUs it takes ~7 seconds for Kokoro to generate 10 seconds of audio, and ~2 seconds for Whisper to generate the captions for a scene.

```bash
docker run -it --rm --name short-video-maker -p 3123:3123 \
  -e PEXELS_API_KEY= \
  gyoridavid/short-video-maker:latest
```

#### NVIDIA GPUs

```bash
docker run -it --rm --name shorts-video-maker -p 3123:3123 \
  -e PEXELS_API_KEY= --gpus=all \
  gyoridavid/short-video-maker:latest-cuda
```

## Find help

Join our [Discord](https://discord.gg/G7FJVJQ6RE) community for support and discussions.

## Environment Variables

| Variable                  | Description                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PEXELS_API_KEY            | Your Pexels API key for background video sourcing                                                                                                                                                                |
| PORT                      | Port for the API/MCP server (default: 3123)                                                                                                                                                                      |
| LOG_LEVEL                 | Log level for the server (default: info, options: trace, debug, info, warn, error)                                                                                                                               |
| WHISPER_VERBOSE           | Verbose mode for Whisper (default: false)                                                                                                                                                                        |
| CONCURRENCY               | [Number of Chrome tabs to use to render the video.](https://www.remotion.dev/docs/terminology/concurrency) Used to limit the memory usage in the Docker containers (default: undefined)                          |
| VIDEO_CACHE_SIZE_IN_BYTES | [cache for <OffthreadVideo> frames](https://www.remotion.dev/docs/renderer/select-composition#offthreadvideocachesizeinbytes) - used to prevent memory related crashes in the Docker images (default: undefined) |

## Example

<table>
  <tr>
    <td>
    <video src="https://github.com/user-attachments/assets/bb7ce80f-e6e1-44e5-ba4e-9b13d917f55b" width="270" height="480"></video>
    </td>
<td>

```json
{
  "scenes": [
    {
      "text": "Hello world! Enjoy using this tool to create awesome AI workflows",
      "searchTerms": ["rainbow"]
    }
  ],
  "config": {
    "paddingBack": 1500,
    "music": "happy"
  }
}
```

</td>
  </tr>
</table>

## Features

- Generate complete short videos from text prompts
- Text-to-speech conversion
- Automatic caption generation and styling
- Background video search and selection via Pexels
- Background music with genre/mood selection
- Serve as both REST API and Model Context Protocol (MCP) server

## How It Works

Shorts Creator takes simple text inputs and search terms, then:

1. Converts text to speech using Kokoro TTS
2. Generates accurate captions via Whisper
3. Finds relevant background videos from Pexels
4. Composes all elements with Remotion
5. Renders a professional-looking short video with perfectly timed captions

## Dependencies for the video generation

| Dependency                                             | Version  | License                                                                           | Purpose                         |
| ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- | ------------------------------- |
| [Remotion](https://remotion.dev/)                      | ^4.0.286 | [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) | Video composition and rendering |
| [Whisper CPP](https://github.com/ggml-org/whisper.cpp) | v1.5.5   | MIT                                                                               | Speech-to-text for captions     |
| [FFmpeg](https://ffmpeg.org/)                          | ^2.1.3   | LGPL/GPL                                                                          | Audio/video manipulation        |
| [Kokoro.js](https://www.npmjs.com/package/kokoro-js)   | ^1.2.0   | MIT                                                                               | Text-to-speech generation       |
| [Pexels API](https://www.pexels.com/api/)              | N/A      | [Pexels Terms](https://www.pexels.com/license/)                                   | Background videos               |

## How to contribute?

PRs are welcome.
See the [CONTRIBUTING.md](CONTRIBUTING.md) file for instructions on setting up a local development environment.

## API Usage

### REST API

The following REST endpoints are available:

1. `GET /api/short-video/:id` - Get a video by ID and also can be downloaded like this :

`curl -o output.mp4 http://localhost:3123/api/short-video/<videoId>   `

3. `POST /api/short-video` - Create a new video
   ```json
   {
     "scenes": [
       {
         "text": "This is the text to be spoken in the video",
         "searchTerms": ["nature sunset"]
       }
     ],
     "config": {
       "paddingBack": 3000,
       "music": "chill"
     }
   }
   ```
4. `DELETE /api/short-video/:id` - Delete a video by ID
5. `GET /api/music-tags` - Get available music tags

### Model Context Protocol (MCP)

The service also implements the Model Context Protocol:

1. `GET /mcp/sse` - Server-sent events for MCP
2. `POST /mcp/messages` - Send messages to MCP server

Available MCP tools:

- `create-short-video` - Create a video from a list of scenes
- `get-video-status` - Check video creation status

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- ❤️ [Remotion](https://remotion.dev/) for programmatic video generation
- ❤️ [Whisper](https://github.com/ggml-org/whisper.cpp) for speech-to-text
- ❤️ [Pexels](https://www.pexels.com/) for video content
- ❤️ [FFmpeg](https://ffmpeg.org/) for audio/video processing
- ❤️ [Kokoro](https://github.com/hexgrad/kokoro) for TTS

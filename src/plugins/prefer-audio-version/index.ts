import { createPlugin } from '@/utils';
import { t } from '@/i18n';

import type { MenuTemplate } from '@/menu';
import type { MusicPlayer } from '@/types/music-player';
import type { GetPlayerResponse } from '@/types/get-player-response';

export type PreferAudioVersionConfig = {
  enabled: boolean;
  avoidMusicVideos: boolean;
  optimizeAudioBitrate: boolean;
};

export default createPlugin({
  name: () => t('plugins.prefer-audio-version.name'),
  description: () => t('plugins.prefer-audio-version.description'),
  restartNeeded: false,
  config: {
    enabled: false,
    avoidMusicVideos: true,
    optimizeAudioBitrate: true,
  } as PreferAudioVersionConfig,
  menu: async ({ getConfig, setConfig }): Promise<MenuTemplate> => {
    const config = await getConfig();

    return [
      {
        label: t('plugins.prefer-audio-version.menu.avoid-music-videos'),
        type: 'checkbox',
        checked: config.avoidMusicVideos,
        click(item) {
          setConfig({ avoidMusicVideos: item.checked });
        },
      },
      {
        label: t('plugins.prefer-audio-version.menu.optimize-audio-bitrate'),
        type: 'checkbox',
        checked: config.optimizeAudioBitrate,
        click(item) {
          setConfig({ optimizeAudioBitrate: item.checked });
        },
      },
    ];
  },

  renderer: {
    config: null as PreferAudioVersionConfig | null,
    playerApi: null as MusicPlayer | null,

    async start({ getConfig }) {
      this.config = await getConfig();
    },

    onPlayerApiReady(api, { getConfig }) {
      this.playerApi = api;

      const handleVideoDataChange = async (
        _name: 'videodatachange',
        _data: { videoId: string },
      ) => {
        if (!this.config) {
          this.config = await getConfig();
        }

        // Only proceed if we should avoid music videos
        if (!this.config.avoidMusicVideos) {
          return;
        }

        try {
          const playerResponse: GetPlayerResponse = api.getPlayerResponse();
          const videoDetails = playerResponse?.videoDetails;

          if (!videoDetails) {
            return;
          }

          // Check if current video is a music video (OMV)
          const isMusicVideo =
            videoDetails.musicVideoType === 'MUSIC_VIDEO_TYPE_OMV';

          if (isMusicVideo) {
            // Get the ytmusic-player element to set playback mode
            const player =
              document.querySelector<HTMLElement>('ytmusic-player');

            if (player) {
              // Force audio-only mode (ATV_PREFERRED)
              player.setAttribute('playback-mode', 'ATV_PREFERRED');

              // Also hide the video and show the album art
              const songVideo = document.querySelector<HTMLElement>(
                '#song-video.ytmusic-player',
              );
              const songImage =
                document.querySelector<HTMLElement>('#song-image');

              if (songVideo && songImage) {
                songVideo.style.display = 'none';
                songImage.style.display = 'block';
              }
            }
          }

          // Optimize audio bitrate if enabled
          if (this.config.optimizeAudioBitrate) {
            this.optimizeAudioQuality(api, playerResponse);
          }
        } catch (error) {
          console.error('prefer-audio-version error:', error);
        }
      };

      // Listen for video data changes
      api.addEventListener('videodatachange', handleVideoDataChange);
    },

    optimizeAudioQuality(api: MusicPlayer, playerResponse: GetPlayerResponse) {
      try {
        const streamingData = playerResponse?.streamingData;
        if (!streamingData || !streamingData.adaptiveFormats) {
          return;
        }

        // Find all audio-only formats
        const audioFormats = streamingData.adaptiveFormats.filter(
          (format) => format.mimeType?.includes('audio') && format.audioQuality,
        );

        if (audioFormats.length === 0) {
          return;
        }

        // Sort by bitrate (highest first)
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        const bestAudioFormat = audioFormats[0];

        // Map audio quality to YouTube's quality levels
        // This is an approximation based on typical audio bitrates
        let qualityLevel = 'hd720';
        if (bestAudioFormat.audioQuality === 'AUDIO_QUALITY_HIGH') {
          qualityLevel = 'hd720';
        } else if (bestAudioFormat.audioQuality === 'AUDIO_QUALITY_MEDIUM') {
          qualityLevel = 'large';
        }

        // Try to set the quality range to include the best audio quality
        try {
          api.setPlaybackQualityRange(qualityLevel);
        } catch (error) {
          console.debug('Could not set playback quality range:', error);
        }
      } catch (error) {
        console.error('Error optimizing audio quality:', error);
      }
    },

    onConfigChange(newConfig) {
      this.config = newConfig;
    },

    stop() {
      // Cleanup if needed
    },
  },
});

/**
 * Video Player Module
 * Handles video playback with sync to tracking data
 */

class VideoPlayerController {
    constructor() {
        this.video = null;
        this.trackingViewer = null;
        this.isPlaying = false;
        this.duration = 0;
        this.fps = 30; // Default FPS, can be updated from metadata
    }

    /**
     * Initialize video player with element
     */
    init(videoElement, trackingViewer = null) {
        this.video = videoElement;
        this.trackingViewer = trackingViewer;

        // Event listeners
        this.video.addEventListener('loadedmetadata', () => {
            this.duration = this.video.duration;
            console.log(`📹 Video loaded: ${this.duration.toFixed(2)}s`);
        });

        this.video.addEventListener('timeupdate', () => {
            this.onTimeUpdate();
        });

        this.video.addEventListener('play', () => {
            this.isPlaying = true;
        });

        this.video.addEventListener('pause', () => {
            this.isPlaying = false;
        });

        this.video.addEventListener('ended', () => {
            this.isPlaying = false;
        });
    }

    /**
     * Load video from URL
     */
    async loadVideo(url) {
        if (!this.video) return false;

        return new Promise((resolve, reject) => {
            this.video.src = url;

            this.video.onloadeddata = () => {
                console.log('✅ Video loaded successfully');
                resolve(true);
            };

            this.video.onerror = (error) => {
                console.error('❌ Video load error:', error);
                reject(new Error('Failed to load video'));
            };

            this.video.load();
        });
    }

    /**
     * Handle time update - sync tracking viewer
     */
    onTimeUpdate() {
        if (this.trackingViewer && this.trackingViewer.trackingData.length > 0) {
            this.trackingViewer.updateByTime(this.video.currentTime, this.fps);
        }
    }

    /**
     * Play video
     */
    play() {
        if (this.video) {
            this.video.play();
        }
    }

    /**
     * Pause video
     */
    pause() {
        if (this.video) {
            this.video.pause();
        }
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Seek to specific time
     */
    seek(time) {
        if (this.video) {
            this.video.currentTime = Math.max(0, Math.min(time, this.duration));
        }
    }

    /**
     * Step forward one frame
     */
    stepForward() {
        const frameTime = 1 / this.fps;
        this.seek(this.video.currentTime + frameTime);
    }

    /**
     * Step backward one frame
     */
    stepBackward() {
        const frameTime = 1 / this.fps;
        this.seek(this.video.currentTime - frameTime);
    }

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        if (this.video) {
            this.video.playbackRate = speed;
        }
    }

    /**
     * Get current time
     */
    getCurrentTime() {
        return this.video ? this.video.currentTime : 0;
    }

    /**
     * Get duration
     */
    getDuration() {
        return this.duration;
    }

    /**
     * Format time for display (mm:ss)
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Clean up
     */
    dispose() {
        if (this.video) {
            this.video.pause();
            this.video.src = '';
        }
    }
}

// Export singleton
window.videoPlayerController = new VideoPlayerController();

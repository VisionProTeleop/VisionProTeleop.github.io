/**
 * VisionProTeleop Web Viewer - Main Application
 * 
 * Integrates all modules and handles UI interactions
 */

class App {
    constructor() {
        this.currentTab = 'public';
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.activeProvider = null;
        this.trackingViewer = null;
        this.currentRecording = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 VisionProTeleop Web Viewer initializing...');

        // Handle OAuth callback if present
        await this.handleOAuthCallback();

        // Initialize CloudKit
        await cloudKitClient.init();

        // Check for existing auth
        const googleAuth = googleDriveClient.init();
        const dropboxAuth = dropboxClient.init();

        if (googleAuth || dropboxAuth) {
            this.activeProvider = googleAuth ? 'google' : 'dropbox';
            localStorage.setItem(STORAGE_KEYS.activeProvider, this.activeProvider);
        }

        // Setup event listeners
        this.setupEventListeners();

        // Load initial data
        await this.loadPublicRecordings();

        // Update UI based on auth state
        this.updateAuthUI();

        console.log('✅ App initialized');
    }

    /**
     * Handle OAuth callback from redirect
     */
    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const provider = sessionStorage.getItem('oauth_provider');

        if (code && provider) {
            try {
                this.showToast('Completing sign in...', 'info');

                if (provider === 'google') {
                    await googleDriveClient.handleCallback(code);
                    this.activeProvider = 'google';
                } else if (provider === 'dropbox') {
                    await dropboxClient.handleCallback(code);
                    this.activeProvider = 'dropbox';
                }

                localStorage.setItem(STORAGE_KEYS.activeProvider, this.activeProvider);

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);

                this.showToast('Signed in successfully!', 'success');

                // Switch to my recordings tab
                this.switchTab('my-recordings');

            } catch (error) {
                console.error('OAuth callback error:', error);
                this.showToast('Sign in failed: ' + error.message, 'error');

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const filter = chip.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Search
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.filterAndRenderRecordings();
            });
        }

        // Refresh button
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            if (this.currentTab === 'public') {
                this.loadPublicRecordings();
            } else {
                this.loadMyRecordings();
            }
        });

        // Auth buttons
        document.getElementById('google-signin-btn')?.addEventListener('click', () => {
            googleDriveClient.signIn();
        });

        document.getElementById('dropbox-signin-btn')?.addEventListener('click', () => {
            dropboxClient.signIn();
        });

        document.getElementById('signout-btn')?.addEventListener('click', () => {
            this.signOut();
        });

        // Provider tabs
        document.querySelectorAll('.provider-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const provider = tab.dataset.provider;
                this.switchProvider(provider);
            });
        });

        // Retry buttons
        document.getElementById('public-retry-btn')?.addEventListener('click', () => {
            this.loadPublicRecordings();
        });

        document.getElementById('public-refresh-btn')?.addEventListener('click', () => {
            this.loadPublicRecordings();
        });

        // Modal
        document.getElementById('modal-close')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
            this.closeModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Follow head toggle
        document.getElementById('follow-head-btn')?.addEventListener('click', () => {
            if (this.trackingViewer) {
                const following = this.trackingViewer.toggleFollowHead();
                const btn = document.getElementById('follow-head-btn');
                btn.innerHTML = following ? '<span>👤</span>' : '<span>🌐</span>';
                btn.title = following ? 'Following head' : 'Free camera';
            }
        });
    }

    /**
     * Switch between tabs
     */
    async switchTab(tabName) {
        this.currentTab = tabName;

        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.getElementById(`${tabName}-tab`)?.classList.remove('hidden');

        // Load data for the tab
        if (tabName === 'public') {
            if (cloudKitClient.publicRecordings.length === 0) {
                await this.loadPublicRecordings();
            }
        } else if (tabName === 'my-recordings') {
            this.updateAuthUI();
            if (this.activeProvider) {
                await this.loadMyRecordings();
            }
        }
    }

    /**
     * Set filter and re-render
     */
    setFilter(filter) {
        this.currentFilter = filter;

        // Update chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === filter);
        });

        this.filterAndRenderRecordings();
    }

    /**
     * Load public recordings
     */
    async loadPublicRecordings() {
        const grid = document.getElementById('public-recordings-grid');
        const loading = document.getElementById('public-loading');
        const empty = document.getElementById('public-empty');
        const error = document.getElementById('public-error');

        // Show loading
        loading?.classList.remove('hidden');
        empty?.classList.add('hidden');
        error?.classList.add('hidden');
        grid.innerHTML = '';
        grid.appendChild(loading);

        try {
            const recordings = await cloudKitClient.fetchPublicRecordings();

            loading?.classList.add('hidden');

            if (recordings.length === 0) {
                empty?.classList.remove('hidden');
                grid.innerHTML = '';
                grid.appendChild(empty);
            } else {
                this.filterAndRenderRecordings();
            }

        } catch (err) {
            console.error('Failed to load public recordings:', err);
            loading?.classList.add('hidden');
            error?.classList.remove('hidden');
            error.querySelector('.error-message').textContent = err.message;
            grid.innerHTML = '';
            grid.appendChild(error);
        }
    }

    /**
     * Filter and render recordings based on current filter and search
     */
    filterAndRenderRecordings() {
        let recordings = cloudKitClient.publicRecordings;

        // Apply date filter
        recordings = cloudKitClient.filterByDateRange(recordings, this.currentFilter);

        // Apply search
        recordings = cloudKitClient.searchRecordings(recordings, this.searchQuery);

        this.renderRecordingsGrid(recordings, 'public-recordings-grid');
    }

    /**
     * Render recordings grid
     */
    renderRecordingsGrid(recordings, gridId) {
        const grid = document.getElementById(gridId);
        if (!grid) return;

        grid.innerHTML = '';

        if (recordings.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>No results</h3>
                    <p>Try adjusting your search or filter</p>
                </div>
            `;
            return;
        }

        recordings.forEach(recording => {
            const card = this.createRecordingCard(recording);
            grid.appendChild(card);
        });
    }

    /**
     * Create a recording card element
     */
    createRecordingCard(recording) {
        const card = document.createElement('div');
        card.className = 'recording-card';
        card.onclick = () => this.openRecording(recording);

        const providerClass = recording.provider === 'google_drive' ? 'google' : 'dropbox';
        const providerLabel = recording.provider === 'google_drive' ? 'G' : 'D';

        // Format date
        const dateStr = recording.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // Thumbnail
        let thumbnailHtml = '<div class="placeholder">🎬</div>';
        if (recording.thumbnailAssetURL) {
            thumbnailHtml = `<img src="${recording.thumbnailAssetURL}" alt="${recording.title}" loading="lazy">`;
        } else if (recording.thumbnailURL) {
            thumbnailHtml = `<img src="${recording.thumbnailURL}" alt="${recording.title}" loading="lazy">`;
        }

        card.innerHTML = `
            <div class="card-thumbnail">
                ${thumbnailHtml}
                <div class="thumbnail-badges">
                    <div class="badge ${providerClass}">${providerLabel}</div>
                    <div class="badge public">🌐</div>
                </div>
            </div>
            <div class="card-info">
                <div class="card-title">${recording.title}</div>
                <div class="card-meta">
                    <span>${dateStr}</span>
                    ${recording.description ? `<span class="separator">•</span><span>${recording.description}</span>` : ''}
                </div>
            </div>
        `;

        return card;
    }

    /**
     * Update auth UI based on current state
     */
    updateAuthUI() {
        const authSection = document.getElementById('auth-section');
        const contentSection = document.getElementById('my-recordings-content');
        const providerTabs = document.getElementById('provider-tabs');

        const isGoogleAuth = googleDriveClient.isAuthenticated;
        const isDropboxAuth = dropboxClient.isAuthenticated;

        if (!isGoogleAuth && !isDropboxAuth) {
            // Show auth section
            authSection?.classList.remove('hidden');
            contentSection?.classList.add('hidden');
        } else {
            // Show content section
            authSection?.classList.add('hidden');
            contentSection?.classList.remove('hidden');

            // Update provider tabs
            if (providerTabs) {
                const googleTab = providerTabs.querySelector('[data-provider="google"]');
                const dropboxTab = providerTabs.querySelector('[data-provider="dropbox"]');

                if (googleTab) {
                    googleTab.style.display = isGoogleAuth ? 'flex' : 'none';
                    googleTab.classList.toggle('active', this.activeProvider === 'google');
                }

                if (dropboxTab) {
                    dropboxTab.style.display = isDropboxAuth ? 'flex' : 'none';
                    dropboxTab.classList.toggle('active', this.activeProvider === 'dropbox');
                }
            }
        }
    }

    /**
     * Switch active provider
     */
    async switchProvider(provider) {
        this.activeProvider = provider;
        localStorage.setItem(STORAGE_KEYS.activeProvider, provider);

        // Update tabs
        document.querySelectorAll('.provider-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.provider === provider);
        });

        // Load recordings
        await this.loadMyRecordings();
    }

    /**
     * Load my recordings
     */
    async loadMyRecordings() {
        const grid = document.getElementById('my-recordings-grid');
        const loading = document.getElementById('my-loading');

        if (!this.activeProvider) return;

        // Show loading
        loading?.classList.remove('hidden');
        grid.innerHTML = '';
        grid.appendChild(loading);

        try {
            let recordings;

            if (this.activeProvider === 'google') {
                recordings = await googleDriveClient.fetchRecordings();
            } else {
                recordings = await dropboxClient.fetchRecordings();
            }

            loading?.classList.add('hidden');

            if (recordings.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📁</div>
                        <h3>No Recordings Found</h3>
                        <p>Record with VisionProTeleop to see your recordings here</p>
                    </div>
                `;
            } else {
                this.renderMyRecordings(recordings);
            }

        } catch (err) {
            console.error('Failed to load my recordings:', err);
            loading?.classList.add('hidden');

            if (err.message === 'Session expired') {
                this.updateAuthUI();
                this.showToast('Session expired. Please sign in again.', 'error');
            } else {
                grid.innerHTML = `
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <h3>Failed to Load</h3>
                        <p class="error-message">${err.message}</p>
                        <button class="btn-primary" onclick="app.loadMyRecordings()">Retry</button>
                    </div>
                `;
            }
        }
    }

    /**
     * Render my recordings grid
     */
    renderMyRecordings(recordings) {
        const grid = document.getElementById('my-recordings-grid');
        grid.innerHTML = '';

        recordings.forEach(recording => {
            const card = document.createElement('div');
            card.className = 'recording-card';
            card.onclick = () => this.openRecording(recording);

            const providerClass = recording.provider === 'google_drive' ? 'google' : 'dropbox';
            const providerLabel = recording.provider === 'google_drive' ? 'G' : 'D';

            const dateStr = recording.createdAt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            card.innerHTML = `
                <div class="card-thumbnail">
                    <div class="placeholder">🎬</div>
                    <div class="thumbnail-badges">
                        <div class="badge ${providerClass}">${providerLabel}</div>
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-title">${recording.title}</div>
                    <div class="card-meta">
                        <span>${dateStr}</span>
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    /**
     * Sign out
     */
    signOut() {
        if (this.activeProvider === 'google') {
            googleDriveClient.signOut();
        } else if (this.activeProvider === 'dropbox') {
            dropboxClient.signOut();
        }

        this.activeProvider = null;
        localStorage.removeItem(STORAGE_KEYS.activeProvider);

        this.updateAuthUI();
        this.showToast('Signed out', 'success');
    }

    /**
     * Open recording in modal
     */
    async openRecording(recording) {
        this.currentRecording = recording;

        const modal = document.getElementById('recording-modal');
        const videoElement = document.getElementById('video-player');
        const videoLoading = document.getElementById('video-loading');

        // Update modal info
        document.getElementById('modal-title').textContent = recording.title;
        document.getElementById('modal-provider').textContent =
            recording.provider === 'google_drive' ? 'Google Drive' : 'Dropbox';
        document.getElementById('modal-date').textContent =
            recording.createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

        // Set cloud URL
        const cloudBtn = document.getElementById('open-cloud-btn');
        cloudBtn.href = recording.cloudURL;

        // Show modal
        modal?.classList.remove('hidden');

        // Initialize tracking viewer
        if (!this.trackingViewer) {
            this.trackingViewer = new TrackingViewer('skeleton-container');
            this.trackingViewer.init();
        }

        // Initialize video player
        videoPlayerController.init(videoElement, this.trackingViewer);

        // Load video
        videoLoading?.classList.remove('hidden');

        try {
            let videoUrl;
            let trackingData;

            if (recording.provider === 'dropbox') {
                if (this.currentTab === 'public') {
                    // Public recording - use direct URL
                    const baseUrl = dropboxClient.getPublicVideoUrl(recording.cloudURL);
                    videoUrl = baseUrl + '/video.mp4';
                } else {
                    // Private recording
                    videoUrl = await dropboxClient.getVideoUrl(recording.path);
                    trackingData = await dropboxClient.getTrackingData(recording.path);
                }
            } else if (recording.provider === 'google_drive') {
                if (googleDriveClient.isAuthenticated) {
                    videoUrl = await googleDriveClient.getVideoUrl(recording.id);
                    trackingData = await googleDriveClient.getTrackingData(recording.id);
                }
            }

            if (videoUrl) {
                await videoPlayerController.loadVideo(videoUrl);

                if (trackingData) {
                    await this.trackingViewer.loadTrackingData(trackingData);
                    const frameInfo = this.trackingViewer.getFrameInfo();
                    document.getElementById('modal-frames').textContent = frameInfo.total.toString();
                }

                videoLoading?.classList.add('hidden');

                // Update duration
                setTimeout(() => {
                    const duration = videoPlayerController.getDuration();
                    document.getElementById('modal-duration').textContent =
                        videoPlayerController.formatTime(duration);
                }, 500);
            } else {
                videoLoading?.classList.add('hidden');
                this.showToast('Could not load video. Sign in to access private recordings.', 'error');
            }

        } catch (error) {
            console.error('Failed to load recording:', error);
            videoLoading?.classList.add('hidden');
            this.showToast('Failed to load recording: ' + error.message, 'error');
        }
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.getElementById('recording-modal');
        modal?.classList.add('hidden');

        // Stop video
        videoPlayerController.pause();

        // Clean up tracking viewer
        if (this.trackingViewer) {
            this.trackingViewer.dispose();
            this.trackingViewer = null;
        }

        this.currentRecording = null;
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-message">${message}</span>`;

        container.appendChild(toast);

        // Remove after 4 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// Initialize app when DOM is ready
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());

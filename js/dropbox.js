/**
 * Dropbox Module
 * Handles OAuth 2.0 authentication and file operations
 */

class DropboxClient {
    constructor() {
        this.accessToken = null;
        this.isAuthenticated = false;
        this.recordings = [];
        this.cursor = null;
        this.hasMore = true;
    }

    /**
     * Initialize from stored tokens
     */
    init() {
        const storedToken = localStorage.getItem(STORAGE_KEYS.dropboxAccessToken);

        if (storedToken) {
            this.accessToken = storedToken;
            this.isAuthenticated = true;
            console.log('✅ Dropbox: Restored session');
            return true;
        }

        return false;
    }

    /**
     * Start OAuth 2.0 flow with PKCE
     */
    async signIn() {
        // Generate PKCE code verifier and challenge
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // Store verifier for token exchange
        sessionStorage.setItem('dropbox_code_verifier', codeVerifier);

        // Build authorization URL
        const params = new URLSearchParams({
            client_id: CONFIG.dropbox.appKey,
            redirect_uri: CONFIG.dropbox.redirectUri,
            response_type: 'code',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            token_access_type: 'offline'
        });

        const authUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;

        // Store state to identify provider on callback
        sessionStorage.setItem('oauth_provider', 'dropbox');

        // Redirect to Dropbox
        window.location.href = authUrl;
    }

    /**
     * Handle OAuth callback
     */
    async handleCallback(code) {
        const codeVerifier = sessionStorage.getItem('dropbox_code_verifier');
        if (!codeVerifier) {
            throw new Error('Missing code verifier');
        }

        // Exchange code for tokens
        const params = new URLSearchParams({
            code: code,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
            client_id: CONFIG.dropbox.appKey,
            redirect_uri: CONFIG.dropbox.redirectUri
        });

        const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Token exchange failed');
        }

        const tokens = await response.json();

        // Store tokens
        this.accessToken = tokens.access_token;
        this.isAuthenticated = true;

        localStorage.setItem(STORAGE_KEYS.dropboxAccessToken, tokens.access_token);

        if (tokens.refresh_token) {
            localStorage.setItem(STORAGE_KEYS.dropboxRefreshToken, tokens.refresh_token);
        }

        // Clean up
        sessionStorage.removeItem('dropbox_code_verifier');
        sessionStorage.removeItem('oauth_provider');

        console.log('✅ Dropbox: Authentication successful');
        return true;
    }

    /**
     * Sign out
     */
    signOut() {
        this.clearAuth();
        console.log('👋 Dropbox: Signed out');
    }

    /**
     * Clear stored auth
     */
    clearAuth() {
        this.accessToken = null;
        this.isAuthenticated = false;
        this.recordings = [];

        localStorage.removeItem(STORAGE_KEYS.dropboxAccessToken);
        localStorage.removeItem(STORAGE_KEYS.dropboxRefreshToken);
    }

    /**
     * Fetch recordings from Dropbox
     */
    async fetchRecordings(reset = true) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        if (reset) {
            this.recordings = [];
            this.cursor = null;
            this.hasMore = true;
        }

        try {
            let response;

            if (this.cursor) {
                // Continue from cursor
                response = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cursor: this.cursor })
                });
            } else {
                // Initial request
                response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        path: CONFIG.dropbox.recordingsPath,
                        recursive: false,
                        include_deleted: false,
                        limit: CONFIG.pageSize
                    })
                });
            }

            if (!response.ok) {
                if (response.status === 401) {
                    this.clearAuth();
                    throw new Error('Session expired');
                }

                const error = await response.json();
                if (error.error?.['.tag'] === 'path' && error.error?.path?.['.tag'] === 'not_found') {
                    console.log('📂 Dropbox: VisionProTeleop folder not found');
                    this.hasMore = false;
                    return [];
                }

                throw new Error('Failed to fetch recordings');
            }

            const data = await response.json();

            // Filter for folders only (each folder is a recording)
            const folders = data.entries.filter(entry => entry['.tag'] === 'folder');

            // Map to recording objects
            const newRecordings = folders.map(folder => this.folderToRecording(folder));

            this.recordings = [...this.recordings, ...newRecordings];
            this.cursor = data.cursor;
            this.hasMore = data.has_more;

            console.log(`✅ Dropbox: Fetched ${newRecordings.length} recordings`);
            return this.recordings;

        } catch (error) {
            console.error('❌ Dropbox fetch error:', error);
            throw error;
        }
    }

    /**
     * Convert folder to recording object
     */
    folderToRecording(folder) {
        const pathParts = folder.path_display.split('/');
        const name = pathParts[pathParts.length - 1];

        return {
            id: folder.id,
            path: folder.path_display,
            title: name,
            provider: 'dropbox',
            createdAt: new Date(), // Dropbox doesn't provide folder creation time
            cloudURL: `https://www.dropbox.com/home${folder.path_display}`
        };
    }

    /**
     * Get video URL for a recording
     */
    async getVideoUrl(recordingPath) {
        const videoPath = `${recordingPath}/${CONFIG.files.video}`;

        try {
            // Get temporary link
            const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: videoPath })
            });

            if (!response.ok) return null;

            const data = await response.json();
            return data.link;

        } catch (error) {
            console.error('❌ Failed to get video URL:', error);
            return null;
        }
    }

    /**
     * Get tracking data for a recording
     */
    async getTrackingData(recordingPath) {
        const trackingPath = `${recordingPath}/${CONFIG.files.tracking}`;

        try {
            const response = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path: trackingPath })
                }
            });

            if (!response.ok) return null;

            return response.text();

        } catch (error) {
            console.error('❌ Failed to get tracking data:', error);
            return null;
        }
    }

    /**
     * Get shared link for public recordings
     */
    getPublicVideoUrl(cloudURL) {
        // Convert web URL to direct download
        // https://www.dropbox.com/sh/xxx/yyy -> https://dl.dropboxusercontent.com/sh/xxx/yyy
        return cloudURL
            .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
            .replace('?dl=0', '');
    }

    /**
     * Generate PKCE code verifier
     */
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64UrlEncode(array);
    }

    /**
     * Generate PKCE code challenge from verifier
     */
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return this.base64UrlEncode(new Uint8Array(hash));
    }

    /**
     * Base64 URL encode
     */
    base64UrlEncode(array) {
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
}

// Export singleton
window.dropboxClient = new DropboxClient();

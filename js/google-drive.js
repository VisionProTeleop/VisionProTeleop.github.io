/**
 * Google Drive Module
 * Handles OAuth 2.0 authentication and file operations
 */

class GoogleDriveClient {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isAuthenticated = false;
        this.recordings = [];
        this.nextPageToken = null;
        this.hasMore = true;
    }

    /**
     * Initialize from stored tokens
     */
    init() {
        const storedToken = localStorage.getItem(STORAGE_KEYS.googleAccessToken);
        const storedExpiry = localStorage.getItem(STORAGE_KEYS.googleTokenExpiry);

        if (storedToken && storedExpiry) {
            const expiryTime = parseInt(storedExpiry);
            if (Date.now() < expiryTime) {
                this.accessToken = storedToken;
                this.tokenExpiry = expiryTime;
                this.isAuthenticated = true;
                console.log('✅ Google Drive: Restored session');
                return true;
            } else {
                // Token expired, try to refresh
                console.log('⏰ Google Drive: Token expired');
                this.clearAuth();
            }
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
        sessionStorage.setItem('google_code_verifier', codeVerifier);

        // Build authorization URL
        const params = new URLSearchParams({
            client_id: CONFIG.google.clientId,
            redirect_uri: CONFIG.google.redirectUri,
            response_type: 'code',
            scope: CONFIG.google.scopes.join(' '),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            access_type: 'offline',
            prompt: 'consent'
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        // Store state to identify provider on callback
        sessionStorage.setItem('oauth_provider', 'google');

        // Redirect to Google
        window.location.href = authUrl;
    }

    /**
     * Handle OAuth callback
     */
    async handleCallback(code) {
        const codeVerifier = sessionStorage.getItem('google_code_verifier');
        if (!codeVerifier) {
            throw new Error('Missing code verifier');
        }

        // Exchange code for tokens
        const params = new URLSearchParams({
            client_id: CONFIG.google.clientId,
            code: code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: CONFIG.google.redirectUri
        });

        const response = await fetch('https://oauth2.googleapis.com/token', {
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
        this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        this.isAuthenticated = true;

        localStorage.setItem(STORAGE_KEYS.googleAccessToken, tokens.access_token);
        localStorage.setItem(STORAGE_KEYS.googleTokenExpiry, this.tokenExpiry.toString());

        if (tokens.refresh_token) {
            localStorage.setItem(STORAGE_KEYS.googleRefreshToken, tokens.refresh_token);
        }

        // Clean up
        sessionStorage.removeItem('google_code_verifier');
        sessionStorage.removeItem('oauth_provider');

        console.log('✅ Google Drive: Authentication successful');
        return true;
    }

    /**
     * Sign out
     */
    signOut() {
        this.clearAuth();
        console.log('👋 Google Drive: Signed out');
    }

    /**
     * Clear stored auth
     */
    clearAuth() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isAuthenticated = false;
        this.recordings = [];

        localStorage.removeItem(STORAGE_KEYS.googleAccessToken);
        localStorage.removeItem(STORAGE_KEYS.googleRefreshToken);
        localStorage.removeItem(STORAGE_KEYS.googleTokenExpiry);
    }

    /**
     * Fetch recordings from Google Drive
     */
    async fetchRecordings(reset = true) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        if (reset) {
            this.recordings = [];
            this.nextPageToken = null;
            this.hasMore = true;
        }

        try {
            // First, find the VisionProTeleop folder
            const folderId = await this.findRecordingsFolder();

            if (!folderId) {
                console.log('📂 No VisionProTeleop folder found');
                this.hasMore = false;
                return [];
            }

            // List subfolders (each is a recording)
            const params = new URLSearchParams({
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
                fields: 'nextPageToken, files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: CONFIG.pageSize.toString()
            });

            if (this.nextPageToken) {
                params.append('pageToken', this.nextPageToken);
            }

            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    this.clearAuth();
                    throw new Error('Session expired');
                }
                throw new Error('Failed to fetch recordings');
            }

            const data = await response.json();

            // Map folders to recording objects
            const newRecordings = await Promise.all(
                data.files.map(folder => this.folderToRecording(folder))
            );

            this.recordings = [...this.recordings, ...newRecordings];
            this.nextPageToken = data.nextPageToken;
            this.hasMore = !!data.nextPageToken;

            console.log(`✅ Google Drive: Fetched ${newRecordings.length} recordings`);
            return this.recordings;

        } catch (error) {
            console.error('❌ Google Drive fetch error:', error);
            throw error;
        }
    }

    /**
     * Find the VisionProTeleop folder
     */
    async findRecordingsFolder() {
        const params = new URLSearchParams({
            q: `name = '${CONFIG.google.recordingsFolderName}' and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name)'
        });

        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to find folder');
        }

        const data = await response.json();
        return data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * Convert folder to recording object
     */
    async folderToRecording(folder) {
        return {
            id: folder.id,
            title: folder.name,
            provider: 'google_drive',
            createdAt: new Date(folder.modifiedTime),
            cloudURL: `https://drive.google.com/drive/folders/${folder.id}`
        };
    }

    /**
     * Get video URL for a recording
     */
    async getVideoUrl(recordingId) {
        // Find video.mp4 in the recording folder
        const params = new URLSearchParams({
            q: `'${recordingId}' in parents and name = '${CONFIG.files.video}'`,
            fields: 'files(id, name, webContentLink)'
        });

        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (data.files.length === 0) return null;

        const fileId = data.files[0].id;

        // Return direct download URL with auth
        return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${this.accessToken}`;
    }

    /**
     * Get tracking data for a recording
     */
    async getTrackingData(recordingId) {
        // Find tracking.jsonl in the recording folder
        const params = new URLSearchParams({
            q: `'${recordingId}' in parents and name = '${CONFIG.files.tracking}'`,
            fields: 'files(id)'
        });

        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (data.files.length === 0) return null;

        const fileId = data.files[0].id;

        // Download the file content
        const contentResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        if (!contentResponse.ok) return null;

        return contentResponse.text();
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
window.googleDriveClient = new GoogleDriveClient();

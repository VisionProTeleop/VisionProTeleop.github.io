/**
 * VisionProTeleop Web Viewer - Configuration
 * 
 * IMPORTANT: Before deploying, you need to:
 * 1. Generate a CloudKit API token at https://developer.apple.com/account/resources/services/cloudkit
 * 2. Configure Google OAuth by adding your GitHub Pages URL to authorized origins
 * 3. Configure Dropbox OAuth by adding your GitHub Pages URL to redirect URIs
 */

const CONFIG = {
    // CloudKit Configuration
    cloudkit: {
        containerIdentifier: 'iCloud.com.younghyopark.VisionProTeleop',
        // TODO: Generate API token from Apple Developer Portal
        apiToken: '4f1fe4d7ee8415ccb16e808e797b58fce1ba60ff4bf81b381847b7225aee0621',
        environment: 'production'
    },

    // Google Drive OAuth Configuration
    google: {
        clientId: '757572625045-vj93vgnu0l7fqfc4nf3rp6laqe5r1ljj.apps.googleusercontent.com',
        // The redirect URI will be constructed based on current location
        get redirectUri() {
            return window.location.origin + window.location.pathname;
        },
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly'
        ],
        discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
        ],
        // Folder name where recordings are stored
        recordingsFolderName: 'VisionProTeleop'
    },

    // Dropbox OAuth Configuration
    dropbox: {
        appKey: 'p4iwmllykm4ytc2',
        get redirectUri() {
            return window.location.origin + window.location.pathname;
        },
        // Path where recordings are stored
        recordingsPath: '/Apps/VisionProTeleop'
    },

    // Recording file names
    files: {
        video: 'video.mp4',
        tracking: 'tracking.jsonl',
        metadata: 'metadata.json',
        thumbnail: 'thumbnail.jpg'
    },

    // Pagination
    pageSize: 20
};

// Storage keys for localStorage
const STORAGE_KEYS = {
    googleAccessToken: 'vpt_google_access_token',
    googleRefreshToken: 'vpt_google_refresh_token',
    googleTokenExpiry: 'vpt_google_token_expiry',
    dropboxAccessToken: 'vpt_dropbox_access_token',
    dropboxRefreshToken: 'vpt_dropbox_refresh_token',
    activeProvider: 'vpt_active_provider'
};

// Export for use in other modules
window.CONFIG = CONFIG;
window.STORAGE_KEYS = STORAGE_KEYS;

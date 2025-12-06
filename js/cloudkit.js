/**
 * CloudKit Module
 * Handles fetching public recordings from CloudKit public database
 */

class CloudKitClient {
    constructor() {
        this.container = null;
        this.database = null;
        this.isConfigured = false;
        this.publicRecordings = [];
        this.queryCursor = null;
        this.hasMore = true;
    }

    /**
     * Initialize CloudKit
     */
    async init() {
        return new Promise((resolve, reject) => {
            // Check if CloudKit JS is loaded
            if (typeof CloudKit === 'undefined') {
                console.warn('CloudKit JS not loaded - public recordings will use demo mode');
                this.isConfigured = false;
                resolve(false);
                return;
            }

            // Check if API token is configured
            if (CONFIG.cloudkit.apiToken === 'YOUR_CLOUDKIT_API_TOKEN') {
                console.warn('CloudKit API token not configured - using demo mode');
                this.isConfigured = false;
                resolve(false);
                return;
            }

            try {
                CloudKit.configure({
                    containers: [{
                        containerIdentifier: CONFIG.cloudkit.containerIdentifier,
                        apiToken: CONFIG.cloudkit.apiToken,
                        environment: CONFIG.cloudkit.environment
                    }]
                });

                this.container = CloudKit.getDefaultContainer();
                this.database = this.container.publicCloudDatabase;
                this.isConfigured = true;
                console.log('✅ CloudKit initialized');
                resolve(true);
            } catch (error) {
                console.error('❌ CloudKit initialization failed:', error);
                this.isConfigured = false;
                resolve(false);
            }
        });
    }

    /**
     * Fetch public recordings from CloudKit
     */
    async fetchPublicRecordings(reset = true) {
        if (!this.isConfigured) {
            // Return demo data if CloudKit is not configured
            return this.getDemoRecordings();
        }

        if (reset) {
            this.publicRecordings = [];
            this.queryCursor = null;
            this.hasMore = true;
        }

        try {
            const query = {
                recordType: 'publicRecording',
                sortBy: [
                    { fieldName: 'createdAt', ascending: false }
                ]
            };

            const options = {
                resultsLimit: CONFIG.pageSize
            };

            if (this.queryCursor) {
                options.continuationMarker = this.queryCursor;
            }

            const response = await this.database.performQuery(query, options);

            if (response.hasErrors) {
                throw new Error(response.errors[0].message);
            }

            const newRecordings = response.records.map(record => this.parseRecord(record));
            this.publicRecordings = [...this.publicRecordings, ...newRecordings];
            this.queryCursor = response.continuationMarker;
            this.hasMore = !!response.continuationMarker;

            console.log(`✅ Fetched ${newRecordings.length} public recordings`);
            return this.publicRecordings;

        } catch (error) {
            console.error('❌ Failed to fetch public recordings:', error);
            throw error;
        }
    }

    /**
     * Load more recordings (pagination)
     */
    async loadMore() {
        if (!this.hasMore) return this.publicRecordings;
        return this.fetchPublicRecordings(false);
    }

    /**
     * Parse CloudKit record to recording object
     */
    parseRecord(record) {
        const fields = record.fields;

        return {
            id: record.recordName,
            recordingId: fields.recordingID?.value || record.recordName,
            title: fields.title?.value || 'Untitled Recording',
            description: fields.recodringDescription?.value || null,
            cloudURL: fields.cloudURL?.value || '',
            thumbnailURL: fields.thumbnailURL?.value || null,
            thumbnailAssetURL: fields.thumbnailAsset?.value?.downloadURL || null,
            provider: fields.provider?.value || 'unknown',
            createdAt: new Date(fields.createdAt?.value || Date.now())
        };
    }

    /**
     * Get demo recordings for testing without CloudKit
     */
    getDemoRecordings() {
        console.log('📋 Using demo recordings data');

        const demoData = [
            {
                id: 'demo-1',
                recordingId: 'demo-1',
                title: 'Demo Recording 1 - Kitchen Task',
                description: 'Sample hand tracking recording',
                cloudURL: 'https://example.com/demo1',
                thumbnailURL: null,
                provider: 'google_drive',
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
            },
            {
                id: 'demo-2',
                recordingId: 'demo-2',
                title: 'Demo Recording 2 - Object Manipulation',
                description: 'Picking up and placing objects',
                cloudURL: 'https://example.com/demo2',
                thumbnailURL: null,
                provider: 'dropbox',
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
            },
            {
                id: 'demo-3',
                recordingId: 'demo-3',
                title: 'Demo Recording 3 - Navigation',
                description: 'Walking around room',
                cloudURL: 'https://example.com/demo3',
                thumbnailURL: null,
                provider: 'google_drive',
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) // 3 days ago
            }
        ];

        this.publicRecordings = demoData;
        this.hasMore = false;
        return demoData;
    }

    /**
     * Filter recordings by date range
     */
    filterByDateRange(recordings, filter) {
        const now = new Date();

        switch (filter) {
            case 'today':
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return recordings.filter(r => r.createdAt >= todayStart);

            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return recordings.filter(r => r.createdAt >= weekAgo);

            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return recordings.filter(r => r.createdAt >= monthAgo);

            default:
                return recordings;
        }
    }

    /**
     * Search recordings by title/description
     */
    searchRecordings(recordings, query) {
        if (!query.trim()) return recordings;

        const lowerQuery = query.toLowerCase();
        return recordings.filter(r =>
            r.title.toLowerCase().includes(lowerQuery) ||
            (r.description && r.description.toLowerCase().includes(lowerQuery))
        );
    }
}

// Export singleton
window.cloudKitClient = new CloudKitClient();

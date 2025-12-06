/**
 * Tracking Viewer Module
 * 3D visualization of hand/head tracking data using Three.js
 */

class TrackingViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.leftHandGroup = null;
        this.rightHandGroup = null;
        this.headMarker = null;

        this.trackingData = [];
        this.currentFrameIndex = 0;
        this.followHead = true;

        this.isInitialized = false;
    }

    /**
     * Initialize the 3D viewer
     */
    init() {
        if (!this.container || typeof THREE === 'undefined') {
            console.warn('Cannot initialize tracking viewer - container or Three.js missing');
            return false;
        }

        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 200;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a25);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
        this.camera.position.set(0, 0.3, 0.8);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 2, 1);
        this.scene.add(directionalLight);

        // Grid helper
        const gridHelper = new THREE.GridHelper(2, 20, 0x444444, 0x333333);
        gridHelper.position.y = -0.3;
        this.scene.add(gridHelper);

        // Create hand groups
        this.leftHandGroup = this.createHandSkeleton(0x4ade80); // Green
        this.rightHandGroup = this.createHandSkeleton(0x60a5fa); // Blue
        this.scene.add(this.leftHandGroup);
        this.scene.add(this.rightHandGroup);

        // Create head marker
        this.headMarker = this.createHeadMarker();
        this.scene.add(this.headMarker);

        // Handle resize
        window.addEventListener('resize', () => this.onResize());

        // Start render loop
        this.animate();

        this.isInitialized = true;
        console.log('✅ Tracking viewer initialized');
        return true;
    }

    /**
     * Create hand skeleton geometry
     */
    createHandSkeleton(color) {
        const group = new THREE.Group();

        // Joint spheres (27 joints per hand)
        const jointGeometry = new THREE.SphereGeometry(0.008, 8, 8);
        const jointMaterial = new THREE.MeshLambertMaterial({ color });

        for (let i = 0; i < 27; i++) {
            const joint = new THREE.Mesh(jointGeometry, jointMaterial);
            joint.name = `joint_${i}`;
            joint.visible = false;
            group.add(joint);
        }

        // Connection lines
        const lineMaterial = new THREE.LineBasicMaterial({
            color,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });

        // Define bone connections
        const connections = this.getBoneConnections();

        connections.forEach((conn, idx) => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(6); // 2 points * 3 coordinates
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const line = new THREE.Line(geometry, lineMaterial);
            line.name = `bone_${idx}`;
            line.visible = false;
            group.add(line);
        });

        return group;
    }

    /**
     * Get bone connection indices
     * Based on Apple's hand skeleton structure
     */
    getBoneConnections() {
        return [
            // Wrist to fingers
            [2, 3], // Wrist to thumb
            [2, 7], // Wrist to index
            [2, 12], // Wrist to middle
            [2, 17], // Wrist to ring
            [2, 22], // Wrist to little

            // Thumb (3-6)
            [3, 4], [4, 5], [5, 6],

            // Index (7-11)
            [7, 8], [8, 9], [9, 10], [10, 11],

            // Middle (12-16)
            [12, 13], [13, 14], [14, 15], [15, 16],

            // Ring (17-21)
            [17, 18], [18, 19], [19, 20], [20, 21],

            // Little (22-26)
            [22, 23], [23, 24], [24, 25], [25, 26]
        ];
    }

    /**
     * Create head marker
     */
    createHeadMarker() {
        const group = new THREE.Group();

        // Head sphere
        const geometry = new THREE.SphereGeometry(0.05, 16, 16);
        const material = new THREE.MeshLambertMaterial({
            color: 0xfbbf24, // Yellow
            transparent: true,
            opacity: 0.8
        });
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);

        // Direction indicator (nose cone)
        const coneGeometry = new THREE.ConeGeometry(0.02, 0.04, 8);
        const coneMaterial = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = 0.06;
        group.add(cone);

        group.visible = false;
        return group;
    }

    /**
     * Load tracking data (JSONL format)
     */
    async loadTrackingData(jsonlText) {
        if (!jsonlText) {
            this.trackingData = [];
            return;
        }

        try {
            const lines = jsonlText.trim().split('\n');
            this.trackingData = lines
                .map(line => {
                    try { return JSON.parse(line); }
                    catch { return null; }
                })
                .filter(frame => frame !== null);

            console.log(`✅ Loaded ${this.trackingData.length} tracking frames`);
        } catch (error) {
            console.error('❌ Failed to parse tracking data:', error);
            this.trackingData = [];
        }
    }

    /**
     * Update visualization for a specific frame
     */
    updateFrame(frameIndex) {
        if (!this.isInitialized || frameIndex >= this.trackingData.length) return;

        this.currentFrameIndex = frameIndex;
        const frame = this.trackingData[frameIndex];

        // Update left hand
        if (frame.leftHand) {
            this.updateHand(this.leftHandGroup, frame.leftHand);
        } else {
            this.leftHandGroup.visible = false;
        }

        // Update right hand
        if (frame.rightHand) {
            this.updateHand(this.rightHandGroup, frame.rightHand);
        } else {
            this.rightHandGroup.visible = false;
        }

        // Update head
        if (frame.headMatrix) {
            this.updateHead(frame.headMatrix);
        } else {
            this.headMarker.visible = false;
        }

        // Follow head if enabled
        if (this.followHead && frame.headMatrix) {
            this.followHeadPosition(frame.headMatrix);
        }
    }

    /**
     * Update hand skeleton from joint data
     */
    updateHand(handGroup, handData) {
        const joints = this.extractJoints(handData);

        if (joints.length === 0) {
            handGroup.visible = false;
            return;
        }

        handGroup.visible = true;

        // Update joint positions
        for (let i = 0; i < Math.min(joints.length, 27); i++) {
            const joint = handGroup.children[i];
            if (joint && joints[i]) {
                joint.position.set(joints[i].x, joints[i].y, joints[i].z);
                joint.visible = true;
            }
        }

        // Update bone lines
        const connections = this.getBoneConnections();
        const boneStartIndex = 27; // After joints

        connections.forEach((conn, idx) => {
            const line = handGroup.children[boneStartIndex + idx];
            if (line && joints[conn[0]] && joints[conn[1]]) {
                const positions = line.geometry.attributes.position.array;
                positions[0] = joints[conn[0]].x;
                positions[1] = joints[conn[0]].y;
                positions[2] = joints[conn[0]].z;
                positions[3] = joints[conn[1]].x;
                positions[4] = joints[conn[1]].y;
                positions[5] = joints[conn[1]].z;
                line.geometry.attributes.position.needsUpdate = true;
                line.visible = true;
            }
        });
    }

    /**
     * Extract joint positions from hand data
     */
    extractJoints(handData) {
        // Joint order matches iOS app's HandJointData
        const jointNames = [
            'forearmArm', 'forearmWrist', 'wrist',
            'thumbKnuckle', 'thumbIntermediateBase', 'thumbIntermediateTip', 'thumbTip',
            'indexMetacarpal', 'indexKnuckle', 'indexIntermediateBase', 'indexIntermediateTip', 'indexTip',
            'middleMetacarpal', 'middleKnuckle', 'middleIntermediateBase', 'middleIntermediateTip', 'middleTip',
            'ringMetacarpal', 'ringKnuckle', 'ringIntermediateBase', 'ringIntermediateTip', 'ringTip',
            'littleMetacarpal', 'littleKnuckle', 'littleIntermediateBase', 'littleIntermediateTip', 'littleTip'
        ];

        const joints = [];

        for (const name of jointNames) {
            const matrix = handData[name];
            if (matrix && Array.isArray(matrix) && matrix.length >= 16) {
                // Extract position from 4x4 transform matrix (last column)
                joints.push({
                    x: matrix[12],
                    y: matrix[13],
                    z: matrix[14]
                });
            } else {
                joints.push(null);
            }
        }

        return joints;
    }

    /**
     * Update head marker from matrix
     */
    updateHead(matrix) {
        if (!matrix || matrix.length < 16) {
            this.headMarker.visible = false;
            return;
        }

        // Extract position
        this.headMarker.position.set(matrix[12], matrix[13], matrix[14]);

        // Extract rotation (simplified - just look direction)
        const forward = new THREE.Vector3(-matrix[8], -matrix[9], -matrix[10]);
        const up = new THREE.Vector3(matrix[4], matrix[5], matrix[6]);

        const look = this.headMarker.position.clone().add(forward);
        this.headMarker.lookAt(look);

        this.headMarker.visible = true;
    }

    /**
     * Follow head position with camera
     */
    followHeadPosition(matrix) {
        if (!matrix || matrix.length < 16) return;

        const headPos = new THREE.Vector3(matrix[12], matrix[13], matrix[14]);

        // Position camera behind and above head
        const offset = new THREE.Vector3(0, 0.2, 0.5);
        this.camera.position.copy(headPos).add(offset);
        this.camera.lookAt(headPos);
    }

    /**
     * Update frame by time (for syncing with video)
     */
    updateByTime(timeSeconds, fps = 30) {
        const frameIndex = Math.floor(timeSeconds * fps);
        this.updateFrame(Math.min(frameIndex, this.trackingData.length - 1));
    }

    /**
     * Handle window resize
     */
    onResize() {
        if (!this.container || !this.renderer) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 200;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.isInitialized) return;

        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Toggle follow head mode
     */
    toggleFollowHead() {
        this.followHead = !this.followHead;

        if (!this.followHead) {
            // Reset camera to default position
            this.camera.position.set(0, 0.3, 0.8);
            this.camera.lookAt(0, 0, 0);
        }

        return this.followHead;
    }

    /**
     * Get frame info
     */
    getFrameInfo() {
        return {
            current: this.currentFrameIndex + 1,
            total: this.trackingData.length
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
        }

        this.isInitialized = false;
    }
}

// Export class
window.TrackingViewer = TrackingViewer;

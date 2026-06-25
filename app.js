/**
 * ==========================================================================
 * Glowing Text Heart Animation JavaScript Engine
 * Features:
 *  - Algebraic Heart Curve point distribution (Boundary & Fill Rejection)
 *  - Spring-inertia physical system (Seeking targets, friction, mass)
 *  - Cursor interactions (Repel, Attract, Vortex forces)
 *  - Mouse click particle explosion & recovery
 *  - Interactive mouse trail particle system
 *  - Web Audio API real-time heartbeat "lub-dub" sound synthesis
 *  - Collapsible glassmorphic sidebar control synchronization
 * ==========================================================================
 */

// --- Audio & Heartbeat Sound Synthesis ---
let audioCtx = null;
let isAudioEnabled = false;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

/**
 * Synthesizes a deep, chest-thumping organic heartbeat sound
 * Uses low-frequency sine waves combined with low-pass filters and exponential decay
 * @param {boolean} isSecondBeat - True for the second "dub" beat, false for the first "lub"
 */
function playHeartbeatSound(isSecondBeat) {
    if (!audioCtx || !isAudioEnabled) return;
    
    // Resume context if suspended (browser security policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    // Heartbeat properties (double thump: "lub-dub")
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filterNode = audioCtx.createBiquadFilter();
    
    osc.type = 'sine';
    
    // The second beat ("dub") is slightly higher pitched, shorter, and quieter
    const startFrequency = isSecondBeat ? 58 : 46;
    const endFrequency = 10;
    const duration = isSecondBeat ? 0.12 : 0.18;
    const peakVolume = isSecondBeat ? 0.22 : 0.38;
    
    // Set frequency sweep for chest-thumping "muffled" punch
    osc.frequency.setValueAtTime(startFrequency, now);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    
    // Muffle the sound using a lowpass filter
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(100, now);
    
    // Apply volume envelope (rapid gain decay)
    gainNode.gain.setValueAtTime(peakVolume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    // Audio graph: osc -> filter -> gain -> destination
    osc.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + duration);
}

// --- Application Core Configurations & State ---
const settings = {
    fgText: "",
    bgText: "",
    particleText: "i love you",
    theme: "crimson",
    particleCount: 800,
    particleSize: 18,
    spread: 22,
    bpm: 85,
    glowIntensity: 15,
    interaction: "repel",
    explodeOnClick: true
};

const themes = {
    crimson: {
        rgb: '255, 34, 85',
        glow: 'rgba(255, 34, 85, 0.8)'
    },
    cyberpink: {
        rgb: '255, 0, 127',
        glow: 'rgba(255, 0, 127, 0.8)'
    },
    gold: {
        rgb: '255, 215, 0',
        glow: 'rgba(255, 215, 0, 0.8)'
    },
    amethyst: {
        rgb: '189, 0, 255',
        glow: 'rgba(189, 0, 255, 0.8)'
    }
};

let canvas, ctx;
let particles = [];
let trailParticles = [];
let wordList = ["i love you"];

// Mouse Tracking State
const mouse = {
    x: null,
    y: null,
    px: null, // previous x
    py: null, // previous y
    isDown: false
};

// Animation States
let lastTime = 0;
let heartBeatTimer = 0;
let soundTriggeredBeat1 = false;
let soundTriggeredBeat2 = false;

// --- Heart Geometry Generators ---

/**
 * Checks if a normalized point (x, y) is inside the standard heart boundary
 * Equation based on: y = x^(2/3) +/- sqrt(1 - x^2)
 * x is in [-1, 1], y is in [-1.2, 1.5]
 */
function isInsideHeart(x, y) {
    if (x < -1 || x > 1) return false;
    const absX = Math.abs(x);
    const xPow = Math.pow(absX, 2/3);
    const sqrtVal = Math.sqrt(1 - x * x);
    return y >= xPow - sqrtVal && y <= xPow + sqrtVal;
}

/**
 * Generates an array of target coordinate nodes within the algebraic heart curve
 * Combines boundary point spacing (for sharp outlines) with interior filling
 */
function generateHeartPoints(count) {
    const points = [];
    
    // Dedicate 25% of particles to the crisp outer boundary line
    const boundaryCount = Math.floor(count * 0.25);
    const fillCount = count - boundaryCount;
    
    // 1. Generate boundary points
    for (let i = 0; i < boundaryCount; i++) {
        // Parameter t from 0 to 2*pi
        const t = (i / boundaryCount) * Math.PI * 2;
        // x(t) = sin(t), y(t) = |sin(t)|^(2/3) + cos(t)
        const x = Math.sin(t);
        const y = Math.pow(Math.abs(x), 2/3) + Math.cos(t);
        points.push({ x, y, isBoundary: true });
    }
    
    // 2. Generate filled interior points using rejection sampling
    let attempts = 0;
    const maxAttempts = count * 30;
    
    while (points.length < count && attempts < maxAttempts) {
        attempts++;
        // Bounding box: x in [-1, 1], y in [-1.15, 1.5]
        const x = Math.random() * 2 - 1;
        const y = Math.random() * 2.65 - 1.15;
        
        if (isInsideHeart(x, y)) {
            // Apply slight organic scaling to avoid visual banding
            points.push({ x, y, isBoundary: false });
        }
    }
    
    // Fallback: If rejection sampling misses targets, pad list with concentric sub-hearts
    while (points.length < count) {
        const t = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.95; // scaling factor inwards
        const x = Math.sin(t) * r;
        const y = (Math.pow(Math.abs(x), 2/3) + Math.cos(t)) * r;
        points.push({ x, y, isBoundary: false });
    }
    
    return points;
}

// --- Particle Simulation Classes ---

class Particle {
    constructor(tx, ty, isBoundary, text) {
        this.tx = tx; // normalized target x
        this.ty = ty; // normalized target y
        this.isBoundary = isBoundary;
        this.text = text;
        
        // Spawn particle at a random position inside a center circle
        const spawnRadius = 150;
        const spawnAngle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spawnRadius;
        this.x = window.innerWidth / 2 + Math.cos(spawnAngle) * dist;
        this.y = window.innerHeight / 2 + Math.sin(spawnAngle) * dist;
        
        this.vx = 0;
        this.vy = 0;
        
        // Custom float dynamics
        this.baseFriction = Math.random() * 0.06 + 0.88; // 0.88 - 0.94
        this.friction = this.baseFriction;
        this.springK = Math.random() * 0.03 + 0.025; // spring strength
        
        this.size = settings.particleSize * (isBoundary ? 1.0 : 0.8);
        this.alpha = Math.random() * 0.35 + 0.65; // 0.65 to 1.0
        
        this.offsetPhase = Math.random() * Math.PI * 2;
        this.floatSpeed = Math.random() * 1.2 + 0.4;
        this.floatRange = Math.random() * 3 + 1;
    }
    
    update(centerX, centerY, scale, heartbeatScale, time) {
        // Calculate dynamic target coordinate (Y is inverted since math coordinate goes up, screen goes down)
        const targetX = centerX + this.tx * scale * heartbeatScale;
        const targetY = centerY - this.ty * scale * heartbeatScale;
        
        // Floating wave animation offset
        const floatX = Math.sin(time * this.floatSpeed + this.offsetPhase) * this.floatRange;
        const floatY = Math.cos(time * this.floatSpeed * 1.1 + this.offsetPhase) * this.floatRange;
        
        // Compute base velocities pulling particle toward its heart slot
        let forceX = (targetX + floatX - this.x) * this.springK;
        let forceY = (targetY + floatY - this.y) * this.springK;
        
        // Mouse Force Interaction (Repel, Attract, Vortex)
        if (mouse.x !== null && mouse.y !== null) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const interactionRadius = 135;
            
            if (dist < interactionRadius) {
                const forcePct = (interactionRadius - dist) / interactionRadius; // 1 at mouse, 0 at boundary
                
                if (settings.interaction === "repel") {
                    // Push particles away from cursor
                    const pushAngle = Math.atan2(this.y - mouse.y, this.x - mouse.x);
                    const pushForce = forcePct * 8; // acceleration strength
                    this.vx += Math.cos(pushAngle) * pushForce;
                    this.vy += Math.sin(pushAngle) * pushForce;
                } else if (settings.interaction === "attract") {
                    // Pull particles towards cursor
                    const pullAngle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
                    const pullForce = forcePct * 5;
                    this.vx += Math.cos(pullAngle) * pullForce;
                    this.vy += Math.sin(pullAngle) * pullForce;
                } else if (settings.interaction === "vortex") {
                    // Swirl particles around cursor (perpendicular vectors)
                    const swirlAngle = Math.atan2(this.y - mouse.y, this.x - mouse.x) + Math.PI / 2;
                    const swirlForce = forcePct * 6.5;
                    this.vx += Math.cos(swirlAngle) * swirlForce;
                    this.vy += Math.sin(swirlAngle) * swirlForce;
                }
            }
        }
        
        // Apply forces to velocity
        this.vx += forceX;
        this.vy += forceY;
        
        // Gradually decay temporary friction additions back to base rates (smooth recovery)
        this.friction = this.friction * 0.95 + this.baseFriction * 0.05;
        this.vx *= this.friction;
        this.vy *= this.friction;
        
        // Update coordinates
        this.x += this.vx;
        this.y += this.vy;
    }
    
    draw(ctx, colorRGB) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // 1. Neon Glow Draw (Lower opacity, larger font)
        if (settings.glowIntensity > 0) {
            ctx.fillStyle = `rgba(${colorRGB}, ${this.alpha * 0.15})`;
            ctx.font = `bold ${this.size * 1.5}px var(--font-body)`;
            ctx.fillText(this.text, this.x, this.y);
        }
        
        // 2. High Definition Solid Text Draw
        ctx.fillStyle = `rgba(${colorRGB}, ${this.alpha})`;
        ctx.font = `bold ${this.size}px var(--font-body)`;
        ctx.fillText(this.text, this.x, this.y);
    }
}

class TrailParticle {
    constructor(x, y, text, colorRGB) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.colorRGB = colorRGB;
        
        // Drift outwards and upwards
        this.vx = (Math.random() * 2 - 1) * 1.2;
        this.vy = -Math.random() * 1.5 - 0.8;
        
        this.alpha = 1.0;
        this.decay = Math.random() * 0.018 + 0.012; // fade rate
        this.size = Math.random() * 5 + 9; // sizes 9px to 14px
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() * 2 - 1) * 0.015;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy -= 0.01; // slight upward drift acceleration
        this.alpha -= this.decay;
        this.angle += this.spin;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${this.size}px var(--font-body)`;
        
        // Glow simulation
        ctx.fillStyle = `rgba(${this.colorRGB}, ${this.alpha * 0.2})`;
        ctx.fillText(this.text, 0, 0);
        
        // Main particle
        ctx.fillStyle = `rgba(${this.colorRGB}, ${this.alpha * 0.75})`;
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}

// --- Engine State Management ---

function parseWordList(inputText) {
    if (inputText.includes(',')) {
        wordList = inputText.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } else {
        wordList = [inputText.trim()];
    }
}

/**
 * Initializes or updates the particle system configuration
 */
function updateParticleSystem() {
    const targetPoints = generateHeartPoints(settings.particleCount);
    const newParticles = [];
    
    for (let i = 0; i < settings.particleCount; i++) {
        const point = targetPoints[i];
        const text = wordList[i % wordList.length];
        
        if (i < particles.length) {
            // Repurpose active particle to avoid GC thrashing
            const p = particles[i];
            p.tx = point.x;
            p.ty = point.y;
            p.isBoundary = point.isBoundary;
            p.text = text;
            p.size = settings.particleSize * (point.isBoundary ? 1.0 : 0.8);
            newParticles.push(p);
        } else {
            // Allocate new particle if density increased
            newParticles.push(new Particle(point.x, point.y, point.isBoundary, text));
        }
    }
    
    particles = newParticles;
}

/**
 * Calculates scale heartbeat values based on realistic dual-pulse (lub-dub) curves
 */
function getHeartbeatScale(phase) {
    // 65 BPM translates to double-beats within a 1s cycle
    // phase goes from 0.0 to 1.0
    if (phase < 0.12) {
        // Strong beat 1 (systole)
        return 1.0 + 0.16 * Math.sin((phase / 0.12) * Math.PI);
    } else if (phase < 0.20) {
        // Rest
        return 1.0;
    } else if (phase < 0.30) {
        // Mild beat 2 (dicrotic wave)
        return 1.0 + 0.05 * Math.sin(((phase - 0.2) / 0.1) * Math.PI);
    } else {
        // Diastolic rest
        return 1.0;
    }
}

/**
 * Triggers a blast explosion dispersing particles outward from cursor coordinate
 */
function explodeHeart(clickX, clickY) {
    particles.forEach(p => {
        const dx = p.x - clickX;
        const dy = p.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const angle = Math.atan2(dy, dx);
        
        // Power relative to distance from center click
        const force = 550 / (dist + 35);
        
        p.vx += Math.cos(angle) * force * (Math.random() * 0.4 + 0.8);
        p.vy += Math.sin(angle) * force * (Math.random() * 0.4 + 0.8);
        
        // Low resistance settings to let particles coast outward
        p.friction = 0.98; 
    });
}

// --- Main Rendering Loop ---

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    // Time delta
    const dt = (currentTime - lastTime) / 1000 || 0;
    lastTime = currentTime;
    
    // Clear viewport with a trailing overlay to simulate smooth particle speed lines (motion blur)
    ctx.fillStyle = "rgba(5, 2, 3, 0.22)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Get theme properties
    const currentTheme = themes[settings.theme];
    const themeRGB = currentTheme.rgb;
    
    // 1. Calculate dynamic heartbeat scale
    heartBeatTimer += dt;
    const beatPeriod = 60 / settings.bpm;
    const phase = (heartBeatTimer % beatPeriod) / beatPeriod;
    const heartbeatScale = getHeartbeatScale(phase);
    
    // Sync heartbeat variable with CSS layout (centered texts)
    document.documentElement.style.setProperty('--heartbeat-scale', heartbeatScale);
    
    // Audio Sound Scheduler: Triggers Web Audio thumps at beat onset phases
    if (isAudioEnabled) {
        // Beat 1: phase starts at 0
        if (phase < 0.1 && !soundTriggeredBeat1) {
            playHeartbeatSound(false); // Lub
            soundTriggeredBeat1 = true;
        }
        if (phase >= 0.1) soundTriggeredBeat1 = false;
        
        // Beat 2: phase starts at 0.20
        if (phase >= 0.20 && phase < 0.32 && !soundTriggeredBeat2) {
            playHeartbeatSound(true); // Dub
            soundTriggeredBeat2 = true;
        }
        if (phase >= 0.32 || phase < 0.2) soundTriggeredBeat2 = false;
    }
    
    // 2. Render & Update Cursor Trails
    for (let i = trailParticles.length - 1; i >= 0; i--) {
        const tp = trailParticles[i];
        tp.update();
        if (tp.alpha <= 0.05) {
            trailParticles.splice(i, 1);
        } else {
            tp.draw(ctx);
        }
    }
    
    // Spawn mouse movement trails
    if (mouse.x !== null && mouse.y !== null && mouse.px !== null && mouse.py !== null) {
        const moveDist = Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py);
        // Only spawn when mouse is moving
        if (moveDist > 2 && Math.random() < 0.45) {
            const trailWords = ["love", "❤", "kiss", "xoxo", "always", "forever"];
            const word = trailWords[Math.floor(Math.random() * trailWords.length)];
            trailParticles.push(new TrailParticle(mouse.x, mouse.y, word, themeRGB));
        }
    }
    
    // Update mouse historical coordinate
    mouse.px = mouse.x;
    mouse.py = mouse.y;
    
    // 3. Render & Update Particle Heart
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Dynamic screen scaling factor based on viewport size & settings
    const minDim = Math.min(canvas.width, canvas.height);
    const baseScale = minDim * 0.145; // base normalization
    const scale = baseScale * (settings.spread / 12);
    
    particles.forEach(p => {
        p.update(centerX, centerY, scale, heartbeatScale, currentTime * 0.001);
        p.draw(ctx, themeRGB);
    });
}

// --- Viewport Resize Handler ---

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Redraw screen space overlay
    ctx.fillStyle = "#050203";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- DOM Event Bindings & Initializations ---

document.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("heart-canvas");
    ctx = canvas.getContext("2d");
    
    // Setup Viewport Size
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
    // Grab Elements
    const fgTextElement = document.getElementById("fg-text");
    const bgTextElement = document.getElementById("bg-text");
    
    const sidebar = document.getElementById("settings-sidebar");
    const settingsToggle = document.getElementById("settings-toggle");
    const closeSidebarBtn = document.getElementById("close-sidebar");
    const audioToggle = document.getElementById("audio-toggle");
    const audioStatusText = document.getElementById("audio-status-text");
    const volumeIcon = document.getElementById("volume-icon");
    const btnReset = document.getElementById("btn-reset");
    
    // Controls Inputs
    const inputFgText = document.getElementById("input-fg-text");
    const inputBgText = document.getElementById("input-bg-text");
    const inputParticleText = document.getElementById("input-particle-text");
    const sliderCount = document.getElementById("slider-particle-count");
    const sliderSize = document.getElementById("slider-particle-size");
    const sliderSpread = document.getElementById("slider-spread");
    const sliderBpm = document.getElementById("slider-bpm");
    const sliderGlow = document.getElementById("slider-glow");
    const selectInteraction = document.getElementById("select-interaction");
    const checkExplode = document.getElementById("check-explode");
    
    const valCount = document.getElementById("val-particle-count");
    const valSize = document.getElementById("val-particle-size");
    const valSpread = document.getElementById("val-spread");
    const valBpm = document.getElementById("val-bpm");
    const valGlow = document.getElementById("val-glow");
    
    const themeButtons = document.querySelectorAll(".theme-btn");
    
    // --- Initialize Default UI Text and Styles ---
    function syncThemeCSS() {
        // Remove old theme classes
        document.getElementById("app-container").className = "";
        document.getElementById("app-container").classList.add(`theme-${settings.theme}`);
        
        // Sync central glows
        const glowColor = themes[settings.theme].glow;
        fgTextElement.style.textShadow = `0 0 8px rgba(255, 255, 255, 0.4), 0 0 ${settings.glowIntensity}px ${glowColor}`;
    }
    
    function syncUIValues() {
        inputFgText.value = settings.fgText;
        inputBgText.value = settings.bgText;
        inputParticleText.value = settings.particleText;
        
        sliderCount.value = settings.particleCount;
        valCount.textContent = settings.particleCount;
        
        sliderSize.value = settings.particleSize;
        valSize.textContent = `${settings.particleSize}px`;
        
        sliderSpread.value = settings.spread;
        valSpread.textContent = settings.spread;
        
        sliderBpm.value = settings.bpm;
        valBpm.textContent = settings.bpm;
        
        sliderGlow.value = settings.glowIntensity;
        valGlow.textContent = `${settings.glowIntensity}px`;
        
        selectInteraction.value = settings.interaction;
        checkExplode.checked = settings.explodeOnClick;
        
        // Sync theme buttons active state
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === settings.theme) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
        
        // Sync page titles
        fgTextElement.textContent = settings.fgText;
        bgTextElement.textContent = settings.bgText;
        
        // Sync css custom variables
        document.documentElement.style.setProperty('--glow-intensity', `${settings.glowIntensity}px`);
        syncThemeCSS();
    }
    
    // --- Mouse & Touch Input Tracking ---
    
    function setMousePos(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    }
    
    function clearMousePos() {
        mouse.x = null;
        mouse.y = null;
    }
    
    canvas.addEventListener("mousemove", setMousePos);
    canvas.addEventListener("mouseleave", clearMousePos);
    
    // Canvas click triggers explosion
    canvas.addEventListener("mousedown", (e) => {
        initAudioContext();
        setMousePos(e);
        mouse.isDown = true;
        if (settings.explodeOnClick) {
            explodeHeart(mouse.x, mouse.y);
        }
    });
    
    canvas.addEventListener("mouseup", () => {
        mouse.isDown = false;
    });
    
    // Touch Events for Mobile compatibility
    canvas.addEventListener("touchstart", (e) => {
        initAudioContext();
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
            if (settings.explodeOnClick) {
                explodeHeart(mouse.x, mouse.y);
            }
        }
    });
    
    canvas.addEventListener("touchmove", (e) => {
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    });
    
    canvas.addEventListener("touchend", clearMousePos);
    canvas.addEventListener("touchcancel", clearMousePos);
    
    // --- Control Settings Action Listeners ---
    
    // Open/Close Sidebar
    settingsToggle.addEventListener("click", () => {
        initAudioContext();
        sidebar.classList.toggle("sidebar-closed");
    });
    
    closeSidebarBtn.addEventListener("click", () => {
        sidebar.classList.add("sidebar-closed");
    });
    
    // Toggle Audio Context state
    audioToggle.addEventListener("click", () => {
        initAudioContext();
        isAudioEnabled = !isAudioEnabled;
        
        if (isAudioEnabled) {
            audioStatusText.textContent = "Sound: On";
            audioToggle.classList.add("active");
            // Change volume icon to unmuted
            volumeIcon.innerHTML = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
            // Trigger an initial beat sound to give instant user feedback
            playHeartbeatSound(false);
        } else {
            audioStatusText.textContent = "Sound: Off";
            audioToggle.classList.remove("active");
            // Change volume icon to muted
            volumeIcon.innerHTML = `<path fill="currentColor" d="M3.63 3.63a.996.996 0 0 0 0 1.41L7.29 8.7 7 9H3v6h4l5 5v-6.71l4.29 4.29c-.38.28-.8.51-1.29.62v2.06c1.03-.23 1.96-.75 2.73-1.43l2.27 2.27a.996.996 0 1 0 1.41-1.41L5.05 3.63a.996.996 0 0 0-1.41 0zM10 15.17L7.83 13H5v-2h2.83l.88-.88L10 11.26v3.91zM12 4L9.91 6.09 12 8.18V4zm4 8c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.14 14.99 20.5 13.54 20.5 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/>`;
        }
    });
    
    // Text Inputs
    inputFgText.addEventListener("input", (e) => {
        settings.fgText = e.target.value;
        fgTextElement.textContent = settings.fgText;
    });
    
    inputBgText.addEventListener("input", (e) => {
        settings.bgText = e.target.value.toUpperCase();
        bgTextElement.textContent = settings.bgText;
    });
    
    inputParticleText.addEventListener("input", (e) => {
        settings.particleText = e.target.value || " ";
        parseWordList(settings.particleText);
        updateParticleSystem();
    });
    
    // Sliders
    sliderCount.addEventListener("input", (e) => {
        settings.particleCount = parseInt(e.target.value);
        valCount.textContent = settings.particleCount;
        updateParticleSystem();
    });
    
    sliderSize.addEventListener("input", (e) => {
        settings.particleSize = parseInt(e.target.value);
        valSize.textContent = `${settings.particleSize}px`;
        particles.forEach(p => {
            p.size = settings.particleSize * (p.isBoundary ? 1.0 : 0.8);
        });
    });
    
    sliderSpread.addEventListener("input", (e) => {
        settings.spread = parseFloat(e.target.value);
        valSpread.textContent = settings.spread;
    });
    
    sliderBpm.addEventListener("input", (e) => {
        settings.bpm = parseInt(e.target.value);
        valBpm.textContent = settings.bpm;
    });
    
    sliderGlow.addEventListener("input", (e) => {
        settings.glowIntensity = parseInt(e.target.value);
        valGlow.textContent = `${settings.glowIntensity}px`;
        document.documentElement.style.setProperty('--glow-intensity', `${settings.glowIntensity}px`);
        syncThemeCSS();
    });
    
    selectInteraction.addEventListener("change", (e) => {
        settings.interaction = e.target.value;
    });
    
    checkExplode.addEventListener("change", (e) => {
        settings.explodeOnClick = e.target.checked;
    });
    
    // Theme buttons
    themeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            // Deactivate others, activate this
            themeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            settings.theme = btn.dataset.theme;
            syncThemeCSS();
        });
    });
    
    // Reset Settings
    btnReset.addEventListener("click", () => {
        settings.fgText = "Love you.";
        settings.bgText = "DESTROYED";
        settings.particleText = "i love you";
        settings.theme = "crimson";
        settings.particleCount = 800;
        settings.particleSize = 14;
        settings.spread = 21;
        settings.bpm = 85;
        settings.glowIntensity = 15;
        settings.interaction = "repel";
        settings.explodeOnClick = true;
        
        parseWordList(settings.particleText);
        syncUIValues();
        updateParticleSystem();
    });
    
    // --- Engine Kick-Off ---
    parseWordList(settings.particleText);
    syncUIValues();
    updateParticleSystem();
    
    // Start canvas animation frame loop
    requestAnimationFrame(animate);
});

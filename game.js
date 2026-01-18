// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 900;
canvas.height = 500;

// Offscreen canvases for cached elements
const bgCanvas = document.createElement('canvas');
bgCanvas.width = canvas.width;
bgCanvas.height = canvas.height;
const bgCtx = bgCanvas.getContext('2d');

// Cached lantern glow texture
const glowCanvas = document.createElement('canvas');
glowCanvas.width = 80;
glowCanvas.height = 80;
const glowCtx = glowCanvas.getContext('2d');

const keys = {};
const GROUND_Y = canvas.height - 60;

// World scrolling for parallax effect
let worldScroll = 0;
const SCROLL_SPEED = 0.8;

// Slowmo system
let slowmo = false;
let slowmoFactor = 1;

// Ambient effects
const fireflies = [];
const shootingStars = [];
const lanternParticles = [];

// Initialize fireflies
for (let i = 0; i < 15; i++) {
    fireflies.push({
        x: Math.random() * canvas.width,
        y: 100 + Math.random() * (GROUND_Y - 150),
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        drift: Math.random() * Math.PI * 2
    });
}

// Foreground tree shadows - positioned in world space with varied shapes
// type: 0=pointed pine, 1=round oak, 2=thin birch, 3=bushy spruce
const treeShadows = [
    { worldX: -100, height: 320, width: 75, type: 3, lean: 0.05 },
    { worldX: 150, height: 180, width: 35, type: 2, lean: -0.08 },
    { worldX: 380, height: 260, width: 55, type: 0, lean: 0.02 },
    { worldX: 520, height: 140, width: 50, type: 1, lean: 0 },
    { worldX: 750, height: 290, width: 65, type: 3, lean: -0.03 },
    { worldX: 950, height: 200, width: 40, type: 2, lean: 0.1 },
    { worldX: 1150, height: 350, width: 80, type: 0, lean: -0.02 },
    { worldX: 1350, height: 170, width: 60, type: 1, lean: 0.05 },
    { worldX: 1550, height: 240, width: 45, type: 2, lean: -0.06 },
    { worldX: 1780, height: 310, width: 70, type: 3, lean: 0.03 },
    { worldX: 1950, height: 190, width: 55, type: 1, lean: -0.04 },
    { worldX: 2150, height: 280, width: 50, type: 0, lean: 0.07 },
];

// Robot character
const robot = {
    x: 150,
    y: GROUND_Y,
    velocityX: 0,
    velocityY: 0,
    isJumping: false,

    speed: 30,
    jumpForce: -18,
    gravity: 0.6,
    friction: 0.85,

    // Combo system
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,

    armAngle: -Math.PI / 2,
    bladeAngle: 0,
    armExtension: 0,
    bladeExtension: 0,

    attackState: 'idle',
    attackProgress: 0,
    attackHeld: null,
    strikeTrail: [],

    wheelRotation: 0,
    afterimages: [],
    speedLines: [],
    dustParticles: [],
    screenShake: { x: 0, y: 0 }
};

// Targets - paper lanterns that bob up and down
// Colors by height: warm orange (ground), soft pink (low), light blue (mid), pale violet (high)
let bobTime = 0;
const targets = [
    // Ground level - warm orange
    { worldX: 400, x: 400, baseY: GROUND_Y - 25, y: 0, radius: 14, alive: true, phase: 0, hue: [255, 180, 100] },
    { worldX: 900, x: 900, baseY: GROUND_Y - 20, y: 0, radius: 12, alive: true, phase: 1.2, hue: [255, 170, 90] },
    { worldX: 1500, x: 1500, baseY: GROUND_Y - 25, y: 0, radius: 13, alive: true, phase: 2.5, hue: [255, 190, 110] },
    { worldX: 2100, x: 2100, baseY: GROUND_Y - 22, y: 0, radius: 12, alive: true, phase: 0.8, hue: [255, 175, 95] },
    // Low air - soft pink
    { worldX: 300, x: 300, baseY: GROUND_Y - 70, y: 0, radius: 12, alive: true, phase: 1.8, hue: [255, 180, 190] },
    { worldX: 600, x: 600, baseY: GROUND_Y - 90, y: 0, radius: 13, alive: true, phase: 3.1, hue: [255, 170, 180] },
    { worldX: 1000, x: 1000, baseY: GROUND_Y - 80, y: 0, radius: 12, alive: true, phase: 0.5, hue: [255, 185, 195] },
    { worldX: 1400, x: 1400, baseY: GROUND_Y - 75, y: 0, radius: 14, alive: true, phase: 2.2, hue: [255, 175, 185] },
    { worldX: 1800, x: 1800, baseY: GROUND_Y - 85, y: 0, radius: 12, alive: true, phase: 4.0, hue: [255, 180, 190] },
    // Mid air - light blue
    { worldX: 450, x: 450, baseY: GROUND_Y - 130, y: 0, radius: 11, alive: true, phase: 1.5, hue: [180, 220, 255] },
    { worldX: 750, x: 750, baseY: GROUND_Y - 150, y: 0, radius: 12, alive: true, phase: 2.8, hue: [170, 210, 255] },
    { worldX: 1100, x: 1100, baseY: GROUND_Y - 140, y: 0, radius: 13, alive: true, phase: 0.3, hue: [185, 225, 255] },
    { worldX: 1600, x: 1600, baseY: GROUND_Y - 135, y: 0, radius: 11, alive: true, phase: 3.5, hue: [175, 215, 255] },
    { worldX: 1950, x: 1950, baseY: GROUND_Y - 145, y: 0, radius: 12, alive: true, phase: 1.1, hue: [180, 220, 255] },
    // High air - pale violet
    { worldX: 550, x: 550, baseY: GROUND_Y - 190, y: 0, radius: 10, alive: true, phase: 2.0, hue: [220, 180, 255] },
    { worldX: 850, x: 850, baseY: GROUND_Y - 210, y: 0, radius: 11, alive: true, phase: 3.8, hue: [210, 170, 255] },
    { worldX: 1250, x: 1250, baseY: GROUND_Y - 200, y: 0, radius: 10, alive: true, phase: 0.9, hue: [225, 185, 255] },
    { worldX: 1700, x: 1700, baseY: GROUND_Y - 195, y: 0, radius: 11, alive: true, phase: 2.6, hue: [215, 175, 255] },
];

// Input handling
// Movement: Arrow keys (left/right to move, up or space to jump)
// Attacks: WASD (A=left, D=right, W=up, S=down)
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (!keys[key] && !keys[e.key]) {
        keys[key] = true;
        keys[e.key] = true;

        // WASD for attacks
        if (key === 'a') {
            handleAttackPress('left');
        } else if (key === 'd') {
            handleAttackPress('right');
        } else if (key === 'w') {
            handleAttackPress('up');
        } else if (key === 's') {
            handleAttackPress('down');
        }
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    keys[e.key] = false;

    // Attack release
    if (key === 'a') {
        handleAttackRelease('left');
    } else if (key === 'd') {
        handleAttackRelease('right');
    } else if (key === 'w') {
        handleAttackRelease('up');
    } else if (key === 's') {
        handleAttackRelease('down');
    }
});

function handleAttackPress(direction) {
    if (robot.attackHeld && robot.attackHeld !== direction) {
        // Combo - determine swing type
        const held = robot.attackHeld;
        if ((held === 'up' && direction === 'down') || (held === 'down' && direction === 'up')) {
            // Vertical combo
            robot.attackState = held === 'up' ? 'swing-ud' : 'swing-du';
        } else if ((held === 'left' && direction === 'right') || (held === 'right' && direction === 'left')) {
            // Horizontal combo
            robot.attackState = held === 'left' ? 'swing-lr' : 'swing-rl';
        } else {
            // Diagonal combo
            robot.attackState = 'swing-diag';
        }
        robot.attackProgress = 0;
        robot.strikeTrail = [];
        robot.attackHeld = null;
    } else {
        // Single jab
        if (direction === 'left') robot.attackState = 'jab-left';
        else if (direction === 'right') robot.attackState = 'jab-right';
        else if (direction === 'up') robot.attackState = 'jab-up';
        else robot.attackState = 'jab-down';

        robot.attackProgress = 0;
        robot.strikeTrail = [];
        robot.attackHeld = direction;
    }
}

function handleAttackRelease(direction) {
    if (robot.attackHeld === direction) {
        robot.attackHeld = null;
    }
}

function update() {
    // Slowmo when holding space (while in air)
    slowmo = keys[' '] && robot.isJumping;
    slowmoFactor = slowmo ? 0.25 : 1;

    const dt = slowmoFactor;

    // Movement with arrow keys
    if (keys['ArrowLeft']) {
        robot.velocityX = -robot.speed;
    } else if (keys['ArrowRight']) {
        robot.velocityX = robot.speed;
    } else {
        robot.velocityX *= robot.friction;
    }

    // Jump with arrow up
    if (keys['ArrowUp'] && !robot.isJumping) {
        robot.velocityY = robot.jumpForce;
        robot.isJumping = true;
        robot.combo = 0; // Reset combo on new jump
    }

    robot.velocityY += robot.gravity * dt;
    robot.y += robot.velocityY * dt;

    // Combo timer decay
    if (robot.comboTimer > 0) {
        robot.comboTimer -= dt;
    }

    if (robot.y >= GROUND_Y) {
        robot.y = GROUND_Y;
        robot.velocityY = 0;
        if (robot.isJumping && robot.combo > 1) {
            robot.comboTimer = 120; // Show combo for 2 seconds
        }
        robot.isJumping = false;
    }

    // Move robot on screen, scroll world only at edges
    const LEFT_EDGE = 150;
    const RIGHT_EDGE = canvas.width - 150;

    robot.x += robot.velocityX * dt;

    // Scroll world when robot hits edge zones
    if (robot.x < LEFT_EDGE) {
        worldScroll += robot.x - LEFT_EDGE;
        robot.x = LEFT_EDGE;
    } else if (robot.x > RIGHT_EDGE) {
        worldScroll += robot.x - RIGHT_EDGE;
        robot.x = RIGHT_EDGE;
    }

    // Update target screen positions and bobbing
    bobTime += 0.03 * dt;
    for (let i = 0; i < targets.length; i++) {
        targets[i].x = targets[i].worldX - worldScroll;
        targets[i].y = targets[i].baseY + Math.sin(bobTime + targets[i].phase) * 8;
    }

    robot.wheelRotation += robot.velocityX * 0.15;
    updateAttack();
    checkTargetCollisions();

    robot.screenShake.x *= 0.8;
    robot.screenShake.y *= 0.8;

    // Speed effects (reduced frequency)
    const absVel = Math.abs(robot.velocityX);
    if (absVel > 2) {
        // Afterimages - less frequent
        if (Math.random() > 0.5) {
            robot.afterimages.push({
                x: robot.x,
                y: robot.y,
                alpha: 0.6,
                wheelRotation: robot.wheelRotation,
                armAngle: robot.armAngle,
                armExtension: robot.armExtension,
                bladeExtension: robot.bladeExtension
            });
        }

        // Speed lines - reduced
        if (Math.random() > 0.6) {
            const direction = robot.velocityX > 0 ? -1 : 1;
            robot.speedLines.push({
                x: robot.x + direction * 30 + Math.random() * 100 * direction,
                y: robot.y - 8 + (Math.random() - 0.5) * 50,
                length: 30 + Math.random() * 50,
                alpha: 0.7,
                speed: absVel * 2
            });
        }

        // Dust - reduced
        if (!robot.isJumping && Math.random() > 0.7) {
            const direction = robot.velocityX > 0 ? -1 : 1;
            robot.dustParticles.push({
                x: robot.x + direction * 4,
                y: GROUND_Y,
                vx: direction * (2 + Math.random() * 3),
                vy: -Math.random() * 3,
                size: 2 + Math.random() * 3,
                alpha: 0.5
            });
        }
    }

    // Update effects
    robot.afterimages = robot.afterimages.filter(img => {
        img.alpha -= 0.1;
        return img.alpha > 0;
    });

    robot.speedLines = robot.speedLines.filter(line => {
        const direction = robot.velocityX > 0 ? -1 : 1;
        line.x += direction * line.speed;
        line.alpha -= 0.06;
        return line.alpha > 0;
    });

    robot.dustParticles = robot.dustParticles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.alpha -= 0.04;
        return p.alpha > 0 && p.y <= GROUND_Y;
    });

    robot.strikeTrail = robot.strikeTrail.filter(p => {
        p.alpha -= 0.15;
        return p.alpha > 0;
    });

    // Update lantern particles
    for (let i = lanternParticles.length - 1; i >= 0; i--) {
        const p = lanternParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.1 * dt;
        p.alpha -= 0.02 * dt;
        if (p.alpha <= 0) lanternParticles.splice(i, 1);
    }

    // Update fireflies
    for (let i = 0; i < fireflies.length; i++) {
        const f = fireflies[i];
        f.phase += 0.02 * dt;
        f.drift += 0.01 * dt;
        f.x += Math.sin(f.drift) * f.speed * dt;
        f.y += Math.cos(f.drift * 0.7) * f.speed * 0.5 * dt;
        // Wrap around
        if (f.x < -20) f.x = canvas.width + 20;
        if (f.x > canvas.width + 20) f.x = -20;
    }

    // Occasional shooting star
    if (Math.random() < 0.002 * dt && shootingStars.length < 2) {
        shootingStars.push({
            x: Math.random() * canvas.width,
            y: 20 + Math.random() * 80,
            vx: 8 + Math.random() * 6,
            vy: 2 + Math.random() * 2,
            alpha: 1,
            length: 40 + Math.random() * 30
        });
    }

    // Update shooting stars
    for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha -= 0.015 * dt;
        if (s.alpha <= 0 || s.x > canvas.width + 50) shootingStars.splice(i, 1);
    }
}

function checkTargetCollisions() {
    if (robot.bladeExtension < 0.3 || robot.armExtension < 0.3) return;

    const wheelRadius = 10;
    const armLength = 12 * robot.armExtension;
    const bladeLength = 60 * robot.bladeExtension;
    const pivotX = robot.x;
    const pivotY = robot.y - wheelRadius - 2;

    const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
    const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
    const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
    const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

    targets.forEach(target => {
        if (!target.alive) return;

        // Check line-circle collision
        const dx = bladeTipX - armEndX;
        const dy = bladeTipY - armEndY;
        const fx = armEndX - target.x;
        const fy = armEndY - target.y;

        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - target.radius * target.radius;

        let discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            discriminant = Math.sqrt(discriminant);
            const t1 = (-b - discriminant) / (2 * a);
            const t2 = (-b + discriminant) / (2 * a);

            if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) {
                target.alive = false;
                robot.screenShake.x = (Math.random() - 0.5) * 8;
                robot.screenShake.y = (Math.random() - 0.5) * 8;

                // Spawn lantern destruction particles
                for (let p = 0; p < 8; p++) {
                    const angle = (p / 8) * Math.PI * 2 + Math.random() * 0.5;
                    const speed = 2 + Math.random() * 3;
                    lanternParticles.push({
                        x: target.x,
                        y: target.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed - 2,
                        size: 3 + Math.random() * 4,
                        alpha: 1,
                        hue: target.hue
                    });
                }

                // Combo system
                if (robot.isJumping) {
                    robot.combo++;
                    if (robot.combo > robot.bestCombo) {
                        robot.bestCombo = robot.combo;
                    }
                }
            }
        }
    });
}

function updateAttack() {
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const isJab = robot.attackState.startsWith('jab-');
    const isSwing = robot.attackState.startsWith('swing-');

    if (isJab) {
        const direction = robot.attackState.replace('jab-', '');
        const held = robot.attackHeld === direction;

        if (robot.attackProgress < 1) {
            robot.attackProgress += 0.12;
            if (robot.attackProgress > 1) robot.attackProgress = 1;
        }

        const p = robot.attackProgress;

        // Set arm angle: 0=right, -PI=left, -PI/2=up, PI/2=down
        if (direction === 'up') robot.armAngle = -Math.PI / 2;
        else if (direction === 'down') robot.armAngle = Math.PI / 2;
        else if (direction === 'left') robot.armAngle = -Math.PI;
        else robot.armAngle = 0;

        if (held) {
            robot.armExtension = easeOutQuint(Math.min(p / 0.2, 1));
            const bladeP = Math.max(0, (p - 0.1) / 0.4);
            robot.bladeExtension = easeOutQuart(Math.min(bladeP, 1)) * 1.8;
        } else {
            if (p < 0.2) {
                robot.armExtension = easeOutQuint(p / 0.2);
                robot.bladeExtension = 0;
            } else if (p < 0.5) {
                robot.armExtension = 1;
                const bladeP = (p - 0.2) / 0.3;
                robot.bladeExtension = easeOutQuart(bladeP) * 1.8;
            } else {
                const retractP = (p - 0.5) / 0.5;
                robot.bladeExtension = 1.8 * (1 - easeOutQuart(Math.min(retractP * 1.5, 1)));
                robot.armExtension = 1 - easeOutQuart(Math.max(0, (retractP - 0.3) / 0.7));
                if (robot.armExtension < 0.01 && robot.bladeExtension < 0.01) {
                    robot.attackState = 'idle';
                    robot.armExtension = 0;
                    robot.bladeExtension = 0;
                }
            }
        }
        robot.bladeAngle = 0;

        if (robot.bladeExtension > 0.3 && robot.attackProgress < 0.5) {
            addTrailPoint();
        }

    } else if (isSwing) {
        robot.attackProgress += 0.08;

        if (robot.attackProgress >= 1) {
            robot.attackState = 'idle';
            robot.attackProgress = 0;
            robot.armExtension = 0;
            robot.bladeExtension = 0;
        } else {
            const p = robot.attackProgress;
            const swingType = robot.attackState.replace('swing-', '');

            robot.armExtension = 1;
            robot.bladeExtension = 1.3;

            // Different swing arcs
            if (swingType === 'lr') {
                robot.armAngle = -Math.PI - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'rl') {
                robot.armAngle = 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'ud') {
                robot.armAngle = -Math.PI / 2 - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'du') {
                robot.armAngle = Math.PI / 2 + 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else {
                // Diagonal swing
                robot.armAngle = -Math.PI * 0.75 + easeInOut(p) * Math.PI * 1.5;
            }

            robot.bladeAngle = Math.sin(p * Math.PI) * 0.15;

            if (p > 0.3 && p < 0.7) {
                robot.screenShake.x = (Math.random() - 0.5) * 5;
                robot.screenShake.y = (Math.random() - 0.5) * 3;
            }
        }
        addTrailPoint();

    } else {
        // Idle
        robot.armAngle += (-Math.PI/2 - robot.armAngle) * 0.15;
        robot.bladeAngle *= 0.8;
        robot.bladeExtension *= 0.85;
        robot.armExtension *= 0.85;
        if (robot.bladeExtension < 0.01) robot.bladeExtension = 0;
        if (robot.armExtension < 0.01) robot.armExtension = 0;
    }
}

function addTrailPoint() {
    if (robot.bladeExtension > 0.3 && robot.armExtension > 0.3) {
        const wheelRadius = 10;
        const armLength = 12 * robot.armExtension;
        const bladeLength = 60 * robot.bladeExtension;
        const pivotX = robot.x;
        const pivotY = robot.y - wheelRadius - 2;

        const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
        const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
        const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
        const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

        robot.strikeTrail.push({ x: bladeTipX, y: bladeTipY, alpha: 1 });
    }
}

// Cache static background once at startup
function initBackground() {
    // Create cached lantern glow (white, will be tinted when drawn)
    const glowGrad = glowCtx.createRadialGradient(40, 40, 0, 40, 40, 40);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    glowGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    glowCtx.fillStyle = glowGrad;
    glowCtx.fillRect(0, 0, 80, 80);

    // Night sky gradient
    const skyGrad = bgCtx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, '#0a0a18');
    skyGrad.addColorStop(0.5, '#101025');
    skyGrad.addColorStop(1, '#181830');
    bgCtx.fillStyle = skyGrad;
    bgCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Moon
    bgCtx.fillStyle = '#e8e8d0';
    bgCtx.beginPath();
    bgCtx.arc(750, 80, 35, 0, Math.PI * 2);
    bgCtx.fill();
    // Moon glow
    const moonGlow = bgCtx.createRadialGradient(750, 80, 35, 750, 80, 120);
    moonGlow.addColorStop(0, 'rgba(200, 200, 180, 0.15)');
    moonGlow.addColorStop(1, 'rgba(200, 200, 180, 0)');
    bgCtx.fillStyle = moonGlow;
    bgCtx.fillRect(600, 0, 300, 250);

    // Stars (sparse)
    bgCtx.fillStyle = '#ffffff';
    const stars = [[120, 45, 0.5], [280, 70, 0.6], [450, 35, 0.4], [600, 90, 0.55], [180, 120, 0.45], [520, 60, 0.5], [850, 50, 0.6], [80, 80, 0.5], [320, 30, 0.45], [720, 65, 0.5]];
    for (let i = 0; i < stars.length; i++) {
        bgCtx.globalAlpha = stars[i][2];
        bgCtx.fillRect(stars[i][0], stars[i][1], 2, 2);
    }
    bgCtx.globalAlpha = 1;

    // Distant mountains
    bgCtx.fillStyle = '#1a1a2e';
    bgCtx.beginPath();
    bgCtx.moveTo(0, GROUND_Y - 80);
    bgCtx.lineTo(100, GROUND_Y - 180);
    bgCtx.lineTo(200, GROUND_Y - 120);
    bgCtx.lineTo(350, GROUND_Y - 220);
    bgCtx.lineTo(500, GROUND_Y - 140);
    bgCtx.lineTo(650, GROUND_Y - 200);
    bgCtx.lineTo(800, GROUND_Y - 100);
    bgCtx.lineTo(900, GROUND_Y - 160);
    bgCtx.lineTo(900, GROUND_Y);
    bgCtx.lineTo(0, GROUND_Y);
    bgCtx.closePath();
    bgCtx.fill();

    // Mid mountains
    bgCtx.fillStyle = '#12121f';
    bgCtx.beginPath();
    bgCtx.moveTo(0, GROUND_Y - 40);
    bgCtx.lineTo(150, GROUND_Y - 130);
    bgCtx.lineTo(280, GROUND_Y - 70);
    bgCtx.lineTo(420, GROUND_Y - 150);
    bgCtx.lineTo(580, GROUND_Y - 90);
    bgCtx.lineTo(720, GROUND_Y - 120);
    bgCtx.lineTo(900, GROUND_Y - 60);
    bgCtx.lineTo(900, GROUND_Y);
    bgCtx.lineTo(0, GROUND_Y);
    bgCtx.closePath();
    bgCtx.fill();

    // Ground fill
    bgCtx.fillStyle = '#0a0a15';
    bgCtx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
}

function drawMoonlitBackground() {
    ctx.drawImage(bgCanvas, 0, 0);
}

function drawShootingStars() {
    for (let i = 0; i < shootingStars.length; i++) {
        const s = shootingStars[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x | 0, s.y | 0);
        ctx.lineTo((s.x - s.vx * 4) | 0, (s.y - s.vy * 4) | 0);
        ctx.stroke();
    }
}

function drawFireflies() {
    for (let i = 0; i < fireflies.length; i++) {
        const f = fireflies[i];
        const brightness = 0.3 + Math.sin(f.phase) * 0.3;
        ctx.fillStyle = `rgba(200, 255, 150, ${brightness})`;
        ctx.beginPath();
        ctx.arc(f.x | 0, f.y | 0, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawLanternParticles() {
    for (let i = 0; i < lanternParticles.length; i++) {
        const p = lanternParticles[i];
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `rgb(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]})`;
        ctx.fillRect((p.x - p.size / 2) | 0, (p.y - p.size / 2) | 0, p.size | 0, p.size | 0);
    }
    ctx.globalAlpha = 1;
}

// Draw background tree shadows with parallax scrolling (optimized)
function drawTreeShadows() {
    ctx.fillStyle = '#080814';
    const baseY = GROUND_Y + 10;

    for (let i = 0; i < treeShadows.length; i++) {
        const tree = treeShadows[i];
        let screenX = tree.worldX - (worldScroll * 1.2);
        screenX = ((screenX % 2500) + 2500) % 2500 - 400;

        if (screenX < -100 || screenX > 1000) continue;

        const lean = tree.height * tree.lean;
        const w = tree.width;
        const h = tree.height;

        // Simple triangle tree - all types reduced to triangles
        ctx.beginPath();
        ctx.moveTo(screenX + lean, baseY - h);
        ctx.lineTo(screenX - w, baseY);
        ctx.lineTo(screenX + w, baseY);
        ctx.fill();
    }
}

function draw() {
    ctx.save();
    ctx.translate(robot.screenShake.x | 0, robot.screenShake.y | 0);

    drawMoonlitBackground();
    drawShootingStars();
    drawFireflies();

    // Combo warm tint overlay
    if (robot.combo > 2 && robot.isJumping) {
        const intensity = Math.min(robot.combo * 0.03, 0.15);
        ctx.fillStyle = `rgba(255, 150, 50, ${intensity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Slowmo visual effect - blue tint overlay
    if (slowmo) {
        ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawTreeShadows();
    drawGround();
    drawTargets();
    drawLanternParticles();
    drawSpeedLines();
    drawDustParticles();
    drawAfterimages();
    drawStrikeTrail();
    drawRobot(robot.x | 0, robot.y | 0, 1, robot.armAngle, robot.bladeAngle, robot.wheelRotation, robot.bladeExtension, false, robot.armExtension);

    // Slowmo radial lines effect
    if (slowmo) {
        ctx.strokeStyle = 'rgba(150, 180, 255, 0.3)';
        ctx.lineWidth = 1;
        const rx = robot.x | 0;
        const ry = (robot.y - 10) | 0;
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(rx + cos * 40, ry + sin * 40);
            ctx.lineTo(rx + cos * 200, ry + sin * 200);
            ctx.stroke();
        }
    }

    // Combo display with scaling effect
    if (robot.combo > 1 && robot.isJumping) {
        const scale = 1 + Math.min(robot.combo * 0.1, 0.5);
        const shake = robot.combo > 3 ? (Math.random() - 0.5) * robot.combo : 0;
        ctx.save();
        ctx.translate(canvas.width / 2 + shake, 80);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${robot.combo}x COMBO!`, 0, 0);
        ctx.restore();
    } else if (robot.comboTimer > 0 && robot.combo > 1) {
        ctx.globalAlpha = robot.comboTimer / 120;
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${robot.combo}x COMBO!`, canvas.width / 2, 80);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    drawUI();

    ctx.restore();
}

let groundScrollPos = 0;

function drawGround() {
    // Ground line
    ctx.strokeStyle = '#c8c8e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 10);
    ctx.lineTo(canvas.width, GROUND_Y + 10);
    ctx.stroke();

    // Scrolling markers
    ctx.strokeStyle = '#5a5a80';
    groundScrollPos = ((groundScrollPos - robot.velocityX * 0.5) % 30 + 30) % 30;

    for (let x = groundScrollPos | 0; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 14);
        ctx.lineTo(x, GROUND_Y + 20);
        ctx.stroke();
    }
}

function drawTargets() {
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.alive || t.x < -50 || t.x > 950) continue;

        const x = t.x | 0;
        const y = t.y | 0;
        const size = t.radius;
        const h = t.hue;

        // Glow using cached texture with color tint
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(glowCanvas, x - 40, y - 40);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        // Lantern body with color
        ctx.fillStyle = `rgb(${h[0]}, ${h[1]}, ${h[2]})`;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.7, size, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner glow (brighter)
        ctx.fillStyle = `rgba(${Math.min(255, h[0] + 40)}, ${Math.min(255, h[1] + 40)}, ${Math.min(255, h[2] + 40)}, 0.9)`;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.4, size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // String
        ctx.strokeStyle = '#443322';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x, (y - size - 15) | 0);
        ctx.stroke();
    }
}

function drawSpeedLines() {
    ctx.strokeStyle = '#9999cc';
    ctx.lineWidth = 1;
    const dir = robot.velocityX > 0 ? -1 : 1;
    for (let i = 0; i < robot.speedLines.length; i++) {
        const line = robot.speedLines[i];
        ctx.globalAlpha = line.alpha;
        ctx.beginPath();
        ctx.moveTo(line.x | 0, line.y | 0);
        ctx.lineTo((line.x + line.length * dir) | 0, line.y | 0);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawDustParticles() {
    ctx.fillStyle = '#9999aa';
    for (let i = 0; i < robot.dustParticles.length; i++) {
        const p = robot.dustParticles[i];
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x | 0, p.y | 0, p.size | 0, p.size | 0);
    }
    ctx.globalAlpha = 1;
}

function drawAfterimages() {
    for (let i = 0; i < robot.afterimages.length; i++) {
        const img = robot.afterimages[i];
        drawRobot(img.x | 0, img.y | 0, img.alpha * 0.3, img.armAngle, 0, img.wheelRotation, img.bladeExtension, true, img.armExtension);
    }
}

function drawStrikeTrail() {
    if (robot.strikeTrail.length < 2) return;

    ctx.lineWidth = 2;
    for (let i = 1; i < robot.strikeTrail.length; i++) {
        const p1 = robot.strikeTrail[i - 1];
        const p2 = robot.strikeTrail[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${p2.alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x | 0, p1.y | 0);
        ctx.lineTo(p2.x | 0, p2.y | 0);
        ctx.stroke();
    }
}

function drawRobot(x, y, alpha = 1, armAng = -Math.PI/2, bladeAng = 0, wheelRot = 0, bladeExt = 0, isAfterimage = false, armExt = null) {
    ctx.globalAlpha = alpha;

    const armExtension = armExt !== null ? armExt : robot.armExtension;
    const wheelRadius = 10;
    const wheelY = y + 1;

    // Wheel
    ctx.strokeStyle = isAfterimage ? '#4a4a6a' : '#e8e8ff';
    ctx.lineWidth = isAfterimage ? 1 : 2;
    ctx.beginPath();
    ctx.arc(x, wheelY, wheelRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Arm and blade
    if (armExtension > 0.01) {
        const pivotX = x;
        const pivotY = y - wheelRadius - 2;

        // Pivot
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 2, 0, Math.PI * 2);
        ctx.stroke();

        // Arm
        const armLength = 12 * armExtension;
        const armEndX = pivotX + Math.cos(armAng) * armLength;
        const armEndY = pivotY + Math.sin(armAng) * armLength;

        ctx.lineWidth = isAfterimage ? 1 : 2;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // Blade
        if (bladeExt > 0.01) {
            const bladeLength = 60 * bladeExt;
            const totalBladeAngle = armAng + bladeAng;
            const bladeTipX = armEndX + Math.cos(totalBladeAngle) * bladeLength;
            const bladeTipY = armEndY + Math.sin(totalBladeAngle) * bladeLength;

            ctx.strokeStyle = isAfterimage ? '#5a5a7a' : '#ffffff';
            ctx.lineWidth = isAfterimage ? 1 : 2;
            ctx.beginPath();
            ctx.moveTo(armEndX, armEndY);
            ctx.lineTo(bladeTipX, bladeTipY);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
}

function drawUI() {
    ctx.fillStyle = '#7070a0';
    ctx.font = 'bold 13px monospace';

    // Target count
    const alive = targets.filter(t => t.alive).length;
    ctx.fillText(`targets: ${alive}/${targets.length}`, 20, 25);

    // Best combo
    if (robot.bestCombo > 1) {
        ctx.fillText(`best combo: ${robot.bestCombo}x`, 20, 42);
    }

    // Slowmo indicator
    if (slowmo) {
        ctx.fillStyle = '#6699ff';
        ctx.fillText('[SLOWMO]', canvas.width - 100, 25);
    }

    if (robot.attackState !== 'idle') {
        ctx.fillStyle = '#c0c0e0';
        let mode = '';
        switch(robot.attackState) {
            case 'jab-left': mode = robot.attackHeld ? '[JAB_L_HOLD]' : '[JAB_L]'; break;
            case 'jab-right': mode = robot.attackHeld ? '[JAB_R_HOLD]' : '[JAB_R]'; break;
            case 'jab-up': mode = robot.attackHeld ? '[JAB_UP_HOLD]' : '[JAB_UP]'; break;
            case 'swing-lr': mode = '[SWING_LR]'; break;
            case 'swing-rl': mode = '[SWING_RL]'; break;
            case 'swing-up': mode = '[SWING_UP]'; break;
        }
        ctx.fillText(mode, canvas.width - 100, 42);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize and start
initBackground();
gameLoop();

// Testing: change this to start at any level
const DEBUG_START_LEVEL = 1;

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 1200;
canvas.height = 600;

const keys = {};

// Minimal color palette
const COLORS = {
    bg: '#08080c',
    dim: '#252535',
    line: '#404055',
    bright: '#ffffff',
    vulnerable: '#ff6666',
    shapes: ['#66ffcc', '#ffcc66', '#cc66ff', '#66ccff', '#ff66cc', '#ccff66']
};

// Shape types for families (distinct from player's circle)
const SHAPES = ['triangle', 'square', 'diamond', 'pentagon', 'hexagon', 'star'];

// Speed system - slow by default, hold space for fast
let slowmoFactor = 0.35;

// Audio system
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioStarted = false;

// Background music
const bgMusic = new Audio('backing_loop.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

// Start audio on first user interaction
function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    audioCtx.resume();
    bgMusic.play().catch(() => {});
}

// Synthesized sound effects (soft and gentle)
function playSound(type) {
    if (!audioStarted) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; // Soft sine waves
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch(type) {
        case 'hit': // Soft tap
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;

        case 'kill': // Gentle chime
            osc.frequency.setValueAtTime(330, now);
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'hurt': // Soft thump
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'levelup': // Soft ascending notes
            [330, 440, 550, 660].forEach((freq, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'sine';
                o.connect(g);
                g.connect(audioCtx.destination);
                o.frequency.setValueAtTime(freq, now + i * 0.1);
                g.gain.setValueAtTime(0.03, now + i * 0.1);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.12);
                o.start(now + i * 0.1);
                o.stop(now + i * 0.1 + 0.12);
            });
            return;

        case 'gameover': // Gentle fade
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.6);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
            break;
    }
}

// Hit particles
const hitParticles = [];

// Freeze frame state
let freezeFrames = 0;

// Blade glow (decays over time)
let bladeGlow = 0;

// Game state
const game = {
    lives: 3,
    score: 0,
    level: 1,
    gameOver: false,
    familyIdCounter: 0,
    levelTransition: 0, // Countdown for level transition pause
    levelTransitionDuration: 90, // ~1.5 seconds at 60fps
    spawnTimer: 0,
    baseSpawnInterval: 300, // ~5 seconds at 60fps
    minSpawnInterval: 120   // Minimum ~2 seconds at higher levels
};

// Vulnerability state - which family is currently vulnerable
const vulnerability = {
    familyId: null,
    timer: 0,
    duration: 180 // ~3 seconds at 60fps
};

// Families array - each family has id, shape, color, members array
const families = [];

// Player character
const player = {
    x: 600,
    y: 300,
    vx: 0,
    vy: 0,
    radius: 5, // Player circle radius
    speed: 5,

    armAngle: -Math.PI / 2,
    bladeAngle: 0,
    armExtension: 0,
    bladeExtension: 0,

    attackState: 'idle',
    attackProgress: 0,
    attackHeld: null, // Which direction key is held
    strikeTrail: [],

    screenShake: { x: 0, y: 0 },
    invulnerable: 0 // Invulnerability frames after being hit
};

// Direction angles for WASD
const DIRECTION_ANGLES = {
    'w': -Math.PI / 2,  // up
    's': Math.PI / 2,   // down
    'a': Math.PI,       // left
    'd': 0              // right
};

// Input handling
document.addEventListener('keydown', (e) => {
    startAudio(); // Start audio on first interaction
    const key = e.key.toLowerCase();

    if (!keys[key]) {
        keys[key] = true;
        keys[e.key] = true;

        // WASD for jabs
        if (['w', 'a', 's', 'd'].includes(key)) {
            player.attackState = 'jab-' + key;
            player.attackProgress = 0;
            player.strikeTrail = [];
            player.attackHeld = key;
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

    // Release held attack
    if (player.attackHeld === key) {
        player.attackHeld = null;
    }
});

// Spawn a new family
function spawnFamily() {
    const familySize = Math.random() < 0.25 ? 1 :
                       Math.random() < 0.5 ? 2 :
                       Math.random() < 0.75 ? 3 : 4;

    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const color = COLORS.shapes[Math.floor(Math.random() * COLORS.shapes.length)];
    const familyId = game.familyIdCounter++;

    const family = {
        id: familyId,
        shape: shape,
        color: color,
        members: []
    };

    // Spawn members in a cluster, away from player
    let baseX, baseY;
    const minDistFromPlayer = 150;
    do {
        baseX = Math.random() * (canvas.width - 100) + 50;
        baseY = Math.random() * (canvas.height - 100) + 50;
    } while (Math.sqrt((baseX - player.x) ** 2 + (baseY - player.y) ** 2) < minDistFromPlayer);

    for (let i = 0; i < familySize; i++) {
        const angle = (i / familySize) * Math.PI * 2;
        const dist = familySize > 1 ? 40 + Math.random() * 20 : 0;

        const target = {
            x: baseX + Math.cos(angle) * dist,
            y: baseY + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: 15,
            familyId: familyId,
            alive: true,
            opacity: 1, // Goes transparent when hit but family not complete
            hit: false, // Has been hit during vulnerability window
            dying: false, // Death animation in progress
            deathTimer: 0, // For shrink animation
            spawning: true, // Fade-in animation
            spawnProgress: 0 // 0 to 1
        };

        // Clamp initial position
        target.x = Math.max(target.radius, Math.min(canvas.width - target.radius, target.x));
        target.y = Math.max(target.radius, Math.min(canvas.height - target.radius, target.y));

        family.members.push(target);
    }

    families.push(family);
}

// Find family by ID
function getFamilyById(id) {
    return families.find(f => f.id === id);
}

// Start a new level
function startLevel(level) {
    game.level = level;
    families.splice(0, families.length);
    vulnerability.familyId = null;
    vulnerability.timer = 0;
    game.spawnTimer = 0;

    const startingFamilies = 3 + (level - 1);
    for (let i = 0; i < startingFamilies; i++) {
        spawnFamily();
    }
}

// Check if level is complete (no alive or dying targets)
function checkLevelComplete() {
    for (const f of families) {
        for (const m of f.members) {
            if (m.alive || m.dying) return false;
        }
    }
    return true;
}

// Update visual elements (runs even on game over)
function updateVisuals(dt) {
    // Update targets movement
    for (const family of families) {
        for (const target of family.members) {
            if (!target.alive) continue;

            // Random direction changes
            if (Math.random() < 0.02) {
                target.vx += (Math.random() - 0.5) * 0.3;
                target.vy += (Math.random() - 0.5) * 0.3;
            }

            // Limit speed
            const speed = Math.sqrt(target.vx * target.vx + target.vy * target.vy);
            if (speed > 1) {
                target.vx = (target.vx / speed) * 1;
                target.vy = (target.vy / speed) * 1;
            }

            target.x += target.vx * dt;
            target.y += target.vy * dt;

            // Bounce off edges
            if (target.x < target.radius) { target.x = target.radius; target.vx *= -1; }
            if (target.x > canvas.width - target.radius) { target.x = canvas.width - target.radius; target.vx *= -1; }
            if (target.y < target.radius) { target.y = target.radius; target.vy *= -1; }
            if (target.y > canvas.height - target.radius) { target.y = canvas.height - target.radius; target.vy *= -1; }
        }
    }

    // Continuous spawning
    game.spawnTimer += dt;
    const spawnInterval = Math.max(
        game.minSpawnInterval,
        game.baseSpawnInterval - (game.level - 1) * 20
    );
    if (game.spawnTimer >= spawnInterval) {
        game.spawnTimer = 0;
        spawnFamily();
    }

    // Update hit particles
    for (let i = hitParticles.length - 1; i >= 0; i--) {
        const p = hitParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= 0.03 * dt;
        if (p.alpha <= 0) hitParticles.splice(i, 1);
    }

    // Update target animations (spawn fade-in, death shrink)
    updateTargetAnimations();

    // Update screen shake decay
    player.screenShake.x *= 0.8;
    player.screenShake.y *= 0.8;

    // Clean up dead families (only after death animations complete)
    for (let i = families.length - 1; i >= 0; i--) {
        if (families[i].members.every(m => !m.alive && !m.dying)) {
            families.splice(i, 1);
        }
    }
}

function update() {
    // Use slow time factor (fast mode only when not game over)
    const dt = game.gameOver ? 0.35 : (keys[' '] ? 1 : 0.35);
    slowmoFactor = dt;

    // Always update visual elements (even on game over)
    updateVisuals(dt);

    if (game.gameOver) return;

    // Handle freeze frames (brief pause on family elimination)
    if (freezeFrames > 0) {
        freezeFrames--;
        bladeGlow *= 0.9;
        return;
    }

    // Handle level transition pause
    if (game.levelTransition > 0) {
        game.levelTransition--;
        if (game.levelTransition === 0) {
            startLevel(game.level + 1);
            playSound('levelup');
        }
        return;
    }

    // Decay blade glow
    bladeGlow *= 0.92;

    // Player movement with arrows - immediate stop, no sliding
    player.vx = 0;
    player.vy = 0;
    if (keys['ArrowLeft']) player.vx = -player.speed;
    if (keys['ArrowRight']) player.vx = player.speed;
    if (keys['ArrowUp']) player.vy = -player.speed;
    if (keys['ArrowDown']) player.vy = player.speed;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Clamp to screen edges
    if (player.x < player.radius) { player.x = player.radius; player.vx = 0; }
    if (player.x > canvas.width - player.radius) { player.x = canvas.width - player.radius; player.vx = 0; }
    if (player.y < player.radius) { player.y = player.radius; player.vy = 0; }
    if (player.y > canvas.height - player.radius) { player.y = canvas.height - player.radius; player.vy = 0; }

    // Update invulnerability
    if (player.invulnerable > 0) player.invulnerable -= dt;

    // Update vulnerability timer
    if (vulnerability.familyId !== null) {
        vulnerability.timer -= dt;
        if (vulnerability.timer <= 0) {
            // Time's up - reset the vulnerable family
            const family = getFamilyById(vulnerability.familyId);
            if (family) {
                for (const member of family.members) {
                    if (member.hit && member.alive) {
                        member.hit = false;
                        member.opacity = 1;
                    }
                }
            }
            vulnerability.familyId = null;
        }
    }

    // Check for level complete
    if (checkLevelComplete() && families.length > 0 || (families.length === 0 && game.level > 0)) {
        // Clean up any remaining dead families first
        for (let i = families.length - 1; i >= 0; i--) {
            if (families[i].members.every(m => !m.alive)) {
                families.splice(i, 1);
            }
        }

        if (checkLevelComplete()) {
            game.levelTransition = game.levelTransitionDuration;
        }
    }

    updateAttack(dt);
    checkTargetCollisions();
    checkPlayerCollisions();

    // Update strike trail
    player.strikeTrail = player.strikeTrail.filter(p => {
        p.alpha -= 0.15 * dt;
        return p.alpha > 0;
    });
}

function checkPlayerCollisions() {
    if (player.invulnerable > 0) return;

    for (const family of families) {
        for (const target of family.members) {
            if (!target.alive || target.hit || target.spawning) continue; // Skip dead, hit, or spawning targets

            // Check collision
            const dx = player.x - target.x;
            const dy = player.y - target.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < player.radius + target.radius) {
                // Hit!
                game.lives--;
                player.invulnerable = 120; // 2 seconds of invulnerability
                player.screenShake.x = (Math.random() - 0.5) * 15;
                player.screenShake.y = (Math.random() - 0.5) * 15;

                if (game.lives <= 0) {
                    game.gameOver = true;
                    playSound('gameover');
                } else {
                    playSound('hurt');
                }
                return;
            }
        }
    }
}

function checkTargetCollisions() {
    if (player.bladeExtension < 0.3 || player.armExtension < 0.3) return;

    const armLength = 15 * player.armExtension;
    const bladeLength = 70 * player.bladeExtension;
    const pivotX = player.x;
    const pivotY = player.y;

    const armEndX = pivotX + Math.cos(player.armAngle) * armLength;
    const armEndY = pivotY + Math.sin(player.armAngle) * armLength;
    const bladeTipX = armEndX + Math.cos(player.armAngle + player.bladeAngle) * bladeLength;
    const bladeTipY = armEndY + Math.sin(player.armAngle + player.bladeAngle) * bladeLength;

    // Collect all hits this frame
    const hits = [];

    for (const family of families) {
        for (const target of family.members) {
            if (!target.alive || target.hit) continue;

            // Line-circle intersection
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
                    hits.push({ target, family });
                }
            }
        }
    }

    if (hits.length === 0) return;

    // Process hits - favor the player
    const singletons = hits.filter(h => h.family.members.length === 1);
    const vulnerableHits = hits.filter(h =>
        h.family.id === vulnerability.familyId && h.family.members.length > 1
    );
    const otherHits = hits.filter(h =>
        h.family.id !== vulnerability.familyId && h.family.members.length > 1
    );

    // Kill all singletons
    for (const { target, family } of singletons) {
        killTarget(target, family);
    }

    // Kill vulnerable family members
    for (const { target, family } of vulnerableHits) {
        hitFamilyMember(target, family);
    }

    // For others: if no vulnerable family, make the first one vulnerable
    if (otherHits.length > 0 && vulnerability.familyId === null) {
        const { target, family } = otherHits[0];
        vulnerability.familyId = family.id;
        vulnerability.timer = vulnerability.duration;
        hitFamilyMember(target, family);
    } else if (otherHits.length > 0 && vulnerability.familyId !== null) {
        // Wrong family hit while another is vulnerable - reset old, start new
        const oldFamily = getFamilyById(vulnerability.familyId);
        if (oldFamily) {
            for (const member of oldFamily.members) {
                if (member.hit && member.alive) {
                    member.hit = false;
                    member.opacity = 1;
                }
            }
        }

        const { target, family } = otherHits[0];
        vulnerability.familyId = family.id;
        vulnerability.timer = vulnerability.duration;
        hitFamilyMember(target, family);
    }
}

function hitFamilyMember(target, family) {
    target.hit = true;
    target.opacity = 0.3;

    createHitParticles(target.x, target.y, family.color, family.shape);
    bladeGlow = 1; // Blade glows on hit
    playSound('hit');

    // Check if all family members are hit
    const allHit = family.members.every(m => m.hit || !m.alive);
    if (allHit) {
        // Eliminate the family!
        playSound('kill');
        const familySize = family.members.filter(m => m.alive).length;
        for (const member of family.members) {
            if (member.alive) {
                killTarget(member, family);
            }
        }
        vulnerability.familyId = null;

        // Family elimination effects
        freezeFrames = 4; // Brief freeze (~67ms at 60fps)

        // Bigger shake for family elimination
        player.screenShake.x = (Math.random() - 0.5) * (6 + familySize * 2);
        player.screenShake.y = (Math.random() - 0.5) * (6 + familySize * 2);
    } else {
        player.screenShake.x = (Math.random() - 0.5) * 4;
        player.screenShake.y = (Math.random() - 0.5) * 4;
    }
}

function killTarget(target, family) {
    target.alive = false;
    target.dying = true;
    target.deathTimer = 1; // Start death animation
    game.score++;
    createHitParticles(target.x, target.y, family.color, family.shape);
    bladeGlow = 1;
}

function createHitParticles(x, y, color = COLORS.bright, shape = null) {
    const count = shape ? 5 : 6; // Fewer shape particles since they're bigger
    for (let p = 0; p < count; p++) {
        const angle = (p / count) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 1.5 + Math.random() * 2;
        hitParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1,
            shape: shape,
            size: shape ? (8 + Math.random() * 8) : 4, // Bigger if shape
            rotation: Math.random() * Math.PI * 2
        });
    }
}

function updateTargetAnimations() {
    for (const family of families) {
        for (const target of family.members) {
            // Spawn fade-in
            if (target.spawning) {
                target.spawnProgress += 0.03;
                if (target.spawnProgress >= 1) {
                    target.spawnProgress = 1;
                    target.spawning = false;
                }
            }
            // Death shrink
            if (target.dying) {
                target.deathTimer -= 0.08;
                if (target.deathTimer <= 0) {
                    target.dying = false;
                }
            }
        }
    }
}

function updateAttack(dt) {
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

    const isJab = player.attackState.startsWith('jab-');
    const attackSpeed = dt;

    if (isJab) {
        const direction = player.attackState.replace('jab-', '');
        const held = player.attackHeld === direction;

        if (player.attackProgress < 1) {
            player.attackProgress += 0.24 * attackSpeed;
            if (player.attackProgress > 1) player.attackProgress = 1;
        }

        const p = player.attackProgress;
        player.armAngle = DIRECTION_ANGLES[direction];

        if (held) {
            // Held - extend and stay extended
            player.armExtension = easeOutQuint(Math.min(p / 0.2, 1));
            const bladeP = Math.max(0, (p - 0.1) / 0.4);
            player.bladeExtension = easeOutQuart(Math.min(bladeP, 1)) * 1.5;
        } else {
            // Released - complete jab and retract
            if (p < 0.2) {
                player.armExtension = easeOutQuint(p / 0.2);
                player.bladeExtension = 0;
            } else if (p < 0.5) {
                player.armExtension = 1;
                const bladeP = (p - 0.2) / 0.3;
                player.bladeExtension = easeOutQuart(bladeP) * 1.5;
            } else {
                const retractP = (p - 0.5) / 0.5;
                player.bladeExtension = 1.5 * (1 - easeOutQuart(Math.min(retractP * 1.5, 1)));
                player.armExtension = 1 - easeOutQuart(Math.max(0, (retractP - 0.3) / 0.7));
                if (player.armExtension < 0.01 && player.bladeExtension < 0.01) {
                    player.attackState = 'idle';
                    player.armExtension = 0;
                    player.bladeExtension = 0;
                }
            }
        }
        player.bladeAngle = 0;

        if (player.bladeExtension > 0.3 && player.attackProgress < 0.5) {
            addTrailPoint();
        }

    } else {
        // Idle - retract blade
        player.armAngle += (-Math.PI/2 - player.armAngle) * 0.15;
        player.bladeAngle *= 0.8;
        player.bladeExtension *= 0.85;
        player.armExtension *= 0.85;
        if (player.bladeExtension < 0.01) player.bladeExtension = 0;
        if (player.armExtension < 0.01) player.armExtension = 0;
    }
}

function addTrailPoint() {
    if (player.bladeExtension > 0.3 && player.armExtension > 0.3) {
        const armLength = 15 * player.armExtension;
        const bladeLength = 70 * player.bladeExtension;
        const pivotX = player.x;
        const pivotY = player.y;

        const armEndX = pivotX + Math.cos(player.armAngle) * armLength;
        const armEndY = pivotY + Math.sin(player.armAngle) * armLength;
        const bladeTipX = armEndX + Math.cos(player.armAngle + player.bladeAngle) * bladeLength;
        const bladeTipY = armEndY + Math.sin(player.armAngle + player.bladeAngle) * bladeLength;

        player.strikeTrail.push({ x: bladeTipX, y: bladeTipY, alpha: 1 });
    }
}

function draw() {
    ctx.save();
    ctx.translate(player.screenShake.x | 0, player.screenShake.y | 0);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw targets
    drawTargets();

    // Hit particles
    drawHitParticles();

    // Strike trail
    drawStrikeTrail();

    // Player
    drawPlayer();

    drawUI();
    ctx.restore();

    // Level transition screen
    if (game.levelTransition > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = COLORS.bright;
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${game.level + 1}`, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
    }

    // Game over screen
    if (game.gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = COLORS.bright;
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);
        ctx.font = '24px monospace';
        ctx.fillText(`Score: ${game.score}`, canvas.width / 2, canvas.height / 2 + 20);
        ctx.font = '16px monospace';
        ctx.fillText('Refresh to restart', canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
    }
}

function drawTargets() {
    for (const family of families) {
        const isVulnerable = family.id === vulnerability.familyId;
        const blinkOn = isVulnerable && Math.floor(Date.now() / 100) % 2 === 0;

        for (const target of family.members) {
            // Draw dying targets with shrink animation
            if (target.dying) {
                ctx.globalAlpha = target.deathTimer * 0.8;
                ctx.strokeStyle = family.color;
                ctx.lineWidth = 2;
                const shrinkRadius = target.radius * target.deathTimer;
                drawShape(target.x, target.y, shrinkRadius, family.shape);
                ctx.globalAlpha = 1;
                continue;
            }

            if (!target.alive) continue;

            let color = family.color;
            if (isVulnerable && blinkOn) {
                color = COLORS.vulnerable;
            }

            // Spawn fade-in factor
            const spawnAlpha = target.spawning ? target.spawnProgress : 1;
            const spawnScale = target.spawning ? 0.5 + target.spawnProgress * 0.5 : 1;

            // Draw diffused/bigger shape behind (aura effect)
            ctx.globalAlpha = target.opacity * 0.15 * spawnAlpha;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            drawShape(target.x, target.y, target.radius * 1.8 * spawnScale, family.shape);

            // Draw main shape
            ctx.globalAlpha = target.opacity * spawnAlpha;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2;
            drawShape(target.x, target.y, target.radius * spawnScale, family.shape);

            ctx.globalAlpha = 1;
        }
    }
}

function drawShape(x, y, radius, shape) {
    ctx.beginPath();

    switch (shape) {
        case 'triangle':
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;

        case 'square':
            ctx.rect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
            break;

        case 'diamond':
            ctx.moveTo(x, y - radius);
            ctx.lineTo(x + radius * 0.7, y);
            ctx.lineTo(x, y + radius);
            ctx.lineTo(x - radius * 0.7, y);
            ctx.closePath();
            break;

        case 'pentagon':
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;

        case 'hexagon':
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;

        case 'star':
            for (let i = 0; i < 10; i++) {
                const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 === 0 ? radius : radius * 0.5;
                const px = x + Math.cos(angle) * r;
                const py = y + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
    }

    ctx.stroke();
}

function drawHitParticles() {
    for (const p of hitParticles) {
        ctx.globalAlpha = p.alpha * 0.6; // More diffused/transparent
        ctx.strokeStyle = COLORS.dim;
        ctx.lineWidth = 1;

        if (p.shape) {
            // Draw expanding shape particle
            const expandedSize = p.size * (2 - p.alpha); // Gets bigger as it fades
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            drawShape(0, 0, expandedSize, p.shape);
            ctx.restore();
        } else {
            // Simple dot for non-shape particles
            ctx.fillStyle = COLORS.dim;
            ctx.fillRect((p.x - 2) | 0, (p.y - 2) | 0, 4, 4);
        }
    }
    ctx.globalAlpha = 1;
}

function drawStrikeTrail() {
    if (player.strikeTrail.length < 2) return;

    ctx.lineWidth = 2;
    for (let i = 1; i < player.strikeTrail.length; i++) {
        const p1 = player.strikeTrail[i - 1];
        const p2 = player.strikeTrail[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${p2.alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x | 0, p1.y | 0);
        ctx.lineTo(p2.x | 0, p2.y | 0);
        ctx.stroke();
    }
}

function drawPlayer() {
    // Blinking when invulnerable
    if (player.invulnerable > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
        return;
    }

    ctx.strokeStyle = COLORS.bright;
    ctx.lineWidth = 2;

    // Player body (circle)
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = COLORS.bright;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Arm and blade
    if (player.armExtension > 0.01) {
        const armLength = 15 * player.armExtension;
        const armEndX = player.x + Math.cos(player.armAngle) * armLength;
        const armEndY = player.y + Math.sin(player.armAngle) * armLength;

        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(armEndX | 0, armEndY | 0);
        ctx.stroke();

        if (player.bladeExtension > 0.01) {
            const bladeLength = 70 * player.bladeExtension;
            const totalBladeAngle = player.armAngle + player.bladeAngle;
            const bladeTipX = armEndX + Math.cos(totalBladeAngle) * bladeLength;
            const bladeTipY = armEndY + Math.sin(totalBladeAngle) * bladeLength;

            // Blade glow effect (thicker, brighter line behind)
            if (bladeGlow > 0.1) {
                ctx.globalAlpha = bladeGlow * 0.5;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4 + bladeGlow * 3;
                ctx.beginPath();
                ctx.moveTo(armEndX | 0, armEndY | 0);
                ctx.lineTo(bladeTipX | 0, bladeTipY | 0);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Normal blade
            ctx.strokeStyle = COLORS.bright;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(armEndX | 0, armEndY | 0);
            ctx.lineTo(bladeTipX | 0, bladeTipY | 0);
            ctx.stroke();
        }
    }
}

function drawUI() {
    ctx.fillStyle = COLORS.line;
    ctx.font = '14px monospace';

    // Lives
    ctx.fillText(`Lives: ${game.lives}`, 20, 25);

    // Score
    ctx.fillText(`Score: ${game.score}`, 20, 45);

    // Level
    ctx.fillText(`Level: ${game.level}`, 20, 65);

    // Vulnerability timer
    if (vulnerability.familyId !== null) {
        const family = getFamilyById(vulnerability.familyId);
        if (family) {
            const timeLeft = (vulnerability.timer / 60).toFixed(1);
            const membersLeft = family.members.filter(m => m.alive && !m.hit).length;
            const totalMembers = family.members.filter(m => m.alive || m.hit).length;

            ctx.fillStyle = COLORS.vulnerable;
            ctx.fillText(`${family.shape.toUpperCase()}: ${timeLeft}s (${membersLeft}/${totalMembers} left)`, canvas.width - 250, 25);
        }
    }

    // Active targets count
    let aliveCount = 0;
    for (const f of families) {
        aliveCount += f.members.filter(m => m.alive).length;
    }
    ctx.fillStyle = COLORS.line;
    ctx.fillText(`Targets: ${aliveCount}`, canvas.width - 100, 65);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ============== TOUCH CONTROLS ==============

// Detect touch device and add class to body
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
    document.body.classList.add('touch-device');
}

// Start overlay handler - requests fullscreen and locks orientation
const startOverlay = document.getElementById('startOverlay');
if (startOverlay && isTouchDevice) {
    startOverlay.addEventListener('click', async () => {
        // Start audio
        startAudio();

        // Request fullscreen
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            }
        } catch (e) {
            // Fullscreen not supported or denied - continue anyway
        }

        // Try to lock orientation to landscape
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch (e) {
            // Orientation lock not supported - continue anyway
        }

        // Mark game as started (shows controls, hides overlay)
        document.body.classList.add('game-started');

        // Resize canvas for new dimensions
        setTimeout(resizeCanvas, 100);
    });
}

// Joystick state
const joysticks = {
    move: { active: false, touchId: null, startX: 0, startY: 0, currentX: 0, currentY: 0 },
    attack: { active: false, touchId: null, startX: 0, startY: 0, currentX: 0, currentY: 0 }
};

// Get joystick elements
const moveJoystick = document.getElementById('moveJoystick');
const moveKnob = document.getElementById('moveKnob');
const attackJoystick = document.getElementById('attackJoystick');
const attackKnob = document.getElementById('attackKnob');
const fastModeBtn = document.getElementById('fastModeBtn');

// Joystick config
const joystickRadius = 70; // Half of joystick zone width
const deadzone = 0.2;

function handleJoystickStart(joystickType, touch, zone) {
    const rect = zone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    joysticks[joystickType] = {
        active: true,
        touchId: touch.identifier,
        startX: centerX,
        startY: centerY,
        currentX: touch.clientX,
        currentY: touch.clientY
    };

    startAudio(); // Start audio on touch
    updateJoystickVisual(joystickType);
    updateKeysFromJoystick(joystickType);
}

function handleJoystickMove(joystickType, touch) {
    if (!joysticks[joystickType].active) return;

    joysticks[joystickType].currentX = touch.clientX;
    joysticks[joystickType].currentY = touch.clientY;

    updateJoystickVisual(joystickType);
    updateKeysFromJoystick(joystickType);
}

function handleJoystickEnd(joystickType) {
    joysticks[joystickType].active = false;
    joysticks[joystickType].touchId = null;

    // Reset knob position
    const knob = joystickType === 'move' ? moveKnob : attackKnob;
    knob.style.transform = 'translate(-50%, -50%)';

    // Clear keys for this joystick
    if (joystickType === 'move') {
        keys['ArrowLeft'] = false;
        keys['ArrowRight'] = false;
        keys['ArrowUp'] = false;
        keys['ArrowDown'] = false;
    } else {
        // Release attack
        if (player.attackHeld) {
            player.attackState = 'retracting';
            player.attackProgress = 1;
            player.attackHeld = null;
        }
        keys['w'] = false;
        keys['a'] = false;
        keys['s'] = false;
        keys['d'] = false;
    }
}

function updateJoystickVisual(joystickType) {
    const js = joysticks[joystickType];
    const knob = joystickType === 'move' ? moveKnob : attackKnob;

    let dx = js.currentX - js.startX;
    let dy = js.currentY - js.startY;

    // Clamp to joystick radius
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = joystickRadius - 30; // Keep knob inside
    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function updateKeysFromJoystick(joystickType) {
    const js = joysticks[joystickType];

    let dx = js.currentX - js.startX;
    let dy = js.currentY - js.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Normalize
    const normalizedDist = Math.min(dist / joystickRadius, 1);

    if (normalizedDist < deadzone) {
        // In deadzone - no input
        if (joystickType === 'move') {
            keys['ArrowLeft'] = false;
            keys['ArrowRight'] = false;
            keys['ArrowUp'] = false;
            keys['ArrowDown'] = false;
        }
        return;
    }

    // Get angle
    const angle = Math.atan2(dy, dx);

    if (joystickType === 'move') {
        // 4-way or 8-way movement based on angle
        keys['ArrowRight'] = Math.cos(angle) > 0.3;
        keys['ArrowLeft'] = Math.cos(angle) < -0.3;
        keys['ArrowDown'] = Math.sin(angle) > 0.3;
        keys['ArrowUp'] = Math.sin(angle) < -0.3;
    } else {
        // Attack - determine direction (4-way)
        const pi = Math.PI;
        let attackKey = null;

        if (angle > -pi/4 && angle <= pi/4) attackKey = 'd'; // right
        else if (angle > pi/4 && angle <= 3*pi/4) attackKey = 's'; // down
        else if (angle > 3*pi/4 || angle <= -3*pi/4) attackKey = 'a'; // left
        else attackKey = 'w'; // up

        // Clear other attack keys
        ['w', 'a', 's', 'd'].forEach(k => keys[k] = false);
        keys[attackKey] = true;

        // Trigger attack if not already attacking
        if (player.attackState === 'idle' || player.attackHeld !== attackKey) {
            player.attackState = 'jab-' + attackKey;
            player.attackProgress = 0;
            player.strikeTrail = [];
            player.attackHeld = attackKey;
        }
    }
}

// Touch event handlers for move joystick
if (moveJoystick) {
    moveJoystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        handleJoystickStart('move', touch, moveJoystick);
    }, { passive: false });
}

// Touch event handlers for attack joystick
if (attackJoystick) {
    attackJoystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        handleJoystickStart('attack', touch, attackJoystick);
    }, { passive: false });
}

// Global touch move and end
document.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
        if (joysticks.move.touchId === touch.identifier) {
            handleJoystickMove('move', touch);
        }
        if (joysticks.attack.touchId === touch.identifier) {
            handleJoystickMove('attack', touch);
        }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
        if (joysticks.move.touchId === touch.identifier) {
            handleJoystickEnd('move');
        }
        if (joysticks.attack.touchId === touch.identifier) {
            handleJoystickEnd('attack');
        }
    }
});

document.addEventListener('touchcancel', (e) => {
    for (const touch of e.changedTouches) {
        if (joysticks.move.touchId === touch.identifier) {
            handleJoystickEnd('move');
        }
        if (joysticks.attack.touchId === touch.identifier) {
            handleJoystickEnd('attack');
        }
    }
});

// Fast mode button
if (fastModeBtn) {
    fastModeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startAudio();
        keys[' '] = true;
        fastModeBtn.classList.add('active');
    }, { passive: false });

    fastModeBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys[' '] = false;
        fastModeBtn.classList.remove('active');
    }, { passive: false });
}

// ============== RESPONSIVE CANVAS ==============

function resizeCanvas() {
    const container = document.getElementById('gameContainer');
    const maxWidth = window.innerWidth;
    const maxHeight = window.innerHeight - (isTouchDevice ? 180 : 60); // Leave room for joysticks

    const aspectRatio = 1200 / 600; // Original canvas aspect ratio

    let newWidth = maxWidth;
    let newHeight = newWidth / aspectRatio;

    if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
    }

    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
}

// Resize on load and window resize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============== START GAME ==============

// Initialize with starting level
startLevel(DEBUG_START_LEVEL);

gameLoop();

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 1200;
canvas.height = 600;

const keys = {};
const keyPressOrder = []; // Track order of attack key presses for swing direction

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
let slowmoFactor = 0.25;

// Hit particles
const hitParticles = [];

// Game state
const game = {
    lives: 3,
    score: 0,
    level: 1,
    spawnTimer: 0,
    baseSpawnInterval: 300, // frames between spawns, decreases with level
    gameOver: false,
    familyIdCounter: 0
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
    radius: 12, // Player circle radius
    speed: 5,

    armAngle: -Math.PI / 2,
    bladeAngle: 0,
    armExtension: 0,
    bladeExtension: 0,

    attackState: 'idle',
    attackProgress: 0,
    attackHeld: null,
    strikeTrail: [],

    // For swing direction calculation
    swingStartAngle: 0,
    swingEndAngle: 0,
    swingDirection: 1, // 1 = clockwise, -1 = counter-clockwise

    screenShake: { x: 0, y: 0 },
    invulnerable: 0 // Invulnerability frames after being hit
};

// Direction angles for WASD
const DIRECTION_ANGLES = {
    'up': -Math.PI / 2,
    'down': Math.PI / 2,
    'left': Math.PI,
    'right': 0
};

// Input handling
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (!keys[key] && !keys[e.key]) {
        keys[key] = true;
        keys[e.key] = true;

        if (key === 'a') handleAttackPress('left');
        else if (key === 'd') handleAttackPress('right');
        else if (key === 'w') handleAttackPress('up');
        else if (key === 's') handleAttackPress('down');
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    keys[e.key] = false;

    if (key === 'a') handleAttackRelease('left');
    else if (key === 'd') handleAttackRelease('right');
    else if (key === 'w') handleAttackRelease('up');
    else if (key === 's') handleAttackRelease('down');
});

function handleAttackPress(direction) {
    const now = performance.now();
    keyPressOrder.push({ direction, time: now });

    // Keep only recent presses (within 150ms)
    const recentPresses = keyPressOrder.filter(p => now - p.time < 150);
    keyPressOrder.length = 0;
    keyPressOrder.push(...recentPresses);

    if (player.attackHeld && player.attackHeld !== direction) {
        // Calculate swing between two directions
        const startAngle = DIRECTION_ANGLES[player.attackHeld];
        const endAngle = DIRECTION_ANGLES[direction];

        // Determine if we should take the long way (270 degrees)
        // This happens if 3+ directions were pressed quickly
        const takeLongWay = keyPressOrder.length >= 3;

        // Calculate shortest angular distance
        let diff = endAngle - startAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        player.swingStartAngle = startAngle;
        player.swingEndAngle = endAngle;

        if (takeLongWay) {
            // Take the long way around (270 degrees)
            player.swingDirection = diff > 0 ? -1 : 1;
        } else {
            // Take the short way
            player.swingDirection = diff > 0 ? 1 : -1;
        }

        player.attackState = 'swing';
        player.attackProgress = 0;
        player.strikeTrail = [];
        player.attackHeld = null;
    } else {
        // Start a jab
        player.attackState = 'jab-' + direction;
        player.attackProgress = 0;
        player.strikeTrail = [];
        player.attackHeld = direction;
    }
}

function handleAttackRelease(direction) {
    if (player.attackHeld === direction) {
        player.attackHeld = null;
    }
}

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
            hit: false  // Has been hit during vulnerability window
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

function update() {
    if (game.gameOver) return;

    // Hold space for fast mode
    slowmoFactor = keys[' '] ? 1 : 0.35;
    const dt = slowmoFactor;

    // Player movement - immediate stop, no sliding
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

    // Update targets
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

    // Spawning
    game.spawnTimer += dt;
    const spawnInterval = Math.max(60, game.baseSpawnInterval - (game.level - 1) * 30);
    if (game.spawnTimer >= spawnInterval) {
        game.spawnTimer = 0;
        spawnFamily();
    }

    // Level up based on score
    const newLevel = Math.floor(game.score / 10) + 1;
    if (newLevel > game.level) {
        game.level = newLevel;
        // Clear all families and respawn with base amount + (level - 1)
        families.splice(0, families.length); // Clear array
        vulnerability.familyId = null;
        vulnerability.timer = 0;
        game.spawnTimer = 0; // Reset spawn timer
        const startingFamilies = 3 + (game.level - 1); // Level 2 = 4, Level 3 = 5, etc.
        for (let i = 0; i < startingFamilies; i++) {
            spawnFamily();
        }
    }

    updateAttack(dt);
    checkTargetCollisions();
    checkPlayerCollisions();

    // Update screen shake
    player.screenShake.x *= 0.8;
    player.screenShake.y *= 0.8;

    // Update strike trail
    player.strikeTrail = player.strikeTrail.filter(p => {
        p.alpha -= 0.15 * dt;
        return p.alpha > 0;
    });

    // Update hit particles
    for (let i = hitParticles.length - 1; i >= 0; i--) {
        const p = hitParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= 0.03 * dt;
        if (p.alpha <= 0) hitParticles.splice(i, 1);
    }

    // Clean up dead families
    for (let i = families.length - 1; i >= 0; i--) {
        if (families[i].members.every(m => !m.alive)) {
            families.splice(i, 1);
        }
    }
}

function checkPlayerCollisions() {
    if (player.invulnerable > 0) return;

    for (const family of families) {
        for (const target of family.members) {
            if (!target.alive) continue;

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

            // Line-circle intersection (simplified, no wraparound for blade)
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
    // Separate into: singletons, already-vulnerable family members, other
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
    // If there's already a vulnerable family, ignore (favor player)
    if (otherHits.length > 0 && vulnerability.familyId === null) {
        const { target, family } = otherHits[0];
        // Make this family vulnerable
        vulnerability.familyId = family.id;
        vulnerability.timer = vulnerability.duration;
        hitFamilyMember(target, family);
    } else if (otherHits.length > 0 && vulnerability.familyId !== null) {
        // Wrong family hit while another is vulnerable
        // Reset the old family and make this one vulnerable
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

    // Create particles
    createHitParticles(target.x, target.y);

    // Check if all family members are hit
    const allHit = family.members.every(m => m.hit || !m.alive);
    if (allHit) {
        // Eliminate the family!
        for (const member of family.members) {
            if (member.alive) {
                killTarget(member, family);
            }
        }
        vulnerability.familyId = null;
    }

    player.screenShake.x = (Math.random() - 0.5) * 4;
    player.screenShake.y = (Math.random() - 0.5) * 4;
}

function killTarget(target, family) {
    target.alive = false;
    game.score++;
    createHitParticles(target.x, target.y);

    player.screenShake.x = (Math.random() - 0.5) * 6;
    player.screenShake.y = (Math.random() - 0.5) * 6;
}

function createHitParticles(x, y) {
    for (let p = 0; p < 6; p++) {
        const angle = (p / 6) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 2 + Math.random() * 3;
        hitParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1
        });
    }
}

function updateAttack(dt) {
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const isJab = player.attackState.startsWith('jab-');
    const isSwing = player.attackState === 'swing';

    // Attack speed affected by slowmo
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
            player.armExtension = easeOutQuint(Math.min(p / 0.2, 1));
            const bladeP = Math.max(0, (p - 0.1) / 0.4);
            player.bladeExtension = easeOutQuart(Math.min(bladeP, 1)) * 1.5;
        } else {
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

    } else if (isSwing) {
        player.attackProgress += 0.16 * attackSpeed;

        if (player.attackProgress >= 1) {
            player.attackState = 'idle';
            player.attackProgress = 0;
            player.armExtension = 0;
            player.bladeExtension = 0;
        } else {
            const p = player.attackProgress;

            player.armExtension = 1;
            player.bladeExtension = 1.2;

            // Calculate swing arc
            let startAngle = player.swingStartAngle;
            let endAngle = player.swingEndAngle;

            // Determine arc length
            let diff = endAngle - startAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            let arcLength;
            if (player.swingDirection === 1) {
                // Clockwise - positive direction
                arcLength = diff > 0 ? diff : (Math.PI * 2 + diff);
            } else {
                // Counter-clockwise - negative direction
                arcLength = diff < 0 ? diff : (diff - Math.PI * 2);
            }

            player.armAngle = startAngle + easeInOut(p) * arcLength;
            player.bladeAngle = Math.sin(p * Math.PI) * 0.15;

            if (p > 0.2 && p < 0.8) {
                player.screenShake.x = (Math.random() - 0.5) * 3;
                player.screenShake.y = (Math.random() - 0.5) * 2;
            }
        }
        addTrailPoint();

    } else {
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
            if (!target.alive) continue;

            ctx.globalAlpha = target.opacity;

            // Color based on vulnerability state
            let color = family.color;
            if (isVulnerable && blinkOn) {
                color = COLORS.vulnerable;
            }

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2;

            drawShape(target.x, target.y, target.radius, family.shape);

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
    ctx.fillStyle = COLORS.bright;
    for (const p of hitParticles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillRect((p.x - 2) | 0, (p.y - 2) | 0, 4, 4);
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

        // Arm
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(armEndX | 0, armEndY | 0);
        ctx.stroke();

        // Blade
        if (player.bladeExtension > 0.01) {
            const bladeLength = 70 * player.bladeExtension;
            const totalBladeAngle = player.armAngle + player.bladeAngle;
            const bladeTipX = armEndX + Math.cos(totalBladeAngle) * bladeLength;
            const bladeTipY = armEndY + Math.sin(totalBladeAngle) * bladeLength;

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

// Initialize with some starting targets
for (let i = 0; i < 3; i++) {
    spawnFamily();
}

gameLoop();

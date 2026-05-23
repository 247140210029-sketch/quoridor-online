document.addEventListener('DOMContentLoaded', () => {
    // --- 1. HỆ THỐNG ÂM THANH ---
    const bgmSound = new Audio('bgm.mp3'); bgmSound.loop = true; bgmSound.volume = 0.4;
    const moveSound = new Audio('move.mp3');
    const wallSound = new Audio('wall.mp3');
    const winSound = new Audio('win.mp3');
    let isBgmPlaying = false;

    function playSound(audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(e => console.log("Lỗi phát âm thanh:", e));
    }

    // --- 2. QUẢN LÝ UI & STATE ---
    const API_URL = '/api'; 
    let socket = null;
    let currentUser = null; 
    let isOnlineMatch = false;
    let myRole = 1; 
    let currentRoomId = null;
    let opponentName = "Máy";
    let currentGameMode = 'bot-hard';

    const authScreen = document.getElementById('auth-screen');
    const mainMenu = document.getElementById('main-menu');
    const gameScreen = document.getElementById('game-screen');
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const victoryOverlay = document.getElementById('victory-overlay');

    // --- 3. ĐĂNG NHẬP / ĐĂNG KÝ ---
    document.getElementById('login-btn').addEventListener('click', () => handleAuth('login'));
    document.getElementById('register-btn').addEventListener('click', () => handleAuth('register'));

    async function handleAuth(type) {
        const username = document.getElementById('username-inp').value.trim();
        const password = document.getElementById('password-inp').value.trim();
        const msgEl = document.getElementById('auth-msg');

        if (!username || !password) return msgEl.textContent = "Vui lòng điền đủ thông tin!";
        
        try {
            const res = await fetch(`${API_URL}/${type}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (!res.ok) {
                msgEl.textContent = data.error;
            } else {
                currentUser = data.user;
                initMainMenu();
                if (!isBgmPlaying) { playSound(bgmSound); isBgmPlaying = true; }
                initSocket(); 
            }
        } catch (error) {
            msgEl.textContent = "Không thể kết nối đến máy chủ!";
        }
    }

    function initMainMenu() {
	authScreen.classList.add('hidden');
    	mainMenu.classList.remove('hidden');
    
    	// Sửa chỗ này: Lấy đúng biến currentUser đã load từ LocalStorage hoặc API
    	document.getElementById('profile-name').textContent = `Xin chào, ${currentUser.username || "Người chơi"}`;
    	document.getElementById('profile-rank').textContent = currentUser.rankScore || 1000;
    	document.getElementById('profile-wins').textContent = currentUser.wins || 0;
    }

    // --- 4. BẢNG XẾP HẠNG ---
    document.getElementById('show-leaderboard-btn').addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_URL}/leaderboard`);
            const data = await res.json();
            const listEl = document.getElementById('leaderboard-list');
            listEl.innerHTML = data.map((u, i) => `<li><b>#${i+1} ${u.username}</b> <span>${u.rankScore} Điểm</span></li>`).join('');
            leaderboardScreen.classList.remove('hidden');
        } catch (error) {
            alert("Lỗi tải bảng xếp hạng");
        }
    });
    document.getElementById('close-leaderboard-btn').addEventListener('click', () => leaderboardScreen.classList.add('hidden'));

    // --- 5. HỆ THỐNG SOCKET.IO ---
    function initSocket() {
        socket = io(window.location.origin, {
    	    transports: ['websocket'],
            secure: true
	}); 
        socket.on('match_found', (data) => {
            matchmakingScreen.classList.add('hidden');
            isOnlineMatch = true;
            myRole = data.role;
            currentRoomId = data.roomId;
            opponentName = data.opponent;
            document.getElementById('restart-btn').classList.add('hidden');
            document.getElementById('victory-restart-btn').classList.add('hidden');
            startGame(); 
        });
        socket.on('opponent_moved', (data) => {
            if (data.action === 'move') executeMovement(data.r, data.c, false);
            else if (data.action === 'wall') executeWallPlacement(data.r, data.c, data.isH, false);
        });
    }

    document.getElementById('find-match-btn').addEventListener('click', () => {
        if (!socket) return alert("Mất kết nối máy chủ!");
        matchmakingScreen.classList.remove('hidden');
        socket.emit('find_match', currentUser); 
    });

    document.getElementById('cancel-match-btn').addEventListener('click', () => {
        matchmakingScreen.classList.add('hidden');
        if (socket) { socket.disconnect(); initSocket(); }
    });

    document.getElementById('start-bot-btn').addEventListener('click', () => {
        isOnlineMatch = false;
        myRole = 1; 
        opponentName = "Bot AI";
        currentGameMode = document.getElementById('menu-game-mode').value;
        document.getElementById('restart-btn').classList.remove('hidden');
        document.getElementById('victory-restart-btn').classList.remove('hidden');
        startGame();
    });

    // --- 6. LOGIC GAME CỐT LÕI ---
    const boardElement = document.getElementById('board');
    const boardSize = 17;
    let p1Position = { r: 16, c: 8 }, p2Position = { r: 0, c: 8 };  
    let p1Walls = 9, p2Walls = 9;
    let currentTurn = 1, gameOver = false;
    let timeLeft = 60, timerInterval, particleInterval;

    function startGame() {
	if (!currentUser || !currentUser.username) {
            alert("Chưa đăng nhập! Vui lòng quay lại đăng nhập.");
            return;
    	}
        mainMenu.classList.add('hidden');     
        gameScreen.classList.remove('hidden'); 
        victoryOverlay.classList.remove('show');
        setTimeout(() => victoryOverlay.classList.add('hidden'), 500); 

        if (myRole === 1) {
            document.getElementById('p1-name-display').textContent = `P1 - ${currentUser.username} (Xanh)`;
            document.getElementById('p2-name-display').textContent = `P2 - ${opponentName} (Đỏ)`;
        } else {
            document.getElementById('p1-name-display').textContent = `P1 - ${opponentName} (Xanh)`;
            document.getElementById('p2-name-display').textContent = `P2 - ${currentUser.username} (Đỏ) - BẠN`;
        }

        boardElement.innerHTML = ''; 
        p1Position = { r: 16, c: 8 }; p2Position = { r: 0, c: 8 };
        p1Walls = 9; p2Walls = 9; currentTurn = 1; gameOver = false;
        document.getElementById('p1-walls').textContent = p1Walls; 
        document.getElementById('p2-walls').textContent = p2Walls;
        
        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                const element = document.createElement('div');
                element.dataset.row = r; element.dataset.col = c;
                if (r % 2 === 0 && c % 2 === 0) element.classList.add('cell');
                else if (r % 2 === 0 && c % 2 !== 0) element.classList.add('wall-v');
                else if (r % 2 !== 0 && c % 2 === 0) element.classList.add('wall-h');
                else element.classList.add('intersection');
                boardElement.appendChild(element);
            }
        }
        updatePawns(); switchTurn(1); 
    }

    function highlightValidMoves() {
        document.querySelectorAll('.valid-move').forEach(el => el.classList.remove('valid-move'));
        if (gameOver || (isOnlineMatch && currentTurn !== myRole) || (!isOnlineMatch && currentTurn === 2)) return;

        let currentPos = currentTurn === 1 ? p1Position : p2Position;
        let oppPos = currentTurn === 1 ? p2Position : p1Position;
        const dirs = [{dr:-2,dc:0}, {dr:2,dc:0}, {dr:0,dc:-2}, {dr:0,dc:2}];

        for (let d of dirs) {
            let tr = currentPos.r + d.dr, tc = currentPos.c + d.dc;
            if (tr >= 0 && tr < boardSize && tc >= 0 && tc < boardSize) {
                let w = document.querySelector(`[data-row="${(currentPos.r + tr)/2}"][data-col="${(currentPos.c + tc)/2}"]`);
                if (!w.classList.contains('wall-placed') && !(tr === oppPos.r && tc === oppPos.c)) {
                    document.querySelector(`[data-row="${tr}"][data-col="${tc}"]`).classList.add('valid-move');
                }
            }
        }
    }

    boardElement.addEventListener('mouseover', (e) => {
        if (gameOver || (isOnlineMatch && currentTurn !== myRole) || (!isOnlineMatch && currentTurn === 2)) return;
        const target = e.target;
        if (target.classList.contains('wall-h') || target.classList.contains('wall-v')) {
            let els = getWallElements(parseInt(target.dataset.row), parseInt(target.dataset.col), target.classList.contains('wall-h'));
            if (els) {
                let isInvalid = els.some(el => el.classList.contains('wall-placed'));
                els.forEach(el => el.classList.add(isInvalid ? 'wall-preview-invalid' : 'wall-preview-valid'));
            }
        }
    });

    boardElement.addEventListener('mouseout', () => {
        document.querySelectorAll('.wall-preview-valid, .wall-preview-invalid').forEach(el => el.classList.remove('wall-preview-valid', 'wall-preview-invalid'));
    });

    boardElement.addEventListener('click', (e) => {
        if (gameOver || (isOnlineMatch && currentTurn !== myRole) || (!isOnlineMatch && currentTurn === 2)) return;
        const targetEl = e.target;
        if (targetEl.closest('.valid-move')) {
            const cell = targetEl.closest('.valid-move');
            executeMovement(parseInt(cell.dataset.row), parseInt(cell.dataset.col), true);
        } else if (targetEl.classList.contains('wall-h') || targetEl.classList.contains('wall-v') || targetEl.classList.contains('wall-preview-valid')) {
            let r = parseInt(targetEl.dataset.row), c = parseInt(targetEl.dataset.col);
            let isH = targetEl.classList.contains('wall-h') || targetEl.dataset.row % 2 !== 0; 
            executeWallPlacement(r, c, isH, true);
        }
    });

    function executeMovement(targetR, targetC, shouldEmit) {
        let currentPos = currentTurn === 1 ? p1Position : p2Position;
        currentPos.r = targetR; currentPos.c = targetC;
        updatePawns();
        playSound(moveSound); 
        if (shouldEmit && isOnlineMatch) socket.emit('player_move', { roomId: currentRoomId, action: 'move', r: targetR, c: targetC });
        checkWinCondition();
    }

    function executeWallPlacement(r, c, isHorizontal, shouldEmit) {
        if ((currentTurn === 1 && p1Walls <= 0) || (currentTurn === 2 && p2Walls <= 0)) return false;
        let els = getWallElements(r, c, isHorizontal);
        if (!els || els.some(el => el.classList.contains('wall-placed'))) return false;
        els.forEach(el => { el.classList.remove('wall-preview-valid'); el.classList.add('wall-placed'); });
        if (!getShortestPath(p1Position, 0, true) || !getShortestPath(p2Position, 16, true)) {
            els.forEach(el => el.classList.remove('wall-placed')); return false; 
        }
        if (currentTurn === 1) document.getElementById('p1-walls').textContent = --p1Walls;
        else document.getElementById('p2-walls').textContent = --p2Walls;
        playSound(wallSound); 
        if (shouldEmit && isOnlineMatch) socket.emit('player_move', { roomId: currentRoomId, action: 'wall', r: r, c: c, isH: isHorizontal });
        checkWinCondition();
        return true;
    }

    function checkWinCondition() {
        if (currentTurn === 1 && p1Position.r === 0) endGame(1);
        else if (currentTurn === 2 && p2Position.r === 16) endGame(2);
        else switchTurn(currentTurn === 1 ? 2 : 1);
    }

    function switchTurn(nextTurn) {
        currentTurn = nextTurn; 
        clearInterval(timerInterval);
        timeLeft = 60; document.getElementById('time-left').textContent = timeLeft;
        timerInterval = setInterval(() => {
            if (gameOver) return clearInterval(timerInterval);
            timeLeft--; document.getElementById('time-left').textContent = timeLeft;
            if (timeLeft <= 0) endGame(currentTurn === 1 ? 2 : 1, "HẾT GIỜ!");
        }, 1000);
        
        highlightValidMoves();
        
        const p1Panel = document.querySelector('.player1-panel');
        const p2Panel = document.querySelector('.player2-panel');
        const screenGlow = document.getElementById('screen-glow');

        if (currentTurn === 1) {
            document.getElementById('current-turn-text').textContent = "P1 (Xanh)"; 
            document.getElementById('current-turn-text').className = "player1-text";
            p1Panel.classList.add('active-p1'); p2Panel.classList.remove('active-p2');
            screenGlow.className = 'glow-p1';
            startParticles(p1Panel, '#00f0ff');
        } else {
            document.getElementById('current-turn-text').textContent = "P2 (Đỏ)"; 
            document.getElementById('current-turn-text').className = "player2-text";
            p2Panel.classList.add('active-p2'); p1Panel.classList.remove('active-p1');
            screenGlow.className = 'glow-p2';
            startParticles(p2Panel, '#ff0055');
            
            if (!isOnlineMatch && !gameOver) {
                setTimeout(() => runBotSafely(), 300);
            }
        }
    }

    function runBotSafely() {
        try {
            makeBotMove(currentGameMode);
        } catch (err) { fallbackBotMove(); }
    }

    function endGame(winnerNum, reason = "") {
        gameOver = true;
        clearInterval(timerInterval); clearInterval(particleInterval);
        document.getElementById('screen-glow').className = '';
        playSound(winSound); 

        let victoryText = document.getElementById('victory-text');
        let rankChangeText = document.getElementById('rank-change-text');
        rankChangeText.textContent = "";

        if (winnerNum === 1) {
            victoryText.innerHTML = `${reason}<br>P1 (XANH) THẮNG!`;
            victoryText.style.color = '#00f0ff';
        } else {
            victoryText.innerHTML = `${reason}<br>P2 (ĐỎ) THẮNG!`;
            victoryText.style.color = '#ff0055';
        }

        if (isOnlineMatch) {
            let amIWinner = (winnerNum === myRole);
            if (amIWinner) {
                rankChangeText.textContent = "Bạn được cộng +50 Rank 📈";
                rankChangeText.style.color = "#00ff88";
                currentUser.rankScore += 50;
                socket.emit('match_end', { roomId: currentRoomId, winnerName: currentUser.username, loserName: opponentName });
            } else {
                rankChangeText.textContent = "Bạn bị trừ -25 Rank 📉";
                rankChangeText.style.color = "#ff4b2b";
                currentUser.rankScore -= 25;
            }
        }

        victoryOverlay.classList.remove('hidden');
        setTimeout(() => victoryOverlay.classList.add('show'), 10);
        startFireworks();
    }

    function returnToMenu() {
        gameOver = true; clearInterval(timerInterval); clearInterval(particleInterval);
        stopFireworks(); document.getElementById('screen-glow').className = '';
        gameScreen.classList.add('hidden');
        victoryOverlay.classList.remove('show');
        setTimeout(() => victoryOverlay.classList.add('hidden'), 500); 
        document.getElementById('profile-rank').textContent = currentUser.rankScore;
        mainMenu.classList.remove('hidden');
        if (isOnlineMatch && socket) socket.emit('leave_match'); 
    }
    document.getElementById('back-to-menu-btn').addEventListener('click', returnToMenu);
    document.getElementById('victory-menu-btn').addEventListener('click', returnToMenu);
    document.getElementById('restart-btn').addEventListener('click', startGame);
    document.getElementById('victory-restart-btn').addEventListener('click', startGame);

    // --- CÁC HÀM TIỆN ÍCH ---
    function updatePawns() {
        document.querySelectorAll('.pawn').forEach(p => p.remove());
        let p1Cell = document.querySelector(`[data-row="${p1Position.r}"][data-col="${p1Position.c}"]`);
        let p2Cell = document.querySelector(`[data-row="${p2Position.r}"][data-col="${p2Position.c}"]`);
        if (p1Cell) p1Cell.innerHTML = `<div class="pawn pawn-p1"></div>`;
        if (p2Cell) p2Cell.innerHTML = `<div class="pawn pawn-p2"></div>`;
    }

    function getShortestPath(startPos, targetRow, ignoreOpponent = true) {
        let queue = [ { r: startPos.r, c: startPos.c, path: [] } ];
        let visited = new Set([`${startPos.r},${startPos.c}`]);
        const dirs = [{ dr: -2, dc: 0 }, { dr: 2, dc: 0 }, { dr: 0, dc: -2 }, { dr: 0, dc: 2 }];
        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.r === targetRow) return curr.path;
            for (let dir of dirs) {
                let nextR = curr.r + dir.dr, nextC = curr.c + dir.dc;
                if (nextR >= 0 && nextR < boardSize && nextC >= 0 && nextC < boardSize) {
                    let wallSlot = document.querySelector(`[data-row="${curr.r + dir.dr / 2}"][data-col="${curr.c + dir.dc / 2}"]`);
                    let posKey = `${nextR},${nextC}`;
                    let isOpp = false;
                    if (!ignoreOpponent) isOpp = (currentTurn === 1 && nextR === p2Position.r && nextC === p2Position.c) || (currentTurn === 2 && nextR === p1Position.r && nextC === p1Position.c);
                    if (!isOpp && wallSlot && !wallSlot.classList.contains('wall-placed') && !visited.has(posKey)) {
                        visited.add(posKey); queue.push({ r: nextR, c: nextC, path: [...curr.path, {r: nextR, c: nextC}] });
                    }
                }
            }
        } return null;
    }

    function getWallElements(r, c, isHorizontal) {
        if (c < 0 || r < 0) return null;
        if (isHorizontal && c >= 16) c = 14; 
        if (!isHorizontal && r >= 16) r = 14; 
        let coords = isHorizontal ? [[r,c], [r,c+1], [r,c+2]] : [[r,c], [r+1,c], [r+2,c]];
        const el1 = document.querySelector(`[data-row="${coords[0][0]}"][data-col="${coords[0][1]}"]`);
        const elInter = document.querySelector(`[data-row="${coords[1][0]}"][data-col="${coords[1][1]}"]`);
        const el2 = document.querySelector(`[data-row="${coords[2][0]}"][data-col="${coords[2][1]}"]`);
        if (!el1 || !elInter || !el2) return null;
        return [el1, elInter, el2];
    }

    function getValidMoves(pos) {
        let moves = [];
        const dirs = [{dr:-2,dc:0}, {dr:2,dc:0}, {dr:0,dc:-2}, {dr:0,dc:2}];
        for(let d of dirs) {
            let tr = pos.r + d.dr, tc = pos.c + d.dc;
            if(tr >= 0 && tr < boardSize && tc >= 0 && tc < boardSize) {
                let w = document.querySelector(`[data-row="${(pos.r + tr)/2}"][data-col="${(pos.c + tc)/2}"]`);
                let isOpp = (tr === p1Position.r && tc === p1Position.c);
                if(w && !w.classList.contains('wall-placed') && !isOpp) moves.push({r: tr, c: tc});
            }
        }
        return moves;
    }

    function fallbackBotMove() {
        let moves = getValidMoves(p2Position);
        if (moves.length > 0) {
            moves.sort((a, b) => b.r - a.r); 
            let bestR = moves[0].r;
            let forwardMoves = moves.filter(m => m.r === bestR);
            let chosenMove = forwardMoves[Math.floor(Math.random() * forwardMoves.length)];
            executeMovement(chosenMove.r, chosenMove.c, false);
        } else { 
            switchTurn(1);
        }
    }

    // --- BỘ NÃO KẺ SĂN MỒI (KIÊN NHẪN & CHÍ MẠNG) ---
    function makeBotMove(mode) {
        let p1Path = getShortestPath(p1Position, 0, false) || getShortestPath(p1Position, 0, true) || []; 
        let p2Path = getShortestPath(p2Position, 16, false) || getShortestPath(p2Position, 16, true) || []; 

        if (!p1Path.length || !p2Path.length) { fallbackBotMove(); return; }

        let p1Dist = p1Path.length;
        let p2Dist = p2Path.length;

        let bestWall = null;
        let bestScore = -999;
        let shouldTryWall = false;
        let scanLimit = 0;

        // Xếp lại cấp độ để tương xứng với độ khó mới
        if (mode === 'bot-random') {
            if (p2Walls > 0 && Math.random() < 0.10) { shouldTryWall = true; scanLimit = 2; } 
            else if (Math.random() < 0.4) { return fallbackBotMove(); }
        }
        if (mode === 'bot-easy') {
            if (p2Walls > 0 && p1Dist <= 4) { shouldTryWall = true; scanLimit = 3; } 
            else if (Math.random() < 0.1) { return fallbackBotMove(); }
        }
        if (mode === 'bot-medium') {
            if (p2Walls > 0) {
                if (p1Dist <= 5) shouldTryWall = true;
                else if (p1Dist <= p2Dist + 1) shouldTryWall = true;
                scanLimit = 8;
            }
        }
        if (mode === 'bot-hard') {
            if (p2Walls > 0) {
                shouldTryWall = true; // KHÔNG BAO GIỜ NGỦ. Luôn quét tìm điểm yếu.
                scanLimit = 16; // Quét mọi ngóc ngách đến tận vạch đích
            }
        }

        // --- HỆ THỐNG TÌM TƯỜNG ---
        if (shouldTryWall) {
            let candidateWalls = [];
            scanLimit = Math.min(p1Path.length, scanLimit);

            for (let i = 0; i < scanLimit; i++) {
                let r = p1Path[i].r;
                let c = p1Path[i].c;
                let intersections = [
                    { ir: r - 1, ic: c - 1 }, { ir: r - 1, ic: c + 1 },
                    { ir: r + 1, ic: c - 1 }, { ir: r + 1, ic: c + 1 }
                ];

                for (let inter of intersections) {
                    if (inter.ir >= 1 && inter.ir <= 15 && inter.ic >= 1 && inter.ic <= 15) {
                        candidateWalls.push({ r: inter.ir, c: inter.ic - 1, isH: true }); 
                        candidateWalls.push({ r: inter.ir - 1, c: inter.ic, isH: false }); 
                    }
                }
            }

            let uniqueWalls = [];
            let seen = new Set();
            for (let w of candidateWalls) {
                let key = `${w.r},${w.c},${w.isH}`;
                if (!seen.has(key)) { seen.add(key); uniqueWalls.push(w); }
            }

            uniqueWalls = uniqueWalls.sort(() => Math.random() - 0.5);

            for (let w of uniqueWalls) {
                let els = getWallElements(w.r, w.c, w.isH);
                if (els && !els.some(el => el.classList.contains('wall-placed'))) {
                    els.forEach(el => el.classList.add('wall-placed')); 

                    let newP1Path = getShortestPath(p1Position, 0, true);
                    let newP2Path = getShortestPath(p2Position, 16, true);

                    if (newP1Path && newP2Path) {
                        let newP1Dist = newP1Path.length;
                        let newP2Dist = newP2Path.length;
                        let p1Delay = newP1Dist - p1Dist;
                        let p2Delay = newP2Dist - p2Dist;

                        if (p1Delay > 0) { 
                            let score = -999;

                            if (mode === 'bot-random' || mode === 'bot-easy') {
                                if (p2Delay <= 2) score = p1Delay; 
                            } 
                            else if (mode === 'bot-medium') {
                                if (p2Delay > p1Delay && p1Dist > 3) score = -999;
                                else score = (p1Delay * 3) - (p2Delay * 2);
                            } 
                            else if (mode === 'bot-hard') {
                                // QUY TẮC SỐ 1: Không tự đào hố chôn mình trừ khi là lựa chọn sống còn
                                if (p2Delay > p1Delay && p1Dist > 2) {
                                    score = -999;
                                } else {
                                    score = (p1Delay * 10) - (p2Delay * 3);

                                    // QUY TẮC SỐ 2: CHIẾN THUẬT LÙA VÀO RỌ
                                    if (p1Dist > 6) {
                                        // Giai đoạn đầu: CHỈ XUẤT THỦ NẾU BẪY ĐƯỢC >= 6 BƯỚC. CÒN KHÔNG THÌ ĐI TIẾP.
                                        if (p1Delay < 6) score = -999;
                                        else score += 1000;
                                    } 
                                    else if (p1Dist > 3) {
                                        // Giai đoạn giữa: Đợi cấu trúc địa hình rõ ràng, tạo ngõ cụt chênh lệch lớn
                                        if (p1Delay < 4) score = -999;
                                        else score += 500;
                                    } 
                                    else {
                                        // Tử chiến: Bắn mọi thứ để chặn cửa
                                        score += 2000 + (p1Delay * 20);
                                    }

                                    // QUY TẮC SỐ 3: TƯ DUY KẺ THẮNG CUỘC (GIỮ TƯỜNG)
                                    if (p2Walls <= 4 && p1Dist > 3 && p1Delay < 6) {
                                        score = -999; // Dưới 5 tường thì ôm khư khư, đợi thời cơ hoàn hảo mới ném
                                    }
                                }
                            }

                            if (score > bestScore && score > 0) { 
                                bestScore = score; bestWall = w;
                            }
                        }
                    }
                    els.forEach(el => el.classList.remove('wall-placed')); 
                }
            }
        }

        // TUNG CHIÊU NẾU TÌM THẤY BẪY HOÀN HẢO
        if (bestWall && bestScore > 0) {
            if (executeWallPlacement(bestWall.r, bestWall.c, bestWall.isH, false)) return;
        }

        // NẾU CHƯA CÓ BẪY -> LẦM LÌ TIẾN LÊN
        if (p2Path.length > 0) {
            let nextStep = p2Path[0];
            if (nextStep.r === p1Position.r && nextStep.c === p1Position.c) {
                let moves = getValidMoves(p2Position);
                let bestMove = null; let bestDist = 999;
                for (let m of moves) {
                    let oldR = p2Position.r; let oldC = p2Position.c;
                    p2Position.r = m.r; p2Position.c = m.c;
                    let path = getShortestPath(p2Position, 16, true);
                    if (path && path.length < bestDist) {
                        bestDist = path.length; bestMove = m;
                    }
                    p2Position.r = oldR; p2Position.c = oldC;
                }
                if (bestMove) { executeMovement(bestMove.r, bestMove.c, false); return; }
                fallbackBotMove();
            } else {
                executeMovement(nextStep.r, nextStep.c, false);
            }
        } else {
            fallbackBotMove();
        }
    }

    // --- PHÁO HOA ---
    const canvas = document.getElementById('fireworksCanvas');
    const ctx = canvas.getContext('2d');
    let fwParticles = [], fwAnimationId = null;
    function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resizeCanvas); resizeCanvas();
    function renderFireworks() {
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = fwParticles.length - 1; i >= 0; i--) {
            let p = fwParticles[i]; p.vx *= 0.98; p.vy *= 0.98; p.vy += 0.05; p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
            if (p.alpha <= 0) fwParticles.splice(i, 1);
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`; ctx.fill(); }
        }
        if (Math.random() < 0.05) {
            const colors = ['0, 240, 255', '255, 0, 85', '255, 170, 0', '255, 255, 255'];
            for (let i = 0; i < 60; i++) {
                const a = Math.random() * Math.PI * 2, s = Math.random() * 5 + 2;
                fwParticles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: colors[Math.floor(Math.random() * colors.length)], alpha: 1, decay: Math.random() * 0.015 + 0.015 });
            }
        }
        fwAnimationId = requestAnimationFrame(renderFireworks);
    }
    function startFireworks() { fwParticles = []; if (!fwAnimationId) renderFireworks(); }
    function stopFireworks() { if (fwAnimationId) cancelAnimationFrame(fwAnimationId); fwAnimationId = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    function startParticles(panel, color) {
        clearInterval(particleInterval);
        particleInterval = setInterval(() => {
            if (gameOver) return clearInterval(particleInterval);
            let particle = document.createElement('div');
            particle.className = 'panel-particle';
            particle.style.background = color;
            particle.style.boxShadow = `0 0 8px ${color}`;
            let size = Math.random() * 5 + 3;
            particle.style.width = size + 'px'; particle.style.height = size + 'px';
            particle.style.left = Math.random() * 95 + '%';
            particle.style.top = (Math.random() * 30 + 70) + '%';
            panel.appendChild(particle);
            setTimeout(() => particle.remove(), 1000);
        }, 150); 
    }
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// CẤU HÌNH ĐƯỜNG DẪN TĨNH
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quoridor_db';
mongoose.connect(dbURI)
.then(() => console.log('✅ Đã kết nối Database thành công!'))
.catch(err => console.error('❌ Lỗi kết nối Database:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rankScore: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// --- API ĐĂNG NHẬP ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ user });
    } else {
        res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }
});

// --- API BẢNG XẾP HẠNG ---
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ rankScore: -1 }).limit(10);
        res.json(topUsers);
    } catch (err) { res.status(500).json({ error: 'Lỗi tải bảng xếp hạng' }); }
});

// --- LOGIC SOCKET (GHÉP TRẬN & DI CHUYỂN) ---
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log("🔌 Một người đã kết nối:", socket.id);

    // Ghép trận
    socket.on('find_match', (user) => {
        console.log("🔥 Yêu cầu tìm trận từ:", user.username);
        if (waitingPlayer) {
            const roomId = 'room_' + Date.now();
            socket.join(roomId);
            waitingPlayer.socket.join(roomId);
            
            io.to(roomId).emit('match_found', { roomId, role: 2, opponent: user.username });
            waitingPlayer.socket.emit('match_found', { roomId, role: 1, opponent: waitingPlayer.user.username });
            
            waitingPlayer = null;
        } else {
            waitingPlayer = { socket, user };
        }
    });

    socket.on('player_move', (data) => {
        socket.to(data.roomId).emit('opponent_moved', data);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) waitingPlayer = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server chạy tại port ${PORT}`));
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- CẤU HÌNH ĐƯỜNG DẪN TĨNH ---
// Lệnh này giúp Server tự động nhận diện file HTML, CSS, JS, Ảnh, Nhạc 
// nằm cùng thư mục với file server.js này
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- KẾT NỐI DATABASE MONGODB ---
mongoose.connect('mongodb+srv://hachi1111:bnqthelq@cluster0.3mkc7to.mongodb.net/?appName=Cluster0')
    .then(() => console.log('✅ Đã kết nối với MongoDB'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// --- CẤU TRÚC DỮ LIỆU USER ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rankScore: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matchHistory: [{
        opponent: String,
        result: String,
        scoreChange: Number
    }]
});
const User = mongoose.model('User', userSchema);

// --- CÁC API ĐĂNG NHẬP / ĐĂNG KÝ ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await User.create({ username, password: hashedPassword });
        res.status(201).json({ user });
    } catch (e) { res.status(400).json({ error: "Tên đăng nhập đã tồn tại!" }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ user });
    } else {
        res.status(400).json({ error: "Sai tên đăng nhập hoặc mật khẩu!" });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const users = await User.find().sort({ rankScore: -1 }).limit(10);
    res.json(users);
});

// --- HỆ THỐNG MATCHMAKING & SOCKET ---
let waitingPlayer = null;
let activeRooms = {};

io.on('connection', (socket) => {
    console.log('🔗 Có người chơi kết nối:', socket.id);

    socket.on('find_match', (userData) => {
        socket.userData = userData;
        if (!waitingPlayer) {
            waitingPlayer = socket;
        } else {
            const p1 = waitingPlayer;
            const p2 = socket;
            waitingPlayer = null;
            
            const roomId = 'room_' + Date.now();
            p1.join(roomId);
            p2.join(roomId);
            
            const isP1Blue = Math.random() > 0.5;
            p1.emit('match_found', { role: isP1Blue ? 1 : 2, opponent: p2.userData.username, roomId });
            p2.emit('match_found', { role: isP1Blue ? 2 : 1, opponent: p1.userData.username, roomId });

            activeRooms[roomId] = { p1, p2, boardState: "start" };
        }
    });

    socket.on('player_move', (data) => {
        socket.to(data.roomId).emit('opponent_moved', data);
    });

    socket.on('match_end', async (data) => {
        const { winnerName, loserName, roomId } = data;
        try {
            const winner = await User.findOne({ username: winnerName });
            const loser = await User.findOne({ username: loserName });
            if (winner && loser) {
                winner.rankScore += 50; winner.wins += 1;
                loser.rankScore -= 25; loser.losses += 1;
                winner.matchHistory.push({ opponent: loser.username, result: 'win', scoreChange: 50 });
                loser.matchHistory.push({ opponent: winner.username, result: 'lose', scoreChange: -25 });
                await winner.save(); await loser.save();
            }
        } catch (error) { console.log("Lỗi cập nhật điểm:", error); }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Thiết bị đã ngắt kết nối:`, socket.id);
        if (waitingPlayer === socket) waitingPlayer = null;
    });
});

// --- LẮNG NGHE PORT ---
server.listen(3000, () => {
    console.log('🚀 Game Server đang chạy tại http://localhost:3000');
});
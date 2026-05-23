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
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- KẾT NỐI DATABASE MONGODB ---
const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quoridor_db';

mongoose.connect(dbURI)
.then(() => console.log('✅ Đã kết nối Database thành công!'))
.catch(err => console.error('❌ Lỗi kết nối Database:', err));

// --- CẤU TRÚC DỮ LIỆU USER ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rankScore: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matchHistory: [{ opponent: String, result: String, scoreChange: Number }]
});

const User = mongoose.model('User', userSchema);

// --- CÁC HÀM XỬ LÝ API (CẦN THIẾT) ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: 'Đăng ký thành công' });
    } catch (err) { res.status(500).json({ error: 'Lỗi đăng ký' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({ message: 'Đăng nhập thành công', username: user.username });
        } else {
            res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        }
    } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// --- XỬ LÝ SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('player_move', (data) => {
        socket.to(data.roomId).emit('opponent_moved', data);
    });

    socket.on('match_end', async (data) => {
        const { winnerName, loserName } = data;
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
});

// --- ROUTE PHỤC VỤ GIAO DIỆN ---
app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.sendFile(__dirname + '/index.html');
    } else {
        next();
    }
});

// Lắng nghe port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
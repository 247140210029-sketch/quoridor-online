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

// --- KẾT NỐI DATABASE MONGODB (ĐÃ LÀM SẠCH) ---
// Render sẽ tự động cấp MONGODB_URI qua Environment Variables
const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quoridor_db';

// Không cần truyền thêm các tùy chọn cũ (useNewUrlParser, etc.) để tránh lỗi phiên bản mới
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

// --- XỬ LÝ SOCKET.IO ---
const activeRooms = {};

io.on('connection', (socket) => {
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
        console.log('Người chơi đã thoát');
    });
});

// --- ROUTE PHỤC VỤ GIAO DIỆN ---
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Lắng nghe port từ Render cấp hoặc dùng 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
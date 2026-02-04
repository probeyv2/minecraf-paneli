const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- AYARLAR ---
const PORT = 3000;
const SERVER_JAR = 'server.jar'; // Sunucu dosyanın tam adı buraya!
// ---------------

app.use(express.static('public')); // HTML dosyasını public klasöründen çeker
app.use(express.json());

let mcProcess = null;
let timeLeft = 18000; // 5 Saat (Saniye)
let timerLoop = null;

// SUNUCU BAŞLATMA
app.post('/api/start', (req, res) => {
    if (mcProcess) return res.send("open");
    
    console.log("Sunucu başlatılıyor...");
    // Java başlatma komutu
    mcProcess = spawn('java', ['-Xmx2G', '-jar', SERVER_JAR, 'nogui'], { cwd: __dirname });

    mcProcess.stdout.on('data', (data) => io.emit('log', data.toString()));
    mcProcess.stderr.on('data', (data) => io.emit('log', data.toString()));

    mcProcess.on('close', () => {
        mcProcess = null;
        io.emit('status', 'offline');
        io.emit('log', 'Sunucu kapandı.');
        clearInterval(timerLoop);
    });

    // Süre Sayacı
    timerLoop = setInterval(() => {
        if(mcProcess) {
            timeLeft--;
            io.emit('timer', timeLeft);
            if(timeLeft <= 0) {
                mcProcess.stdin.write("stop\n");
                io.emit('log', 'SÜRE DOLDU! Sunucu kapatılıyor...');
            }
        }
    }, 1000);

    io.emit('status', 'online');
    res.send("ok");
});

// KOMUT GÖNDERME
app.post('/api/cmd', (req, res) => {
    if (mcProcess && req.body.cmd) {
        mcProcess.stdin.write(req.body.cmd + "\n");
    }
    res.send("ok");
});

// SÜRE YENİLEME
app.post('/api/renew', (req, res) => {
    timeLeft += 18000; // +5 Saat ekle
    io.emit('timer', timeLeft);
    io.emit('log', '[SİSTEM] Süre 5 saat uzatıldı.');
    res.send("ok");
});

// DOSYA LİSTELEME
app.get('/api/files', (req, res) => {
    const reqPath = req.query.path || '';
    const fullPath = path.join(__dirname, reqPath);

    // Güvenlik (Ana klasör dışına çıkamazsın)
    if (!fullPath.startsWith(__dirname)) return res.json([]);

    try {
        const items = fs.readdirSync(fullPath, { withFileTypes: true });
        const list = items.map(i => ({
            name: i.name,
            type: i.isDirectory() ? 'folder' : 'file'
        }));
        // Klasörleri başa al
        list.sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1));
        res.json(list);
    } catch (e) {
        res.json([]);
    }
});

server.listen(PORT, () => {
    console.log(`PANEL ÇALIŞIYOR: http://localhost:${PORT}`);
});

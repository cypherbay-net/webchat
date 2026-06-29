const QRCode = (function() {
    const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const EXP = new Uint8Array(256);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x = (x << 1) ^ (x & 128 ? 0x11d : 0);
    }
    EXP[255] = EXP[0];

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return EXP[(LOG[a] + LOG[b]) % 255];
    }

    function rsEncode(data, ecCount) {
        let gen = [1];
        for (let i = 0; i < ecCount; i++) {
            const ng = new Array(gen.length + 1).fill(0);
            for (let j = 0; j < gen.length; j++) {
                ng[j] ^= gen[j];
                ng[j + 1] ^= gfMul(gen[j], EXP[i]);
            }
            gen = ng;
        }
        const msg = new Uint8Array(data.length + ecCount);
        msg.set(data);
        for (let i = 0; i < data.length; i++) {
            const c = msg[i];
            if (c === 0) continue;
            for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], c);
        }
        return msg.slice(data.length);
    }

    function encodeData(text) {
        text = text.toUpperCase();
        let bits = '0010';
        bits += text.length.toString(2).padStart(9, '0');
        for (let i = 0; i < text.length; i += 2) {
            const a = ALPHANUM.indexOf(text[i]);
            if (i + 1 < text.length) {
                bits += (a * 45 + ALPHANUM.indexOf(text[i + 1])).toString(2).padStart(11, '0');
            } else {
                bits += a.toString(2).padStart(6, '0');
            }
        }
        bits += '0000';
        while (bits.length % 8 !== 0) bits += '0';
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
        const pad = [0xEC, 0x11];
        let pi = 0;
        while (bytes.length < 19) { bytes.push(pad[pi % 2]); pi++; }
        return new Uint8Array(bytes);
    }

    function createMatrix(data, ecData) {
        const s = 21;
        const m = Array.from({length: s}, () => new Int8Array(s));
        const res = Array.from({length: s}, () => new Uint8Array(s));

        function finder(row, col) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const pr = row + r, pc = col + c;
                    if (pr < 0 || pr >= s || pc < 0 || pc >= s) continue;
                    const blk = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                                (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                                (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                    m[pr][pc] = blk ? 1 : -1;
                    res[pr][pc] = 1;
                }
            }
        }
        finder(0, 0);
        finder(0, s - 7);
        finder(s - 7, 0);

        for (let i = 8; i < s - 8; i++) {
            m[6][i] = (i % 2 === 0) ? 1 : -1; res[6][i] = 1;
            m[i][6] = (i % 2 === 0) ? 1 : -1; res[i][6] = 1;
        }
        m[s - 8][8] = 1; res[s - 8][8] = 1;

        for (let i = 0; i < 8; i++) {
            res[8][i] = 1; res[8][s - 1 - i] = 1;
            res[i][8] = 1; res[s - 1 - i][8] = 1;
        }
        res[8][8] = 1;

        const all = new Uint8Array(data.length + ecData.length);
        all.set(data); all.set(ecData, data.length);

        let bi = 0, up = true;
        for (let col = s - 1; col >= 0; col -= 2) {
            if (col === 6) col = 5;
            const rows = up ? Array.from({length: s}, (_, i) => s - 1 - i) : Array.from({length: s}, (_, i) => i);
            for (const row of rows) {
                for (let c = 0; c < 2; c++) {
                    const cc = col - c;
                    if (cc < 0 || res[row][cc]) continue;
                    if (bi < all.length * 8) {
                        m[row][cc] = ((all[Math.floor(bi / 8)] >> (7 - (bi % 8))) & 1) ? 1 : -1;
                        bi++;
                    } else {
                        m[row][cc] = -1;
                    }
                }
            }
            up = !up;
        }
        return { m, res, s };
    }

    function applyMask(matrix, res, s, mn) {
        const masked = matrix.map(r => Int8Array.from(r));
        const fn = [
            (r, c) => (r + c) % 2 === 0,
            (r, c) => r % 2 === 0,
            (r, c) => c % 3 === 0,
            (r, c) => (r + c) % 3 === 0,
            (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
            (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
            (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
            (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
        ][mn];
        for (let r = 0; r < s; r++)
            for (let c = 0; c < s; c++)
                if (!res[r][c] && fn(r, c)) masked[r][c] = masked[r][c] === 1 ? -1 : 1;
        return masked;
    }

    function penalty(m, s) {
        let p = 0;
        for (let r = 0; r < s; r++) {
            let cnt = 1;
            for (let c = 1; c < s; c++) {
                if (m[r][c] === m[r][c - 1]) { cnt++; if (cnt === 5) p += 3; else if (cnt > 5) p++; }
                else cnt = 1;
            }
        }
        for (let c = 0; c < s; c++) {
            let cnt = 1;
            for (let r = 1; r < s; r++) {
                if (m[r][c] === m[r - 1][c]) { cnt++; if (cnt === 5) p += 3; else if (cnt > 5) p++; }
                else cnt = 1;
            }
        }
        for (let r = 0; r < s - 1; r++)
            for (let c = 0; c < s - 1; c++)
                if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
        return p;
    }

    function formatInfo(matrix, s, mn) {
        const ecl = 0b01;
        let fb = (ecl << 3) | mn;
        let rem = fb << 10;
        for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0b10100110111 << (i - 10);
        fb = ((ecl << 3) | mn) << 10 | rem;
        fb ^= 0b101010000010010;
        const p1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
        const p2 = [[s-1,8],[s-2,8],[s-3,8],[s-4,8],[s-5,8],[s-6,8],[s-7,8],[8,s-8],[8,s-7],[8,s-6],[8,s-5],[8,s-4],[8,s-3],[8,s-2],[8,s-1]];
        for (let i = 0; i < 15; i++) {
            const v = ((fb >> i) & 1) ? 1 : -1;
            matrix[p1[i][0]][p1[i][1]] = v;
            matrix[p2[i][0]][p2[i][1]] = v;
        }
    }

    function render(canvas, text) {
        text = text.toUpperCase();
        const data = encodeData(text);
        const ec = rsEncode(data, 7);
        const { m, res, s } = createMatrix(data, ec);
        let bestMask = 0, bestPen = Infinity;
        for (let mn = 0; mn < 8; mn++) {
            const masked = applyMask(m, res, s, mn);
            formatInfo(masked, s, mn);
            const p = penalty(masked, s);
            if (p < bestPen) { bestPen = p; bestMask = mn; }
        }
        const final = applyMask(m, res, s, bestMask);
        formatInfo(final, s, bestMask);
        const scale = 5, border = 4, total = (s + border * 2) * scale;
        canvas.width = total; canvas.height = total;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, total, total);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < s; r++)
            for (let c = 0; c < s; c++)
                if (final[r][c] === 1) ctx.fillRect((c + border) * scale, (r + border) * scale, scale, scale);
    }

    return { render };
})();

window.QRCode = QRCode;

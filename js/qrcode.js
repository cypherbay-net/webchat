const QRCode = (function() {
    const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    // уровень коррекции ошибок L, один блок (версии 6+ используют несколько RS-блоков и здесь не поддерживаются)
    const PARAMS = {
        1: { s: 21, db:  19, ec:  7, align: []         },
        2: { s: 25, db:  34, ec: 10, align: [[18, 18]] },
        3: { s: 29, db:  55, ec: 15, align: [[22, 22]] },
        4: { s: 33, db:  80, ec: 20, align: [[26, 26]] },
        5: { s: 37, db: 108, ec: 26, align: [[30, 30]] },
    };
    const MAX_VERSION = 5;

    const EXP = new Uint8Array(256);
    const LOG = new Uint8Array(256);
    let gx = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = gx; LOG[gx] = i;
        gx = (gx << 1) ^ (gx & 128 ? 0x11d : 0);
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

    function encodeAlphanumeric(text, dataBytes) {
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
        bits += '0000'.slice(0, Math.max(0, Math.min(4, dataBytes * 8 - bits.length)));
        while (bits.length % 8 !== 0) bits += '0';
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
        const pad = [0xEC, 0x11]; let pi = 0;
        while (bytes.length < dataBytes) bytes.push(pad[pi++ % 2]);
        return new Uint8Array(bytes);
    }

    function encodeByte(text, dataBytes) {
        let bits = '0100';
        bits += text.length.toString(2).padStart(8, '0');
        for (let i = 0; i < text.length; i++) {
            bits += text.charCodeAt(i).toString(2).padStart(8, '0');
        }
        bits += '0000'.slice(0, Math.max(0, Math.min(4, dataBytes * 8 - bits.length)));
        while (bits.length % 8 !== 0) bits += '0';
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
        const pad = [0xEC, 0x11]; let pi = 0;
        while (bytes.length < dataBytes) bytes.push(pad[pi++ % 2]);
        return new Uint8Array(bytes);
    }

    // максимум байт на версию в байтовом режиме: V1:17, V2:32, V3:53, V4:78, V5:106
    const BYTE_CAP = { 1: 17, 2: 32, 3: 53, 4: 78, 5: 106 };
    function pickVersionByte(len) {
        for (let v = 1; v <= MAX_VERSION; v++) if (len <= BYTE_CAP[v]) return v;
        return null;
    }

    // ёмкость в алфавитно-цифровом режиме (L): V1=25, V2=47, V3=77, V4=114, V5=154
    const ALPHA_CAP = { 1: 25, 2: 47, 3: 77, 4: 114, 5: 154 };
    function pickVersionAlpha(len) {
        for (let v = 1; v <= MAX_VERSION; v++) if (len <= ALPHA_CAP[v]) return v;
        return null;
    }

    function createMatrix(data, ecData, version) {
        const { s, align } = PARAMS[version];
        const m   = Array.from({ length: s }, () => new Int8Array(s));
        const res = Array.from({ length: s }, () => new Uint8Array(s));

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
        finder(0, 0); finder(0, s - 7); finder(s - 7, 0);

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

        for (const [ar, ac] of align) {
            for (let r = ar - 2; r <= ar + 2; r++) {
                for (let c = ac - 2; c <= ac + 2; c++) {
                    if (res[r][c]) continue;
                    const edge = r === ar-2 || r === ar+2 || c === ac-2 || c === ac+2;
                    m[r][c] = (edge || (r === ar && c === ac)) ? 1 : -1;
                    res[r][c] = 1;
                }
            }
        }

        const all = new Uint8Array(data.length + ecData.length);
        all.set(data); all.set(ecData, data.length);

        let bi = 0, up = true;
        for (let col = s - 1; col >= 0; col -= 2) {
            if (col === 6) col = 5;
            const rows = up
                ? Array.from({ length: s }, (_, i) => s - 1 - i)
                : Array.from({ length: s }, (_, i) => i);
            for (const row of rows) {
                for (let dc = 0; dc < 2; dc++) {
                    const cc = col - dc;
                    if (cc < 0 || res[row][cc]) continue;
                    m[row][cc] = bi < all.length * 8
                        ? (((all[Math.floor(bi / 8)] >> (7 - (bi % 8))) & 1) ? 1 : -1)
                        : -1;
                    bi++;
                }
            }
            up = !up;
        }
        return { m, res, s };
    }

    function applyMask(matrix, res, s, mn) {
        const masked = matrix.map(r => Int8Array.from(r));
        const fns = [
            (r, c) => (r + c) % 2 === 0,
            (r, c) => r % 2 === 0,
            (r, c) => c % 3 === 0,
            (r, c) => (r + c) % 3 === 0,
            (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
            (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
            (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
            (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
        ];
        const fn = fns[mn];
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
                if (m[r][c] === m[r][c-1]) { cnt++; if (cnt === 5) p += 3; else if (cnt > 5) p++; }
                else cnt = 1;
            }
        }
        for (let c = 0; c < s; c++) {
            let cnt = 1;
            for (let r = 1; r < s; r++) {
                if (m[r][c] === m[r-1][c]) { cnt++; if (cnt === 5) p += 3; else if (cnt > 5) p++; }
                else cnt = 1;
            }
        }
        for (let r = 0; r < s - 1; r++)
            for (let c = 0; c < s - 1; c++)
                if (m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c] && m[r][c] === m[r+1][c+1]) p += 3;
        return p;
    }

    function formatInfo(matrix, s, mn) {
        const ecl = 0b01;
        let fb = (ecl << 3) | mn, rem = fb << 10;
        for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0b10100110111 << (i - 10);
        fb = ((ecl << 3) | mn) << 10 | rem;
        fb ^= 0b101010000010010;
        const p1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
        const p2 = [[s-1,8],[s-2,8],[s-3,8],[s-4,8],[s-5,8],[s-6,8],[s-7,8],[8,s-8],[8,s-7],[8,s-6],[8,s-5],[8,s-4],[8,s-3],[8,s-2],[8,s-1]];
        for (let i = 0; i < 15; i++) {
            const v = ((fb >> (14 - i)) & 1) ? 1 : -1;
            matrix[p1[i][0]][p1[i][1]] = v;
            matrix[p2[i][0]][p2[i][1]] = v;
        }
    }

    function render(canvas, text) {
        const upper = text.toUpperCase();
        const canAlpha = [...upper].every(c => ALPHANUM.includes(c));

        let version, data;
        if (canAlpha) {
            version = pickVersionAlpha(upper.length);
            if (version === null) throw new Error('QRCode: text too long to encode (' + upper.length + ' chars)');
            data = encodeAlphanumeric(upper, PARAMS[version].db);
        } else {
            version = pickVersionByte(text.length);
            if (version === null) throw new Error('QRCode: text too long to encode (' + text.length + ' bytes)');
            data = encodeByte(text, PARAMS[version].db);
        }

        const p = PARAMS[version];
        const ec = rsEncode(data, p.ec);
        const { m, res, s } = createMatrix(data, ec, version);

        let bestMask = 0, bestPen = Infinity;
        for (let mn = 0; mn < 8; mn++) {
            const masked = applyMask(m, res, s, mn);
            formatInfo(masked, s, mn);
            const pen = penalty(masked, s);
            if (pen < bestPen) { bestPen = pen; bestMask = mn; }
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

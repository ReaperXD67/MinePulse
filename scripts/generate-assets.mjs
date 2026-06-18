import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const width = 1600;
const height = 900;
const rgba = Buffer.alloc(width * height * 4);

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  rgba[index] = color[0];
  rgba[index + 1] = color[1];
  rgba[index + 2] = color[2];
  rgba[index + 3] = color[3] ?? 255;
}

function rect(x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setPixel(xx, yy, color);
    }
  }
}

function block(cx, cy, size, top, left, right) {
  const half = Math.floor(size / 2);
  for (let y = 0; y < half; y += 1) {
    for (let x = -half + y; x <= half - y; x += 1) {
      setPixel(cx + x, cy + y, top);
    }
  }
  for (let y = 0; y < half; y += 1) {
    for (let x = -half; x <= 0; x += 1) {
      setPixel(cx + x + y, cy + half + y, left);
    }
    for (let x = 0; x <= half; x += 1) {
      setPixel(cx + x - y, cy + half + y, right);
    }
  }
}

function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const shade = 12 + Math.floor((y / height) * 18) + ((x + y) % 17 === 0 ? 4 : 0);
    setPixel(x, y, [shade, shade + 5, shade + 8, 255]);
  }
}

for (let y = 0; y < height; y += 32) {
  rect(0, y, width, 1, [95, 255, 180, 24]);
}
for (let x = 0; x < width; x += 32) {
  rect(x, 0, 1, height, [72, 227, 255, 18]);
}

const blocks = [
  [1040, 250, 120, [151, 255, 91], [34, 111, 62], [20, 82, 92]],
  [1160, 330, 92, [72, 227, 255], [19, 90, 109], [36, 61, 127]],
  [910, 380, 86, [247, 201, 72], [103, 78, 25], [73, 90, 42]],
  [1260, 460, 78, [255, 111, 145], [102, 44, 66], [65, 47, 92]],
  [1040, 560, 150, [167, 139, 250], [59, 51, 129], [35, 79, 112]],
  [1320, 635, 110, [155, 255, 91], [37, 104, 48], [18, 72, 98]]
];

for (const [cx, cy, size, top, left, right] of blocks) {
  block(cx, cy, size, [...top, 255], [...left, 255], [...right, 255]);
}

for (let i = 0; i < 190; i += 1) {
  const x = (i * 149) % width;
  const y = (i * 83) % height;
  const color = i % 3 === 0 ? [155, 255, 91, 140] : i % 3 === 1 ? [72, 227, 255, 120] : [247, 201, 72, 120];
  rect(x, y, 3 + (i % 5), 3, color);
}

const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  raw[y * (width * 4 + 1)] = 0;
  rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

const out = path.join(process.cwd(), "public", "voxel-network.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`Generated ${out}`);

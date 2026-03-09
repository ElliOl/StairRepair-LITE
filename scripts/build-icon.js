#!/usr/bin/env node
/**
 * Convert favicon.ico to macOS icon.icns for electron-builder.
 * Uses ico-to-png + sharp to resize, iconutil (macOS) to create .icns.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const icoToPng = require('ico-to-png')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const icoPath = path.join(root, 'favicon.ico')
const buildDir = path.join(root, 'build')
const iconsetDir = path.join(buildDir, 'icon.iconset')

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]

async function main() {
  if (!fs.existsSync(icoPath)) {
    console.error('favicon.ico not found')
    process.exit(1)
  }

  const icoBuffer = fs.readFileSync(icoPath)
  const pngBuffer = await icoToPng(icoBuffer, 256)
  if (!pngBuffer || pngBuffer.length === 0) {
    throw new Error('ico-to-png failed')
  }

  fs.mkdirSync(iconsetDir, { recursive: true })

  for (const { name, size } of sizes) {
    const buffer = await sharp(pngBuffer)
      .resize(size, size)
      .grayscale()
      .png()
      .toBuffer()
    fs.writeFileSync(path.join(iconsetDir, name), buffer)
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(buildDir, 'icon.icns')}"`, {
    stdio: 'inherit',
  })

  fs.rmSync(iconsetDir, { recursive: true })
  console.log('Created build/icon.icns')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

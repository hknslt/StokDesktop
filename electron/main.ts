import { app, BrowserWindow, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

// Dev'de public/, build'de dist/ kullanılıyor
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const isDev = !!VITE_DEV_SERVER_URL

function resolveIconPath(): string {
  if (isDev) {
    // Geliştirme sırasında gözüken ikon
    // public/ altında kendi ikonunu koy: public/icon.png
    return path.join(process.env.VITE_PUBLIC!, 'icon.png')
  } else {
    // Build sonrası (electron-builder) ikonlar process.resourcesPath altına kopyalanır
    // Aşağıdaki klasörler builder config ile eşleşiyor (bkz. electron-builder.json5).
    if (process.platform === 'win32') {
      return path.join(process.resourcesPath, 'icons', 'win', 'icon.ico')
    }
    if (process.platform === 'darwin') {
      return path.join(process.resourcesPath, 'icons', 'mac', 'icon.icns')
    }
    // linux
    return path.join(process.resourcesPath, 'icons', 'png', '512x512.png')
  }
}

let win: BrowserWindow | null

function createWindow() {
  const iconPath = resolveIconPath()

  // macOS için dock ikonunu da ayarla (opsiyonel ama şık)
  if (process.platform === 'darwin') {
    try {
      const nimg = nativeImage.createFromPath(iconPath)
      if (!nimg.isEmpty()) app.dock.setIcon(nimg)
    } catch {}
  }

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (isDev) {
    win.loadURL(VITE_DEV_SERVER_URL!)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(createWindow)
